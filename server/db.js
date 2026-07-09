import './env.js';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, 'data');
const dbPath = process.env.DB_PATH || join(dataDir, 'finance.sqlite');

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('pragma foreign_keys = on;');

export function initDatabase() {
  db.exec(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      name text,
      password_hash text,
      created_at text not null default (datetime('now'))
    );

    create table if not exists oauth_accounts (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      provider text not null,
      provider_user_id text not null,
      provider_email text,
      created_at text not null default (datetime('now')),
      unique(provider, provider_user_id)
    );

    create table if not exists oauth_states (
      state text primary key,
      created_at text not null default (datetime('now'))
    );

    create table if not exists sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at text not null,
      created_at text not null default (datetime('now'))
    );

    create table if not exists incomes (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      description text not null,
      reference_number text,
      amount real not null default 0,
      collected_date text,
      status text not null default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists expenses (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      description text not null,
      category text,
      reference_number text,
      amount real not null default 0,
      paid_date text,
      status text not null default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists providers (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      name text not null,
      service text,
      reference_number text,
      amount_due real default 0,
      payment_date text,
      status text default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists employees (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      name text not null,
      role text,
      reference_number text,
      salary real default 0,
      payment_date text,
      status text default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists client_charges (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      client_name text not null,
      description text,
      reference_number text,
      amount real not null default 0,
      collection_date text,
      status text not null default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists debts (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      creditor text not null,
      description text,
      reference_number text,
      amount real not null default 0,
      due_date text,
      status text not null default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists attachments (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      entity_key text not null,
      record_id text not null,
      original_name text not null,
      mime_type text,
      file_size integer not null,
      storage_path text not null,
      created_at text not null default (datetime('now'))
    );

    create table if not exists bills (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      payee text not null,
      bill_type text,
      reference_number text,
      amount real not null default 0,
      due_date text,
      recurrence_type text not null default 'once',
      recurrence_day integer,
      interval_days integer,
      payment_method text,
      payment_link text,
      phone_number text,
      notes text,
      status text not null default 'pending',
      created_at text not null default (datetime('now'))
    );

    create table if not exists bill_payments (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      bill_id text not null references bills(id) on delete cascade,
      amount real not null default 0,
      payment_date text not null,
      confirmation_number text,
      created_at text not null default (datetime('now'))
    );
  `);

  applyMigrations();
}

function applyMigrations() {
  ensureColumn('incomes', 'reference_number text');
  ensureColumn('expenses', 'reference_number text');
  ensureColumn('providers', 'reference_number text');
  ensureColumn('employees', 'reference_number text');
  ensureColumn('client_charges', 'reference_number text');
  ensureColumn('debts', 'reference_number text');
  ensureColumn('bills', "recurrence_type text not null default 'once'");
  ensureColumn('bills', 'recurrence_day integer');
  ensureColumn('bills', 'interval_days integer');
}

function ensureColumn(table, columnDefinition) {
  const columnName = columnDefinition.split(' ')[0];
  const columns = db.prepare(`pragma table_info(${table})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.exec(`alter table ${table} add column ${columnDefinition}`);
  }
}

export function seedStarterData(userId) {
  const existing = db.prepare('select count(*) as total from incomes where user_id = ?').get(userId);
  if (existing.total > 0) return;

  const now = new Date();
  const date = (day) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  db.prepare('insert into incomes (id, user_id, description, amount, collected_date, status) values (?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    'Retail sales',
    5200,
    date(5),
    'collected'
  );
  db.prepare('insert into expenses (id, user_id, description, category, amount, paid_date, status) values (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    'Office rent',
    'Operations',
    1600,
    date(1),
    'paid'
  );
  db.prepare('insert into providers (id, user_id, name, service, amount_due, payment_date, status) values (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    'Acme Supplies',
    'Inventory',
    820,
    date(24),
    'pending'
  );
  db.prepare('insert into employees (id, user_id, name, role, salary, payment_date, status) values (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    'Maria Lopez',
    'Manager',
    2400,
    date(28),
    'pending'
  );
  db.prepare('insert into client_charges (id, user_id, client_name, description, amount, collection_date, status) values (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    'Northside Cafe',
    'Monthly service',
    950,
    date(22),
    'pending'
  );
  db.prepare('insert into debts (id, user_id, creditor, description, amount, due_date, status) values (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    'Business Loan',
    'Loan payment',
    700,
    date(26),
    'pending'
  );
  db.prepare(
    `insert into bills
     (id, user_id, payee, bill_type, reference_number, amount, due_date, recurrence_type, recurrence_day, payment_method, payment_link, phone_number, notes, status)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    userId,
    'Home Mortgage',
    'Mortgage',
    'MTG-2026',
    1850,
    date(15),
    'monthly',
    15,
    'Online portal',
    'https://example.com/pay-mortgage',
    '800-555-0101',
    'Pay from business checking.',
    'pending'
  );
}

export function createLocalUser({ email, password, name }) {
  const id = randomUUID();
  db.prepare('insert into users (id, email, name, password_hash) values (?, ?, ?, ?)').run(
    id,
    email.toLowerCase(),
    name || null,
    hashPassword(password)
  );
  seedStarterData(id);
  return db.prepare('select id, email, name from users where id = ?').get(id);
}
