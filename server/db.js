import "./env.js";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const rootDir = fileURLToPath(new URL("../", import.meta.url));
export const defaultDbPath = resolve(rootDir, "data/finance.sqlite");

export function openDatabase(path = process.env.DB_PATH || defaultDbPath) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;",
    );
    const legacy = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'incomes'",
      )
      .get();
    if (legacy)
      throw new Error(
        "Legacy database detected. Run npm run db:reset to replace it with the domain model and demo data.",
      );
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    const migrations = [
      new URL("./migrations/001-domain.sql", import.meta.url),
      new URL("./migrations/002-bill-images.sql", import.meta.url),
      new URL(
        "./migrations/003-properties-and-standalone-bills.sql",
        import.meta.url,
      ),
      new URL(
        "./migrations/004-optional-property-income-references.sql",
        import.meta.url,
      ),
    ];
    migrations.forEach((url, index) => {
      const version = index + 1;
      if (
        db
          .prepare("SELECT version FROM schema_migrations WHERE version = ?")
          .get(version)
      )
        return;
      // Rebuilding referenced tables requires disabling FK enforcement outside the transaction.
      db.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE");
      try {
        db.exec(readFileSync(url, "utf8"));
        db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
          version,
        );
        if (db.prepare("PRAGMA foreign_key_check").all().length)
          throw new Error("Migration failed foreign key validation");
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      } finally {
        db.exec("PRAGMA foreign_keys = ON");
      }
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
