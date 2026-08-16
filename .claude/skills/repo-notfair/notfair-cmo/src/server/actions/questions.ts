"use server";

import { revalidatePath } from "next/cache";
import {
  answerQuestion,
  cancelQuestion,
  getQuestion,
  parseQuestionOptions,
} from "@/server/db/questions";
import { wakeTaskOnQuestionResolution } from "@/server/orchestration/question-wakeup";

export type QuestionActionResult = { ok: boolean; error?: string };

export type AnswerQuestionInput = {
  /** Zero-based index into the original options[]. Null = no option chosen. */
  option_index?: number | null;
  /** Free-text answer alongside / instead of an option. Null = no comment. */
  text?: string | null;
};

/**
 * Answer the user's open question. Validates the option index against the
 * stored options[], writes the answer, then fires the wake-up
 * fire-and-forget so the agent picks it up on its next turn.
 */
export async function answerQuestionAction(
  id: string,
  input: AnswerQuestionInput,
): Promise<QuestionActionResult> {
  const before = getQuestion(id);
  if (!before) return { ok: false, error: "Question not found." };
  if (before.status !== "pending") {
    return { ok: false, error: `Question is already ${before.status}.` };
  }

  const trimmedText = input.text?.trim() || null;
  let optionIndex: number | null = null;
  if (input.option_index != null) {
    const options = parseQuestionOptions(before);
    if (
      !Number.isInteger(input.option_index) ||
      input.option_index < 0 ||
      input.option_index >= options.length
    ) {
      return { ok: false, error: "Selected option is out of range." };
    }
    optionIndex = input.option_index;
  }

  if (optionIndex == null && !trimmedText) {
    return {
      ok: false,
      error: "Pick an option or type an answer.",
    };
  }

  const after = answerQuestion({
    id,
    answer_option_index: optionIndex,
    answer_text: trimmedText,
  });
  if (!after) return { ok: false, error: "Question row vanished." };

  void wakeTaskOnQuestionResolution(after).catch((err) => {
    console.error("[answer-question-action] wake-up failed:", err);
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Dismiss the question without delivering an answer. The task STAYS
 * blocked — the user opted out of resolving here, so the agent is not
 * woken. The agent / user can take the next step manually (cancel the
 * task, re-ask, etc.).
 */
export async function cancelQuestionAction(
  id: string,
): Promise<QuestionActionResult> {
  const before = getQuestion(id);
  if (!before) return { ok: false, error: "Question not found." };
  if (before.status !== "pending") {
    return { ok: false, error: `Question is already ${before.status}.` };
  }
  const after = cancelQuestion(id);
  if (!after) return { ok: false, error: "Question row vanished." };
  revalidatePath("/", "layout");
  return { ok: true };
}
