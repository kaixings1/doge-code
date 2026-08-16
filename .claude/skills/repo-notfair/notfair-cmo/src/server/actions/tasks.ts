"use server";

import { revalidatePath } from "next/cache";

import { getActiveProject } from "@/server/active-project";
import { claimProposedTask, getTask, listTasksByAgent, updateTask } from "@/server/db/tasks";
import { runTaskKickoffServerSide } from "@/server/orchestration/run-task";

export type StartAllResult =
  | { ok: true; data: { started: number; task_ids: string[] } }
  | { ok: false; error: string };

/**
 * Start all proposed tasks for an agent. Marks each as running, then fires
 * a server-side kickoff per task (fire-and-forget). The kickoffs run the
 * agent against each task in parallel using the shared OpenClaw gateway;
 * the action returns as soon as kickoffs are scheduled so the UI can
 * refresh without blocking on agent completion.
 *
 * Polling: the page is server-rendered, so the caller should run
 * router.refresh() periodically to see status flip from proposed →
 * running → succeeded as each kickoff finishes.
 */
export async function startAllProposedTasksAction(
  agentId: string,
): Promise<StartAllResult> {
  if (!agentId.trim()) return { ok: false, error: "agentId is required" };
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };

  const proposed = listTasksByAgent(agentId, "proposed");
  if (proposed.length === 0) {
    return { ok: true, data: { started: 0, task_ids: [] } };
  }

  // Guard: every task we touch must belong to the active project. Defends
  // against the assignee belonging to a project the user no longer has
  // active (cookie drift).
  const validTasks = proposed.filter((t) => t.project_slug === project.slug);
  if (validTasks.length === 0) {
    return {
      ok: false,
      error: `Agent ${agentId} has no proposed tasks in the active project.`,
    };
  }

  // Atomic claim per task — conditional UPDATE so a task that raced into
  // running/terminal between the SELECT and now is silently skipped instead
  // of getting its terminal status overwritten with `running`.
  const claimedTasks = validTasks
    .map((t) => claimProposedTask(t.id))
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Fire-and-forget per claimed task. The server stays alive long enough to
  // drain each gateway stream because Node keeps event-loop work running
  // even after the action's response is sent. In production we'd want
  // `unstable_after` for stronger guarantees; V1 dev mode is fine.
  for (const task of claimedTasks) {
    void runTaskKickoffServerSide(task).catch((err) =>
      console.error(`[start-all] kickoff failed for ${task.id}:`, err),
    );
  }

  revalidatePath(`/agents`, "layout");
  revalidatePath(`/tasks`, "layout");
  return {
    ok: true,
    data: { started: claimedTasks.length, task_ids: claimedTasks.map((t) => t.id) },
  };
}

export type CancelTaskResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Mark a task as cancelled. The agent run on OpenClaw is fire-and-forget
 * and may still complete in the background; processOrchestrationBlocks
 * guards against overwriting a terminal status, so a late "done" from
 * the agent won't flip cancelled → succeeded. Accepts either the PK
 * UUID or the display_id (`<slug>-<n>`).
 */
export async function cancelTaskAction(
  idOrDisplayId: string,
): Promise<CancelTaskResult> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };
  const task = getTask(idOrDisplayId);
  if (!task) return { ok: false, error: "Task not found." };
  if (task.project_slug !== project.slug) {
    return { ok: false, error: "Task isn't in the active project." };
  }
  if (
    task.status === "done" ||
    task.status === "failed" ||
    task.status === "cancelled"
  ) {
    return { ok: false, error: `Task is already ${task.status}.` };
  }
  updateTask(task.id, {
    status: "cancelled",
    error_message: "Cancelled by user",
  });
  revalidatePath(`/agents`, "layout");
  revalidatePath(`/tasks`, "layout");
  return { ok: true };
}

export type SimpleTaskActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Resume a task that the agent abandoned (turn ended without a
 * submit_task_status call, so we parked it in `blocked`). Flips the
 * task back to `proposed` and re-fires the kickoff so the agent picks
 * up where it left off — its prior transcript stays intact.
 *
 * Safe to call repeatedly: only succeeds when the task is currently
 * `blocked` and not gated on an approval / question / upstream task.
 */
export async function resumeBlockedTaskAction(
  idOrDisplayId: string,
): Promise<SimpleTaskActionResult> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };
  const task = getTask(idOrDisplayId);
  if (!task) return { ok: false, error: "Task not found." };
  if (task.project_slug !== project.slug) {
    return { ok: false, error: "Task isn't in the active project." };
  }
  if (task.status !== "blocked") {
    return { ok: false, error: `Task isn't blocked (it's ${task.status}).` };
  }
  if (task.blocked_by_task_id) {
    return {
      ok: false,
      error: "Task is blocked on an upstream task; resolve that first.",
    };
  }
  // Flip back to `proposed` and re-kickoff via the same path the
  // initial kickoff used. The kickoff function atomically claims the
  // task so concurrent clicks are safe.
  updateTask(task.id, { status: "proposed", error_message: null });
  const reread = getTask(task.id);
  if (reread) {
    const { startTaskIfProposed } = await import("@/server/orchestration/run-task");
    startTaskIfProposed(reread);
  }
  revalidatePath(`/agents`, "layout");
  revalidatePath(`/tasks`, "layout");
  return { ok: true };
}

/**
 * Manually mark a task as done. For the abandoned-task case where the
 * agent finished its work but never called submit_task_status — the
 * user is closing it on the agent's behalf.
 */
export async function markTaskDoneAction(
  idOrDisplayId: string,
): Promise<SimpleTaskActionResult> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };
  const task = getTask(idOrDisplayId);
  if (!task) return { ok: false, error: "Task not found." };
  if (task.project_slug !== project.slug) {
    return { ok: false, error: "Task isn't in the active project." };
  }
  if (task.status === "done" || task.status === "failed" || task.status === "cancelled") {
    return { ok: false, error: `Task is already ${task.status}.` };
  }
  updateTask(task.id, {
    status: "done",
    error_message: null,
  });
  revalidatePath(`/agents`, "layout");
  revalidatePath(`/tasks`, "layout");
  return { ok: true };
}
