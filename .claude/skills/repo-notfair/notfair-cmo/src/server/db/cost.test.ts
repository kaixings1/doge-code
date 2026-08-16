import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import { costToday, recordCost } from "./cost";

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

describe("recordCost", () => {
  it("inserts a cost event and returns the row", () => {
    seedProject();
    const event = recordCost({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      source: "llm",
      amount_usd: 0.42,
      ref: "openai:gpt-4o:msg-1",
    });
    expect(event.id).toMatch(/[0-9a-f-]{36}/);
    expect(event.project_slug).toBe("acme");
    expect(event.agent_id).toBe("acme-google-ads");
    expect(event.source).toBe("llm");
    expect(event.amount_usd).toBe(0.42);
    expect(event.ref).toBe("openai:gpt-4o:msg-1");
    expect(Date.parse(event.occurred_at)).toBeGreaterThan(0);

    const row = testDb
      .prepare("SELECT * FROM cost_events WHERE id = ?")
      .get(event.id);
    expect(row).toMatchObject({ project_slug: "acme", source: "llm" });
  });

  it("defaults agent_id and ref to null when omitted", () => {
    seedProject();
    const event = recordCost({
      project_slug: "acme",
      source: "google_ads",
      amount_usd: 1.0,
    });
    expect(event.agent_id).toBeNull();
    expect(event.ref).toBeNull();
  });

  it("explicit null agent_id / null ref also persist as null", () => {
    seedProject();
    const event = recordCost({
      project_slug: "acme",
      agent_id: null,
      source: "gsc",
      amount_usd: 0,
      ref: null,
    });
    expect(event.agent_id).toBeNull();
    expect(event.ref).toBeNull();
  });

  it("honors an explicit occurred_at timestamp", () => {
    seedProject();
    const event = recordCost({
      project_slug: "acme",
      source: "other",
      amount_usd: 0.01,
      occurred_at: "2020-06-01T12:34:56.000Z",
    });
    expect(event.occurred_at).toBe("2020-06-01T12:34:56.000Z");
  });

  it("rejects invalid source via CHECK constraint", () => {
    seedProject();
    expect(() =>
      recordCost({
        project_slug: "acme",
        // @ts-expect-error invalid on purpose
        source: "bogus",
        amount_usd: 0,
      }),
    ).toThrow(/CHECK/i);
  });

  it("trips FK constraint when project_slug is missing", () => {
    expect(() =>
      recordCost({
        project_slug: "no-such",
        source: "llm",
        amount_usd: 0.01,
      }),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe("costToday", () => {
  it("returns zeros when there are no cost events", () => {
    seedProject();
    expect(costToday("acme")).toEqual({
      total_usd: 0,
      by_source: { llm: 0, google_ads: 0, gsc: 0, other: 0 },
    });
  });

  it("groups today's spend by source and sums total", () => {
    seedProject();
    // Use 'now' as the occurred_at so the >= startOfDay filter passes regardless of TZ.
    const now = new Date().toISOString();
    recordCost({ project_slug: "acme", source: "llm", amount_usd: 0.10, occurred_at: now });
    recordCost({ project_slug: "acme", source: "llm", amount_usd: 0.20, occurred_at: now });
    recordCost({ project_slug: "acme", source: "google_ads", amount_usd: 5.0, occurred_at: now });
    recordCost({ project_slug: "acme", source: "gsc", amount_usd: 1.5, occurred_at: now });
    recordCost({ project_slug: "acme", source: "other", amount_usd: 0.05, occurred_at: now });
    const out = costToday("acme");
    expect(out.by_source.llm).toBeCloseTo(0.3, 6);
    expect(out.by_source.google_ads).toBe(5.0);
    expect(out.by_source.gsc).toBe(1.5);
    expect(out.by_source.other).toBe(0.05);
    expect(out.total_usd).toBeCloseTo(0.3 + 5.0 + 1.5 + 0.05, 6);
  });

  it("excludes events from yesterday", () => {
    seedProject();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // Pin yesterday to early morning UTC so we are definitely before today's
    // 00:00 local even for tests run shortly after midnight in any TZ.
    yesterday.setHours(0, 5, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1); // 2 days back for safety
    recordCost({
      project_slug: "acme",
      source: "llm",
      amount_usd: 99,
      occurred_at: yesterday.toISOString(),
    });
    expect(costToday("acme").total_usd).toBe(0);
  });

  it("isolates spend by project", () => {
    seedProject("a");
    seedProject("b");
    const now = new Date().toISOString();
    recordCost({ project_slug: "a", source: "llm", amount_usd: 1, occurred_at: now });
    recordCost({ project_slug: "b", source: "llm", amount_usd: 10, occurred_at: now });
    expect(costToday("a").total_usd).toBe(1);
    expect(costToday("b").total_usd).toBe(10);
  });

  it("returns the zero shape (does not mutate the shared ZERO_BY_SOURCE)", () => {
    seedProject();
    const first = costToday("acme");
    const now = new Date().toISOString();
    recordCost({ project_slug: "acme", source: "llm", amount_usd: 42, occurred_at: now });
    const second = costToday("acme");
    expect(first.by_source.llm).toBe(0); // first snapshot wasn't mutated
    expect(second.by_source.llm).toBe(42);
  });
});
