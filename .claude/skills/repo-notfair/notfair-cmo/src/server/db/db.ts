import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations";

const DEFAULT_DATA_DIR = process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
const DB_PATH = join(DEFAULT_DATA_DIR, "db.sqlite");

let cached: Database.Database | null = null;

export function getDb(): Database.Database {
  if (cached) return cached;

  if (!existsSync(DEFAULT_DATA_DIR)) {
    mkdirSync(DEFAULT_DATA_DIR, { recursive: true, mode: 0o700 });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  applyMigrations(db);

  cached = db;
  return db;
}

export function getDbPath(): string {
  return DB_PATH;
}

function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (row) => row.name,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        migration.name,
        new Date().toISOString(),
      );
    });
    tx();
  }
}
