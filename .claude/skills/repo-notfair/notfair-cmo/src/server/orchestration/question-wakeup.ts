import { getProject } from "@/server/db/projects";
import { requireAdapter } from "@/server/adapters/registry";
import { workspaceDirFor } from "@/server/agents/provisioning";
import {
  appendTranscriptEvent,
  getOrCreateSession,
  touchSession,
} from "@/server/sessions";
import { parseQuestionOptions } from "@/server/db/questions";
import { getTask, setTaskThreadIfMissing, unblockTask } from "@/server/db/tasks";
import type { Question } from "@/types";

import { generateTaskThreadId } from "./task-kickoff";

/**
 * After the user answers (or cancels) a question raised by ask_user_question,
 * deliver a [SYSTEM] turn into the task's chat thread so the agent picks up
 * the resolution on its next turn. Mirrors approval-wakeup.ts.
 *
 * - answered → task unblocks, agent receives the question + chosen option +
 *   any free-text comment.
 * - cancelled → task STAYS blocked (the user dismissed without resolving).
 *   The agent is not woken; the question simply disappears from the
 *   workspace and the task remains parked until the agent / user takes
 *   the next step.
 *
 * No-op when the question isn't anchored to a task — free-standing asks
 * surface only in the project inbox and never park anything.
 */
export async function wakeTaskOnQuestionResolution(question: Question): Promise<void> {
  if (!question.task_id) return;
  if (question.status === "cancelled") return;
  if (question.status !== "answered") return;

  const task = getTask(question.task_id);
  if (!task) return;
  if (
    task.status === "done" ||
    task.status === "failed" ||
    task.status === "cancelled"
  ) {
    return;
  }

  unblockTask(task.id);

  // Lazy thread mint so a free-floating ask (no prior message) still has
  // somewhere to deliver the [SYSTEM] turn.
  let threadId = task.thread_id;
  if (!threadId) {
    const minted = setTaskThreadIfMissing(task.id, generateTaskThreadId());
    if (minted?.thread_id) threadId = minted.thread_id;
  }
  if (!threadId) {
    console.error(`[question-wakeup] no thread_id for task ${task.id}`);
    return;
  }

  const project = getProject(task.project_slug);
  if (!project) {
    console.error(`[question-wakeup] project '${task.project_slug}' not found`);
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

  const message = buildAnswerMessage(question);
  appendTranscriptEvent(session.id, "user", { text: message, source: "question-wakeup" });

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
    console.error(
      `[question-wakeup] adapter stream failed for task ${task.id}:`,
      err,
    );
  }
}

function buildAnswerMessage(question: Question): string {
  const options = parseQuestionOptions(question);
  const chosen =
    question.answer_option_index != null
      ? (options[question.answer_option_index] ?? null)
      : null;
  const note = question.answer_text?.trim() || null;

  // Compose a single "Answer: …" line that's unambiguous no matter how
  // the user replied: option only, free-text only, or both.
  let answerLine: string;
  if (chosen && note) {
    answerLine = `Answer: ${chosen} — ${note}`;
  } else if (chosen) {
    answerLine = `Answer: ${chosen}`;
  } else if (note) {
    answerLine = `Answer: ${note}`;
  } else {
    answerLine = "Answer: (the user submitted an empty response — re-ask if needed)";
  }

  return [
    `[SYSTEM] The user answered question #${question.id.slice(0, 8)}.`,
    `Question: ${question.prompt}`,
    answerLine,
    "",
    "The task has been unblocked. Continue your work using this answer. End your turn with `submit_task_status` (working / done / failed / blocked) when appropriate.",
  ].join("\n");
}
