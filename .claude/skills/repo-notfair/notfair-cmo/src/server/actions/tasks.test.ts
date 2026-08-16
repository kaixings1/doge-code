import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, Task } from "@/types";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

const getActiveProjectMock = vi.fn();
vi.mock("@/server/active-project", () => ({
  getActiveProject: () => getActiveProjectMock(),
}));

const claimProposedTaskMock = vi.fn();
const getTaskMock = vi.fn();
const listTasksByAgentMock = vi.fn();
const updateTaskMock = vi.fn();
vi.mock("@/server/db/tasks", () => ({
  claimProposedTask: (...a: unknown[]) => claimProposedTaskMock(...a),
  getTask: (...a: unknown[]) => getTaskMock(...a),
  listTasksByAgent: (...a: unknown[]) => listTasksByAgentMock(...a),
  updateTask: (...a: unknown[]) => updateTaskMock(...a),
}));

const runTaskKickoffServerSideMock = vi.fn();
vi.mock("@/server/orchestration/run-task", () => ({
  runTaskKickoffServerSide: (...a: unknown[]) => runTaskKickoffServerSideMock(...a),
}));

import { cancelTaskAction, startAllProposedTasksAction } from "./tasks";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    slug: "demo",
    display_name: "Demo",
    created_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    google_ads_account_id: null,
    website_url: null,
    codebase_path: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    display_id: "demo-1",
    project_slug: "demo",
    agent_id: "demo-google-ads",
    title: "T",
    brief: "b",
    success_criteria: null,
    deadline_iso: null,
    status: "proposed",
    result_json: null,
    error_message: null,
    thread_id: null,
    assigner_agent_id: "demo-cmo",
    blocked_by_task_id: null,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    ...overrides,
  };
}

describe("startAllProposedTasksAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTaskKickoffServerSideMock.mockResolvedValue(undefined);
  });

  it("returns ok:false when agentId is whitespace-only", async () => {
    const out = await startAllProposedTasksAction("   ");
    expect(out).toEqual({ ok: false, error: "agentId is required" });
    expect(getActiveProjectMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when no active project is set", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out).toEqual({ ok: false, error: "No active project." });
    expect(listTasksByAgentMock).not.toHaveBeenCalled();
  });

  it("returns started=0 when the agent has no proposed tasks", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject());
    listTasksByAgentMock.mockReturnValue([]);
    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out).toEqual({ ok: true, data: { started: 0, task_ids: [] } });
    expect(claimProposedTaskMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when none of the proposed tasks belong to the active project (cookie drift guard)", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject({ slug: "demo" }));
    listTasksByAgentMock.mockReturnValue([
      makeTask({ id: "t-other", project_slug: "other-project" }),
    ]);
    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/no proposed tasks in the active project/);
    expect(claimProposedTaskMock).not.toHaveBeenCalled();
  });

  it("claims every valid task atomically and fires kickoffs in the background", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject());
    const t1 = makeTask({ id: "t1" });
    const t2 = makeTask({ id: "t2" });
    listTasksByAgentMock.mockReturnValue([t1, t2]);
    claimProposedTaskMock.mockImplementation((id: string) => {
      if (id === "t1") return { ...t1, status: "working" };
      if (id === "t2") return { ...t2, status: "working" };
      return null;
    });

    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.data.started).toBe(2);
    expect(out.data.task_ids.sort()).toEqual(["t1", "t2"]);
    expect(claimProposedTaskMock).toHaveBeenCalledTimes(2);

    // Let fire-and-forget kickoffs schedule.
    await new Promise((r) => setImmediate(r));
    expect(runTaskKickoffServerSideMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith("/agents", "layout");
    expect(revalidatePathMock).toHaveBeenCalledWith("/tasks", "layout");
  });

  it("silently skips tasks whose claim fails (race already-running/terminal)", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject());
    const t1 = makeTask({ id: "t1" });
    const t2 = makeTask({ id: "t2" });
    listTasksByAgentMock.mockReturnValue([t1, t2]);
    claimProposedTaskMock.mockImplementation((id: string) => {
      if (id === "t1") return { ...t1, status: "working" };
      return null;
    });

    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.data.started).toBe(1);
    expect(out.data.task_ids).toEqual(["t1"]);

    await new Promise((r) => setImmediate(r));
    expect(runTaskKickoffServerSideMock).toHaveBeenCalledTimes(1);
  });

  it("filters tasks belonging to other projects before claiming", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject({ slug: "demo" }));
    const tMine = makeTask({ id: "t-mine", project_slug: "demo" });
    const tOther = makeTask({ id: "t-other", project_slug: "other" });
    listTasksByAgentMock.mockReturnValue([tMine, tOther]);
    claimProposedTaskMock.mockReturnValue({ ...tMine, status: "working" });

    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out.ok).toBe(true);
    expect(claimProposedTaskMock).toHaveBeenCalledTimes(1);
    expect(claimProposedTaskMock).toHaveBeenCalledWith("t-mine");
  });

  it("logs but does not rethrow when a background kickoff rejects", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getActiveProjectMock.mockResolvedValue(makeProject());
    const t = makeTask({ id: "t1" });
    listTasksByAgentMock.mockReturnValue([t]);
    claimProposedTaskMock.mockReturnValue({ ...t, status: "working" });
    runTaskKickoffServerSideMock.mockRejectedValue(new Error("kickoff boom"));

    const out = await startAllProposedTasksAction("demo-google-ads");
    expect(out.ok).toBe(true);

    // Drain microtasks twice to let the rejection propagate to .catch.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[start-all] kickoff failed for t1:"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it("passes the agentId and status='proposed' filter to listTasksByAgent", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject());
    listTasksByAgentMock.mockReturnValue([]);
    await startAllProposedTasksAction("demo-google-ads");
    expect(listTasksByAgentMock).toHaveBeenCalledWith("demo-google-ads", "proposed");
  });
});

describe("cancelTaskAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:false when no active project is set", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    const out = await cancelTaskAction("demo-1");
    expect(out).toEqual({ ok: false, error: "No active project." });
    expect(getTaskMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when the task is not found", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject());
    getTaskMock.mockReturnValue(null);
    const out = await cancelTaskAction("demo-1");
    expect(out).toEqual({ ok: false, error: "Task not found." });
    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when the task belongs to a different project (active-project mismatch)", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject({ slug: "demo" }));
    getTaskMock.mockReturnValue(makeTask({ project_slug: "other" }));
    const out = await cancelTaskAction("other-1");
    expect(out).toEqual({ ok: false, error: "Task isn't in the active project." });
    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it.each(["done", "failed", "cancelled"] as const)(
    "returns ok:false when the task is already %s",
    async (status) => {
      getActiveProjectMock.mockResolvedValue(makeProject());
      getTaskMock.mockReturnValue(makeTask({ status }));
      const out = await cancelTaskAction("demo-1");
      expect(out).toEqual({ ok: false, error: `Task is already ${status}.` });
      expect(updateTaskMock).not.toHaveBeenCalled();
    },
  );

  it.each(["proposed", "approved", "working"] as const)(
    "cancels the task when it is in non-terminal state %s",
    async (status) => {
      getActiveProjectMock.mockResolvedValue(makeProject());
      getTaskMock.mockReturnValue(makeTask({ id: "task-1", status }));
      updateTaskMock.mockReturnValue(makeTask({ id: "task-1", status: "cancelled" }));

      const out = await cancelTaskAction("demo-1");
      expect(out).toEqual({ ok: true });
      expect(updateTaskMock).toHaveBeenCalledWith("task-1", {
        status: "cancelled",
        error_message: "Cancelled by user",
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/agents", "layout");
      expect(revalidatePathMock).toHaveBeenCalledWith("/tasks", "layout");
    },
  );

  it("accepts a display_id and forwards it to getTask", async () => {
    getActiveProjectMock.mockResolvedValue(makeProject());
    getTaskMock.mockReturnValue(makeTask({ id: "uuid-xyz", status: "working" }));
    await cancelTaskAction("demo-7");
    expect(getTaskMock).toHaveBeenCalledWith("demo-7");
    // updateTask is keyed by the row PK, not the display_id input.
    expect(updateTaskMock).toHaveBeenCalledWith("uuid-xyz", expect.any(Object));
  });
});
