"use client";

import { startTransition, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Loader2,
  StopCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { ApprovalCard } from "@/components/approval-card";
import { QuestionCard } from "@/components/question-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveTranscript, type McpCatalogEntryLite } from "@/components/live-transcript";
import { Markdown } from "@/components/markdown";
import { RunningDot } from "@/components/running-dot";
import { StartAllTasksButton } from "@/components/start-all-tasks-button";
import {
  cancelTaskAction,
  markTaskDoneAction,
  resumeBlockedTaskAction,
} from "@/server/actions/tasks";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/project-href";
import type { TranscriptEvent } from "@/server/sessions/transcript-tail";
import type { Approval, Question, Task, TaskStatus } from "@/types";

const TASK_IN_FLIGHT: TaskStatus[] = ["proposed", "approved", "working", "blocked"];

// Composer is locked only while the agent is actively running. `blocked`
// is dormant by design (waiting on approval or an upstream task) — the
// user must be able to type into it to give context, answer a question
// the agent posed, or steer the next attempt. Approve/Deny on the
// ApprovalCard remains the canonical way to resolve the block; the
// composer is a parallel channel for free-form direction.
const COMPOSER_LOCKED: TaskStatus[] = ["proposed", "approved", "working"];

// `blocked` covers two distinct reasons: waiting on an approval, or
// waiting on another task to finish. The section header stays generic
// ("Blocked") and each row's subline spells out the actual reason —
// avoids the previous "Waiting on approval" label being a lie when the
// real blocker is an upstream task.
const STATUS_GROUPS: Array<{ status: TaskStatus; label: string }> = [
  { status: "working", label: "Working" },
  { status: "blocked", label: "Blocked" },
  { status: "proposed", label: "Proposed" },
  { status: "approved", label: "Approved" },
  { status: "done", label: "Done" },
  { status: "failed", label: "Failed" },
  { status: "cancelled", label: "Cancelled" },
];

const STATUS_VARIANT: Record<
  TaskStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  proposed: "outline",
  approved: "secondary",
  working: "default",
  blocked: "secondary",
  done: "secondary",
  failed: "destructive",
  cancelled: "outline",
};

type SelectedTaskBundle = {
  task: Task;
  threadId: string;
  sessionKey: string;
  initialEvents: TranscriptEvent[];
  initialByteOffset: number;
  /** Approvals attached to this task, newest first. Rendered above the
   *  transcript so the user can act on a pending one without leaving the chat. */
  approvals: Approval[];
  /** Questions attached to this task, newest first. Pending ones render
   *  as a QuestionCard above the transcript. */
  questions: Question[];
  /**
   * Set when this task is still in `proposed` and the workspace should
   * auto-fire the kickoff via /api/chat on mount. Null once the task has
   * been claimed (working / done / etc.) so a reload doesn't re-send.
   */
  kickoff: { taskId: string; message: string } | null;
};

type Props = {
  projectSlug: string;
  agentSlug: string;
  agentFullId: string;
  agentDisplayName: string;
  tasks: Task[];
  selected: SelectedTaskBundle | null;
  proposedCount: number;
  /** MCP catalog forwarded to the per-task LiveTranscript so tool calls
   *  that resolve to an MCP server render the server's brand favicon. */
  mcpCatalog?: McpCatalogEntryLite[];
};

export function AgentTaskWorkspace({
  projectSlug,
  agentSlug,
  agentFullId,
  agentDisplayName,
  tasks,
  selected,
  proposedCount,
  mcpCatalog,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const selectedId = search.get("task");

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const t of tasks) {
      const list = map.get(t.status) ?? [];
      list.push(t);
      map.set(t.status, list);
    }
    return map;
  }, [tasks]);

  // Resolve blocker → blocker task. Used by TaskRow to show a
  //   "Waiting on <display_id>" subline on tasks blocked by an upstream
  // task (vs. tasks blocked by an approval). Internal-only — only the
  // sidebar list needs this; the chat-side blockedReason is computed
  // separately further below.
  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const totalCount = tasks.length;
  const inFlightCount =
    (grouped.get("working")?.length ?? 0) +
    (grouped.get("proposed")?.length ?? 0) +
    (grouped.get("approved")?.length ?? 0);

  function selectTask(displayId: string) {
    const params = new URLSearchParams(search?.toString() ?? "");
    params.set("task", displayId);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Background liveness polling is handled at the sidebar level
          (GlobalLivenessPoller) so it covers every route, not just this
          workspace. The per-thread LiveTranscript polling still handles
          the open transcript. */}
      {/* ── Left pane: task list ─────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {inFlightCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <RunningDot size="sm" aria-label="" />
                <span className="tabular-nums">{inFlightCount}</span> in flight
              </span>
            ) : totalCount === 0 ? (
              "Nothing assigned yet."
            ) : (
              "All quiet."
            )}
          </p>
          {proposedCount > 0 && (
            <div className="mt-2">
              <StartAllTasksButton
                agentId={agentFullId}
                proposedCount={proposedCount}
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {totalCount === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              The CMO will delegate tasks here.
            </div>
          ) : (
            STATUS_GROUPS.map((group) => {
              const items = grouped.get(group.status);
              if (!items || items.length === 0) return null;
              return (
                <div key={group.status} className="py-1">
                  <div className="flex items-center justify-between px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <ul>
                    {items.map((t) => (
                      <li key={t.id}>
                        <TaskRow
                          task={t}
                          blocker={
                            t.blocked_by_task_id
                              ? taskById.get(t.blocked_by_task_id)
                              : undefined
                          }
                          selected={
                            t.display_id === selectedId || t.id === selectedId
                          }
                          onSelect={() => selectTask(t.display_id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Right pane: brief header + live transcript ───────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="border-b bg-background/60 backdrop-blur">
              <div className="mx-auto w-full max-w-3xl px-6 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span className="font-mono">{selected.task.display_id.toUpperCase()}</span>
                    </div>
                    <h1 className="mt-0.5 text-base font-semibold tracking-tight truncate">
                      {selected.task.title ?? "(untitled task)"}
                    </h1>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(selected.task.status === "working" ||
                      selected.task.status === "proposed" ||
                      selected.task.status === "approved") && (
                      <>
                        <RunningDot size="md" />
                        <CancelTaskButton
                          taskDisplayId={selected.task.display_id}
                        />
                      </>
                    )}
                    <Badge
                      variant={STATUS_VARIANT[selected.task.status]}
                      className="text-[10px]"
                    >
                      {selected.task.status}
                    </Badge>
                  </div>
                </div>
                <details className="group mt-2">
                  <summary className="flex cursor-pointer select-none items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
                    <span className="transition-transform group-open:rotate-90">›</span>
                    Brief
                  </summary>
                  <div className="mt-2 max-h-[40vh] overflow-y-auto pl-3 text-sm text-muted-foreground">
                    <Markdown>{selected.task.brief}</Markdown>
                    {selected.task.success_criteria && (
                      <div className="mt-4">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Success criteria
                        </div>
                        <Markdown>{selected.task.success_criteria}</Markdown>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </header>

            <div className="min-h-0 flex-1">
              <SelectedTaskPanel
                selected={selected}
                projectSlug={projectSlug}
                agentSlug={agentSlug}
                agentDisplayName={agentDisplayName}
                taskById={taskById}
                mcpCatalog={mcpCatalog}
              />
            </div>
          </>
        ) : (
          <EmptyRightPane
            agentDisplayName={agentDisplayName}
            hasTasks={totalCount > 0}
          />
        )}
      </section>
    </div>
  );
}

function SelectedTaskPanel({
  selected,
  projectSlug,
  agentSlug,
  agentDisplayName,
  taskById,
  mcpCatalog,
}: {
  selected: SelectedTaskBundle;
  projectSlug: string;
  agentSlug: string;
  agentDisplayName: string;
  taskById: Map<string, Task>;
  mcpCatalog?: McpCatalogEntryLite[];
}) {
  const router = useRouter();
  const isInFlight = TASK_IN_FLIGHT.includes(selected.task.status);
  const composerLocked = COMPOSER_LOCKED.includes(selected.task.status);
  // We refresh the server tree on every in-flight poll so the status
  // badge + sidebar in-flight counters track the DB even when nothing
  // has landed in the JSONL transcript yet.
  //
  // Why: OpenClaw doesn't flush session.jsonl until session.ended —
  // and even after the task flips to `done` in our DB, the flush can
  // land seconds or minutes later (and isn't guaranteed at all if the
  // user opens the task page after-the-fact). Auto-stopping polling
  // on terminal status meant the transcript stayed blank until a
  // manual refresh; even a generous grace window can't cover a flush
  // that happens after the user navigates in.
  //
  // Resolution: never auto-stop polling. Cost is cheap (one HTTP fetch
  // every 2 s while the user is on this page), and the unmount/effect
  // cleanup tears the timer down the moment they navigate away.
  const onPolled = useCallback(
    ({ newEvents }: { newEvents: number; fileSize: number }) => {
      void newEvents;
      // Mark as a transition so React keeps the rendered tree alive while
      // the new RSC payload streams in — prevents the sidebar (and any
      // sibling subtree) from flickering on every transcript tick.
      if (isInFlight) startTransition(() => router.refresh());
      // Never returns true → polling continues for the lifetime of the
      // mounted page.
      return false;
    },
    [isInFlight, router],
  );
  // Surface the actionable approval up front so the user doesn't have to
  // navigate to /approvals to unblock the agent. Resolved rows would only
  // add noise here, so they're filtered out — the audit trail lives on the
  // dedicated Resolved tab. Most blocked tasks have exactly one pending
  // request at a time; render whichever's actionable, plus any
  // revision_requested that's still in play.
  const liveApprovals = selected.approvals.filter(
    (a) => a.status === "pending" || a.status === "revision_requested",
  );
  const openQuestions = selected.questions.filter(
    (q) => q.status === "pending",
  );
  // When the task is parked in `blocked`, build a short "why" string so
  // the LiveTranscript can replace its forward-motion indicator
  // ("thinking…", "wrapping up…") with an honest paused-state pill.
  // Three distinct reasons: (a) question pending (b) approval pending
  // (c) gated on another task.
  // Specific blocked sub-state: the agent's turn ended without it calling
  // submit_task_status, so the task is parked with no upstream blocker,
  // no question, and no approval. The error_message carries our marker.
  // Surfaces a dedicated recovery card with Resume / Mark done buttons.
  const isAbandoned =
    selected.task.status === "blocked" &&
    !selected.task.blocked_by_task_id &&
    openQuestions.length === 0 &&
    liveApprovals.length === 0 &&
    (selected.task.error_message?.includes("submit_task_status") ?? false);

  let blockedReason: string | undefined;
  if (selected.task.status === "blocked") {
    if (selected.task.blocked_by_task_id) {
      const blocker = taskById.get(selected.task.blocked_by_task_id);
      blockedReason = blocker
        ? `waiting on ${blocker.display_id.toUpperCase()}`
        : "waiting on an upstream task";
    } else if (openQuestions.length > 0) {
      blockedReason =
        openQuestions.length === 1
          ? "waiting on your answer"
          : `waiting on ${openQuestions.length} answers`;
    } else if (liveApprovals.length > 0) {
      blockedReason =
        liveApprovals.length === 1
          ? "waiting on approval"
          : `waiting on ${liveApprovals.length} approvals`;
    } else if (isAbandoned) {
      // Recovery card above the transcript already explains the state and
      // surfaces the action buttons; suppressing the in-transcript pill
      // avoids two pieces of UI saying the same thing in slightly
      // different ways.
      blockedReason = undefined;
    } else {
      blockedReason = "waiting for the gating condition to resolve";
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {(openQuestions.length > 0 || liveApprovals.length > 0 || isAbandoned) && (
        <div className="mx-auto w-full max-w-3xl space-y-3 px-6 pt-4">
          {openQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              options={parseOptionsJson(q.options_json)}
            />
          ))}
          {liveApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
          {isAbandoned && (
            <AbandonedTaskCard
              taskDisplayId={selected.task.display_id}
            />
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <LiveTranscript
          key={selected.task.id}
          projectSlug={projectSlug}
          agentSlug={agentSlug}
          agentDisplayName={agentDisplayName}
          threadId={selected.threadId}
          sessionKey={selected.sessionKey}
          initialEvents={selected.initialEvents}
          initialByteOffset={selected.initialByteOffset}
          composerDisabled={composerLocked}
          blockedReason={blockedReason}
          onPolled={onPolled}
          autoKickoff={selected.kickoff !== null}
          kickoffMessage={selected.kickoff?.message}
          taskId={selected.kickoff?.taskId}
          mcpCatalog={mcpCatalog}
        />
      </div>
    </div>
  );
}

function CancelTaskButton({ taskDisplayId }: { taskDisplayId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  function onClick() {
    if (!confirming) {
      setConfirming(true);
      // Auto-clear the confirm prompt after a few seconds so the button
      // doesn't sit in a scary "click again to cancel" state forever.
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    startTransition(async () => {
      const r = await cancelTaskAction(taskDisplayId);
      if (!r.ok) {
        toast.error(r.error);
        setConfirming(false);
        return;
      }
      toast.success("Task cancelled.");
      setConfirming(false);
      router.refresh();
    });
  }
  return (
    <Button
      type="button"
      variant={confirming ? "destructive" : "outline"}
      size="sm"
      disabled={pending}
      onClick={onClick}
      className="h-7 px-2 text-[11px]"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <StopCircle className="size-3" />
      )}
      {confirming ? "Click again to cancel" : "Cancel"}
    </Button>
  );
}

function TaskRow({
  task,
  blocker,
  selected,
  onSelect,
}: {
  task: Task;
  /** When this task is blocked by another task, the blocker (for the
   *  "Waiting on <id>" subline). Undefined for approval-blocked tasks. */
  blocker?: Task;
  selected: boolean;
  onSelect: () => void;
}) {
  const isRunning = task.status === "working";
  const isInFlight =
    task.status === "working" ||
    task.status === "proposed" ||
    task.status === "approved";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group block w-full px-4 py-2.5 text-left transition-colors",
        "hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/40",
        selected && "bg-accent/80 hover:bg-accent/80",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {isRunning ? (
            <RunningDot size="md" aria-label="Running" />
          ) : (
            <StatusGlyph status={task.status} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">
          <span className="mr-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
            {task.display_id.toUpperCase()}
          </span>
          <span
            className={cn(
              selected ? "font-medium text-foreground" : "text-foreground/90",
              !isInFlight && task.status !== "working" && "text-muted-foreground",
            )}
          >
            {task.title ?? task.brief.slice(0, 80)}
          </span>
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {formatRelative(task.updated_at)}
        </span>
      </div>
      {task.status === "failed" && task.error_message && (
        <div className="ml-6 mt-1 line-clamp-1 text-[10px] text-destructive/80">
          {task.error_message}
        </div>
      )}
      {task.status === "blocked" && (
        <div className="ml-6 mt-1 line-clamp-1 text-[10px] text-muted-foreground">
          {blocker ? (
            <>
              Waiting on{" "}
              <span className="font-mono tabular-nums">
                {blocker.display_id.toUpperCase()}
              </span>
            </>
          ) : (
            "Waiting on approval"
          )}
        </div>
      )}
    </button>
  );
}

function StatusGlyph({ status }: { status: TaskStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="size-3.5 text-emerald-600" />;
    case "failed":
      return <XCircle className="size-3.5 text-destructive" />;
    case "cancelled":
      return <Circle className="size-3.5 text-muted-foreground" />;
    case "approved":
      return <CircleDot className="size-3.5 text-sky-600" />;
    case "working":
      return <Loader2 className="size-3.5 animate-spin text-sky-600" />;
    case "blocked":
      return <CircleDot className="size-3.5 text-amber-600" />;
    case "proposed":
    default:
      return <Circle className="size-3.5 text-muted-foreground" />;
  }
}

function EmptyRightPane({
  agentDisplayName,
  hasTasks,
}: {
  agentDisplayName: string;
  hasTasks: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="space-y-2 max-w-sm">
        <h3 className="text-sm font-medium">
          {hasTasks ? "Select a task" : `${agentDisplayName} has no tasks yet`}
        </h3>
        <p className="text-xs text-muted-foreground">
          {hasTasks
            ? "Pick one from the left to see its brief and live transcript."
            : "When the CMO delegates work to this specialist, tasks will land here. Open the CMO and ask it to plan the next move."}
        </p>
      </div>
    </div>
  );
}

/** Parse Question.options_json into a string[] in a client-safe way.
 *  Mirrors @/server/db/questions#parseQuestionOptions but avoids importing
 *  the server module from a client component. */
function parseOptionsJson(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const delta = Date.now() - t;
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}

/**
 * Recovery card for the specific blocked sub-state where the agent's
 * turn ended without it calling submit_task_status. Surfaces three
 * actions so the user always knows what to do:
 *
 *   - Resume: flip the task back to `proposed` and re-fire the kickoff.
 *     The prior transcript stays intact; the agent picks up where it
 *     stopped.
 *   - Mark done: close the task manually (e.g. the agent did the work
 *     in its last reply but just forgot the closing tool call).
 *   - Cancel: drop the task entirely.
 *
 * Without this card, an abandoned task showed only a generic "Paused"
 * pill and the user had no obvious way to act on it.
 */
function AbandonedTaskCard({ taskDisplayId }: { taskDisplayId: string }) {
  const router = useRouter();
  const [resumePending, startResume] = useTransition();
  const [donePending, startDone] = useTransition();
  const [cancelPending, startCancel] = useTransition();

  function onResume() {
    startResume(async () => {
      const r = await resumeBlockedTaskAction(taskDisplayId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Resuming — the agent will pick up from where it stopped.");
      router.refresh();
    });
  }
  function onDone() {
    startDone(async () => {
      const r = await markTaskDoneAction(taskDisplayId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Marked done.");
      router.refresh();
    });
  }
  function onCancel() {
    startCancel(async () => {
      const r = await cancelTaskAction(taskDisplayId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Cancelled.");
      router.refresh();
    });
  }

  const anyPending = resumePending || donePending || cancelPending;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <StopCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Agent stopped without closing this task
            </p>
            <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
              The last turn finished cleanly but the agent didn’t call
              <code className="mx-1 rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[11px]">
                submit_task_status
              </code>
              . Pick how to recover:
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={onResume}
              disabled={anyPending}
            >
              {resumePending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Resume
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDone}
              disabled={anyPending}
            >
              {donePending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 size-3.5" />
              )}
              Mark done
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={anyPending}
            >
              {cancelPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <XCircle className="mr-1.5 size-3.5" />
              )}
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
