CREATE TABLE businesses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL UNIQUE,
  default_language TEXT NOT NULL DEFAULT 'en' CHECK(default_language IN ('en', 'es')),
  currency TEXT NOT NULL DEFAULT 'USD', time_zone TEXT NOT NULL DEFAULT 'America/New_York',
  FOREIGN KEY(owner_id, id) REFERENCES users(id, business_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE users (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'employee')), title TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en', 'es')),
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id),
  CHECK(role = 'admin' OR last_accessed_at IS NULL),
  CHECK(role <> 'employee' OR (title IS NOT NULL AND length(trim(title)) > 0))
);
CREATE UNIQUE INDEX one_owner_per_business ON users(business_id) WHERE role = 'owner';
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL
);
CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, UNIQUE(provider, provider_user_id)
);
CREATE TABLE oauth_states (state TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), name TEXT NOT NULL,
  start_date TEXT NOT NULL, end_date TEXT, budget_cents INTEGER NOT NULL CHECK(budget_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id), CHECK(end_date IS NULL OR end_date >= start_date)
);
CREATE TABLE employee_projects (
  business_id TEXT NOT NULL, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
  PRIMARY KEY(user_id, project_id),
  FOREIGN KEY(user_id, business_id) REFERENCES users(id, business_id),
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id)
);
CREATE TABLE contractors (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
  UNIQUE(id, business_id)
);
CREATE TABLE contractor_projects (
  business_id TEXT NOT NULL, contractor_id TEXT NOT NULL, project_id TEXT NOT NULL,
  PRIMARY KEY(contractor_id, project_id),
  FOREIGN KEY(contractor_id, business_id) REFERENCES contractors(id, business_id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id)
);
CREATE TABLE billing_accounts (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL, masked_identifier TEXT NOT NULL DEFAULT '', UNIQUE(id, business_id)
);
CREATE TABLE bills (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), project_id TEXT NOT NULL,
  name TEXT NOT NULL, payee_account_number TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  first_due_date TEXT NOT NULL,
  recurrence TEXT NOT NULL CHECK(recurrence IN ('once', 'monthly', 'weekly', 'yearly', 'interval_days')),
  recurrence_day INTEGER CHECK(recurrence_day BETWEEN 1 AND 31), interval_days INTEGER CHECK(interval_days > 0),
  billing_account_id TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)), paused_at TEXT,
  UNIQUE(id, business_id),
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id),
  FOREIGN KEY(billing_account_id, business_id) REFERENCES billing_accounts(id, business_id),
  CHECK(recurrence <> 'monthly' OR recurrence_day IS NOT NULL),
  CHECK(recurrence <> 'interval_days' OR interval_days IS NOT NULL)
);
CREATE TABLE bill_occurrences (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, bill_id TEXT NOT NULL, due_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'processing', 'paid', 'canceled')),
  UNIQUE(bill_id, due_date), UNIQUE(id, business_id),
  FOREIGN KEY(bill_id, business_id) REFERENCES bills(id, business_id)
);
CREATE TABLE evidence_references (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, transaction_id TEXT, occurrence_id TEXT,
  reference_number TEXT, evidence_at TEXT, description TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id), UNIQUE(id, transaction_id),
  FOREIGN KEY(transaction_id, business_id) REFERENCES transactions(id, business_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(occurrence_id, business_id) REFERENCES bill_occurrences(id, business_id),
  FOREIGN KEY(created_by, business_id) REFERENCES users(id, business_id),
  CHECK(transaction_id IS NOT NULL OR occurrence_id IS NOT NULL)
);
CREATE TABLE file_attachments (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, reference_id TEXT NOT NULL,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  storage_name TEXT NOT NULL UNIQUE,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY(reference_id, business_id) REFERENCES evidence_references(id, business_id)
);
CREATE TABLE transactions (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL,
  invoice_id TEXT, date TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'refund')),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded', 'void')),
  primary_reference_id TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id),
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id),
  FOREIGN KEY(primary_reference_id, id) REFERENCES evidence_references(id, transaction_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(created_by, business_id) REFERENCES users(id, business_id)
);
CREATE TABLE payments (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, occurrence_id TEXT NOT NULL UNIQUE,
  billing_account_id TEXT NOT NULL, payment_date TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  status TEXT NOT NULL CHECK(status IN ('processing', 'processed', 'failed')),
  transaction_id TEXT UNIQUE, recorded_by TEXT NOT NULL,
  FOREIGN KEY(occurrence_id, business_id) REFERENCES bill_occurrences(id, business_id),
  FOREIGN KEY(billing_account_id, business_id) REFERENCES billing_accounts(id, business_id),
  FOREIGN KEY(transaction_id, business_id) REFERENCES transactions(id, business_id),
  FOREIGN KEY(recorded_by, business_id) REFERENCES users(id, business_id),
  CHECK((status = 'processed' AND transaction_id IS NOT NULL) OR (status <> 'processed' AND transaction_id IS NULL))
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, project_id TEXT, transaction_id TEXT,
  author_id TEXT NOT NULL, text TEXT NOT NULL CHECK(length(trim(text)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), edited_at TEXT,
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id),
  FOREIGN KEY(transaction_id, business_id) REFERENCES transactions(id, business_id),
  FOREIGN KEY(author_id, business_id) REFERENCES users(id, business_id),
  CHECK((project_id IS NOT NULL) <> (transaction_id IS NOT NULL))
);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, entity_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX transactions_project ON transactions(business_id, project_id, date);
CREATE INDEX occurrence_dates ON bill_occurrences(business_id, due_date);
CREATE INDEX references_transaction ON evidence_references(transaction_id);
CREATE INDEX references_occurrence ON evidence_references(occurrence_id);
CREATE INDEX comments_targets ON comments(business_id, project_id, transaction_id);
