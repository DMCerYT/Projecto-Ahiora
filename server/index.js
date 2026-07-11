import './env.js';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { clearSessionCookie, createSession, getCookie, getSessionUser, hashToken, sessionCookie, verifyPassword } from './auth.js';
import { createLocalUser, db, initDatabase, seedStarterData } from './db.js';
import { financeEntities } from './schema.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, 'dist');
const uploadDir = join(rootDir, 'data', 'uploads');
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024);

initDatabase();
mkdirSync(uploadDir, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(port, host, () => {
  console.log(`Local API running at http://${host}:${port}`);
});

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/session') {
    const user = getSessionUser(db, req);
    sendJson(res, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || password.length < 8) {
      sendJson(res, 400, { error: 'Use a valid email and a password with at least 8 characters.' });
      return;
    }

    try {
      const user = createLocalUser({ email, password, name: body.name });
      const session = createSession(db, user.id);
      res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt));
      sendJson(res, 201, { user });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        sendJson(res, 409, { error: 'An account with this email already exists.' });
        return;
      }
      throw error;
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = db.prepare('select id, email, name, password_hash from users where email = ?').get(email);

    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: 'Invalid email or password.' });
      return;
    }

    const session = createSession(db, user.id);
    res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = getCookie(req, 'sid');
    if (token) {
      db.prepare('delete from sessions where token_hash = ?').run(hashToken(token));
    }

    res.setHeader('Set-Cookie', clearSessionCookie());
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/github') {
    await startGithubOAuth(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/github/callback') {
    await finishGithubOAuth(req, res, url);
    return;
  }

  const user = getSessionUser(db, req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    sendJson(res, 200, { data: getDashboardRecords(user.id) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/bills/payments') {
    const rows = db
      .prepare(
        `select bill_payments.*, bills.payee, bills.bill_type
         from bill_payments
         join bills on bills.id = bill_payments.bill_id
         where bill_payments.user_id = ?
         order by bill_payments.payment_date desc`
      )
      .all(user.id);
    sendJson(res, 200, { data: rows });
    return;
  }

  const billPaymentMatch = url.pathname.match(/^\/api\/bills\/([^/]+)\/payments$/);
  if (billPaymentMatch) {
    await handleBillPaymentRoute(req, res, user, billPaymentMatch[1]);
    return;
  }

  const attachmentListMatch = url.pathname.match(/^\/api\/records\/([^/]+)\/attachments$/);
  if (attachmentListMatch) {
    await handleAttachmentListRoute(req, res, user, attachmentListMatch[1]);
    return;
  }

  const recordAttachmentMatch = url.pathname.match(/^\/api\/records\/([^/]+)\/([^/]+)\/attachments$/);
  if (recordAttachmentMatch) {
    await handleRecordAttachmentRoute(req, res, user, recordAttachmentMatch[1], recordAttachmentMatch[2]);
    return;
  }

  const attachmentDownloadMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/download$/);
  if (attachmentDownloadMatch) {
    await downloadAttachment(req, res, user, attachmentDownloadMatch[1]);
    return;
  }

  const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (attachmentMatch) {
    await handleAttachmentRoute(req, res, user, attachmentMatch[1]);
    return;
  }

  const recordMatch = url.pathname.match(/^\/api\/records\/([^/]+)(?:\/([^/]+))?$/);
  if (recordMatch) {
    await handleRecordRoute(req, res, user, recordMatch[1], recordMatch[2]);
    return;
  }

  sendJson(res, 404, { error: 'Route not found.' });
}

async function handleBillPaymentRoute(req, res, user, billId) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const bill = db.prepare('select * from bills where id = ? and user_id = ?').get(billId, user.id);
  if (!bill) {
    sendJson(res, 404, { error: 'Bill not found.' });
    return;
  }

  const body = await readJson(req);
  const amount = Number(body.amount || 0);
  const paymentDate = String(body.payment_date || '').trim();

  if (!amount || !paymentDate) {
    sendJson(res, 400, { error: 'Payment amount and date are required.' });
    return;
  }

  const paymentId = randomUUID();
  db.prepare(
    `insert into bill_payments (id, user_id, bill_id, amount, payment_date, confirmation_number)
     values (?, ?, ?, ?, ?, ?)`
  ).run(paymentId, user.id, billId, amount, paymentDate, body.confirmation_number || null);

  const nextDueDate = getNextDueDate(bill, paymentDate);
  const nextStatus = bill.recurrence_type === 'once' ? 'paid' : 'pending';
  db.prepare('update bills set due_date = ?, status = ? where id = ? and user_id = ?').run(
    nextDueDate || bill.due_date,
    nextStatus,
    billId,
    user.id
  );

  const files = Array.isArray(body.files) ? body.files : [];
  for (const file of files) {
    await saveAttachment(user.id, 'bill-payments', paymentId, file);
  }

  sendJson(res, 201, { ok: true, id: paymentId, nextDueDate });
}

async function handleRecordRoute(req, res, user, entityKey, id) {
  const entity = financeEntities[entityKey];
  if (!entity) {
    sendJson(res, 404, { error: 'Unknown record type.' });
    return;
  }

  if (req.method === 'GET' && !id) {
    const rows = db
      .prepare(`select * from ${entity.table} where user_id = ? order by created_at desc`)
      .all(user.id);
    sendJson(res, 200, { data: rows });
    return;
  }

  if (req.method === 'POST' && !id) {
    const body = await readJson(req);
    const record = normalizeRecord(entityKey, cleanRecord(body, entity.fields));
    const columns = ['id', 'user_id', ...entity.fields];
    const placeholders = columns.map(() => '?').join(', ');
    const id = randomUUID();
    const values = [id, user.id, ...entity.fields.map((field) => record[field])];

    db.prepare(`insert into ${entity.table} (${columns.join(', ')}) values (${placeholders})`).run(...values);
    sendJson(res, 201, { ok: true, id });
    return;
  }

  if (req.method === 'PUT' && id) {
    const body = await readJson(req);
    const record = normalizeRecord(entityKey, cleanRecord(body, entity.fields));
    const assignments = entity.fields.map((field) => `${field} = ?`).join(', ');
    const values = [...entity.fields.map((field) => record[field]), id, user.id];

    db.prepare(`update ${entity.table} set ${assignments} where id = ? and user_id = ?`).run(...values);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'DELETE' && id) {
    await deleteRecordAttachments(user.id, entityKey, id);
    db.prepare(`delete from ${entity.table} where id = ? and user_id = ?`).run(id, user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

async function handleAttachmentListRoute(req, res, user, entityKey) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!financeEntities[entityKey]) {
    sendJson(res, 404, { error: 'Unknown record type.' });
    return;
  }

  const rows = db
    .prepare(
      `select id, entity_key, record_id, original_name, mime_type, file_size, created_at
       from attachments
       where user_id = ? and entity_key = ?
       order by created_at desc`
    )
    .all(user.id, entityKey)
    .map(publicAttachment);

  sendJson(res, 200, { data: rows });
}

async function handleRecordAttachmentRoute(req, res, user, entityKey, recordId) {
  if (!getOwnedRecord(user.id, entityKey, recordId)) {
    sendJson(res, 404, { error: 'Record not found.' });
    return;
  }

  if (req.method === 'GET') {
    const rows = db
      .prepare(
        `select id, entity_key, record_id, original_name, mime_type, file_size, created_at
         from attachments
         where user_id = ? and entity_key = ? and record_id = ?
         order by created_at desc`
      )
      .all(user.id, entityKey, recordId)
      .map(publicAttachment);

    sendJson(res, 200, { data: rows });
    return;
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const files = Array.isArray(body.files) ? body.files : [];
    const savedFiles = [];

    for (const file of files) {
      savedFiles.push(await saveAttachment(user.id, entityKey, recordId, file));
    }

    sendJson(res, 201, { data: savedFiles });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

async function handleAttachmentRoute(req, res, user, attachmentId) {
  if (req.method !== 'DELETE') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const attachment = db.prepare('select * from attachments where id = ? and user_id = ?').get(attachmentId, user.id);
  if (!attachment) {
    sendJson(res, 404, { error: 'Attachment not found.' });
    return;
  }

  db.prepare('delete from attachments where id = ? and user_id = ?').run(attachmentId, user.id);
  await unlink(attachment.storage_path).catch(() => {});
  sendJson(res, 200, { ok: true });
}

async function deleteRecordAttachments(userId, entityKey, recordId) {
  const attachments = db
    .prepare('select * from attachments where user_id = ? and entity_key = ? and record_id = ?')
    .all(userId, entityKey, recordId);

  db.prepare('delete from attachments where user_id = ? and entity_key = ? and record_id = ?').run(
    userId,
    entityKey,
    recordId
  );

  await Promise.all(attachments.map((attachment) => unlink(attachment.storage_path).catch(() => {})));
}

async function downloadAttachment(req, res, user, attachmentId) {
  const attachment = db.prepare('select * from attachments where id = ? and user_id = ?').get(attachmentId, user.id);
  if (!attachment || !existsSync(attachment.storage_path)) {
    sendJson(res, 404, { error: 'Attachment not found.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': attachment.mime_type || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${attachment.original_name.replaceAll('"', '')}"`
  });
  createReadStream(attachment.storage_path).pipe(res);
}

async function saveAttachment(userId, entityKey, recordId, file) {
  const originalName = sanitizeFileName(file.name || 'attachment');
  const mimeType = String(file.type || 'application/octet-stream').slice(0, 120);
  const base64 = String(file.data || '').split(',').pop();
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    throw new Error('Attachment is empty.');
  }

  if (buffer.length > maxUploadBytes) {
    throw new Error(`Attachment exceeds the ${Math.round(maxUploadBytes / 1024 / 1024)} MB limit.`);
  }

  const id = randomUUID();
  const userUploadDir = join(uploadDir, userId);
  mkdirSync(userUploadDir, { recursive: true });

  const storagePath = join(userUploadDir, `${id}-${originalName}`);
  await writeFile(storagePath, buffer);

  db.prepare(
    `insert into attachments
     (id, user_id, entity_key, record_id, original_name, mime_type, file_size, storage_path)
     values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, entityKey, recordId, originalName, mimeType, buffer.length, storagePath);

  return publicAttachment({
    id,
    entity_key: entityKey,
    record_id: recordId,
    original_name: originalName,
    mime_type: mimeType,
    file_size: buffer.length,
    created_at: new Date().toISOString()
  });
}

function getOwnedRecord(userId, entityKey, recordId) {
  const entity = financeEntities[entityKey];
  if (!entity) return null;
  return db.prepare(`select id from ${entity.table} where id = ? and user_id = ?`).get(recordId, userId);
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function publicAttachment(attachment) {
  return {
    id: attachment.id,
    entityKey: attachment.entity_key,
    recordId: attachment.record_id,
    name: attachment.original_name,
    type: attachment.mime_type,
    size: attachment.file_size,
    createdAt: attachment.created_at,
    downloadUrl: `/api/attachments/${attachment.id}/download`
  };
}

function getDashboardRecords(userId) {
  const records = Object.values(financeEntities).reduce((allRecords, entity) => {
    const rows = db.prepare(`select * from ${entity.table} where user_id = ? order by created_at desc`).all(userId);
    return { ...allRecords, [entity.table]: rows };
  }, {});

  records.bill_payments = db
    .prepare(
      `select bill_payments.*, bills.payee, bills.bill_type
       from bill_payments
       join bills on bills.id = bill_payments.bill_id
       where bill_payments.user_id = ?
       order by bill_payments.payment_date desc`
    )
    .all(userId);

  return records;
}

function getNextDueDate(bill, paymentDate) {
  if (bill.recurrence_type === 'monthly') {
    const currentDue = parseDateOnly(bill.due_date || paymentDate);
    const nextMonth = currentDue.month === 12 ? 1 : currentDue.month + 1;
    const nextYear = currentDue.month === 12 ? currentDue.year + 1 : currentDue.year;
    const preferredDay = Number(bill.recurrence_day || currentDue.day);
    return formatDateOnly(nextYear, nextMonth, clampDay(nextYear, nextMonth, preferredDay));
  }

  if (bill.recurrence_type === 'interval_days') {
    const days = Number(bill.interval_days || 30);
    const date = new Date(`${paymentDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  return bill.due_date;
}

function getNextMonthlyDueDate(preferredDay) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const todayKey = formatDateOnly(year, month, today.getDate());
  const thisMonthDate = formatDateOnly(year, month, clampDay(year, month, preferredDay));

  if (thisMonthDate >= todayKey) {
    return thisMonthDate;
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return formatDateOnly(nextYear, nextMonth, clampDay(nextYear, nextMonth, preferredDay));
}

function parseDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function formatDateOnly(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function clampDay(year, month, preferredDay) {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(preferredDay, lastDay);
}

function cleanRecord(body, fields) {
  return fields.reduce((record, field) => {
    return {
      ...record,
      [field]: body[field] === '' || body[field] === undefined ? null : body[field]
    };
  }, {});
}

function normalizeRecord(entityKey, record) {
  if (entityKey !== 'bills') return record;

  const dueDay = record.due_date ? Number(record.due_date.split('-')[2]) : null;
  const recurrenceType = record.recurrence_type || 'monthly';
  const recurrenceDay = recurrenceType === 'monthly' ? Number(record.recurrence_day || dueDay || 1) : null;
  const intervalDays = recurrenceType === 'interval_days' ? Number(record.interval_days || 30) : null;
  const normalizedRecurrenceDay = recurrenceDay ? Math.min(Math.max(recurrenceDay, 1), 31) : null;
  const dueDate =
    recurrenceType === 'monthly' && record.due_date && dueDay !== normalizedRecurrenceDay
      ? getNextMonthlyDueDate(normalizedRecurrenceDay)
      : record.due_date;

  return {
    ...record,
    due_date: dueDate,
    recurrence_type: recurrenceType,
    recurrence_day: normalizedRecurrenceDay,
    interval_days: intervalDays,
    status: record.status || 'pending'
  };
}

async function startGithubOAuth(res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || `http://127.0.0.1:${port}/api/auth/github/callback`;

  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    sendJson(res, 400, { error: 'GitHub OAuth is not configured yet.' });
    return;
  }

  const state = randomBytes(24).toString('hex');
  db.prepare('insert into oauth_states (state) values (?)').run(state);

  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', clientId);
  githubUrl.searchParams.set('redirect_uri', callbackUrl);
  githubUrl.searchParams.set('scope', 'read:user user:email');
  githubUrl.searchParams.set('state', state);

  res.writeHead(302, { Location: githubUrl.toString() });
  res.end();
}

async function finishGithubOAuth(req, res, url) {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const savedState = state ? db.prepare('select state from oauth_states where state = ?').get(state) : null;

  if (!code || !savedState) {
    redirect(res, '/?oauth=failed');
    return;
  }

  db.prepare('delete from oauth_states where state = ?').run(state);

  const callbackUrl = process.env.GITHUB_CALLBACK_URL || `http://127.0.0.1:${port}/api/auth/github/callback`;
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      code
    })
  });
  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    redirect(res, '/?oauth=failed');
    return;
  }

  const githubUser = await githubFetch('https://api.github.com/user', tokenData.access_token);
  const emails = await githubFetch('https://api.github.com/user/emails', tokenData.access_token);
  const primaryEmail = emails.find((email) => email.primary)?.email || githubUser.email;

  if (!primaryEmail) {
    redirect(res, '/?oauth=no-email');
    return;
  }

  const user = findOrCreateOAuthUser({
    provider: 'github',
    providerUserId: String(githubUser.id),
    email: primaryEmail,
    name: githubUser.name || githubUser.login
  });
  const session = createSession(db, user.id);

  res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  redirect(res, '/');
}

async function githubFetch(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'local-finance-dashboard'
    }
  });

  return response.json();
}

function findOrCreateOAuthUser({ provider, providerUserId, email, name }) {
  const linkedAccount = db
    .prepare(
      `select users.id, users.email, users.name
       from oauth_accounts
       join users on users.id = oauth_accounts.user_id
       where oauth_accounts.provider = ? and oauth_accounts.provider_user_id = ?`
    )
    .get(provider, providerUserId);

  if (linkedAccount) return linkedAccount;

  let user = db.prepare('select id, email, name from users where email = ?').get(email.toLowerCase());

  if (!user) {
    const userId = randomUUID();
    db.prepare('insert into users (id, email, name) values (?, ?, ?)').run(userId, email.toLowerCase(), name || null);
    seedStarterData(userId);
    user = db.prepare('select id, email, name from users where id = ?').get(userId);
  }

  db.prepare(
    'insert or ignore into oauth_accounts (id, user_id, provider, provider_user_id, provider_email) values (?, ?, ?, ?, ?)'
  ).run(randomUUID(), user.id, provider, providerUserId, email.toLowerCase());

  return user;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || '' };
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = resolve(join(distDir, requestedPath));

  if (!filePath.startsWith(resolve(distDir)) || !existsSync(filePath)) {
    const indexPath = join(distDir, 'index.html');
    if (!existsSync(indexPath)) {
      sendJson(res, 404, { error: 'Build the client first with npm run build.' });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Type': mimeType(filePath) });
  createReadStream(filePath).pipe(res);
}

function mimeType(filePath) {
  const types = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };

  return types[extname(filePath)] || 'application/octet-stream';
}
