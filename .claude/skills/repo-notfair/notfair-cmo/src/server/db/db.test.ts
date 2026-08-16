import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test re-imports the module after tweaking env so the module-scoped
// DEFAULT_DATA_DIR / DB_PATH constants pick up our tmpdir override. The
// connection is cached at module level — vi.resetModules() between tests
// ensures we get a fresh `cached: null` every time.
type DbModule = typeof import("./db");

async function loadDb(): Promise<DbModule> {
  return (await import("./db")) as DbModule;
}

let tmpDir: string;
const ORIGINAL_ENV = process.env.NOTFAIR_CMO_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = mkdtempSync(join(tmpdir(), "notfair-cmo-db-test-"));
  process.env.NOTFAIR_CMO_DATA_DIR = tmpDir;
});

afterEach(() => {
  // Restore env so other tests don't pick up our tmpdir.
  if (ORIGINAL_ENV === undefined) {
    delete process.env.NOTFAIR_CMO_DATA_DIR;
  } else {
    process.env.NOTFAIR_CMO_DATA_DIR = ORIGINAL_ENV;
  }
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("getDbPath", () => {
  it("returns the path inside NOTFAIR_CMO_DATA_DIR", async () => {
    const { getDbPath } = await loadDb();
    expect(getDbPath()).toBe(join(tmpDir, "db.sqlite"));
  });

  it("falls back to ~/.notfair-cmo when env var is unset", async () => {
    delete process.env.NOTFAIR_CMO_DATA_DIR;
    vi.resetModules();
    const fakeHome = mkdtempSync(join(tmpdir(), "notfair-cmo-fake-home-"));
    try {
      vi.doMock("node:os", async () => {
        const actual = await vi.importActual<typeof import("node:os")>("node:os");
        return { ...actual, homedir: () => fakeHome };
      });
      const { getDbPath } = await loadDb();
      expect(getDbPath()).toBe(join(fakeHome, ".notfair-cmo", "db.sqlite"));
    } finally {
      vi.doUnmock("node:os");
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

describe("getDb", () => {
  it("creates the data dir if it doesn't exist", async () => {
    const nested = join(tmpDir, "nested", "deeper");
    process.env.NOTFAIR_CMO_DATA_DIR = nested;
    vi.resetModules();
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      expect(existsSync(nested)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("creates the data dir with mode 0o700", async () => {
    const nested = join(tmpDir, "secure");
    process.env.NOTFAIR_CMO_DATA_DIR = nested;
    vi.resetModules();
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      const stat = statSync(nested);
      // On POSIX systems we expect 0o700. Skip on Windows-y environments.
      if (process.platform !== "win32") {
        // Mask with 0o777 to strip the file-type bits.
        expect(stat.mode & 0o777).toBe(0o700);
      }
    } finally {
      db.close();
    }
  });

  it("opens the SQLite file at the expected path", async () => {
    const { getDb, getDbPath } = await loadDb();
    const db = getDb();
    try {
      expect(existsSync(getDbPath())).toBe(true);
    } finally {
      db.close();
    }
  });

  it("returns a cached instance on subsequent calls", async () => {
    const { getDb } = await loadDb();
    const a = getDb();
    const b = getDb();
    try {
      expect(a).toBe(b);
    } finally {
      a.close();
    }
  });

  it("enables foreign_keys pragma", async () => {
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      const row = db.pragma("foreign_keys", { simple: true });
      expect(row).toBe(1);
    } finally {
      db.close();
    }
  });

  it("sets WAL journal mode", async () => {
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      const mode = db.pragma("journal_mode", { simple: true });
      expect(String(mode).toLowerCase()).toBe("wal");
    } finally {
      db.close();
    }
  });

  it("sets busy_timeout to 5000", async () => {
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      const ms = db.pragma("busy_timeout", { simple: true });
      expect(ms).toBe(5000);
    } finally {
      db.close();
    }
  });

  it("applies migrations on first open", async () => {
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      // Every migration from MIGRATIONS should be recorded.
      const { MIGRATIONS } = await import("./migrations");
      const applied = db
        .prepare("SELECT name FROM _migrations ORDER BY name")
        .all() as { name: string }[];
      expect(applied.map((r) => r.name).sort()).toEqual(
        MIGRATIONS.map((m) => m.name).sort(),
      );

      // Spot-check that the schema is real (table from 001_init).
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
        .all();
      expect(tables).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("does not re-apply migrations on a second open", async () => {
    {
      const { getDb } = await loadDb();
      const db = getDb();
      db.close();
    }

    // Reset module so cached=null but the file at NOTFAIR_CMO_DATA_DIR remains.
    vi.resetModules();
    const { getDb } = await loadDb();
    const db = getDb();
    try {
      const { MIGRATIONS } = await import("./migrations");
      const rows = db
        .prepare("SELECT COUNT(*) AS n FROM _migrations")
        .get() as { n: number };
      // Should NOT have duplicated.
      expect(rows.n).toBe(MIGRATIONS.length);
    } finally {
      db.close();
    }
  });
});
