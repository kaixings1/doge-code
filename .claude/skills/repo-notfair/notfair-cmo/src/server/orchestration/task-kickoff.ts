import { randomUUID } from "node:crypto";

import type { Task } from "@/types";

/**
 * Generate a UUID for a per-task chat thread. Stable per-call; callers
 * persist it via setTaskThreadIfMissing once they decide to materialize
 * the thread (typically on the first /tasks/[id] page visit, or when
 * approval-wakeup needs to push a system message into a task that's
 * never been opened in the UI).
 */
export function generateTaskThreadId(): string {
  return randomUUID();
}

/**
 * Build the hidden kickoff message the assignee receives on first open of
 * a task's per-task chat thread. Carries the brief + operating
 * instructions — the agent has everything it needs to acknowledge and
 * start working without the user typing anything.
 *
 * Kept server-side (in orchestration/) because the format mirrors what
 * the agent's system prompt expects; changing one without the other
 * desyncs the contract.
 */
export function buildTaskKickoffMessage(task: Task): string {
  const lines: string[] = [
    "(task assignment)",
    "",
    `project_slug: ${task.project_slug}`,
    `agent_id:     ${task.agent_id}`,
    `task_id:      ${task.id}`,
    `Title:        ${task.title ?? "(untitled)"}`,
    "",
    "Brief:",
    task.brief,
    "",
  ];
  if (task.success_criteria) {
    lines.push("Success criteria:", task.success_criteria, "");
  }
  lines.push(
    "Acknowledge this task in 1-2 sentences (what you'll do + roughly how",
    "long), then start working. Use your domain tools to actually do the",
    "thing — don't just describe what you'd do. Close the task out when",
    "you're done.",
  );
  return lines.join("\n");
}
