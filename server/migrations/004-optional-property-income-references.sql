CREATE TABLE transactions_new (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, project_id TEXT, property_id TEXT, bill_id TEXT,
  name TEXT NOT NULL, invoice_id TEXT, date TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'refund')),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded', 'void')),
  primary_reference_id TEXT UNIQUE, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(id, business_id),
  FOREIGN KEY(project_id, business_id) REFERENCES projects(id, business_id),
  FOREIGN KEY(property_id, business_id) REFERENCES properties(id, business_id),
  FOREIGN KEY(bill_id, business_id) REFERENCES bills(id, business_id),
  FOREIGN KEY(primary_reference_id, id) REFERENCES evidence_references(id, transaction_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(created_by, business_id) REFERENCES users(id, business_id),
  CHECK((project_id IS NOT NULL) + (property_id IS NOT NULL) + (bill_id IS NOT NULL) = 1),
  CHECK(bill_id IS NULL OR type = 'expense'),
  CHECK(primary_reference_id IS NOT NULL OR (property_id IS NOT NULL AND type = 'income'))
);
INSERT INTO transactions_new SELECT * FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX transaction_project_date ON transactions(project_id, date);
CREATE INDEX transaction_property_date ON transactions(property_id, date);
