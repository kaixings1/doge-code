import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { Task, TaskStatus } from "@/types";

export type CreateTaskInput = {
  project_slug: string;
  /** Assignee — the agent expected to do the work. */
  agent_id: string;
  /** Short label for the kanban card. Optional but recommended. */
  title?: string | null;
  brief: string;
  success_criteria?: string | null;
  deadline_iso?: string | null;
  status?: TaskStatus;
  /** Agent that created this task. CMO is the typical originator. */
  assigner_agent_id?: string | null;
  /**
   * Upstream task that must finish before this one can start. When set,
   * the task is forced into `blocked` status regardless of the `status`
   * input — caller intent to gate cannot be circumvented by leaving the
   * default. Cleared automatically on blocker resolution.
   */
  blocked_by_task_id?: string | null;
};

/**
 * Allocate the next display_id for a project — `<slug>-<n>` where n is one
 * past the current MAX. better-sqlite3 is synchronous so two creates in
 * one process can't race; cross-process collisions don't apply (single-user
 * local CLI) and the UNIQUE index would catch them if they ever did.
 */
function nextDisplayId(project_slug: string): string {
  const db = getDb();
  // substr starts at length(slug) + 2 to skip past "slug-".
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(display_id, ?) AS INTEGER)), 0) AS max_n
       FROM tasks
       WHERE project_slug = ? AND display_id LIKE ?`,
    )
    .get(project_slug.length + 2, project_slug, `${project_slug}-%`) as
    | { max_n: number }
    | undefined;
  const n = (row?.max_n ?? 0) + 1;
  return `${project_slug}-${n}`;
}

export function createTask(input: CreateTaskInput): Task {
  const db = getDb();
  const now = new Date().toISOString();

  // If a blocker is named AND it isn't already terminal, force this task
  // into `blocked` so it won't be picked up before the blocker resolves.
  // Race-free because better-sqlite3 is synchronous in this process: by
  // the time the propagation hook fires on the blocker's `done`, this
  // row exists and is visible to the SELECT inside the hook.
  let initialStatus: TaskStatus = input.status ?? "proposed";
  let blocked_by_task_id: string | null = input.blocked_by_task_id ?? null;
  if (blocked_by_task_id) {
    const blocker = getTask(blocked_by_task_id);
    if (blocker && !isTerminal(blocker.status)) {
      initialStatus = "blocked";
    } else {
      // Blocker already done / failed / cancelled — no point gating.
      // Drop the pointer so the dependent isn't permanently stuck.
      blocked_by_task_id = null;
    }
  }

  const task: Task = {
    id: randomUUID(),
    display_id: nextDisplayId(input.project_slug),
    project_slug: input.project_slug,
    agent_id: input.agent_id,
    title: input.title ?? null,
    brief: input.brief,
    success_criteria: input.success_criteria ?? null,
    deadline_iso: input.deadline_iso ?? null,
    status: initialStatus,
    result_json: null,
    error_message: null,
    thread_id: null,
    assigner_agent_id: input.assigner_agent_id ?? null,
    blocked_by_task_id,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO tasks
       (id, display_id, project_slug, agent_id, title, brief, success_criteria, deadline_iso,
        status, result_json, error_message, thread_id, assigner_agent_id, blocked_by_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.display_id,
    task.project_slug,
    task.agent_id,
    task.title,
    task.brief,
    task.success_criteria,
    task.deadline_iso,
    task.status,
    task.assigner_agent_id,
    task.blocked_by_task_id,
    task.created_at,
    task.updated_at,
  );
  return task;
}

function isTerminal(status: TaskStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

/**
 * Lazily set the OpenClaw chat session id for this task. Called the first
 * time someone opens /tasks/[id] — the thread_id is generated then and
 * remains stable forever after so the per-task chat history persists.
 * No-op when the task already has a thread_id assigned.
 */
export function setTaskThreadIfMissing(
  id: string,
  thread_id: string,
): Task | null {
  const db = getDb();
  const current = getTask(id);
  if (!current) return null;
  if (current.thread_id) return current;
  db.prepare(
    "UPDATE tasks SET thread_id = ?, updated_at = ? WHERE id = ? AND thread_id IS NULL",
  ).run(thread_id, new Date().toISOString(), id);
  return getTask(id);
}

/**
 * Look up a task by either the PK UUID or the human-readable display_id
 * (`<slug>-<n>`). URLs prefer display_id; internal callers may pass
 * either. Returns null when neither matches.
 */
export function getTask(idOrDisplayId: string): Task | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM tasks WHERE id = ? OR display_id = ?")
    .get(idOrDisplayId, idOrDisplayId);
  return (row as Task) ?? null;
}

export function listTasks(project_slug: string, status?: TaskStatus): Task[] {
  const db = getDb();
  if (status) {
    return db
      .prepare("SELECT * FROM tasks WHERE project_slug = ? AND status = ? ORDER BY created_at DESC")
      .all(project_slug, status) as Task[];
  }
  return db
    .prepare("SELECT * FROM tasks WHERE project_slug = ? ORDER BY created_at DESC")
    .all(project_slug) as Task[];
}

/**
 * Per-agent task list — what's on this agent's plate. Used by the
 * /agents/[agent]/tasks page so the assignee can see its queue without
 * filtering the project-wide kanban manually.
 */
export function listTasksByAgent(agent_id: string, status?: TaskStatus): Task[] {
  const db = getDb();
  if (status) {
    return db
      .prepare("SELECT * FROM tasks WHERE agent_id = ? AND status = ? ORDER BY created_at DESC")
      .all(agent_id, status) as Task[];
  }
  return db
    .prepare("SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at DESC")
    .all(agent_id) as Task[];
}

/**
 * Map of `agent_id → in-flight task count` for a single project. Drives the
 * sidebar's per-agent live-task badge. "In flight" means proposed (kickoff
 * pending), approved, working, or blocked. Terminal states (done/failed/cancelled)
 * never count.
 */
export function inFlightCountsByAgent(
  project_slug: string,
): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT agent_id, COUNT(*) as count
       FROM tasks
       WHERE project_slug = ? AND status IN ('proposed', 'approved', 'working', 'blocked')
       GROUP BY agent_id`,
    )
    .all(project_slug) as Array<{ agent_id: string; count: number }>;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.agent_id, r.count);
  return map;
}

export type UpdateTaskInput = {
  status?: TaskStatus;
  result?: unknown;
  error_message?: string | null;
};

export function updateTask(id: string, update: UpdateTaskInput): Task | null {
  const db = getDb();
  const now = new Date().toISOString();
  const current = getTask(id);
  if (!current) return null;

  const result_json = update.result !== undefined ? JSON.stringify(update.result) : current.result_json;
  const error_message = update.error_message !== undefined ? update.error_message : current.error_message;
  const status = update.status ?? current.status;

  db.prepare(
    "UPDATE tasks SET status = ?, result_json = ?, error_message = ?, updated_at = ? WHERE id = ?",
  ).run(status, result_json, error_message, now, id);

  return getTask(id);
}

/**
 * Atomically flip a task from `proposed` to `working` and return the post-flip
 * row, or null when no claim happened (already started, already terminal, row
 * missing). The conditional WHERE clause is the whole point — callers
 * (kickoff entry points, "Start all" batch) can never accidentally regress a
 * `done`/`failed`/`cancelled` row back to `working` by passing in a
 * stale in-memory task snapshot. better-sqlite3 is synchronous, so the
 * read-back here cannot race with a concurrent writer in this process.
 */
export function claimProposedTask(id: string): Task | null {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      "UPDATE tasks SET status = 'working', updated_at = ? WHERE id = ? AND status = 'proposed'",
    )
    .run(now, id);
  if (info.changes === 0) return null;
  return getTask(id);
}

/**
 * Flip a working task to `blocked` (waiting on an approval). Only transitions
 * from `working` or `proposed` so we don't undo a terminal state. Returns
 * the post-flip row, or the current row when the transition didn't apply.
 */
export function markTaskBlocked(id: string): Task | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ? AND status IN ('working','proposed','approved')",
  ).run(now, id);
  return getTask(id);
}

/**
 * Flip a blocked task back to working once its approval resolves. No-op when
 * the task isn't blocked (e.g., already terminal because the user cancelled).
 */
export function unblockTask(id: string): Task | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE tasks SET status = 'working', updated_at = ? WHERE id = ? AND status = 'blocked'",
  ).run(now, id);
  return getTask(id);
}

/**
 * Tasks gated on the given blocker (i.e. blocked_by_task_id = id) that are
 * still in the `blocked` state. Used by the propagation hook in
 * handleTaskStatus to find dependents to wake when the blocker resolves.
 */
export function listTasksBlockedBy(blocker_task_id: string): Task[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM tasks WHERE blocked_by_task_id = ? AND status = 'blocked' ORDER BY created_at ASC",
    )
    .all(blocker_task_id) as Task[];
}

/**
 * Atomically clear the blocked_by pointer and flip blocked→proposed so the
 * task becomes eligible for the standard `startTaskIfProposed` claim. Done
 * in one UPDATE so a concurrent kickoff can't observe an intermediate state
 * where the task is proposed-but-still-pointed-at-a-resolved-blocker.
 *
 * Returns the post-flip task on success, null when the row wasn't blocked
 * (e.g. someone cancelled it before the blocker finished).
 */
export function clearBlockerAndPromote(id: string): Task | null {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      "UPDATE tasks SET status = 'proposed', blocked_by_task_id = NULL, updated_at = ? WHERE id = ? AND status = 'blocked'",
    )
    .run(now, id);
  if (info.changes === 0) return null;
  return getTask(id);
}
