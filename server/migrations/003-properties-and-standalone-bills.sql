CREATE TABLE properties (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL, address TEXT NOT NULL, tenant_name TEXT NOT NULL DEFAULT '',
  monthly_rent_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_rent_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id)
);
CREATE TABLE bills_new (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL, payee_account_number TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  first_due_date TEXT NOT NULL,
  recurrence TEXT NOT NULL CHECK(recurrence IN ('once', 'monthly', 'weekly', 'yearly', 'interval_days')),
  recurrence_day INTEGER CHECK(recurrence_day BETWEEN 1 AND 31), interval_days INTEGER CHECK(interval_days > 0),
  billing_account_id TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)), paused_at TEXT,
  UNIQUE(id, business_id),
  FOREIGN KEY(billing_account_id, business_id) REFERENCES billing_accounts(id, business_id),
  CHECK(recurrence <> 'monthly' OR recurrence_day IS NOT NULL),
  CHECK(recurrence <> 'interval_days' OR interval_days IS NOT NULL)
);
INSERT INTO bills_new SELECT id, business_id, name, payee_account_number, amount_cents, first_due_date,
  recurrence, recurrence_day, interval_days, billing_account_id, active, paused_at FROM bills;
DROP TABLE bills;
ALTER TABLE bills_new RENAME TO bills;
CREATE TABLE transactions_new (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, project_id TEXT, property_id TEXT, bill_id TEXT,
  name TEXT NOT NULL, invoice_id TEXT, date TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'refund')),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded', 'void')),
  primary_reference_id TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id),
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id),
  FOREIGN KEY(property_id, business_id) REFERENCES properties(id, business_id),
  FOREIGN KEY(bill_id, business_id) REFERENCES bills(id, business_id),
  FOREIGN KEY(primary_reference_id, id) REFERENCES evidence_references(id, transaction_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(created_by, business_id) REFERENCES users(id, business_id),
  CHECK((project_id IS NOT NULL) + (property_id IS NOT NULL) + (bill_id IS NOT NULL) = 1),
  CHECK(bill_id IS NULL OR type = 'expense')
);
INSERT INTO transactions_new (id, business_id, project_id, bill_id, name, invoice_id, date, amount_cents,
  type, status, primary_reference_id, created_by, created_at)
SELECT t.id, t.business_id,
  CASE WHEN p.id IS NULL THEN t.project_id ELSE NULL END,
  o.bill_id, t.name, t.invoice_id, t.date, t.amount_cents, t.type, t.status, t.primary_reference_id, t.created_by, t.created_at
FROM transactions t LEFT JOIN payments p ON p.transaction_id = t.id
LEFT JOIN bill_occurrences o ON o.id = p.occurrence_id;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX transaction_project_date ON transactions(project_id, date);
CREATE INDEX transaction_property_date ON transactions(property_id, date);
