import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "@/server/db/migrations";

let testDb: Database.Database;

vi.mock("@/server/db/db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

vi.mock("@/server/agent-meta", () => ({
  listProjectAgents: vi.fn(async (slug: string) => [
    {
      agent_id: `${slug}-cmo`,
      slug: "cmo",
      display_name: "CMO",
      description: "Chief Marketing Officer.",
      template_key: "cmo",
      is_template_default: true,
    },
    {
      agent_id: `${slug}-google-ads`,
      slug: "google-ads",
      display_name: "Google Ads",
      description: "Google Ads specialist.",
      template_key: "google_ads",
      is_template_default: true,
    },
  ]),
}));

// Most handler tests don't need run-task; mock it so the dynamic import in
// handleCreateTask doesn't reach OpenClaw.
vi.mock("./run-task", () => ({
  startTaskIfProposed: (task: { id: string; status: string }) => ({
    ...task,
    status: "working",
  }),
}));

const syncProjectBriefToAgentsMock = vi.fn(
  async (..._a: unknown[]) => ({
    synced: ["demo-cmo", "demo-google-ads"] as string[],
    failed: [] as Array<{ name: string; error: string }>,
  }),
);
vi.mock("@/server/agent-templates", () => ({
  agentExists: async () => true,
  agentNameFor: (slug: string, key: string) =>
    `${slug}-${key.replace(/_/g, "-")}`,
  templateForKey: (k: string) =>
    k === "google_ads"
      ? { key: "google_ads", display_name: "Google Ads" }
      : k === "cmo"
        ? { key: "cmo", display_name: "CMO" }
        : undefined,
  syncProjectBriefToAgents: (...a: unknown[]) =>
    syncProjectBriefToAgentsMock(...a),
}));

// Use a tmpdir for the PROJECT.md canonical path so set_project_brief
// tests don't litter the developer's real ~/.notfair-cmo.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.NOTFAIR_CMO_DATA_DIR = mkdtempSync(
  join(tmpdir(), "notfair-cmo-handlers-test-"),
);

import {
  handleCancelTask,
  handleGetApproval,
  handleGetProject,
  handleGetTask,
  handleListApprovalActionTypes,
  handleListMyApprovals,
  handleListMyTasks,
  handleListPendingApprovals,
  handleListProjectAgents,
  handleListTaskComments,
  handleListTaskStatuses,
  handleListTasks,
  handleUpdateTask,
} from "./handlers";
import { createTask } from "@/server/db/tasks";
import { createApproval } from "@/server/db/approvals";
import { logAgentAction } from "@/server/db/agent-actions";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

function seedProject(slug: string) {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(`p-${slug}`, slug, slug, "2026-05-20T00:00:00Z");
}

beforeEach(() => {
  testDb = createTestDb();
  seedProject("demo");
  seedProject("other");
});

afterEach(() => {
  testDb.close();
});

describe("handleGetTask", () => {
  it("returns the task when project_slug matches", () => {
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      brief: "do x",
      title: "T1",
    });
    const r = handleGetTask(
      { task_id: t.id },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok && r.data.id).toBe(t.id);
  });

  it("rejects cross-project reads", () => {
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      brief: "do x",
    });
    const r = handleGetTask(
      { task_id: t.id },
      { project_slug: "other", agent_id: "other-google-ads" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Cross-project/);
  });

  it("returns ok:false for unknown task_id", () => {
    const r = handleGetTask(
      { task_id: "nope" },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("handleTaskStatus — cannot-close-with-pending-approval invariant", () => {
  it("refuses status='done' when the task has a pending approval", async () => {
    const { handleTaskStatus } = await import("./handlers");
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      brief: "x",
    });
    testDb.prepare("UPDATE tasks SET status='blocked' WHERE id = ?").run(t.id);
    createApproval({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      task_id: t.id,
      action_summary: "Pause keyword",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const r = handleTaskStatus(
      { task_id: t.id, status: "done" },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unresolved approval/i);
    // Task should NOT have been flipped to succeeded.
    const after = testDb
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(t.id) as { status: string };
    expect(after.status).toBe("blocked");
  });

  it("allows status='failed' even with pending approvals (bail-out hatch)", async () => {
    const { handleTaskStatus } = await import("./handlers");
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      brief: "x",
    });
    testDb.prepare("UPDATE tasks SET status='blocked' WHERE id = ?").run(t.id);
    createApproval({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      task_id: t.id,
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const r = handleTaskStatus(
      { task_id: t.id, status: "failed", summary: "user is unreachable" },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("failed");
  });

  it("allows status='done' once the approval is resolved", async () => {
    const { handleTaskStatus } = await import("./handlers");
    const { resolveApproval } = await import("@/server/db/approvals");
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      brief: "x",
    });
    testDb.prepare("UPDATE tasks SET status='blocked' WHERE id = ?").run(t.id);
    const a = createApproval({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      task_id: t.id,
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    resolveApproval(a.id, "approved");
    const r = handleTaskStatus(
      { task_id: t.id, status: "done", summary: "shipped" },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok && r.data.status).toBe("done");
  });
});

describe("handleListMyTasks", () => {
  it("returns only in-flight tasks by default, filtered to this project + agent", () => {
    createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "a", title: "A" });
    const t2 = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "b", title: "B" });
    testDb.prepare("UPDATE tasks SET status='done' WHERE id = ?").run(t2.id);
    createTask({ project_slug: "demo", agent_id: "demo-seo", brief: "not mine" });
    createTask({ project_slug: "other", agent_id: "other-google-ads", brief: "other proj" });

    const r = handleListMyTasks(
      {},
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((t) => t.title).sort()).toEqual(["A"]);
  });

  it("status='all' returns terminal + in-flight", () => {
    createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "a", title: "A" });
    const t2 = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "b", title: "B" });
    testDb.prepare("UPDATE tasks SET status='done' WHERE id = ?").run(t2.id);

    const r = handleListMyTasks(
      { status: "all" },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok && r.data.length).toBe(2);
  });

  it("status='done' narrows", () => {
    const t1 = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "a" });
    testDb.prepare("UPDATE tasks SET status='done' WHERE id = ?").run(t1.id);
    createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "b" });

    const r = handleListMyTasks(
      { status: "done" },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(r.ok && r.data.length).toBe(1);
  });
});

describe("handleListTasks", () => {
  it("returns all project tasks regardless of agent", () => {
    createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "a" });
    createTask({ project_slug: "demo", agent_id: "demo-seo", brief: "b" });
    createTask({ project_slug: "other", agent_id: "other-seo", brief: "c" });
    const r = handleListTasks(
      {},
      { project_slug: "demo", agent_id: "" },
    );
    expect(r.ok && r.data.length).toBe(2);
  });
});

describe("handleUpdateTask", () => {
  it("patches the requested fields and logs an action", () => {
    const t = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "old", title: "Old" });
    const r = handleUpdateTask(
      { task_id: t.id, title: "New", brief: "fresh" },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.title).toBe("New");
    expect(r.data.brief).toBe("fresh");
    const log = testDb
      .prepare("SELECT action_type FROM agent_actions WHERE task_id = ?")
      .all(t.id) as Array<{ action_type: string }>;
    expect(log.some((l) => l.action_type === "task_updated")).toBe(true);
  });

  it("rejects updates with no fields", () => {
    const t = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "x" });
    const r = handleUpdateTask(
      { task_id: t.id },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects cross-project updates", () => {
    const t = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "x" });
    const r = handleUpdateTask(
      { task_id: t.id, title: "z" },
      { project_slug: "other", agent_id: "other-cmo" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("handleCancelTask", () => {
  it("flips a running task to cancelled with reason", () => {
    const t = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "x" });
    testDb.prepare("UPDATE tasks SET status='working' WHERE id = ?").run(t.id);
    const r = handleCancelTask(
      { task_id: t.id, reason: "no longer needed" },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok && r.data.status).toBe("cancelled");
    expect(r.ok && r.data.error_message).toBe("no longer needed");
  });

  it("is a no-op on already-terminal tasks", () => {
    const t = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "x" });
    testDb.prepare("UPDATE tasks SET status='done' WHERE id = ?").run(t.id);
    const r = handleCancelTask(
      { task_id: t.id },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok && r.data.status).toBe("done");
  });
});

describe("handleGetProject + handleListProjectAgents", () => {
  it("returns the project metadata for the caller's project", () => {
    const r = handleGetProject({}, { project_slug: "demo", agent_id: "" });
    expect(r.ok && r.data.slug).toBe("demo");
  });

  it("listProjectAgents returns the seeded mock", async () => {
    const r = await handleListProjectAgents({}, { project_slug: "demo", agent_id: "" });
    expect(r.ok && r.data.map((a) => a.slug)).toEqual(["cmo", "google-ads"]);
  });
});

describe("handleListTaskComments", () => {
  it("returns task_comment rows scoped to the task", () => {
    const t = createTask({ project_slug: "demo", agent_id: "demo-google-ads", brief: "x" });
    logAgentAction({
      project_slug: "demo",
      agent_id: "demo-cmo",
      task_id: t.id,
      action_type: "task_comment",
      summary: "first",
    });
    logAgentAction({
      project_slug: "demo",
      agent_id: "demo-cmo",
      task_id: t.id,
      action_type: "task_done", // not a comment
      summary: "should be filtered",
    });
    const r = handleListTaskComments(
      { task_id: t.id },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok && r.data.map((c) => c.summary)).toEqual(["first"]);
  });
});

describe("handleGetApproval + handleListMyApprovals + handleListPendingApprovals", () => {
  it("returns the approval and filters by agent for list_my_approvals", () => {
    const a1 = createApproval({
      project_slug: "demo",
      agent_id: "demo-google-ads",
      action_summary: "raise bid",
      action_type: "bid_change",
      cost_estimate_usd: 10,
      payload: {},
    });
    createApproval({
      project_slug: "demo",
      agent_id: "demo-seo",
      action_summary: "publish",
      action_type: "content_publishing",
      cost_estimate_usd: 0,
      payload: {},
    });

    const got = handleGetApproval(
      { approval_id: a1.id },
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(got.ok && got.data.id).toBe(a1.id);

    const mine = handleListMyApprovals(
      {},
      { project_slug: "demo", agent_id: "demo-google-ads" },
    );
    expect(mine.ok && mine.data.length).toBe(1);
    expect(mine.ok && mine.data[0]!.agent_id).toBe("demo-google-ads");

    const pending = handleListPendingApprovals(
      {},
      { project_slug: "demo", agent_id: "" },
    );
    expect(pending.ok && pending.data.length).toBe(2);
  });

  it("rejects cross-project get_approval", () => {
    const a = createApproval({
      project_slug: "demo",
      agent_id: "demo-cmo",
      action_summary: "x",
      action_type: "other",
      cost_estimate_usd: 0,
      payload: {},
    });
    const r = handleGetApproval(
      { approval_id: a.id },
      { project_slug: "other", agent_id: "" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("enum discovery handlers", () => {
  it("list_task_statuses returns 7 entries with transitions", () => {
    const r = handleListTaskStatuses();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((s) => s.value).sort()).toEqual(
      ["approved", "blocked", "cancelled", "failed", "proposed", "working", "done"].sort(),
    );
    const succeeded = r.data.find((s) => s.value === "done")!;
    expect(succeeded.terminal).toBe(true);
    expect(succeeded.next).toEqual([]);
    const running = r.data.find((s) => s.value === "working")!;
    expect(running.terminal).toBe(false);
    expect(running.next).toContain("blocked");
    expect(running.next).toContain("done");
  });

  it("list_approval_action_types marks cost-required types", () => {
    const r = handleListApprovalActionTypes();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const spend = r.data.find((a) => a.value === "spend")!;
    expect(spend.cost_estimate_required).toBe(true);
    const content = r.data.find((a) => a.value === "content_publishing")!;
    expect(content.cost_estimate_required).toBe(false);
  });
});

describe("handleSetProjectBrief", () => {
  it("persists PROJECT.md and fans out to agents", async () => {
    syncProjectBriefToAgentsMock.mockClear();
    const { handleSetProjectBrief } = await import("./handlers");
    const r = await handleSetProjectBrief(
      { body: "# Demo\n\nWe sell paperclips to office managers." },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.path).toMatch(/PROJECT\.md$/);
    expect(syncProjectBriefToAgentsMock).toHaveBeenCalledWith("demo");

    const { readProjectBrief } = await import(
      "@/server/onboarding/project-brief"
    );
    const persisted = await readProjectBrief("demo");
    expect(persisted).toContain("paperclips");
  });

  it("rejects empty body", async () => {
    const { handleSetProjectBrief } = await import("./handlers");
    const r = await handleSetProjectBrief(
      { body: "   " },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it("rejects unknown project", async () => {
    const { handleSetProjectBrief } = await import("./handlers");
    const r = await handleSetProjectBrief(
      { body: "valid body" },
      { project_slug: "no-such-project", agent_id: "x" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown project/i);
  });

  it("rejects oversized body", async () => {
    const { handleSetProjectBrief } = await import("./handlers");
    const huge = "x".repeat(70 * 1024); // 70 KB > 64 KB cap
    const r = await handleSetProjectBrief(
      { body: huge },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds/i);
  });
});

describe("handleTaskStatus — blocked_by_task_id propagation", () => {
  it("flipping a blocker to 'done' promotes its blocked dependents to 'proposed'", async () => {
    const { handleTaskStatus } = await import("./handlers");

    const blocker = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "first",
      title: "Learn the project",
    });
    const dependent = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "audit",
      title: "Audit the account",
      blocked_by_task_id: blocker.id,
    });
    expect(dependent.status).toBe("blocked");

    const r = handleTaskStatus(
      { task_id: blocker.id, status: "done", summary: "wrote PROJECT.md" },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(true);

    // Synchronous DB flip: dependent is proposed with cleared pointer
    // before the (async) kickoff microtask runs.
    const after = testDb
      .prepare(
        "SELECT status, blocked_by_task_id FROM tasks WHERE id = ?",
      )
      .get(dependent.id) as { status: string; blocked_by_task_id: string | null };
    expect(after.status).toBe("proposed");
    expect(after.blocked_by_task_id).toBeNull();
  });

  it("does NOT propagate on 'failed' — dependents remain blocked", async () => {
    const { handleTaskStatus } = await import("./handlers");

    const blocker = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "first",
    });
    const dependent = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "second",
      blocked_by_task_id: blocker.id,
    });

    const r = handleTaskStatus(
      { task_id: blocker.id, status: "failed", summary: "couldn't fetch site" },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(true);

    const after = testDb
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(dependent.id) as { status: string };
    expect(after.status).toBe("blocked");
  });

  it("only promotes dependents that are still 'blocked' (skips cancelled ones)", async () => {
    const { handleTaskStatus } = await import("./handlers");

    const blocker = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "first",
    });
    const dep1 = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "d1",
      blocked_by_task_id: blocker.id,
    });
    const dep2 = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "d2",
      blocked_by_task_id: blocker.id,
    });
    // User cancels dep2 before the blocker resolves.
    testDb
      .prepare("UPDATE tasks SET status='cancelled' WHERE id = ?")
      .run(dep2.id);

    handleTaskStatus(
      { task_id: blocker.id, status: "done", summary: "ok" },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );

    const a1 = testDb
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(dep1.id) as { status: string };
    const a2 = testDb
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(dep2.id) as { status: string };
    expect(a1.status).toBe("proposed");
    expect(a2.status).toBe("cancelled"); // untouched
  });
});

describe("handleAskUser — ask_user_question", () => {
  it("persists a Question row with parsed options and parks the task in blocked", async () => {
    const { handleAskUser } = await import("./handlers");
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "x",
    });
    const r = handleAskUser(
      {
        question: "Which channel first?",
        task_id: t.id,
        options: " Google Ads ,  Meta ,, TikTok ",
      },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.question_id).toMatch(/[0-9a-f-]{36}/);
    expect(r.data.options).toEqual(["Google Ads", "Meta", "TikTok"]);

    // Row persisted with status='pending' and options serialized.
    const row = testDb
      .prepare("SELECT status, options_json, task_id FROM questions WHERE id = ?")
      .get(r.data.question_id) as {
        status: string;
        options_json: string;
        task_id: string | null;
      };
    expect(row.status).toBe("pending");
    expect(row.task_id).toBe(t.id);
    expect(JSON.parse(row.options_json)).toEqual([
      "Google Ads",
      "Meta",
      "TikTok",
    ]);

    // Task transitioned to blocked.
    const taskAfter = testDb
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(t.id) as { status: string };
    expect(taskAfter.status).toBe("blocked");
  });

  it("does not block when there's no task_id (free-standing question)", async () => {
    const { handleAskUser } = await import("./handlers");
    const r = handleAskUser(
      { question: "What's your timezone?" },
      { project_slug: "demo", agent_id: "demo-cmo" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.task_id).toBeNull();
    const row = testDb
      .prepare("SELECT task_id FROM questions WHERE id = ?")
      .get(r.data.question_id) as { task_id: string | null };
    expect(row.task_id).toBeNull();
  });

  it("rejects cross-project task references", async () => {
    const { handleAskUser } = await import("./handlers");
    const t = createTask({
      project_slug: "demo",
      agent_id: "demo-cmo",
      brief: "x",
    });
    const r = handleAskUser(
      { question: "?", task_id: t.id },
      { project_slug: "other", agent_id: "other-cmo" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Cross-project/);
  });
});
