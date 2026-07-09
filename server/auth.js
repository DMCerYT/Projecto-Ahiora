import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SESSION_DAYS = 7;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, savedHash) {
  const [salt, hash] = savedHash.split(':');
  const incomingHash = scryptSync(password, salt, 64);
  const savedBuffer = Buffer.from(hash, 'hex');

  if (incomingHash.length !== savedBuffer.length) return false;
  return timingSafeEqual(incomingHash, savedBuffer);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare('insert into sessions (id, user_id, token_hash, expires_at) values (?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    tokenHash,
    expiresAt
  );

  return { token, expiresAt };
}

export function sessionCookie(token, expiresAt) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookie() {
  return 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}

export function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export function getSessionUser(db, req) {
  const token = getCookie(req, 'sid');
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = db
    .prepare(
      `select sessions.id as session_id, users.id, users.email, users.name
       from sessions
       join users on users.id = sessions.user_id
       where sessions.token_hash = ? and sessions.expires_at > ?`
    )
    .get(tokenHash, new Date().toISOString());

  return session || null;
}
