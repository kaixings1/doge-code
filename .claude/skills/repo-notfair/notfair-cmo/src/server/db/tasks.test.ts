import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  claimProposedTask,
  clearBlockerAndPromote,
  createTask,
  getTask,
  inFlightCountsByAgent,
  listTasks,
  listTasksBlockedBy,
  listTasksByAgent,
  markTaskBlocked,
  setTaskThreadIfMissing,
  unblockTask,
  updateTask,
} from "./tasks";

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

describe("createTask", () => {
  it("creates a proposed task with sensible defaults", () => {
    seedProject();
    const t = createTask({
      project_slug: "acme",
      agent_id: "acme-cmo",
      brief: "do the thing",
    });
    expect(t.id).toMatch(/[0-9a-f-]{36}/);
    expect(t.display_id).toBe("acme-1");
    expect(t.status).toBe("proposed");
    expect(t.title).toBeNull();
    expect(t.success_criteria).toBeNull();
    expect(t.deadline_iso).toBeNull();
    expect(t.thread_id).toBeNull();
    expect(t.assigner_agent_id).toBeNull();
    expect(t.result_json).toBeNull();
    expect(t.error_message).toBeNull();
    expect(Date.parse(t.created_at)).toBeGreaterThan(0);
    expect(t.updated_at).toBe(t.created_at);
  });

  it("stores optional fields when provided", () => {
    seedProject();
    const t = createTask({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      title: "Raise bid",
      brief: "Raise bid to $2.50 on shoes",
      success_criteria: "CPA stays < $30",
      deadline_iso: "2026-12-31T23:59:59.000Z",
      assigner_agent_id: "acme-cmo",
      status: "approved",
    });
    expect(t.title).toBe("Raise bid");
    expect(t.success_criteria).toBe("CPA stays < $30");
    expect(t.deadline_iso).toBe("2026-12-31T23:59:59.000Z");
    expect(t.assigner_agent_id).toBe("acme-cmo");
    expect(t.status).toBe("approved");
  });

  it("allocates monotonically increasing display_ids per project", () => {
    seedProject("acme");
    seedProject("other");
    const a1 = createTask({ project_slug: "acme", agent_id: "x", brief: "1" });
    const a2 = createTask({ project_slug: "acme", agent_id: "x", brief: "2" });
    const a3 = createTask({ project_slug: "acme", agent_id: "x", brief: "3" });
    const o1 = createTask({ project_slug: "other", agent_id: "x", brief: "1" });
    const o2 = createTask({ project_slug: "other", agent_id: "x", brief: "2" });
    expect(a1.display_id).toBe("acme-1");
    expect(a2.display_id).toBe("acme-2");
    expect(a3.display_id).toBe("acme-3");
    expect(o1.display_id).toBe("other-1");
    expect(o2.display_id).toBe("other-2");
  });

  it("display_id allocator picks up after manually inserted high N", () => {
    seedProject();
    // Insert a row with display_id "acme-7" so the next createTask picks acme-8.
    testDb
      .prepare(
        `INSERT INTO tasks (id, display_id, project_slug, agent_id, brief, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("u1", "acme-7", "acme", "x", "b", "proposed", "now", "now");
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "next" });
    expect(t.display_id).toBe("acme-8");
  });

  it("display_id is unique (UNIQUE INDEX from migration 004)", () => {
    seedProject();
    createTask({ project_slug: "acme", agent_id: "x", brief: "a" });
    // Manually attempting to insert another acme-1 must fail at the DB layer.
    expect(() =>
      testDb
        .prepare(
          `INSERT INTO tasks (id, display_id, project_slug, agent_id, brief, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("dupe", "acme-1", "acme", "x", "b", "proposed", "now", "now"),
    ).toThrow(/UNIQUE/i);
  });

  it("trips FK on missing project", () => {
    expect(() =>
      createTask({ project_slug: "no-such", agent_id: "x", brief: "b" }),
    ).toThrow(/FOREIGN KEY/i);
  });

  it("rejects invalid status via CHECK constraint", () => {
    seedProject();
    expect(() =>
      createTask({
        project_slug: "acme",
        agent_id: "x",
        brief: "b",
        // @ts-expect-error invalid on purpose
        status: "bogus",
      }),
    ).toThrow(/CHECK/i);
  });
});

describe("getTask", () => {
  it("finds a task by UUID", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    const out = getTask(t.id);
    expect(out).not.toBeNull();
    expect(out!.id).toBe(t.id);
  });

  it("finds a task by display_id", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    const out = getTask(t.display_id);
    expect(out).not.toBeNull();
    expect(out!.id).toBe(t.id);
  });

  it("returns null when neither match", () => {
    expect(getTask("not-there")).toBeNull();
  });
});

describe("listTasks", () => {
  it("returns all tasks for project ordered by created_at DESC", () => {
    seedProject();
    testDb
      .prepare(
        `INSERT INTO tasks (id, display_id, project_slug, agent_id, brief, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("t1", "acme-1", "acme", "x", "first", "proposed", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    testDb
      .prepare(
        `INSERT INTO tasks (id, display_id, project_slug, agent_id, brief, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("t2", "acme-2", "acme", "x", "second", "working", "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z");

    const rows = listTasks("acme");
    expect(rows.map((r) => r.brief)).toEqual(["second", "first"]);
  });

  it("filters by status when provided", () => {
    seedProject();
    createTask({ project_slug: "acme", agent_id: "x", brief: "p" });
    createTask({ project_slug: "acme", agent_id: "x", brief: "r", status: "working" });
    expect(listTasks("acme", "proposed")).toHaveLength(1);
    expect(listTasks("acme", "working")).toHaveLength(1);
    expect(listTasks("acme", "done")).toHaveLength(0);
  });

  it("isolates by project", () => {
    seedProject("a");
    seedProject("b");
    createTask({ project_slug: "a", agent_id: "x", brief: "1" });
    createTask({ project_slug: "b", agent_id: "x", brief: "1" });
    expect(listTasks("a")).toHaveLength(1);
    expect(listTasks("b")).toHaveLength(1);
  });
});

describe("listTasksByAgent", () => {
  it("returns tasks for the agent across projects", () => {
    seedProject("a");
    seedProject("b");
    createTask({ project_slug: "a", agent_id: "specialist", brief: "1" });
    createTask({ project_slug: "b", agent_id: "specialist", brief: "2" });
    createTask({ project_slug: "a", agent_id: "other-agent", brief: "x" });
    expect(listTasksByAgent("specialist")).toHaveLength(2);
    expect(listTasksByAgent("other-agent")).toHaveLength(1);
  });

  it("filters by status", () => {
    seedProject();
    createTask({ project_slug: "acme", agent_id: "a1", brief: "p" });
    createTask({
      project_slug: "acme",
      agent_id: "a1",
      brief: "r",
      status: "working",
    });
    expect(listTasksByAgent("a1", "working")).toHaveLength(1);
    expect(listTasksByAgent("a1", "proposed")).toHaveLength(1);
  });

  it("returns empty array when no tasks assigned", () => {
    expect(listTasksByAgent("nobody")).toEqual([]);
  });
});

describe("inFlightCountsByAgent", () => {
  it("counts only proposed/approved/running per agent", () => {
    seedProject();
    createTask({ project_slug: "acme", agent_id: "ads", brief: "1" }); // proposed
    createTask({
      project_slug: "acme",
      agent_id: "ads",
      brief: "2",
      status: "approved",
    });
    createTask({
      project_slug: "acme",
      agent_id: "ads",
      brief: "3",
      status: "working",
    });
    createTask({
      project_slug: "acme",
      agent_id: "ads",
      brief: "4",
      status: "done",
    });
    createTask({
      project_slug: "acme",
      agent_id: "seo",
      brief: "1",
      status: "working",
    });
    createTask({
      project_slug: "acme",
      agent_id: "seo",
      brief: "2",
      status: "failed",
    });
    createTask({
      project_slug: "acme",
      agent_id: "seo",
      brief: "3",
      status: "cancelled",
    });

    const map = inFlightCountsByAgent("acme");
    expect(map.get("ads")).toBe(3);
    expect(map.get("seo")).toBe(1);
  });

  it("returns an empty map when no in-flight tasks exist", () => {
    seedProject();
    createTask({ project_slug: "acme", agent_id: "x", brief: "1", status: "done" });
    const map = inFlightCountsByAgent("acme");
    expect(map.size).toBe(0);
  });

  it("isolates by project", () => {
    seedProject("a");
    seedProject("b");
    createTask({ project_slug: "a", agent_id: "ads", brief: "1" });
    createTask({ project_slug: "b", agent_id: "ads", brief: "1" });
    expect(inFlightCountsByAgent("a").get("ads")).toBe(1);
    expect(inFlightCountsByAgent("b").get("ads")).toBe(1);
  });
});

describe("setTaskThreadIfMissing", () => {
  it("sets thread_id when null and bumps updated_at", async () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    // sleep so updated_at can advance
    await new Promise((r) => setTimeout(r, 5));
    const out = setTaskThreadIfMissing(t.id, "thread-1");
    expect(out).not.toBeNull();
    expect(out!.thread_id).toBe("thread-1");
    expect(Date.parse(out!.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(t.updated_at),
    );
  });

  it("is a no-op when thread_id is already set (returns current row)", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    setTaskThreadIfMissing(t.id, "first");
    const after = setTaskThreadIfMissing(t.id, "second");
    expect(after!.thread_id).toBe("first");
  });

  it("returns null when the task doesn't exist", () => {
    expect(setTaskThreadIfMissing("nope", "t")).toBeNull();
  });

  it("works via display_id (getTask accepts either)", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    // Pass display_id; setTaskThreadIfMissing -> getTask first resolves the
    // current row, but the UPDATE itself uses the PK from the input which is
    // the display_id here. The function signature says "id" — confirm what
    // actually happens. The UPDATE uses WHERE id = ?, and display_id won't
    // match the PK, so no row gets updated. The function returns the row
    // unchanged (getTask resolves display_id).
    const out = setTaskThreadIfMissing(t.display_id, "ignored");
    // Documenting current behavior: the lookup succeeds, the UPDATE filter
    // misses, and we return getTask(display_id) which still has null thread_id.
    expect(out).not.toBeNull();
    expect(out!.thread_id).toBeNull();
  });
});

describe("updateTask", () => {
  it("updates status, result, error_message and bumps updated_at", async () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    await new Promise((r) => setTimeout(r, 5));
    const out = updateTask(t.id, {
      status: "done",
      result: { hello: "world" },
      error_message: null,
    });
    expect(out).not.toBeNull();
    expect(out!.status).toBe("done");
    expect(out!.result_json).toBe(JSON.stringify({ hello: "world" }));
    expect(out!.error_message).toBeNull();
    expect(Date.parse(out!.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(t.updated_at),
    );
  });

  it("keeps existing values when fields are omitted (status defaults to current)", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    updateTask(t.id, { result: { a: 1 } });
    const fetched = getTask(t.id);
    expect(fetched!.status).toBe("proposed"); // unchanged
    expect(fetched!.result_json).toBe(JSON.stringify({ a: 1 }));
  });

  it("explicit null error_message clears error", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    updateTask(t.id, { error_message: "boom" });
    expect(getTask(t.id)!.error_message).toBe("boom");
    updateTask(t.id, { error_message: null });
    expect(getTask(t.id)!.error_message).toBeNull();
  });

  it("returns null when task doesn't exist", () => {
    expect(updateTask("missing", { status: "working" })).toBeNull();
  });

  it("rejects invalid status via CHECK constraint", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    expect(() =>
      // @ts-expect-error invalid on purpose
      updateTask(t.id, { status: "bogus" }),
    ).toThrow(/CHECK/i);
  });
});

describe("claimProposedTask", () => {
  it("flips proposed → running and returns the post-flip row", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    const out = claimProposedTask(t.id);
    expect(out).not.toBeNull();
    expect(out!.status).toBe("working");
  });

  it("returns null when the task is already past proposed", () => {
    seedProject();
    const t = createTask({
      project_slug: "acme",
      agent_id: "x",
      brief: "b",
      status: "working",
    });
    expect(claimProposedTask(t.id)).toBeNull();
  });

  it("returns null when the task is terminal (succeeded)", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    updateTask(t.id, { status: "done" });
    expect(claimProposedTask(t.id)).toBeNull();
    expect(getTask(t.id)!.status).toBe("done"); // not regressed
  });

  it("returns null when the task doesn't exist", () => {
    expect(claimProposedTask("missing")).toBeNull();
  });

  it("is single-shot: a second call after a successful claim returns null", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    expect(claimProposedTask(t.id)!.status).toBe("working");
    expect(claimProposedTask(t.id)).toBeNull();
  });
});

describe("markTaskBlocked + unblockTask", () => {
  it("flips a running task to blocked, then unblockTask flips it back to running", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    claimProposedTask(t.id); // proposed → running
    const blocked = markTaskBlocked(t.id);
    expect(blocked?.status).toBe("blocked");
    const unblocked = unblockTask(t.id);
    expect(unblocked?.status).toBe("working");
  });

  it("markTaskBlocked accepts proposed + approved as source states", () => {
    seedProject();
    const a = createTask({ project_slug: "acme", agent_id: "x", brief: "a" });
    // proposed → blocked
    expect(markTaskBlocked(a.id)?.status).toBe("blocked");

    const b = createTask({
      project_slug: "acme",
      agent_id: "x",
      brief: "b",
      status: "approved",
    });
    expect(markTaskBlocked(b.id)?.status).toBe("blocked");
  });

  it("markTaskBlocked does NOT regress a terminal task", () => {
    seedProject();
    const t = createTask({
      project_slug: "acme",
      agent_id: "x",
      brief: "b",
      status: "done",
    });
    const after = markTaskBlocked(t.id);
    expect(after?.status).toBe("done");
  });

  it("unblockTask is a no-op when the task isn't blocked", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    claimProposedTask(t.id);
    const after = unblockTask(t.id);
    expect(after?.status).toBe("working"); // unchanged
  });

  it("inFlightCountsByAgent counts blocked tasks too", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "agent-1", brief: "b" });
    markTaskBlocked(t.id);
    expect(inFlightCountsByAgent("acme").get("agent-1")).toBe(1);
  });
});

describe("blocked_by_task_id (task-blocks-task)", () => {
  it("createTask with blocked_by_task_id forces status to 'blocked'", () => {
    seedProject();
    const blocker = createTask({
      project_slug: "acme",
      agent_id: "acme-cmo",
      brief: "first",
    });
    const dependent = createTask({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      brief: "second",
      status: "proposed", // caller asked for proposed
      blocked_by_task_id: blocker.id,
    });
    expect(dependent.status).toBe("blocked");
    expect(dependent.blocked_by_task_id).toBe(blocker.id);
  });

  it("createTask drops the blocker pointer when blocker is already terminal", () => {
    seedProject();
    const blocker = createTask({
      project_slug: "acme",
      agent_id: "acme-cmo",
      brief: "first",
    });
    updateTask(blocker.id, { status: "done" });
    const dependent = createTask({
      project_slug: "acme",
      agent_id: "acme-google-ads",
      brief: "second",
      blocked_by_task_id: blocker.id,
    });
    expect(dependent.status).toBe("proposed");
    expect(dependent.blocked_by_task_id).toBeNull();
  });

  it("listTasksBlockedBy returns only blocked dependents", () => {
    seedProject();
    const blocker = createTask({
      project_slug: "acme",
      agent_id: "acme-cmo",
      brief: "b",
    });
    const dep1 = createTask({
      project_slug: "acme",
      agent_id: "x",
      brief: "d1",
      blocked_by_task_id: blocker.id,
    });
    const dep2 = createTask({
      project_slug: "acme",
      agent_id: "x",
      brief: "d2",
      blocked_by_task_id: blocker.id,
    });
    // Cancel dep2 — it should no longer appear in the blocked-by list even
    // though its pointer is still set.
    updateTask(dep2.id, { status: "cancelled" });

    const found = listTasksBlockedBy(blocker.id);
    expect(found.map((t) => t.id)).toEqual([dep1.id]);
  });

  it("clearBlockerAndPromote flips blocked→proposed and clears the pointer atomically", () => {
    seedProject();
    const blocker = createTask({
      project_slug: "acme",
      agent_id: "acme-cmo",
      brief: "b",
    });
    const dep = createTask({
      project_slug: "acme",
      agent_id: "x",
      brief: "d",
      blocked_by_task_id: blocker.id,
    });
    expect(dep.status).toBe("blocked");

    const promoted = clearBlockerAndPromote(dep.id);
    expect(promoted).not.toBeNull();
    expect(promoted!.status).toBe("proposed");
    expect(promoted!.blocked_by_task_id).toBeNull();
  });

  it("clearBlockerAndPromote is a no-op when the task isn't blocked", () => {
    seedProject();
    const t = createTask({ project_slug: "acme", agent_id: "x", brief: "b" });
    // status = proposed
    const result = clearBlockerAndPromote(t.id);
    expect(result).toBeNull();
    expect(getTask(t.id)!.status).toBe("proposed");
  });
});
