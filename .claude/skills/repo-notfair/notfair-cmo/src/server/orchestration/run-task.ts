import { claimProposedTask, setTaskThreadIfMissing, updateTask } from "@/server/db/tasks";
import { getProject } from "@/server/db/projects";
import { requireAdapter } from "@/server/adapters/registry";
import { workspaceDirFor } from "@/server/agents/provisioning";
import {
  getOrCreateSession,
  appendTranscriptEvent,
  touchSession,
} from "@/server/sessions";
import type { Task } from "@/types";

import {
  buildTaskKickoffMessage,
  generateTaskThreadId,
} from "./task-kickoff";

/**
 * Idempotent "claim and kickoff" — atomically flips a proposed task to
 * working and fires the server-side kickoff. No-op when the row is already
 * running, terminal, or missing.
 */
export function startTaskIfProposed(task: Task): Task {
  const claimed = claimProposedTask(task.id);
  if (!claimed) return task;
  void runTaskKickoffServerSide(claimed).catch((err) => {
    console.error("[start-task] kickoff failed:", err);
  });
  return claimed;
}

/**
 * Server-side kickoff for a task. Dispatches the kickoff message through the
 * project's harness adapter and persists every emitted event to
 * `transcript_events`. The browser tails the same row range over SSE for
 * live render.
 */
export async function runTaskKickoffServerSide(task: Task): Promise<void> {
  let finalTask = task;
  if (!finalTask.thread_id) {
    const updated = setTaskThreadIfMissing(task.id, generateTaskThreadId());
    if (updated) finalTask = updated;
    if (!finalTask.thread_id) {
      throw new Error(`Failed to assign thread_id for task ${task.id}`);
    }
  }

  const project = getProject(finalTask.project_slug);
  if (!project) {
    updateTask(finalTask.id, {
      status: "failed",
      error_message: `Project '${finalTask.project_slug}' not found.`,
    });
    return;
  }
  const adapter = requireAdapter(project.harness_adapter);

  const session = getOrCreateSession({
    project_slug: project.slug,
    agent_id: finalTask.agent_id,
    label: finalTask.thread_id,
    harness_adapter: project.harness_adapter,
    task_id: finalTask.id,
  });

  const kickoffMessage = buildTaskKickoffMessage(finalTask);
  appendTranscriptEvent(session.id, "user", { text: kickoffMessage, source: "kickoff" });

  console.log(
    `[run-task] kickoff start task=${finalTask.id} agent=${finalTask.agent_id} thread=${finalTask.thread_id}`,
  );

  try {
    for await (const evt of adapter.execute({
      projectSlug: project.slug,
      agentId: finalTask.agent_id,
      workspaceDir: workspaceDirFor(finalTask.agent_id),
      message: kickoffMessage,
      threadId: session.id,
      harnessSessionId: session.harness_session_id,
    })) {
      if (evt.kind === "session") {
        touchSession(session.id, evt.harnessSessionId);
        continue;
      }
      appendTranscriptEvent(session.id, evt.kind, evt);
      if (evt.kind === "error") {
        throw new Error(evt.message);
      }
    }
    touchSession(session.id);
    console.log(`[run-task] kickoff stream done task=${finalTask.id}`);

    // The harness turn ended cleanly. If the agent didn't call
    // submit_task_status the task is stuck in `working` and the UI
    // shows a wrong "Wrapping up" spinner forever. Detect that, flip
    // the task to `blocked` with a clear reason so the user can decide
    // whether to retry, take over, or mark done. Best-effort: a stale
    // read is harmless because the orchestration tool path also writes
    // the task status, and our update is gated on status === "working".
    const current = updateTask(finalTask.id, {});
    if (current && current.status === "working") {
      console.warn(
        `[run-task] turn ended but agent did not call submit_task_status (task=${finalTask.id}); marking blocked`,
      );
      updateTask(finalTask.id, {
        status: "blocked",
        error_message:
          "Agent finished its turn without calling submit_task_status. The task is parked — send a follow-up message or mark it done manually.",
      });
      appendTranscriptEvent(session.id, "error", {
        kind: "error",
        message:
          "Turn ended without submit_task_status. Task moved to blocked — open Approvals or send a follow-up message to resume.",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[run-task] kickoff failed task=${finalTask.id} agent=${finalTask.agent_id}: ${message}`,
    );
    updateTask(finalTask.id, {
      status: "failed",
      error_message: message,
    });
  }
}
