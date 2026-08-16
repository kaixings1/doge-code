"use client";

import { useState, useTransition } from "react";
import { MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  answerQuestionAction,
  cancelQuestionAction,
} from "@/server/actions/questions";
import type { Question } from "@/types";

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export type QuestionCardProps = {
  question: Question;
  /** Options parsed from question.options_json. Empty array = free-text only. */
  options: string[];
};

/**
 * Renders an open `ask_user_question` row as a structured card above the
 * task transcript. The user can pick one of the agent-provided options
 * AND/OR type a free-text answer. Submit fires answerQuestionAction,
 * which streams a [SYSTEM] wake-up turn to the agent and unblocks the
 * task. Cancel dismisses without delivering — task stays blocked.
 *
 * Mirrors ApprovalCard structurally so the workspace renders a consistent
 * "what does the agent need from me" stack when both card kinds are open.
 */
export function QuestionCard({ question, options }: QuestionCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const actionable = question.status === "pending";
  const canSubmit = actionable && (selectedIndex != null || text.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    start(async () => {
      const r = await answerQuestionAction(question.id, {
        option_index: selectedIndex,
        text: text.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Failed to send answer");
        return;
      }
      toast.success("Sent — agent is being notified");
      // No local reset: the server action revalidates and the next render
      // shows the row with status='answered' (or it disappears from the
      // open list, depending on the wrapping component).
    });
  }

  function dismiss() {
    start(async () => {
      const r = await cancelQuestionAction(question.id);
      if (!r.ok) {
        toast.error(r.error ?? "Failed to dismiss");
        return;
      }
      toast.info(
        "Question dismissed. The task stays blocked until the agent or user takes another step.",
      );
    });
  }

  return (
    <article
      className="ns-card"
      role="region"
      aria-label={question.prompt}
      data-status={question.status}
    >
      <div className="space-y-3 p-[18px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ns-tag inline-flex items-center gap-1">
            <MessageSquareQuote className="size-3" />
            Question
          </span>
          <span className={actionable ? "ns-tag-accent" : "ns-tag"}>
            {actionable
              ? "Needs answer"
              : question.status === "answered"
                ? "Answered"
                : "Dismissed"}
          </span>
        </div>
        <p className="m-0 whitespace-pre-wrap text-[14.5px] font-medium leading-snug text-[hsl(var(--notfair-ink))]">
          {question.prompt}
        </p>
        <p className="m-0 text-[12px] text-[hsl(var(--notfair-ink-4))]">
          Agent <span className="font-mono">{question.agent_id}</span> ·{" "}
          {timeAgo(question.created_at)}
        </p>

        {!actionable && (
          <ResolvedAnswer question={question} options={options} />
        )}

        {actionable && (
          <div className="space-y-3 pt-1">
            {options.length > 0 && (
              <div
                className="grid gap-2"
                role="radiogroup"
                aria-label="Suggested answers"
              >
                {options.map((opt, idx) => {
                  const selected = idx === selectedIndex;
                  return (
                    <button
                      key={`${opt}-${idx}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setSelectedIndex((cur) => (cur === idx ? null : idx))
                      }
                      disabled={pending}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left text-[13.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--notfair-accent-border))] disabled:cursor-not-allowed disabled:opacity-50",
                        selected
                          ? "border-[hsl(var(--notfair-accent-border))] bg-[hsl(var(--notfair-accent-soft))] text-[hsl(var(--notfair-ink))]"
                          : "border-border bg-card hover:border-[hsl(var(--notfair-accent-border))] hover:bg-[hsl(var(--notfair-accent-soft))]/40",
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor={`q-${question.id}-text`}
                className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--notfair-ink-4))]"
              >
                {options.length > 0 ? "Or add a comment" : "Your answer"}
              </label>
              <textarea
                id={`q-${question.id}-text`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={
                  options.length > 0
                    ? "Optional — add nuance to the option you picked, or answer free-form."
                    : "Type your answer…"
                }
                disabled={pending}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-[13.5px] shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-[hsl(var(--notfair-accent-border))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--notfair-accent-border))] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={pending || !canSubmit}
                className="ns-btn ns-btn-primary ns-btn-sm"
              >
                Send answer
              </button>
              <button
                type="button"
                onClick={dismiss}
                disabled={pending}
                className="ns-btn ns-btn-outline ns-btn-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ResolvedAnswer({
  question,
  options,
}: {
  question: Question;
  options: string[];
}) {
  if (question.status === "cancelled") {
    return (
      <p className="rounded-lg border border-dashed border-border bg-[hsl(var(--notfair-surface-2))]/60 px-3 py-2 text-[12.5px] text-[hsl(var(--notfair-ink-4))]">
        Dismissed without answer.
      </p>
    );
  }
  const chosen =
    question.answer_option_index != null
      ? (options[question.answer_option_index] ?? null)
      : null;
  const text = question.answer_text?.trim() || null;
  return (
    <div className="rounded-lg border border-dashed border-border bg-[hsl(var(--notfair-surface-2))]/60 p-3 text-[12.5px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[hsl(var(--notfair-ink-4))]">
        Answer
      </div>
      {chosen && (
        <p className="mt-1 font-medium leading-relaxed text-[hsl(var(--notfair-ink-2))]">
          {chosen}
        </p>
      )}
      {text && (
        <p
          className={cn(
            "whitespace-pre-wrap leading-relaxed",
            chosen
              ? "mt-1 text-[hsl(var(--notfair-ink-4))]"
              : "mt-1 text-[hsl(var(--notfair-ink-2))]",
          )}
        >
          {text}
        </p>
      )}
      {!chosen && !text && (
        <p className="mt-1 italic text-[hsl(var(--notfair-ink-4))]">
          (empty answer)
        </p>
      )}
    </div>
  );
}
