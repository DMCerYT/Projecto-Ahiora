import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../server/db.js";
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
    const demo = seedDemo(db, { today: "2026-10-18" });
    db.close();
    db = openDatabase(path);
    try {
      assert.equal(
        db
          .prepare("SELECT name FROM businesses WHERE id = ?")
          .get(demo.owner.business_id).name,
        "Ahiora Demo Construction",
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n,
        2,
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.throws(() => seedDemo(db), /empty database/);
    } finally {
      db.close();
    }
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
