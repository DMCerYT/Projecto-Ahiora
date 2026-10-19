import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../server/db.js";
import { FinanceStore } from "../server/domain.js";
import { seedDemo } from "../server/demo.js";

test("versioned migrations are idempotent and startup preserves existing data", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahiora-migrations-")),
    path = join(temp, "finance.sqlite");
  try {
    // Start with an existing version-one database, then apply new migrations.
    let db = new DatabaseSync(path);
    db.exec(
      readFileSync(
        new URL("../server/migrations/001-domain.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1)",
    );
    db.exec(`BEGIN;
      INSERT INTO businesses (id,name,owner_id) VALUES ('b','Existing business','u');
      INSERT INTO users (id,business_id,email,name,role) VALUES ('u','b','owner@example.com','Owner','owner');
      INSERT INTO projects (id,business_id,name,start_date,budget_cents) VALUES ('p','b','Existing project','2026-01-01',10000);
      INSERT INTO billing_accounts (id,business_id,name) VALUES ('account','b','Checking');
      INSERT INTO bills (id,business_id,project_id,name,amount_cents,first_due_date,recurrence) VALUES ('bill','b','p','Existing bill',100,'2026-01-01','once');
      INSERT INTO bill_occurrences (id,business_id,bill_id,due_date,amount_cents,status) VALUES ('o','b','bill','2026-01-01',100,'paid');
      INSERT INTO evidence_references (id,business_id,transaction_id,occurrence_id,evidence_at,created_by) VALUES ('r','b','tx','o','2026-01-01T12:00:00Z','u');
      INSERT INTO transactions (id,business_id,project_id,name,date,amount_cents,type,primary_reference_id,created_by) VALUES ('tx','b','p','Existing expense','2026-01-01',100,'expense','r','u');
      INSERT INTO payments (id,business_id,occurrence_id,billing_account_id,payment_date,amount_cents,status,transaction_id,recorded_by) VALUES ('pay','b','o','account','2026-01-01',100,'processed','tx','u');
      COMMIT;`);
    db.close();
    db = openDatabase(path);
    try {
      assert.equal(
        db.prepare("SELECT name FROM businesses WHERE id = ?").get("b").name,
        "Existing business",
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n,
        5,
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      const tx = db.prepare("SELECT * FROM transactions WHERE id = 'tx'").get();
      assert.equal(tx.project_id, null);
      assert.equal(tx.bill_id, "bill");
      assert.equal(
        db
          .prepare(
            "SELECT reference_number FROM evidence_references WHERE id = 'r'",
          )
          .get().reference_number,
        null,
      );
      assert.equal(
        db.prepare("SELECT transaction_id FROM payments WHERE id = 'pay'").get()
          .transaction_id,
        "tx",
      );
      assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
      assert.throws(() => seedDemo(db), /empty database/);
    } finally {
      db.close();
    }
    db = openDatabase(path);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM transactions").get().n,
      1,
    );
    db.close();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
test("legacy databases require the explicit reset command instead of silent destruction", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahiora-legacy-")),
    path = join(temp, "legacy.sqlite");
  try {
    let db = new DatabaseSync(path);
    db.exec("CREATE TABLE incomes (id TEXT)");
    db.close();
    assert.throws(() => openDatabase(path), /npm run db:reset/);
    db = new DatabaseSync(path);
    try {
      assert.ok(
        db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'incomes'").get(),
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("migration four preserves existing property income and attachments, then permits receipt-free rent", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahiora-rent-migration-")),
    path = join(temp, "finance.sqlite");
  let db = new DatabaseSync(path);
  try {
    for (const file of [
      "001-domain.sql",
      "002-bill-images.sql",
      "003-properties-and-standalone-bills.sql",
    ])
      db.exec(
        readFileSync(
          new URL(`../server/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    db.exec(
      "PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1),(2),(3)",
    );
    db.exec(`BEGIN;
      INSERT INTO businesses (id,name,owner_id) VALUES ('b','Existing business','u');
      INSERT INTO users (id,business_id,email,name,role) VALUES ('u','b','owner@example.com','Owner','owner');
      INSERT INTO properties (id,business_id,name,address) VALUES ('property','b','Rental','123 Main');
      INSERT INTO evidence_references (id,business_id,transaction_id,reference_number,created_by) VALUES ('ref','b','rent','RENT-OLD','u');
      INSERT INTO transactions (id,business_id,property_id,name,date,amount_cents,type,primary_reference_id,created_by) VALUES ('rent','b','property','Existing rent','2026-10-18',90000,'income','ref','u');
      INSERT INTO file_attachments (id,business_id,reference_id,original_name,mime_type,size_bytes,storage_name) VALUES ('file','b','ref','rent.txt','text/plain',5,'rent.bin');
      COMMIT;`);
    const demo = { owner: { id: "u", business_id: "b", role: "owner" } },
      property = { id: "property" },
      old = { id: "rent" },
      ref = "ref";
    db.close();
    db = openDatabase(path);
    const store = new FinanceStore(db, { uploadDir: temp });
    const migratedProperty = db
      .prepare("SELECT status, deleted_at FROM properties WHERE id = ?")
      .get(property.id);
    assert.equal(migratedProperty.status, "active");
    assert.equal(migratedProperty.deleted_at, null);
    assert.equal(
      db
        .prepare("SELECT primary_reference_id FROM transactions WHERE id = ?")
        .get(old.id).primary_reference_id,
      ref,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM file_attachments WHERE reference_id = ?",
        )
        .get(ref).n,
      1,
    );
    const created = store.createTransaction(demo.owner, {
      property_id: property.id,
      type: "income",
      amount: "950",
      date: "2026-10-18",
    });
    assert.equal(
      db
        .prepare("SELECT primary_reference_id FROM transactions WHERE id = ?")
        .get(created.id).primary_reference_id,
      null,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
