import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { Question, QuestionStatus } from "@/types";

export type CreateQuestionInput = {
  project_slug: string;
  agent_id: string;
  task_id?: string | null;
  prompt: string;
  /** Multiple-choice hints rendered as buttons. Empty array = free-text only. */
  options: string[];
};

export function createQuestion(input: CreateQuestionInput): Question {
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO questions
       (id, project_slug, agent_id, task_id, prompt, options_json,
        status, answer_option_index, answer_text, resolved_by_kind,
        created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, NULL)`,
  ).run(
    id,
    input.project_slug,
    input.agent_id,
    input.task_id ?? null,
    input.prompt,
    JSON.stringify(input.options ?? []),
    createdAt,
  );
  return getQuestion(id)!;
}

export function getQuestion(id: string): Question | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM questions WHERE id = ?")
    .get(id) as Question | undefined;
  return row ?? null;
}

/** Open (pending) questions on a given task, oldest first. Usually 0 or 1. */
export function listOpenQuestionsForTask(task_id: string): Question[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM questions
        WHERE task_id = ? AND status = 'pending'
        ORDER BY created_at ASC`,
    )
    .all(task_id) as Question[];
}

/** Every question (any status) anchored to a task, newest first. Audit trail.
 *  `rowid DESC` tiebreaker keeps ordering deterministic when two rows share
 *  a millisecond-resolution `created_at`: SQLite assigns rowid sequentially
 *  per insert, so this falls back to insertion order. */
export function listQuestionsForTask(task_id: string): Question[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM questions
        WHERE task_id = ?
        ORDER BY created_at DESC, rowid DESC`,
    )
    .all(task_id) as Question[];
}

/** Project-wide open questions. Used by the future approvals/inbox tab. */
export function listOpenQuestionsForProject(project_slug: string): Question[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM questions
        WHERE project_slug = ? AND status = 'pending'
        ORDER BY created_at DESC`,
    )
    .all(project_slug) as Question[];
}

export type AnswerQuestionInput = {
  id: string;
  /** Zero-based index into the original options[] when the user clicked
   *  an option. Null when the user only typed free-text. */
  answer_option_index?: number | null;
  /** Free-text answer typed by the user. Null when the user only clicked
   *  an option. */
  answer_text?: string | null;
};

/**
 * Conditional UPDATE keyed on status='pending' — returns the post-update
 * row, or null if the question wasn't pending (already answered /
 * cancelled / unknown id). Callers use null to detect race-loss and bail
 * silently.
 */
export function answerQuestion(input: AnswerQuestionInput): Question | null {
  const db = getDb();
  const resolvedAt = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE questions
          SET status = 'answered',
              answer_option_index = ?,
              answer_text = ?,
              resolved_by_kind = 'user',
              resolved_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
    .run(
      input.answer_option_index ?? null,
      input.answer_text ?? null,
      resolvedAt,
      input.id,
    );
  if (res.changes === 0) return null;
  return getQuestion(input.id);
}

export function cancelQuestion(id: string): Question | null {
  const db = getDb();
  const resolvedAt = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE questions
          SET status = 'cancelled',
              resolved_by_kind = 'user',
              resolved_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
    .run(resolvedAt, id);
  if (res.changes === 0) return null;
  return getQuestion(id);
}

/** Convenience: parse options_json into a string[] for the UI/handler. */
export function parseQuestionOptions(q: Question): string[] {
  try {
    const parsed = JSON.parse(q.options_json);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

/** Map a question.status string to a human label for badges. */
export function statusLabel(status: QuestionStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "answered":
      return "Answered";
    case "cancelled":
      return "Cancelled";
  }
}
