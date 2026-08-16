import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  actionableApprovalCount,
  appendComment,
  createApproval,
  createPolicy,
  deletePolicy,
  findMatchingPolicy,
  getApproval,
  listActionableApprovals,
  listComments,
  listPendingApprovals,
  listPolicies,
  listResolvedApprovals,
  pendingApprovalCount,
  requestApprovalRevision,
  resolveApproval,
} from "./approvals";

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

describe("createApproval", () => {
  it("persists a pending approval with a generated id and serialized payload", () => {
    seedProject();
    const payload = { campaign_id: "123", new_bid: 2.5 };
    const approval = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "raise bid on shoes",
      action_type: "bid_change",
      cost_estimate_usd: 10,
      reasoning: "below target ROAS",
      payload,
    });

    expect(approval.id).toMatch(/[0-9a-f-]{36}/);
    expect(approval.status).toBe("pending");
    expect(approval.resolved_at).toBeNull();
    expect(approval.payload_json).toBe(JSON.stringify(payload));
    expect(approval.reasoning).toBe("below target ROAS");
    expect(approval.cost_estimate_usd).toBe(10);
    expect(approval.action_type).toBe("bid_change");

    // Round-trip via DB
    const row = testDb
      .prepare("SELECT * FROM approvals WHERE id = ?")
      .get(approval.id) as Record<string, unknown>;
    expect(row.status).toBe("pending");
    expect(row.resolved_at).toBeNull();
  });

  it("defaults reasoning to null when omitted", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(a.reasoning).toBeNull();
  });

  it("serializes an undefined payload as {}", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: undefined,
    });
    expect(a.payload_json).toBe("{}");
  });

  it("serializes a null payload as {} (?? operator coerces null too)", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: null,
    });
    // Behaviorally: `?? {}` replaces null with {}, then JSON.stringify({}) === "{}".
    expect(a.payload_json).toBe("{}");
  });

  it("throws on invalid action_type (CHECK constraint)", () => {
    seedProject();
    expect(() =>
      createApproval({
        project_slug: "acme",
        agent_id: "x",
        action_summary: "y",
        // @ts-expect-error invalid on purpose
        action_type: "invalid_type",
        cost_estimate_usd: 0,
        payload: {},
      }),
    ).toThrow(/CHECK/i);
  });

  it("throws on missing project FK", () => {
    expect(() =>
      createApproval({
        project_slug: "no-such-project",
        agent_id: "x",
        action_summary: "y",
        action_type: "other",
        cost_estimate_usd: 0,
        payload: {},
      }),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe("listPendingApprovals", () => {
  it("returns only pending approvals for the given project", () => {
    seedProject("acme");
    seedProject("other");
    const a1 = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "pending1",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "pending2",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    // Resolve one so it's filtered out.
    resolveApproval(a1.id, "approved");
    createApproval({
      project_slug: "other",
      agent_id: "x",
      action_summary: "from other project",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });

    const rows = listPendingApprovals("acme");
    expect(rows.map((r) => r.action_summary)).toEqual(["pending2"]);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("orders by created_at DESC", () => {
    seedProject();
    testDb
      .prepare(
        `INSERT INTO approvals
           (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run("a1", "acme", "x", "old", "other", 0, "{}", "2026-01-01T00:00:00.000Z");
    testDb
      .prepare(
        `INSERT INTO approvals
           (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run("a2", "acme", "x", "newer", "other", 0, "{}", "2026-01-02T00:00:00.000Z");
    expect(listPendingApprovals("acme").map((r) => r.action_summary)).toEqual([
      "newer",
      "old",
    ]);
  });

  it("returns empty array when project has no pending approvals", () => {
    seedProject();
    expect(listPendingApprovals("acme")).toEqual([]);
  });
});

describe("pendingApprovalCount", () => {
  it("returns 0 when there are no approvals", () => {
    seedProject();
    expect(pendingApprovalCount("acme")).toBe(0);
  });

  it("counts only pending approvals", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p1",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p2",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p3",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(pendingApprovalCount("acme")).toBe(3);
    resolveApproval(a.id, "approved");
    expect(pendingApprovalCount("acme")).toBe(2);
  });

  it("isolates count by project", () => {
    seedProject("a");
    seedProject("b");
    createApproval({
      project_slug: "a",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(pendingApprovalCount("a")).toBe(1);
    expect(pendingApprovalCount("b")).toBe(0);
  });
});

describe("resolveApproval", () => {
  it("flips pending → approved and stamps resolved_at", async () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "approved");
    expect(out).not.toBeNull();
    expect(out!.status).toBe("approved");
    expect(out!.resolved_at).not.toBeNull();
    expect(Date.parse(out!.resolved_at!)).toBeGreaterThan(0);
  });

  it("flips pending → rejected", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "rejected");
    expect(out!.status).toBe("rejected");
  });

  it("flips pending → expired", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "expired");
    expect(out!.status).toBe("expired");
  });

  it("is a no-op when the approval is not pending (returns current row)", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const first = resolveApproval(a.id, "approved")!;
    const second = resolveApproval(a.id, "rejected")!;
    // Still approved — the WHERE status='pending' clause prevents re-resolution.
    expect(second.status).toBe("approved");
    expect(second.resolved_at).toBe(first.resolved_at);
  });

  it("returns null when the approval id doesn't exist", () => {
    expect(resolveApproval("missing-id", "approved")).toBeNull();
  });

  it("persists decision_note + decided_by_kind + decided_by_id on resolve", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = resolveApproval(a.id, "approved", {
      decision_note: "Looks good",
      decided_by_kind: "user",
      decided_by_id: "alice@example.com",
    });
    expect(out!.decision_note).toBe("Looks good");
    expect(out!.decided_by_kind).toBe("user");
    expect(out!.decided_by_id).toBe("alice@example.com");
  });
});

describe("createApproval + policies", () => {
  it("creates a pending row by default with task_id null and no decision metadata", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "raise bid",
      action_type: "bid_change",
      cost_estimate_usd: 5,
      payload: {},
    });
    expect(a.task_id).toBeNull();
    expect(a.status).toBe("pending");
    expect(a.decided_by_kind).toBeNull();
    expect(a.decided_by_id).toBeNull();
    expect(a.decision_note).toBeNull();
  });

  it("auto-approves when a matching policy exists", () => {
    seedProject();
    const policy = createPolicy({
      project_slug: "acme",
      action_type: "bid_change",
      agent_id: null,
      max_cost_usd: null,
      auto_decision: "approve",
      note: "trusted",
      created_by_kind: "user",
    });
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "raise bid",
      action_type: "bid_change",
      cost_estimate_usd: 50,
      payload: {},
    });
    expect(a.status).toBe("approved");
    expect(a.decided_by_kind).toBe("policy");
    expect(a.decided_by_id).toBe(policy.id);
    expect(a.resolved_at).not.toBeNull();

    // System comment recorded so the thread shows the trail.
    const comments = listComments(a.id);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.author_kind).toBe("system");
    expect(comments[0]!.body).toContain("Auto-approved");
  });

  it("does NOT auto-approve when cost exceeds max_cost_usd", () => {
    seedProject();
    createPolicy({
      project_slug: "acme",
      action_type: "bid_change",
      agent_id: null,
      max_cost_usd: 10,
      auto_decision: "approve",
      created_by_kind: "user",
    });
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "expensive bid raise",
      action_type: "bid_change",
      cost_estimate_usd: 50,
      payload: {},
    });
    expect(a.status).toBe("pending");
    expect(a.decided_by_kind).toBeNull();
  });

  it("auto-rejects when a matching reject policy exists", () => {
    seedProject();
    createPolicy({
      project_slug: "acme",
      action_type: "content_publishing",
      agent_id: null,
      max_cost_usd: null,
      auto_decision: "reject",
      note: "human approval required for content",
      created_by_kind: "user",
    });
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-seo",
      action_summary: "publish landing page",
      action_type: "content_publishing",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(a.status).toBe("rejected");
    expect(a.decided_by_kind).toBe("policy");
  });

  it("ignores policies from another project", () => {
    seedProject("acme");
    seedProject("other");
    createPolicy({
      project_slug: "other",
      action_type: "bid_change",
      agent_id: null,
      max_cost_usd: null,
      auto_decision: "approve",
      created_by_kind: "user",
    });
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "bid",
      action_type: "bid_change",
      cost_estimate_usd: 1,
      payload: {},
    });
    expect(a.status).toBe("pending");
  });

  it("prefers an agent-scoped policy over a wildcard policy", () => {
    seedProject();
    createPolicy({
      project_slug: "acme",
      action_type: "bid_change",
      agent_id: null,
      max_cost_usd: null,
      auto_decision: "approve",
      note: "wildcard",
      created_by_kind: "user",
    });
    const scoped = createPolicy({
      project_slug: "acme",
      action_type: "bid_change",
      agent_id: "acme-google-ads",
      max_cost_usd: null,
      auto_decision: "reject",
      note: "specific reject",
      created_by_kind: "user",
    });
    // Specific reject must win for this agent.
    const a = createApproval({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      action_summary: "bid",
      action_type: "bid_change",
      cost_estimate_usd: 1,
      payload: {},
    });
    expect(a.status).toBe("rejected");
    expect(a.decided_by_id).toBe(scoped.id);
  });

  it("persists task_id when provided", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      task_id: "task-uuid-123",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(a.task_id).toBe("task-uuid-123");
  });
});

describe("requestApprovalRevision", () => {
  it("flips pending → revision_requested with a note", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const out = requestApprovalRevision(a.id, {
      decision_note: "narrow the audience first",
      decided_by_kind: "user",
    });
    expect(out!.status).toBe("revision_requested");
    expect(out!.decision_note).toBe("narrow the audience first");
    expect(out!.resolved_at).toBeNull(); // not terminal yet
  });

  it("no-ops on a non-pending row", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    resolveApproval(a.id, "approved");
    const out = requestApprovalRevision(a.id, {
      decision_note: "second thoughts",
      decided_by_kind: "user",
    });
    // Status is still approved — revision can't undo a terminal decision.
    expect(out!.status).toBe("approved");
  });

  it("approved/rejected work after revision_requested transition (pending+revision_requested both resolvable)", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    requestApprovalRevision(a.id, {
      decision_note: "smaller scope",
      decided_by_kind: "user",
    });
    const out = resolveApproval(a.id, "approved");
    expect(out!.status).toBe("approved");
  });
});

describe("listActionableApprovals + listResolvedApprovals + actionableApprovalCount", () => {
  it("actionable includes pending and revision_requested but not terminal", () => {
    seedProject();
    const pending = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "pending",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const revising = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "revising",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    requestApprovalRevision(revising.id, {
      decision_note: "x",
      decided_by_kind: "user",
    });
    const approved = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "approved",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    resolveApproval(approved.id, "approved");

    const ids = listActionableApprovals("acme")
      .map((a) => a.id)
      .sort();
    expect(ids).toEqual([pending.id, revising.id].sort());
    expect(actionableApprovalCount("acme")).toBe(2);
  });

  it("resolved lists approved/rejected/expired, excluding pending+revision_requested", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p1",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const b = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p2",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    resolveApproval(a.id, "approved");
    resolveApproval(b.id, "rejected");

    const resolved = listResolvedApprovals("acme");
    const statuses = new Set(resolved.map((r) => r.status));
    expect(statuses).toEqual(new Set(["approved", "rejected"]));
  });
});

describe("appendComment + listComments", () => {
  it("round-trips a comment with author metadata", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    appendComment({
      approval_id: a.id,
      author_kind: "user",
      author_id: "alice",
      body: "let's push back here",
    });
    const c = listComments(a.id);
    expect(c).toHaveLength(1);
    expect(c[0]!.author_kind).toBe("user");
    expect(c[0]!.author_id).toBe("alice");
    expect(c[0]!.body).toBe("let's push back here");
  });

  it("orders comments by created_at ASC (chat-like)", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    appendComment({ approval_id: a.id, author_kind: "user", body: "first" });
    appendComment({ approval_id: a.id, author_kind: "agent", author_id: "bot", body: "second" });
    appendComment({ approval_id: a.id, author_kind: "system", body: "third" });
    const ordered = listComments(a.id).map((c) => c.body);
    expect(ordered).toEqual(["first", "second", "third"]);
  });

  it("comments cascade-delete with the parent approval", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    appendComment({ approval_id: a.id, author_kind: "user", body: "hi" });
    testDb.prepare("DELETE FROM approvals WHERE id = ?").run(a.id);
    expect(listComments(a.id)).toEqual([]);
  });
});

describe("policies CRUD + findMatchingPolicy", () => {
  it("creates + lists + deletes a policy", () => {
    seedProject();
    const p = createPolicy({
      project_slug: "acme",
      action_type: "spend",
      agent_id: null,
      max_cost_usd: 100,
      auto_decision: "approve",
      note: "anything under $100",
      created_by_kind: "user",
    });
    expect(listPolicies("acme")).toHaveLength(1);
    expect(listPolicies("acme")[0]!.id).toBe(p.id);
    expect(deletePolicy(p.id)).toBe(true);
    expect(listPolicies("acme")).toHaveLength(0);
    expect(deletePolicy("missing")).toBe(false);
  });

  it("findMatchingPolicy respects cost cap (≤ semantics)", () => {
    seedProject();
    createPolicy({
      project_slug: "acme",
      action_type: "spend",
      agent_id: null,
      max_cost_usd: 100,
      auto_decision: "approve",
      created_by_kind: "user",
    });
    // 100 is OK (≤ cap), 101 is not.
    expect(findMatchingPolicy("acme", "spend", "x", 100)).not.toBeNull();
    expect(findMatchingPolicy("acme", "spend", "x", 99.99)).not.toBeNull();
    expect(findMatchingPolicy("acme", "spend", "x", 100.01)).toBeNull();
  });

  it("findMatchingPolicy returns null when project, type, or agent mismatch", () => {
    seedProject("acme");
    seedProject("other");
    createPolicy({
      project_slug: "acme",
      action_type: "spend",
      agent_id: "agent-1",
      max_cost_usd: null,
      auto_decision: "approve",
      created_by_kind: "user",
    });
    expect(findMatchingPolicy("other", "spend", "agent-1", 0)).toBeNull();
    expect(findMatchingPolicy("acme", "bid_change", "agent-1", 0)).toBeNull();
    expect(findMatchingPolicy("acme", "spend", "agent-2", 0)).toBeNull();
  });
});

describe("getApproval", () => {
  it("returns the row by id", () => {
    seedProject();
    const a = createApproval({
      project_slug: "acme",
      agent_id: "x",
      action_summary: "p",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    expect(getApproval(a.id)?.id).toBe(a.id);
  });
  it("returns null for unknown id", () => {
    expect(getApproval("nope")).toBeNull();
  });
});
