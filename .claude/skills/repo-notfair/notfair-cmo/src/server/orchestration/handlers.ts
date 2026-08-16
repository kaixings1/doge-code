import {
  agentExists,
  templateForKey,
  type AgentTemplateKey,
} from "@/server/agent-templates";
import { listProjectAgents } from "@/server/agent-meta";
import { listAgentActions, logAgentAction } from "@/server/db/agent-actions";
import {
  createApproval,
  getApproval,
  listActionableApprovals,
  listApprovalsForTask,
} from "@/server/db/approvals";
import { createQuestion } from "@/server/db/questions";
import { getDb } from "@/server/db/db";
import { getProject } from "@/server/db/projects";
import {
  clearBlockerAndPromote,
  createTask,
  getTask,
  listTasks,
  listTasksBlockedBy,
  listTasksByAgent,
  markTaskBlocked,
  unblockTask,
  updateTask,
} from "@/server/db/tasks";
import type {
  AgentAction,
} from "@/server/db/agent-actions";
import type {
  Approval,
  Project,
  Task,
  TaskStatus,
} from "@/types";

/**
 * Shared orchestration handlers. Both the legacy text-block parser
 * (`process-blocks.ts`) and the MCP server tools (`mcp-server/tools.ts`)
 * dispatch through these so the two entry points stay in sync — same
 * validation, same logging, same side effects.
 *
 * Inputs are already-parsed/validated payloads (schema enforcement happens
 * upstream — regex in the block parser, zod in the MCP layer). Context
 * carries the caller's identity which the handler uses for authorization
 * checks (cross-project rejection, assignee-only updates).
 *
 * Return shape is the `HandlerResult` discriminated union so callers can
 * surface failures consistently — the MCP layer maps `ok: false` to the
 * tool-call `isError: true` envelope; the block parser maps it to an
 * `outcome.errors[]` entry.
 */

export type HandlerContext = {
  /** Project the caller is operating in. */
  project_slug: string;
  /** Caller's agent_id (the one making the change). */
  agent_id: string;
};

export type HandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const TASK_STATUS_ENUM = ["working", "done", "blocked", "failed"] as const;
export type TaskStatusValue = (typeof TASK_STATUS_ENUM)[number];

const APPROVAL_ACTION_TYPES = [
  "spend",
  "content_publishing",
  "new_channel",
  "bid_change",
  "audience_change",
  "other",
] as const;
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export {
  TASK_STATUS_ENUM as TASK_STATUS_VALUES,
  APPROVAL_ACTION_TYPES as APPROVAL_ACTION_TYPE_VALUES,
};

// ── create_task ────────────────────────────────────────────────────────

export type CreateTaskInput = {
  title: string;
  /** Template key (e.g. `google_ads`). Normalized through templateForKey. */
  assignee: string;
  brief: string;
  success_criteria?: string;
};

export async function handleCreateTask(
  input: CreateTaskInput,
  ctx: HandlerContext,
): Promise<HandlerResult<Task>> {
  const template = templateForKey(input.assignee);
  if (!template) {
    return { ok: false, error: `Unknown assignee template '${input.assignee}'` };
  }
  if (template.key === "cmo") {
    return { ok: false, error: "CMO cannot assign tasks to itself — pick a specialist" };
  }

  // Look up the assignee by template_key — agent_ids encode the
  // personal name (e.g. `acme-google-ads-ana`), so we can't synthesize
  // one from the role alone.
  const assigneeEntry = (await listProjectAgents(ctx.project_slug)).find(
    (a) => a.template_key === template.key,
  );
  if (!assigneeEntry || !(await agentExists(assigneeEntry.agent_id))) {
    return {
      ok: false,
      error: `Assignee agent for role '${template.key}' is not provisioned for this project`,
    };
  }
  const assigneeAgentId = assigneeEntry.agent_id;

  const task = createTask({
    project_slug: ctx.project_slug,
    agent_id: assigneeAgentId,
    title: input.title,
    brief: input.brief,
    success_criteria: input.success_criteria ?? null,
    assigner_agent_id: ctx.agent_id,
    status: "proposed",
  });

  logAgentAction({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    action_type: "task_created",
    summary: `Created task '${task.title}' for ${template.display_name}.`,
    payload: { task_id: task.id, assignee: assigneeAgentId },
  });

  // Auto-start the delegated task. Lazy import keeps the orchestration →
  // run-task → gateway chain out of modules that just want createTask.
  const { startTaskIfProposed } = await import("./run-task");
  const started = startTaskIfProposed(task);
  return { ok: true, data: started };
}

// ── submit_task_status ──────────────────────────────────────────────────

export type TaskStatusInput = {
  task_id: string;
  status: TaskStatusValue;
  summary?: string;
};

/** Used by the MCP submit_task_status handler; the text-block path is in
 *  process-blocks.ts and shares this logic. */
export function handleTaskStatus(
  input: TaskStatusInput,
  ctx: HandlerContext | null,
): HandlerResult<{ task_id: string; status: TaskStatus }> {
  const task = getTask(input.task_id);
  if (!task) {
    return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  }
  // For MCP calls ctx is null (we trust the bearer; status updates are
  // intrinsically agent-scoped via task.agent_id). The block-parser path
  // passes ctx so it can enforce cross-project / wrong-assignee rules.
  if (ctx) {
    if (task.project_slug !== ctx.project_slug) {
      return {
        ok: false,
        error: `Cross-project task update rejected: task '${input.task_id}' belongs to '${task.project_slug}' but emitter is in '${ctx.project_slug}'`,
      };
    }
    if (task.agent_id !== ctx.agent_id) {
      return {
        ok: false,
        error: `Only the assignee (${task.agent_id}) can update task '${input.task_id}'; got update from '${ctx.agent_id}'`,
      };
    }
  }
  if (
    task.status === "cancelled" ||
    task.status === "failed" ||
    task.status === "done"
  ) {
    return { ok: true, data: { task_id: task.id, status: task.status } };
  }

  // Closing a task that's gated on an unresolved approval is almost always
  // a mistake — the agent thinks "I queued the approval, my work is done"
  // and prematurely marks the task done, orphaning the approval in the
  // inbox. Refuse the transition and tell the agent what's blocking it.
  // The exception is `failed`, which we DO allow even with pending
  // approvals (an agent should be able to bail out of a stuck flow).
  if (input.status === "done") {
    const pendingApprovals = listApprovalsForTask(task.id).filter(
      (a) => a.status === "pending" || a.status === "revision_requested",
    );
    if (pendingApprovals.length > 0) {
      const ids = pendingApprovals.map((a) => a.id.slice(0, 8)).join(", ");
      return {
        ok: false,
        error: `Cannot close task ${task.display_id} — ${pendingApprovals.length} unresolved approval(s) still pending: ${ids}. Stay in 'blocked' until the user resolves them; the platform will wake you up on resolution with the decision in context.`,
      };
    }
  }

  // No mapping layer anymore: the agent-facing enum (working/done/blocked/
  // failed) IS the DB enum. Migration 007 unified the vocabularies.
  const newStatus: TaskStatus = input.status;

  updateTask(task.id, {
    status: newStatus,
    result: input.summary ? { summary: input.summary } : undefined,
    error_message:
      input.status === "failed"
        ? (input.summary ?? "agent reported failure")
        : null,
  });

  logAgentAction({
    project_slug: task.project_slug,
    agent_id: task.agent_id,
    task_id: task.id,
    action_type: `task_${input.status}`,
    summary: input.summary ?? `Task ${input.status}.`,
    payload: { task_id: task.id, status: newStatus, via: ctx ? "block" : "mcp" },
  });

  // Propagation: when a task resolves to `done`, wake any tasks that were
  // gated on it via blocked_by_task_id. The DB flip (blocked→proposed +
  // clear pointer) happens synchronously here so subsequent SELECTs in
  // the same process see the new state immediately; the kickoff itself
  // is fire-and-forget (it already runs the gateway stream async).
  //
  // We don't propagate on `failed`/`cancelled` — those leave dependents
  // stranded in `blocked`. That's deliberate: a failed prerequisite is a
  // signal to the user, not something to silently route around. They can
  // cancel the dependent or rerun the blocker.
  if (newStatus === "done") {
    // Promote dependents from `blocked → proposed` and auto-fire each
    // kickoff so the audit runs in the background even when the user is
    // on another page. Visibility comes from the SHADOW TRANSCRIPT that
    // runTaskKickoffServerSide writes — readTranscriptTail merges it
    // with OpenClaw's buffered JSONL so polling sees events live.
    const dependents = listTasksBlockedBy(task.id);
    const promoted: Task[] = [];
    for (const dep of dependents) {
      const p = clearBlockerAndPromote(dep.id);
      if (p) promoted.push(p);
    }
    if (promoted.length > 0) {
      void (async () => {
        const { startTaskIfProposed } = await import("./run-task");
        for (const p of promoted) {
          try {
            startTaskIfProposed(p);
          } catch (err) {
            console.error(
              `[block-prop] kickoff failed for ${p.display_id}:`,
              err,
            );
          }
        }
      })().catch((err) => {
        console.error("[block-prop] propagation IIFE failed:", err);
      });
    }
  }

  return { ok: true, data: { task_id: task.id, status: newStatus } };
}

// ── set_project_brief ──────────────────────────────────────────────────

export type SetProjectBriefInput = {
  body: string;
};

/**
 * Persist a new PROJECT.md body for this project, then propagate it into
 * every agent's IDENTITY.md so specialists pick up the updated context on
 * their next turn.
 *
 * The CMO calls this once during its project-onboarding task. It's
 * idempotent — calling again with a revised body replaces the prior one,
 * which is how PROJECT.md gets updated over the project's life (e.g. user
 * asks the CMO to "remember we're targeting EU now").
 */
export async function handleSetProjectBrief(
  input: SetProjectBriefInput,
  ctx: HandlerContext,
): Promise<HandlerResult<{ path: string }>> {
  const project = getProject(ctx.project_slug);
  if (!project) {
    return { ok: false, error: `Unknown project '${ctx.project_slug}'` };
  }

  const body = input.body;
  if (typeof body !== "string" || body.trim().length === 0) {
    return { ok: false, error: "PROJECT.md body cannot be empty." };
  }
  const { PROJECT_BRIEF_MAX_BYTES, writeProjectBrief, projectBriefPath } =
    await import("@/server/onboarding/project-brief");
  if (Buffer.byteLength(body, "utf8") > PROJECT_BRIEF_MAX_BYTES) {
    return {
      ok: false,
      error: `PROJECT.md exceeds ${PROJECT_BRIEF_MAX_BYTES} bytes — tighten it before resubmitting.`,
    };
  }

  await writeProjectBrief(ctx.project_slug, body);

  // Fan out into every agent workspace so the IDENTITY.md prompts pick
  // up the new context immediately. Best-effort per agent.
  const { syncProjectBriefToAgents } = await import(
    "@/server/agent-templates"
  );
  const sync = await syncProjectBriefToAgents(ctx.project_slug);

  logAgentAction({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    action_type: "project_brief_updated",
    summary: `Wrote PROJECT.md (${Buffer.byteLength(body, "utf8")} bytes); synced ${sync.synced.length} agents${sync.failed.length > 0 ? `, ${sync.failed.length} failed` : ""}.`,
    payload: { synced: sync.synced, failed: sync.failed },
  });

  return { ok: true, data: { path: projectBriefPath(ctx.project_slug) } };
}

// ── add_task_comment ───────────────────────────────────────────────────

export type AddCommentInput = {
  task_id: string;
  body: string;
};

export function handleAddTaskComment(
  input: AddCommentInput,
  ctx: HandlerContext,
): HandlerResult<{ task_id: string }> {
  const task = getTask(input.task_id);
  if (!task) {
    return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  }
  if (task.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project comment rejected on task '${input.task_id}'`,
    };
  }
  logAgentAction({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    task_id: task.id,
    action_type: "task_comment",
    summary: input.body,
    payload: { task_id: task.id },
  });
  return { ok: true, data: { task_id: task.id } };
}

// ── ask_user_question ──────────────────────────────────────────────────

export type AskUserInput = {
  question: string;
  task_id?: string;
  /** Comma-separated multi-choice hints rendered as buttons in the UI. */
  options?: string;
};

export function handleAskUser(
  input: AskUserInput,
  ctx: HandlerContext,
): HandlerResult<{
  question_id: string;
  question: string;
  task_id: string | null;
  options: string[];
}> {
  let resolvedTaskId: string | null = null;
  if (input.task_id) {
    const task = getTask(input.task_id);
    if (!task) {
      return { ok: false, error: `Unknown task_id '${input.task_id}'` };
    }
    if (task.project_slug !== ctx.project_slug) {
      return {
        ok: false,
        error: `Cross-project ask_user rejected on task '${input.task_id}'`,
      };
    }
    resolvedTaskId = task.id;
  }

  // Parse comma-separated options into a clean string[] — the tool input
  // is a comma-separated string for ergonomics in the agent template, but
  // the DB and UI use a structured array. Drop empties/whitespace so the
  // UI never renders an empty button.
  const options = (input.options ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const question = createQuestion({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    task_id: resolvedTaskId,
    prompt: input.question,
    options,
  });

  // Park the task in `blocked` so the workspace renders the QuestionCard
  // and the agent doesn't keep running while waiting on a human answer.
  // Mirrors request_approval's blocking behavior.
  if (resolvedTaskId) {
    markTaskBlocked(resolvedTaskId);
  }

  logAgentAction({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    task_id: resolvedTaskId,
    action_type: "ask_user",
    summary: input.question,
    payload: {
      task_id: resolvedTaskId,
      options,
      question_id: question.id,
    },
  });
  return {
    ok: true,
    data: {
      question_id: question.id,
      question: input.question,
      task_id: resolvedTaskId,
      options,
    },
  };
}

// ── request_approval ────────────────────────────────────────────────────

export type RequestApprovalInput = {
  action_summary: string;
  action_type: ApprovalActionType;
  task_id?: string;
  cost_estimate_usd?: number;
  reasoning?: string;
};

export async function handleRequestApproval(
  input: RequestApprovalInput,
  ctx: HandlerContext,
): Promise<HandlerResult<{
  approval_id: string;
  action_type: ApprovalActionType;
  status: string;
  auto_resolved: boolean;
}>> {
  let resolvedTaskId: string | null = null;
  if (input.task_id) {
    const task = getTask(input.task_id);
    if (!task) {
      return { ok: false, error: `Unknown task_id '${input.task_id}'` };
    }
    if (task.project_slug !== ctx.project_slug) {
      return {
        ok: false,
        error: `Cross-project approval rejected on task '${input.task_id}'`,
      };
    }
    resolvedTaskId = task.id;
  }

  const approval = createApproval({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    task_id: resolvedTaskId,
    action_summary: input.action_summary,
    action_type: input.action_type,
    cost_estimate_usd: input.cost_estimate_usd ?? 0,
    reasoning: input.reasoning ?? null,
    payload: { task_id: resolvedTaskId },
  });

  const autoResolved = approval.decided_by_kind === "policy";

  if (resolvedTaskId) {
    if (autoResolved) {
      unblockTask(resolvedTaskId);
    } else {
      markTaskBlocked(resolvedTaskId);
    }
  }

  if (autoResolved) {
    void (async () => {
      try {
        const { wakeTaskOnApprovalResolution } = await import("./approval-wakeup");
        await wakeTaskOnApprovalResolution(approval);
      } catch (err) {
        console.error("[request-approval] auto-resolve wake-up failed:", err);
      }
    })();
  }

  return {
    ok: true,
    data: {
      approval_id: approval.id,
      action_type: input.action_type,
      status: approval.status,
      auto_resolved: autoResolved,
    },
  };
}

// ── Read handlers (paperclip-aligned context surface) ──────────────────
//
// These let agents ask "what's my task?", "what's pending?", "who can I
// delegate to?" instead of relying solely on the one-shot kickoff message.
// Without them, an agent whose context window rotates loses task anchoring.

export function handleGetTask(
  input: { task_id: string },
  ctx: HandlerContext,
): HandlerResult<Task> {
  const task = getTask(input.task_id);
  if (!task) return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  if (task.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project read rejected: task '${input.task_id}' belongs to '${task.project_slug}'`,
    };
  }
  return { ok: true, data: task };
}

export function handleListMyTasks(
  input: { status?: TaskStatus | "in_flight" | "all" },
  ctx: HandlerContext,
): HandlerResult<Task[]> {
  // "in_flight" = anything not terminal; the common case for an agent asking
  // "what's on my plate?". "all" disables the filter; a specific TaskStatus
  // narrows to that state.
  const status = input.status ?? "in_flight";
  let all: Task[];
  if (status === "in_flight" || status === "all") {
    all = listTasksByAgent(ctx.agent_id);
  } else {
    all = listTasksByAgent(ctx.agent_id, status);
  }
  if (status === "in_flight") {
    const inFlight = new Set<TaskStatus>([
      "proposed",
      "approved",
      "working",
      "blocked",
    ]);
    all = all.filter((t) => inFlight.has(t.status));
  }
  const projectScoped = all.filter((t) => t.project_slug === ctx.project_slug);
  return { ok: true, data: projectScoped };
}

export function handleListTasks(
  input: { status?: TaskStatus },
  ctx: HandlerContext,
): HandlerResult<Task[]> {
  const rows = listTasks(ctx.project_slug, input.status);
  return { ok: true, data: rows };
}

// ── update_task ────────────────────────────────────────────────────────

export type UpdateTaskInput = {
  task_id: string;
  title?: string;
  brief?: string;
  success_criteria?: string;
};

export function handleUpdateTask(
  input: UpdateTaskInput,
  ctx: HandlerContext,
): HandlerResult<Task> {
  const task = getTask(input.task_id);
  if (!task) return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  if (task.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project update rejected on task '${input.task_id}'`,
    };
  }
  if (
    input.title === undefined &&
    input.brief === undefined &&
    input.success_criteria === undefined
  ) {
    return { ok: false, error: "At least one field (title/brief/success_criteria) must be provided." };
  }
  // Patch via raw SQL inline so we don't widen the public updateTask
  // surface (which only supports status/result/error_message) for this
  // one tool. better-sqlite3 is synchronous so the read-after-write is
  // race-free in this process.
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const args: unknown[] = [now];
  if (input.title !== undefined) {
    sets.push("title = ?");
    args.push(input.title);
  }
  if (input.brief !== undefined) {
    sets.push("brief = ?");
    args.push(input.brief);
  }
  if (input.success_criteria !== undefined) {
    sets.push("success_criteria = ?");
    args.push(input.success_criteria);
  }
  args.push(task.id);
  db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  const after = getTask(task.id);
  if (!after) return { ok: false, error: "Task vanished after update." };
  logAgentAction({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    task_id: task.id,
    action_type: "task_updated",
    summary: "Task fields updated.",
    payload: {
      task_id: task.id,
      fields: Object.fromEntries(
        Object.entries(input).filter(([k, v]) => k !== "task_id" && v !== undefined),
      ),
    },
  });
  return { ok: true, data: after };
}

// ── cancel_task ────────────────────────────────────────────────────────

export function handleCancelTask(
  input: { task_id: string; reason?: string },
  ctx: HandlerContext,
): HandlerResult<Task> {
  const task = getTask(input.task_id);
  if (!task) return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  if (task.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project cancel rejected on task '${input.task_id}'`,
    };
  }
  if (
    task.status === "done" ||
    task.status === "failed" ||
    task.status === "cancelled"
  ) {
    return { ok: true, data: task }; // already terminal — no-op
  }
  updateTask(task.id, {
    status: "cancelled",
    error_message: input.reason ?? null,
  });
  logAgentAction({
    project_slug: ctx.project_slug,
    agent_id: ctx.agent_id,
    task_id: task.id,
    action_type: "task_cancelled",
    summary: input.reason ?? "Task cancelled.",
    payload: { task_id: task.id, reason: input.reason ?? null },
  });
  const after = getTask(task.id);
  if (!after) return { ok: false, error: "Task vanished after cancel." };
  return { ok: true, data: after };
}

// ── project + agents context ───────────────────────────────────────────

export function handleGetProject(
  _input: Record<string, never>,
  ctx: HandlerContext,
): HandlerResult<Project> {
  const project = getProject(ctx.project_slug);
  if (!project) return { ok: false, error: `Unknown project '${ctx.project_slug}'` };
  return { ok: true, data: project };
}

export type ProjectAgentSummary = {
  agent_id: string;
  slug: string;
  display_name: string;
  description: string;
  template_key: string | null;
  is_template_default: boolean;
};

export async function handleListProjectAgents(
  _input: Record<string, never>,
  ctx: HandlerContext,
): Promise<HandlerResult<ProjectAgentSummary[]>> {
  const entries = await listProjectAgents(ctx.project_slug);
  return {
    ok: true,
    data: entries.map((e) => ({
      agent_id: e.agent_id,
      slug: e.slug,
      display_name: e.name,
      description: e.description ?? "",
      template_key: e.template_key ?? null,
      is_template_default: Boolean(e.is_template_default),
    })),
  };
}

// ── activity / comments ────────────────────────────────────────────────

export function handleListTaskComments(
  input: { task_id: string; limit?: number },
  ctx: HandlerContext,
): HandlerResult<AgentAction[]> {
  const task = getTask(input.task_id);
  if (!task) return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  if (task.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project read rejected on task '${input.task_id}'`,
    };
  }
  // Comments are stored on the agent_actions log keyed by task_id and
  // action_type. Filter both client-side; a dedicated table is in scope
  // for v1.1 (paperclip parity — see comments in process-blocks.ts).
  const limit = input.limit ?? 50;
  const rows = listAgentActions(ctx.project_slug, 500).filter(
    (a) => a.task_id === task.id && a.action_type === "task_comment",
  );
  return { ok: true, data: rows.slice(0, limit) };
}

// ── approvals ─────────────────────────────────────────────────────────

export function handleGetApproval(
  input: { approval_id: string },
  ctx: HandlerContext,
): HandlerResult<Approval> {
  const approval = getApproval(input.approval_id);
  if (!approval) {
    return { ok: false, error: `Unknown approval_id '${input.approval_id}'` };
  }
  if (approval.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project read rejected on approval '${input.approval_id}'`,
    };
  }
  return { ok: true, data: approval };
}

export function handleListMyApprovals(
  _input: Record<string, never>,
  ctx: HandlerContext,
): HandlerResult<Approval[]> {
  // Approvals requested by this agent across all states. Caller filters
  // status client-side if needed.
  const rows = listActionableApprovals(ctx.project_slug).filter(
    (a) => a.agent_id === ctx.agent_id,
  );
  return { ok: true, data: rows };
}

export function handleListPendingApprovals(
  _input: Record<string, never>,
  ctx: HandlerContext,
): HandlerResult<Approval[]> {
  return { ok: true, data: listActionableApprovals(ctx.project_slug) };
}

export function handleListApprovalsForTask(
  input: { task_id: string },
  ctx: HandlerContext,
): HandlerResult<Approval[]> {
  const task = getTask(input.task_id);
  if (!task) return { ok: false, error: `Unknown task_id '${input.task_id}'` };
  if (task.project_slug !== ctx.project_slug) {
    return {
      ok: false,
      error: `Cross-project read rejected on task '${input.task_id}'`,
    };
  }
  return { ok: true, data: listApprovalsForTask(task.id) };
}

// ── enum discovery ─────────────────────────────────────────────────────

export type TaskStatusInfo = {
  value: TaskStatus;
  description: string;
  terminal: boolean;
  /** Statuses you can transition INTO from this one. Empty for terminal. */
  next: TaskStatus[];
};

const TASK_STATUS_INFO: TaskStatusInfo[] = [
  { value: "proposed", description: "Task created, awaiting kickoff or user approval.", terminal: false, next: ["approved", "working", "cancelled"] },
  { value: "approved", description: "User approved a guarded task; ready for the assignee to pick up.", terminal: false, next: ["working", "cancelled"] },
  { value: "working", description: "Assignee is actively working.", terminal: false, next: ["blocked", "done", "failed", "cancelled"] },
  { value: "blocked", description: "Waiting on a user decision, an approval, or a missing input.", terminal: false, next: ["working", "done", "failed", "cancelled"] },
  { value: "done", description: "Task complete (terminal).", terminal: true, next: [] },
  { value: "failed", description: "Task could not complete (terminal). error_message has the reason.", terminal: true, next: [] },
  { value: "cancelled", description: "User or CMO cancelled before completion (terminal).", terminal: true, next: [] },
];

export function handleListTaskStatuses(): HandlerResult<TaskStatusInfo[]> {
  return { ok: true, data: TASK_STATUS_INFO };
}

const APPROVAL_ACTION_TYPE_INFO: Array<{
  value: ApprovalActionType;
  description: string;
  cost_estimate_required: boolean;
}> = [
  { value: "spend", description: "Increase or shift advertising spend.", cost_estimate_required: true },
  { value: "content_publishing", description: "Publish public-facing content (landing page, blog post, ad copy).", cost_estimate_required: false },
  { value: "new_channel", description: "Launch a new marketing channel (new ad platform, new geo, etc.).", cost_estimate_required: true },
  { value: "bid_change", description: "Modify keyword bids or bidding strategy.", cost_estimate_required: true },
  { value: "audience_change", description: "Change campaign targeting / audience.", cost_estimate_required: false },
  { value: "other", description: "Any other governed action not covered above.", cost_estimate_required: false },
];

export function handleListApprovalActionTypes(): HandlerResult<typeof APPROVAL_ACTION_TYPE_INFO> {
  return { ok: true, data: APPROVAL_ACTION_TYPE_INFO };
}
