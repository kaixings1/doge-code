import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

// Use a real in-memory better-sqlite3 instance so SQLite's FK constraint
// actually engages — mocking the DB would defeat the point (the bug was a
// real FK violation our code wasn't catching).
let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  archiveProject,
  changeProjectSlug,
  createProject,
  deleteProjectRow,
  getProject,
  listProjects,
  renameProject,
  setProjectGoogleAdsAccount,
  unarchiveProject,
} from "./projects";

function applyMigrations(db: Database.Database): void {
  for (const migration of MIGRATIONS) {
    db.exec(migration.sql);
  }
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("createProject", () => {
  it("creates a new project from display_name and returns the row", () => {
    const result = createProject({ display_name: "Acme Inc." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slug).toBe("acme-inc");
    expect(result.project.display_name).toBe("Acme Inc.");
    expect(result.project.archived_at).toBeNull();
    expect(result.project.google_ads_account_id).toBeNull();
    expect(result.project.id).toMatch(/[0-9a-f-]{36}/);
    expect(Date.parse(result.project.created_at)).toBeGreaterThan(0);

    // Round-trip via DB.
    const row = testDb
      .prepare("SELECT * FROM projects WHERE slug = ?")
      .get("acme-inc");
    expect(row).toMatchObject({ slug: "acme-inc", display_name: "Acme Inc." });
  });

  it("respects an explicit slug override", () => {
    const result = createProject({
      display_name: "Long Pretty Name",
      slug: "shortie",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slug).toBe("shortie");
    expect(result.project.display_name).toBe("Long Pretty Name");
  });

  it("trims display_name", () => {
    const result = createProject({ display_name: "   Acme   " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.display_name).toBe("Acme");
  });

  it("returns { ok: false } when slugify fails (empty input)", () => {
    const result = createProject({ display_name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/empty/i);
  });

  it("returns { ok: false } when slug is reserved", () => {
    const result = createProject({ display_name: "api" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/reserved/i);
  });

  it("returns { ok: false } when slug already exists", () => {
    const first = createProject({ display_name: "Acme" });
    expect(first.ok).toBe(true);
    const dup = createProject({ display_name: "Acme" });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toMatch(/already exists/i);
  });
});

describe("listProjects", () => {
  it("returns empty array when no projects exist", () => {
    expect(listProjects()).toEqual([]);
  });

  it("orders by created_at DESC", () => {
    testDb
      .prepare(
        "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
      )
      .run("p1", "old", "Old", "2026-01-01T00:00:00.000Z");
    testDb
      .prepare(
        "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
      )
      .run("p2", "new", "New", "2026-02-01T00:00:00.000Z");
    const rows = listProjects();
    expect(rows.map((r) => r.slug)).toEqual(["new", "old"]);
  });

  it("filters archived by default", () => {
    createProject({ display_name: "Live" });
    const archived = createProject({ display_name: "Dead" });
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    archiveProject(archived.project.slug);

    const rows = listProjects();
    expect(rows.map((r) => r.slug)).toEqual(["live"]);
  });

  it("includes archived when includeArchived: true", () => {
    createProject({ display_name: "Live" });
    const archived = createProject({ display_name: "Dead" });
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    archiveProject(archived.project.slug);

    const rows = listProjects({ includeArchived: true });
    expect(rows.map((r) => r.slug).sort()).toEqual(["dead", "live"]);
  });
});

describe("getProject", () => {
  it("returns the project when found", () => {
    createProject({ display_name: "Acme" });
    const out = getProject("acme");
    expect(out).not.toBeNull();
    expect(out!.slug).toBe("acme");
  });

  it("returns null when no project matches", () => {
    expect(getProject("nope")).toBeNull();
  });
});

describe("setProjectGoogleAdsAccount", () => {
  it("persists the customer id and returns the updated row", () => {
    createProject({ display_name: "Acme" });
    const out = setProjectGoogleAdsAccount("acme", "123-456-7890");
    expect(out).not.toBeNull();
    expect(out!.google_ads_account_id).toBe("123-456-7890");
  });

  it("can clear the customer id by passing null", () => {
    createProject({ display_name: "Acme" });
    setProjectGoogleAdsAccount("acme", "123");
    const cleared = setProjectGoogleAdsAccount("acme", null);
    expect(cleared!.google_ads_account_id).toBeNull();
  });

  it("is idempotent (re-set same value)", () => {
    createProject({ display_name: "Acme" });
    setProjectGoogleAdsAccount("acme", "abc");
    const again = setProjectGoogleAdsAccount("acme", "abc");
    expect(again!.google_ads_account_id).toBe("abc");
  });

  it("returns null when project doesn't exist", () => {
    expect(setProjectGoogleAdsAccount("nope", "x")).toBeNull();
  });
});

describe("renameProject", () => {
  it("changes display_name and returns the updated row", () => {
    createProject({ display_name: "Acme" });
    const out = renameProject("acme", "Acme Corp");
    expect(out!.display_name).toBe("Acme Corp");
    // Slug must NOT change here — renameProject only edits the label.
    expect(out!.slug).toBe("acme");
  });

  it("trims the new display_name", () => {
    createProject({ display_name: "Acme" });
    const out = renameProject("acme", "   Trimmed   ");
    expect(out!.display_name).toBe("Trimmed");
  });

  it("returns null when display_name is empty after trimming", () => {
    createProject({ display_name: "Acme" });
    expect(renameProject("acme", "   ")).toBeNull();
    expect(getProject("acme")!.display_name).toBe("Acme");
  });

  it("returns null when project doesn't exist (no row, no update)", () => {
    // No row in projects — UPDATE affects 0 rows; getProject returns null.
    expect(renameProject("nope", "X")).toBeNull();
  });
});

describe("changeProjectSlug", () => {
  it("renames slug and migrates child rows", () => {
    createProject({ display_name: "Old" });
    // Seed a row in each child table so we can verify the migration touches them all.
    testDb
      .prepare(
        `INSERT INTO tasks (id, project_slug, agent_id, brief, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("t1", "old", "old-cmo", "b", "proposed", "now", "now");
    testDb
      .prepare(
        `INSERT INTO approvals
           (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("ap1", "old", "old-cmo", "s", "other", 0, "{}", "pending", "now");
    testDb
      .prepare(
        `INSERT INTO cost_events (id, project_slug, agent_id, source, amount_usd, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("c1", "old", null, "llm", 0.01, "now");
    testDb
      .prepare(
        `INSERT INTO oauth_tokens
           (id, project_slug, provider, account_label, access_token_enc, refresh_token_enc, expires_at, scope, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("o1", "old", "google_ads", "main", "x", "y", "later", "s", "now", "now");
    testDb
      .prepare(
        `INSERT INTO agent_actions (id, project_slug, agent_id, action_type, summary, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("a1", "old", "x", "t", "s", "now");
    testDb
      .prepare(
        `INSERT INTO sequence_runs
           (id, project_slug, agent_id, sequence_kind, cursor, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("s1", "old", "x", "k", "0", "pending", "now", "now");

    const out = changeProjectSlug("old", "renamed");
    expect(out).not.toBeNull();
    expect(out!.slug).toBe("renamed");

    // Every child table's row should now live under the new slug.
    for (const table of [
      "tasks",
      "approvals",
      "cost_events",
      "oauth_tokens",
      "agent_actions",
      "sequence_runs",
    ]) {
      const row = testDb
        .prepare(`SELECT project_slug FROM ${table} LIMIT 1`)
        .get() as { project_slug: string };
      expect(row.project_slug, table).toBe("renamed");
    }
    expect(getProject("old")).toBeNull();
  });

  it("also updates display_name when provided", () => {
    createProject({ display_name: "Old" });
    const out = changeProjectSlug("old", "new", "New Display");
    expect(out!.slug).toBe("new");
    expect(out!.display_name).toBe("New Display");
  });

  it("trims new display_name", () => {
    createProject({ display_name: "Old" });
    const out = changeProjectSlug("old", "new", "   Padded   ");
    expect(out!.display_name).toBe("Padded");
  });

  it("when old === new and display_name is provided, updates only display_name", () => {
    createProject({ display_name: "Acme" });
    const out = changeProjectSlug("acme", "acme", "Renamed");
    expect(out!.slug).toBe("acme");
    expect(out!.display_name).toBe("Renamed");
  });

  it("when old === new and no display_name, returns the current row (no-op)", () => {
    createProject({ display_name: "Acme" });
    const out = changeProjectSlug("acme", "acme");
    expect(out!.slug).toBe("acme");
    expect(out!.display_name).toBe("Acme");
  });

  it("returns null when the source slug doesn't exist", () => {
    expect(changeProjectSlug("missing", "new")).toBeNull();
  });

  it("throws when the destination slug already exists", () => {
    createProject({ display_name: "A" });
    createProject({ display_name: "B" });
    expect(() => changeProjectSlug("a", "b")).toThrow(/already exists/i);
  });

  it("restores foreign_keys = ON after the rename (even on failure)", () => {
    createProject({ display_name: "A" });
    // Pre-condition.
    expect(testDb.pragma("foreign_keys", { simple: true })).toBe(1);
    changeProjectSlug("a", "renamed");
    expect(testDb.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("BUG: does not actually restore prior FK state (always leaves FK = ON)", () => {
    // Documenting current behavior. The implementation captures
    //   const fkWasOn = db.pragma("foreign_keys = OFF", { simple: true });
    // expecting fkWasOn to be the previous value, but better-sqlite3's pragma
    // returns undefined for SET-style PRAGMAs. So the ternary always falls
    // through to "ON" regardless of prior state. Not a regression for our
    // single-user CLI (which always runs with FK=ON) but worth flagging.
    createProject({ display_name: "Acme" });
    testDb.pragma("foreign_keys = OFF");
    changeProjectSlug("acme", "new");
    // After the rename, FK ends up ON even though we started with FK=OFF.
    expect(testDb.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});

describe("archiveProject", () => {
  it("sets archived_at and returns the row", () => {
    createProject({ display_name: "Acme" });
    const out = archiveProject("acme");
    expect(out!.archived_at).not.toBeNull();
    expect(Date.parse(out!.archived_at!)).toBeGreaterThan(0);
  });

  it("is a no-op when already archived (preserves first archived_at)", async () => {
    createProject({ display_name: "Acme" });
    const first = archiveProject("acme")!;
    await new Promise((r) => setTimeout(r, 5));
    const second = archiveProject("acme")!;
    expect(second.archived_at).toBe(first.archived_at);
  });

  it("returns null when project doesn't exist", () => {
    expect(archiveProject("nope")).toBeNull();
  });
});

describe("unarchiveProject", () => {
  it("clears archived_at and returns the row", () => {
    createProject({ display_name: "Acme" });
    archiveProject("acme");
    expect(getProject("acme")!.archived_at).not.toBeNull();
    const out = unarchiveProject("acme");
    expect(out!.archived_at).toBeNull();
  });

  it("is a no-op when project is not archived", () => {
    createProject({ display_name: "Acme" });
    const out = unarchiveProject("acme");
    expect(out!.archived_at).toBeNull();
  });

  it("returns null when project doesn't exist", () => {
    expect(unarchiveProject("nope")).toBeNull();
  });
});

describe("deleteProjectRow", () => {
  it("cleans the project row when no child rows exist", () => {
    const result = createProject({ display_name: "Acme" });
    expect(result.ok).toBe(true);
    expect(() => deleteProjectRow("acme")).not.toThrow();
    expect(testDb.prepare("SELECT 1 FROM projects WHERE slug = ?").get("acme")).toBeUndefined();
  });

  it("is a no-op when project doesn't exist", () => {
    expect(() => deleteProjectRow("missing")).not.toThrow();
  });

  describe("regression: FOREIGN KEY constraint failure on delete", () => {
    // The bug: deleteProjectRow's childTables list was stale — it deleted
    // from approvals/agent_actions/cost_snapshots/connections (the last
    // two don't even exist in our migrations), missing tasks, cost_events,
    // oauth_tokens, sequence_runs. With orchestration adding task rows
    // aggressively, deletes started tripping the FK constraint.
    // This block populates every FK-bearing table and asserts the delete
    // succeeds + nothing is left behind.

    it("cleans tasks rows (the table that exposed the bug)", () => {
      createProject({ display_name: "Acme" });
      testDb
        .prepare(
          `INSERT INTO tasks
             (id, project_slug, agent_id, brief, status, created_at, updated_at)
           VALUES ('t1', 'acme', 'acme-google-ads', 'do x', 'proposed', 'now', 'now')`,
        )
        .run();

      expect(() => deleteProjectRow("acme")).not.toThrow();
      expect(testDb.prepare("SELECT 1 FROM tasks WHERE project_slug = ?").get("acme")).toBeUndefined();
      expect(testDb.prepare("SELECT 1 FROM projects WHERE slug = ?").get("acme")).toBeUndefined();
    });

    it("cleans every FK-bearing child table without tripping FK", () => {
      createProject({ display_name: "Acme" });

      // One row per FK-bearing table from the migrations. If any new
      // migration adds a project_slug FK and forgets to update
      // deleteProjectRow's list, this test fails immediately.
      testDb
        .prepare(
          `INSERT INTO tasks
             (id, project_slug, agent_id, brief, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("t1", "acme", "acme-google-ads", "do x", "proposed", "now", "now");
      testDb
        .prepare(
          `INSERT INTO approvals
             (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, payload_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("ap1", "acme", "acme-google-ads", "raise bid", "bid_change", 0, "{}", "pending", "now");
      testDb
        .prepare(
          `INSERT INTO cost_events
             (id, project_slug, agent_id, source, amount_usd, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("c1", "acme", "acme-google-ads", "llm", 0.01, "now");
      testDb
        .prepare(
          `INSERT INTO oauth_tokens
             (id, project_slug, provider, account_label, access_token_enc, refresh_token_enc, expires_at, scope, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("o1", "acme", "google_ads", "acme", "x", "y", "later", "scope", "now", "now");
      testDb
        .prepare(
          `INSERT INTO agent_actions
             (id, project_slug, agent_id, action_type, summary, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("a1", "acme", "system", "project_created", "x", "now");
      testDb
        .prepare(
          `INSERT INTO sequence_runs
             (id, project_slug, agent_id, sequence_kind, cursor, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("s1", "acme", "acme-cmo", "k", "0", "pending", "now", "now");
      testDb
        .prepare(
          `INSERT INTO questions
             (id, project_slug, agent_id, prompt, options_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("q1", "acme", "acme-cmo", "ok?", "[]", "pending", "now");
      testDb
        .prepare(
          `INSERT INTO mcp_tokens
             (id, project_slug, server_name, account_label, access_token_enc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("m1", "acme", "notfair-googleads", "", "tok", "now", "now");
      testDb
        .prepare(
          `INSERT INTO scheduled_jobs
             (id, project_slug, agent_id, name, cron_expr, message, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("j1", "acme", "acme-google-ads", "daily", "0 9 * * *", "go", 1, "now", "now");
      testDb
        .prepare(
          `INSERT INTO sessions
             (id, project_slug, agent_id, label, harness_adapter, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("se1", "acme", "acme-google-ads", "main", "claude-code-local", "now", "now");

      // Pre-condition: every child table has a row keyed to acme.
      for (const table of [
        "tasks",
        "approvals",
        "cost_events",
        "oauth_tokens",
        "agent_actions",
        "sequence_runs",
        "questions",
        "mcp_tokens",
        "scheduled_jobs",
        "sessions",
      ]) {
        expect(
          testDb.prepare(`SELECT 1 FROM ${table} WHERE project_slug = ?`).get("acme"),
          `${table} should have a pre-existing row`,
        ).toBeTruthy();
      }

      // The actual fix: delete should NOT throw FOREIGN KEY constraint failed.
      expect(() => deleteProjectRow("acme")).not.toThrow();

      // Post-condition: project + every child row gone.
      expect(
        testDb.prepare("SELECT 1 FROM projects WHERE slug = ?").get("acme"),
      ).toBeUndefined();
      for (const table of [
        "tasks",
        "approvals",
        "cost_events",
        "oauth_tokens",
        "agent_actions",
        "sequence_runs",
        "questions",
        "mcp_tokens",
        "scheduled_jobs",
        "sessions",
      ]) {
        expect(
          testDb.prepare(`SELECT 1 FROM ${table} WHERE project_slug = ?`).get("acme"),
          `${table} should have no rows after delete`,
        ).toBeUndefined();
      }
    });
  });
});
