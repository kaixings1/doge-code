import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import { listAgentActions, logAgentAction } from "./agent-actions";

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

function seedProject(slug = "acme"): void {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("p-" + slug, slug, slug, "2026-01-01T00:00:00.000Z");
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("logAgentAction", () => {
  it("persists a minimal action with sensible defaults", () => {
    seedProject();
    const before = Date.now();
    const action = logAgentAction({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_type: "audit",
      summary: "ran nightly audit",
    });
    const after = Date.now();

    expect(action.id).toMatch(/[0-9a-f-]{36}/);
    expect(action.project_slug).toBe("acme");
    expect(action.agent_id).toBe("acme-google-ads");
    expect(action.action_type).toBe("audit");
    expect(action.summary).toBe("ran nightly audit");
    expect(action.task_id).toBeNull();
    expect(action.reasoning).toBeNull();
    expect(action.payload_json).toBeNull();
    const t = Date.parse(action.occurred_at);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);

    // Round-trip via the DB to confirm the insert actually landed.
    const row = testDb
      .prepare("SELECT * FROM agent_actions WHERE id = ?")
      .get(action.id) as Record<string, unknown>;
    expect(row).toMatchObject({
      id: action.id,
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_type: "audit",
      summary: "ran nightly audit",
      task_id: null,
      reasoning: null,
      payload_json: null,
    });
  });

  it("stores reasoning, task_id, and JSON-encoded payload when provided", () => {
    seedProject();
    const payload = { keyword: "shoes", bid_usd: 1.25, nested: { tag: "x" } };
    const action = logAgentAction({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_type: "bid_change",
      summary: "raised bid",
      reasoning: "below target ROAS",
      task_id: "task-123",
      payload,
    });
    expect(action.reasoning).toBe("below target ROAS");
    expect(action.task_id).toBe("task-123");
    expect(action.payload_json).toBe(JSON.stringify(payload));
    expect(JSON.parse(action.payload_json!)).toEqual(payload);
  });

  it("treats null reasoning / null task_id distinctly from undefined", () => {
    seedProject();
    const action = logAgentAction({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_type: "x",
      summary: "y",
      reasoning: null,
      task_id: null,
    });
    expect(action.reasoning).toBeNull();
    expect(action.task_id).toBeNull();
  });

  it("serializes payload === null as the JSON string 'null' (distinct from omitted)", () => {
    seedProject();
    // input.payload === null → not undefined → JSON.stringify(null) === "null"
    const action = logAgentAction({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_type: "x",
      summary: "y",
      payload: null,
    });
    expect(action.payload_json).toBe("null");
  });

  it("throws when project_slug FK is violated", () => {
    // No project seeded — insert should trip the FK.
    expect(() =>
      logAgentAction({
        project_slug: "missing",
        agent_id: "x",
        action_type: "y",
        summary: "z",
      }),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe("listAgentActions", () => {
  it("returns rows ordered by occurred_at DESC (newest first)", () => {
    seedProject();
    testDb
      .prepare(
        `INSERT INTO agent_actions (id, project_slug, agent_id, action_type, summary, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("a1", "acme", "x", "t", "first", "2026-01-01T00:00:00.000Z");
    testDb
      .prepare(
        `INSERT INTO agent_actions (id, project_slug, agent_id, action_type, summary, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("a2", "acme", "x", "t", "second", "2026-01-02T00:00:00.000Z");
    testDb
      .prepare(
        `INSERT INTO agent_actions (id, project_slug, agent_id, action_type, summary, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("a3", "acme", "x", "t", "third", "2026-01-03T00:00:00.000Z");
    const rows = listAgentActions("acme");
    expect(rows.map((r) => r.summary)).toEqual(["third", "second", "first"]);
  });

  it("filters by project_slug", () => {
    seedProject("acme");
    seedProject("other");
    logAgentAction({
      project_slug: "acme",
      agent_id: "x",
      action_type: "t",
      summary: "for acme",
    });
    logAgentAction({
      project_slug: "other",
      agent_id: "x",
      action_type: "t",
      summary: "for other",
    });
    const rows = listAgentActions("acme");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe("for acme");
  });

  it("honors the limit parameter", () => {
    seedProject();
    for (let i = 0; i < 5; i++) {
      testDb
        .prepare(
          `INSERT INTO agent_actions (id, project_slug, agent_id, action_type, summary, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(`a${i}`, "acme", "x", "t", `s${i}`, `2026-01-0${i + 1}T00:00:00.000Z`);
    }
    expect(listAgentActions("acme", 3)).toHaveLength(3);
    expect(listAgentActions("acme", 100)).toHaveLength(5);
  });

  it("defaults to limit=50", () => {
    seedProject();
    const insert = testDb.prepare(
      `INSERT INTO agent_actions (id, project_slug, agent_id, action_type, summary, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < 60; i++) {
      // pad the timestamp so they sort cleanly
      const ts = `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`;
      insert.run(`a${i}`, "acme", "x", "t", `s${i}`, ts);
    }
    expect(listAgentActions("acme")).toHaveLength(50);
  });

  it("returns empty array when project has no actions", () => {
    seedProject();
    expect(listAgentActions("acme")).toEqual([]);
  });

  it("returns empty array for unknown project slug", () => {
    expect(listAgentActions("does-not-exist")).toEqual([]);
  });
});
