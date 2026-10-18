import "../server/env.js";
import { existsSync, rmSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { defaultDbPath, openDatabase, rootDir } from "../server/db.js";
import { demoAccounts, seedDemo } from "../server/demo.js";

const path = resolve(process.env.DB_PATH || defaultDbPath);
// An explicit local reset must never delete an unrelated path outside this repository.
if (
  !path.startsWith(resolve(rootDir, "data") + sep) ||
  !/\.(sqlite|db)$/.test(path)
)
  throw new Error(
    "Reset requires a .sqlite or .db file inside the repository data/ directory.",
  );
for (const suffix of ["", "-wal", "-shm"])
  if (existsSync(path + suffix)) rmSync(path + suffix);
rmSync(join(rootDir, "data/uploads"), { recursive: true, force: true });
const db = openDatabase(path);
try {
  seedDemo(db, { uploadDir: join(rootDir, "data/uploads") });
  console.log("Fresh domain database and demo records created.");
  console.log(
    demoAccounts
      .map(({ role, email, password }) => `${role}: ${email} / ${password}`)
      .join("\n"),
  );
} finally {
  db.close();
}
