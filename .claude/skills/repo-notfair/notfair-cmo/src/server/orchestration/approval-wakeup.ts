import { getProject } from "@/server/db/projects";
import { requireAdapter } from "@/server/adapters/registry";
import { workspaceDirFor } from "@/server/agents/provisioning";
import {
  appendTranscriptEvent,
  getOrCreateSession,
  touchSession,
} from "@/server/sessions";
import { appendComment, listComments } from "@/server/db/approvals";
import { getTask, setTaskThreadIfMissing, unblockTask } from "@/server/db/tasks";
import type { Approval } from "@/types";

import { generateTaskThreadId } from "./task-kickoff";

/**
 * After an approval is resolved (approve / reject / revision_requested),
 * deliver a system message into the task thread so the agent can pick up
 * the decision on its next turn. Mirrors paperclip's heartbeat.wakeup()
 * pattern: the agent doesn't poll — we push a turn with the decision in
 * its context, and side effects (next submit_task_status, follow-up
 * request_approval, etc.) happen via MCP tool calls during the turn.
 *
 * - approved/rejected → task unblocks, agent receives a green/red light.
 * - revision_requested → task stays `blocked`, agent receives the revision
 *   note and is expected to call request_approval again with the revised
 *   plan.
 *
 * No-op when the approval isn't linked to a task. Free-standing
 * approvals (without task_id) surface only in the inbox.
 */
export async function wakeTaskOnApprovalResolution(approval: Approval): Promise<void> {
  if (!approval.task_id) return;
  const task = getTask(approval.task_id);
  if (!task) return;
  // Don't restart agents on terminal tasks — the user may have cancelled
  // while the approval was outstanding.
  if (
    task.status === "done" ||
    task.status === "failed" ||
    task.status === "cancelled"
  ) {
    return;
  }

  // Approved/rejected both unblock the task. Revision keeps it blocked so
  // the UI continues to show "Waiting on approval" while the agent reworks.
  if (approval.status === "approved" || approval.status === "rejected") {
    unblockTask(task.id);
  }

  // Lazy thread mint — usually already set by an earlier kickoff, but a
  // free-floating approval (no prior message yet) won't have one.
  let threadId = task.thread_id;
  if (!threadId) {
    const minted = setTaskThreadIfMissing(task.id, generateTaskThreadId());
    if (minted?.thread_id) threadId = minted.thread_id;
  }
  if (!threadId) {
    console.error(`[approval-wakeup] no thread_id for task ${task.id}`);
    return;
  }

  const project = getProject(task.project_slug);
  if (!project) {
    console.error(`[approval-wakeup] project '${task.project_slug}' not found`);
    return;
  }
  const adapter = requireAdapter(project.harness_adapter);
  const session = getOrCreateSession({
    project_slug: project.slug,
    agent_id: task.agent_id,
    label: threadId,
    harness_adapter: project.harness_adapter,
    task_id: task.id,
  });

  const message = buildWakeupMessage(approval);
  appendComment({
    approval_id: approval.id,
    author_kind: "system",
    body: `Delivered to ${task.agent_id} on thread ${threadId}.`,
  });
  appendTranscriptEvent(session.id, "user", { text: message, source: "approval-wakeup" });

  try {
    for await (const evt of adapter.execute({
      projectSlug: project.slug,
      agentId: task.agent_id,
      workspaceDir: workspaceDirFor(task.agent_id),
      message,
      threadId: session.id,
      harnessSessionId: session.harness_session_id,
    })) {
      if (evt.kind === "session") {
        touchSession(session.id, evt.harnessSessionId);
        continue;
      }
      appendTranscriptEvent(session.id, evt.kind, evt);
      if (evt.kind === "error") throw new Error(evt.message);
    }
    touchSession(session.id);
  } catch (err) {
    console.error(`[approval-wakeup] adapter stream failed for task ${task.id}:`, err);
  }
}

function buildWakeupMessage(approval: Approval): string {
  const decidedBy =
    approval.decided_by_kind === "user"
      ? "the user"
      : approval.decided_by_kind === "agent"
        ? `another agent (${approval.decided_by_id ?? "unknown"})`
        : approval.decided_by_kind === "policy"
          ? "an auto-approval policy"
          : "an unknown party";

  const note = approval.decision_note?.trim();

  switch (approval.status) {
    case "approved":
      return [
        `[SYSTEM] Approval #${approval.id.slice(0, 8)} has been APPROVED by ${decidedBy}.`,
        `Action: ${approval.action_summary}`,
        note ? `Note: ${note}` : null,
        "",
        "You may now proceed with the action. When you're finished, call the `submit_task_status` MCP tool with status `done` (or `working` if you're posting an interim update). Do NOT invent new status values.",
      ]
        .filter(Boolean)
        .join("\n");
    case "rejected":
      return [
        `[SYSTEM] Approval #${approval.id.slice(0, 8)} has been REJECTED by ${decidedBy}.`,
        `Action: ${approval.action_summary}`,
        note ? `Reason: ${note}` : null,
        "",
        "Do NOT perform the rejected action. Decide whether to propose an alternative or stop here. Either way, call the `submit_task_status` MCP tool — use status `done` if you have nothing further to do, or `working` if you're proposing an alternative. The valid statuses are exactly: working, done, blocked, failed.",
      ]
        .filter(Boolean)
        .join("\n");
    case "revision_requested":
      return [
        `[SYSTEM] Approval #${approval.id.slice(0, 8)} needs revision per ${decidedBy}.`,
        `Action: ${approval.action_summary}`,
        note ? `Feedback: ${note}` : "Feedback: (no note left — re-read the request and propose a refined version)",
        "",
        "Re-evaluate the request given the feedback, then call the notfair-orchestration `request_approval` MCP tool again with the revised plan. Keep status `working` via `submit_task_status` in the meantime. Do NOT emit pseudo-XML blocks.",
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return `[SYSTEM] Approval #${approval.id.slice(0, 8)} resolved (${approval.status}). Continue.`;
  }
}

/** Re-export for tests / future code that wants the inbox thread. */
export { listComments };
