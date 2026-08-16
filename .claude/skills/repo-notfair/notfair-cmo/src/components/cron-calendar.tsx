"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Loader2,
  Pause,
  Pencil,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";
/* note: ExternalLink import removed with the OpenClaw docs button */
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { colorForAgentSlug } from "@/lib/agent-colors";
import {
  pauseCronAction,
  resumeCronAction,
  deleteCronAction,
  updateCronPromptAction,
} from "@/server/actions/crons";
import { getCronRunsAction, type CronRunWithTick, type ScheduleInput } from "@/server/actions/cron-runs";

/**
 * Pre-computed cron occurrence used by the calendar. Server computes these
 * with `expandSchedule()` so the client just renders.
 */
export type CalendarOccurrence = {
  at: number;
  cron_id: string;
  cron_name: string;
  short_name: string;
  agent_id: string;
  agent_slug: string;
  schedule_text: string;
  /** Raw OpenClaw status when this occurrence has fired (e.g. "ok", "error"). */
  run_status?: string;
  /** True when the underlying cron is currently paused/disabled. */
  cron_disabled?: boolean;
};

export type CalendarCron = {
  id: string;
  short_name: string;
  full_name: string;
  agent_id: string;
  agent_slug: string;
  schedule_text: string;
  disabled: boolean;
  status_text: string;
  /** Prompt sent to the agent on every tick. */
  message?: string;
  description?: string;
  /** Last execution time (ms epoch). */
  last_run_at_ms?: number;
  /** Raw OpenClaw status string for the most recent run (e.g. "ok", "error"). */
  last_status?: string;
  last_error?: string;
  /** Schedule shape — used to attribute runs to occurrences via nominal ticks. */
  schedule_raw?: ScheduleInput | null;
};

type Props = {
  /** ms epoch of the first day shown (00:00 local). */
  startOfFirstDay: number;
  numDays: number;
  occurrences: CalendarOccurrence[];
  cronsById: Record<string, CalendarCron>;
  /** Distinct agents for the legend. */
  agentSlugs: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

type CronFilter = "all" | "enabled" | "disabled";

export function CronCalendar({
  startOfFirstDay,
  numDays,
  occurrences,
  cronsById,
  agentSlugs,
}: Props) {
  const [focusDayOffset, setFocusDayOffset] = useState(0);
  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [filter, setFilter] = useState<CronFilter>("enabled");

  const visibleOccurrences = useMemo(() => {
    if (filter === "all") return occurrences;
    return occurrences.filter((o) => {
      const d = cronsById[o.cron_id]?.disabled;
      return filter === "disabled" ? !!d : !d;
    });
  }, [occurrences, filter, cronsById]);

  // Agent slugs visible right now drive the legend.
  const visibleAgentSlugs = useMemo(() => {
    if (filter === "all") return agentSlugs;
    const set = new Set<string>();
    for (const o of visibleOccurrences) set.add(o.agent_slug);
    return Array.from(set).sort();
  }, [agentSlugs, visibleOccurrences, filter]);

  // Group filtered occurrences into days.
  const days = useMemo(() => {
    const buckets: CalendarOccurrence[][] = Array.from(
      { length: numDays },
      () => [],
    );
    for (const o of visibleOccurrences) {
      const idx = Math.floor((o.at - startOfFirstDay) / DAY_MS);
      if (idx >= 0 && idx < numDays) buckets[idx]!.push(o);
    }
    for (const day of buckets) day.sort((a, b) => a.at - b.at);
    return buckets;
  }, [visibleOccurrences, numDays, startOfFirstDay]);

  // 7-day window navigation (we keep numDays at 14 to allow scrolling).
  const visibleDays = Math.min(7, numDays);
  const offsetMax = Math.max(0, numDays - visibleDays);
  const clampedOffset = Math.max(0, Math.min(focusDayOffset, offsetMax));

  const selectedCron = selected ? cronsById[selected.cron_id] : null;

  return (
    <>
      <div className="space-y-3">
        {/* Legend + filter chips + window navigator */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips filter={filter} onChange={setFilter} />
            <span className="h-4 w-px bg-border" aria-hidden />
            {visibleAgentSlugs.map((slug) => {
              const color = colorForAgentSlug(slug);
              return (
                <div key={slug} className="flex items-center gap-1.5 text-xs">
                  <span className={cn("inline-block size-2 rounded-full", color.dot)} />
                  <span className="font-mono text-muted-foreground">{slug}</span>
                </div>
              );
            })}
            {visibleAgentSlugs.length === 0 && (
              <span className="text-xs text-muted-foreground">
                Nothing to show with this filter.
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setFocusDayOffset((o) => Math.max(0, o - visibleDays))}
              disabled={clampedOffset === 0}
              aria-label="Previous week"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setFocusDayOffset(0)}
              disabled={clampedOffset === 0}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setFocusDayOffset((o) => Math.min(offsetMax, o + visibleDays))}
              disabled={clampedOffset >= offsetMax}
              aria-label="Next week"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Day grid */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div
            className="grid divide-x"
            style={{ gridTemplateColumns: `repeat(${visibleDays}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: visibleDays }).map((_, i) => {
              const dayIndex = clampedOffset + i;
              const dayStart = startOfFirstDay + dayIndex * DAY_MS;
              const dayOccs = days[dayIndex] ?? [];
              return (
                <DayColumn
                  key={dayIndex}
                  dayStart={dayStart}
                  occurrences={dayOccs}
                  onSelect={(o) => setSelected(o)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <CronDetailDialog
        occurrence={selected}
        cron={selectedCron}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

// --- Day column ---

function FilterChips({
  filter,
  onChange,
}: {
  filter: CronFilter;
  onChange: (f: CronFilter) => void;
}) {
  const items: Array<{ key: CronFilter; label: string }> = [
    { key: "enabled", label: "Enabled" },
    { key: "disabled", label: "Disabled" },
    { key: "all", label: "All" },
  ];
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
      role="tablist"
      aria-label="Filter crons"
    >
      {items.map(({ key, label }) => {
        const isActive = filter === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DayColumn({
  dayStart,
  occurrences,
  onSelect,
}: {
  dayStart: number;
  occurrences: CalendarOccurrence[];
  onSelect: (o: CalendarOccurrence) => void;
}) {
  const date = new Date(dayStart);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const dayLabel = date.toLocaleDateString(undefined, { weekday: "short" });
  const dateLabel = date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });

  return (
    <div className="flex min-h-[280px] flex-col">
      <div
        className={cn(
          "border-b px-2 py-1.5 text-center",
          isToday && "bg-accent/30",
        )}
      >
        <div
          className={cn(
            "text-[10px] uppercase tracking-wide text-muted-foreground",
            isToday && "text-foreground font-medium",
          )}
        >
          {dayLabel}
        </div>
        <div
          className={cn(
            "text-sm tabular-nums",
            isToday ? "font-semibold text-foreground" : "text-foreground/80",
          )}
        >
          {dateLabel}
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
        {occurrences.length === 0 ? (
          <div className="flex h-full items-center justify-center pb-6">
            <span className="text-[10px] text-muted-foreground/60">·</span>
          </div>
        ) : (
          occurrences.map((o, idx) => (
            <OccurrenceChip
              key={`${o.cron_id}-${o.at}-${idx}`}
              occurrence={o}
              onClick={() => onSelect(o)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function OccurrenceChip({
  occurrence,
  onClick,
}: {
  occurrence: CalendarOccurrence;
  onClick: () => void;
}) {
  const color = colorForAgentSlug(occurrence.agent_slug);
  const time = new Date(occurrence.at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-md border px-2 py-1 text-left text-[11px] leading-tight transition-colors hover:brightness-95",
        color.chip,
        occurrence.cron_disabled && "opacity-50 border-dashed",
      )}
      title={`${occurrence.cron_name} · ${occurrence.schedule_text}${
        occurrence.cron_disabled ? " · disabled" : ""
      }${occurrence.run_status ? ` · ${occurrence.run_status}` : ""}`}
    >
      <div className="flex items-center justify-between gap-1 tabular-nums font-medium">
        <span className={cn(occurrence.cron_disabled && "line-through")}>
          {time}
        </span>
        {occurrence.cron_disabled ? (
          <Pause className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <RunStatusGlyph status={occurrence.run_status} />
        )}
      </div>
      <div className="truncate opacity-80">{occurrence.short_name}</div>
    </button>
  );
}

function RunStatusGlyph({ status }: { status: string | undefined }) {
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === "ok") {
    return (
      <span
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
        aria-label="success"
      >
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (lower === "error") {
    return (
      <span
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-destructive text-white"
        aria-label="error"
      >
        <AlertCircle className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  // Other statuses (e.g. "skipped"): show a neutral dot to flag "ran but
  // neither ok nor error". Keeps the chip honest without picking a color.
  return (
    <span
      className="inline-flex size-2 shrink-0 rounded-full bg-zinc-400"
      aria-label={status}
    />
  );
}

// --- Detail dialog with pause/resume/delete ---

function CronDetailDialog({
  occurrence,
  cron,
  onClose,
}: {
  occurrence: CalendarOccurrence | null;
  cron: CalendarCron | null;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<CronRunWithTick[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  // Fetch this cron's run history when the dialog opens. Stays mounted across
  // occurrence clicks for the same cron, so cache by id.
  useEffect(() => {
    if (!cron) {
      setRuns(null);
      setRunsError(null);
      return;
    }
    let cancelled = false;
    setRunsLoading(true);
    setRunsError(null);
    (async () => {
      const r = await getCronRunsAction(cron.id, cron.schedule_raw ?? null, 200);
      if (cancelled) return;
      if (r.ok) setRuns(r.runs);
      else setRunsError(r.error);
      setRunsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cron]);

  // Prompt-edit state lives here (not in EditablePrompt) so the section
  // header can host the Edit / Save / Cancel buttons next to the title.
  const [promptEditing, setPromptEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState(cron?.message ?? "");
  const [promptPending, startPromptTransition] = useTransition();
  useEffect(() => {
    setPromptEditing(false);
    setPromptDraft(cron?.message ?? "");
  }, [cron?.id, cron?.message]);

  if (!occurrence || !cron) return null;
  const matchedRun = findRunForOccurrence(runs, occurrence.at);
  const occStatus = computeOccurrenceStatus(occurrence, matchedRun);

  function savePrompt() {
    const trimmed = promptDraft.trim();
    if (!trimmed) {
      toast.error("Prompt cannot be empty.");
      return;
    }
    if (trimmed === cron!.message) {
      setPromptEditing(false);
      return;
    }
    startPromptTransition(async () => {
      const r = await updateCronPromptAction(cron!.id, trimmed);
      if (!r.ok) {
        toast.error(r.error ?? "Could not update prompt");
        return;
      }
      setPromptEditing(false);
      toast.success("Prompt updated");
    });
  }

  function cancelPromptEdit() {
    setPromptDraft(cron!.message ?? "");
    setPromptEditing(false);
  }

  return (
    <Dialog open={!!occurrence} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] max-w-xl flex-col gap-0 p-0">
        {/* Header — single row: title + status pill, tight padding. */}
        <DialogHeader className="shrink-0 space-y-0 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">
              {cron.short_name}
            </DialogTitle>
            <OccurrenceStatusBadge status={occStatus} />
          </div>
          {cron.description && (
            <DialogDescription className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {cron.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Body — scrolls. Sections are flat (no card chrome) to keep the
            modal short when collapsed. */}
        <div className="min-h-0 flex-1 divide-y overflow-y-auto">
          <CollapsibleSection title="Details" defaultOpen>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-muted-foreground">Full name</dt>
              <dd className="truncate font-mono">{cron.full_name}</dd>

              <dt className="text-muted-foreground">Agent</dt>
              <dd className="font-mono">{cron.agent_id}</dd>

              <dt className="text-muted-foreground">Schedule</dt>
              <dd className="font-mono">{cron.schedule_text}</dd>

              <dt className="text-muted-foreground">Occurrence</dt>
              <dd className="tabular-nums">{new Date(occurrence.at).toLocaleString()}</dd>

              {matchedRun && (
                <>
                  <dt className="text-muted-foreground">Finished</dt>
                  <dd className="tabular-nums">
                    {new Date(matchedRun.finished_at_ms).toLocaleString()}
                    {matchedRun.duration_ms != null && (
                      <span className="ml-1 text-muted-foreground">
                        ({formatDuration(matchedRun.duration_ms)})
                      </span>
                    )}
                  </dd>
                  {matchedRun.model && (
                    <>
                      <dt className="text-muted-foreground">Model</dt>
                      <dd className="font-mono">
                        {matchedRun.model}
                        {matchedRun.provider && (
                          <span className="ml-1 text-muted-foreground">
                            · {matchedRun.provider}
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                  {matchedRun.usage?.total_tokens != null && (
                    <>
                      <dt className="text-muted-foreground">Tokens</dt>
                      <dd className="tabular-nums">
                        {matchedRun.usage.total_tokens.toLocaleString()}
                      </dd>
                    </>
                  )}
                </>
              )}
            </dl>
          </CollapsibleSection>

          {cron.message != null && (
            <CollapsibleSection
              title="Prompt"
              defaultOpen
              actions={
                promptEditing ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={cancelPromptEdit}
                      disabled={promptPending}
                      className="h-6 px-2 text-[11px]"
                    >
                      <X className="mr-1 size-3" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={savePrompt}
                      disabled={promptPending}
                      className="h-6 px-2 text-[11px]"
                    >
                      {promptPending ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Save className="mr-1 size-3" />
                      )}
                      Save
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPromptEditing(true)}
                    className="h-6 px-2 text-[11px]"
                  >
                    <Pencil className="mr-1 size-3" />
                    Edit
                  </Button>
                )
              }
            >
              {promptEditing ? (
                <textarea
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  disabled={promptPending}
                  className="max-h-64 min-h-[80px] w-full resize-y overflow-y-auto rounded border bg-background p-2 font-mono text-[11px] leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  rows={6}
                  autoFocus
                />
              ) : (
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                  {cron.message}
                </pre>
              )}
            </CollapsibleSection>
          )}

          {matchedRun?.error && (
            <CollapsibleSection title="Error" tone="destructive" defaultOpen>
              <div className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                {matchedRun.error}
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Result" defaultOpen>
            {matchedRun ? (
              matchedRun.summary ? (
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed">
                  {matchedRun.summary}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Run finished with no summary.
                </div>
              )
            ) : runsLoading ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading…
              </div>
            ) : runsError ? (
              <div className="text-[11px] text-destructive">{runsError}</div>
            ) : occurrence.at <= Date.now() ? (
              <div className="text-[11px] text-muted-foreground">
                No run log for this occurrence.
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Not fired yet.
              </div>
            )}
          </CollapsibleSection>
        </div>

        {/* Footer — sticky, tight. */}
        <DialogFooter className="shrink-0 gap-2 border-t bg-background/95 px-4 py-2 sm:gap-2">
          <CronActions cronId={cron.id} cronName={cron.short_name} disabled={cron.disabled} onAfter={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollapsibleSection({
  title,
  tone = "default",
  defaultOpen,
  actions,
  children,
}: {
  title: string;
  tone?: "default" | "destructive";
  defaultOpen?: boolean;
  /** Right-aligned controls in the section header (don't toggle the section). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  useEffect(() => {
    setOpen(!!defaultOpen);
  }, [defaultOpen]);

  return (
    <section className={cn(tone === "destructive" && "bg-destructive/5")}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex flex-1 items-center gap-1.5 px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide",
            tone === "destructive" ? "text-destructive" : "text-muted-foreground hover:text-foreground",
          )}
          aria-expanded={open}
        >
          <ChevronRightSmall
            className={cn("size-3 transition-transform", open && "rotate-90")}
          />
          {title}
        </button>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
      </div>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  );
}


function findRunForOccurrence(
  runs: CronRunWithTick[] | null,
  occAt: number,
): CronRunWithTick | null {
  if (!runs?.length) return null;
  // Preferred path: server tagged each run with its owning nominal tick via
  // the cron schedule. Exact match handles late-fires (e.g., a 11:00 tick
  // whose run actually ran at 11:06:20) without time-window guesswork.
  const exact = runs.find((r) => r.owning_occurrence_at_ms === occAt);
  if (exact) return exact;
  // Fallback for older schedules we couldn't parse: pick the closest run
  // within ±15 minutes — wide enough to cover scheduler drift but tight
  // enough to keep adjacent hourly ticks from cross-matching.
  let best: CronRunWithTick | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const r of runs) {
    const delta = Math.abs(r.run_at_ms - occAt);
    if (delta < bestDelta && delta < 15 * 60_000) {
      best = r;
      bestDelta = delta;
    }
  }
  return best;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

type OccurrenceStatus =
  /** Future tick the scheduler hasn't fired yet. */
  | { kind: "scheduled"; at: number }
  /** Past tick we have a status string for from OpenClaw (verbatim). */
  | { kind: "ran"; at: number; raw: string }
  /** Past tick but no status from OpenClaw (the cron has never run here, or we
   *  don't have a recent enough run to align). */
  | { kind: "past"; at: number };

/**
 * Decide how to label this occurrence using OpenClaw's own status vocabulary:
 *   - future → "scheduled"
 *   - past tick with a matching entry in the run log → show that run's raw
 *     status string (e.g. "ok", "error", "skipped")
 *   - past tick with no matching run → "past"
 */
function computeOccurrenceStatus(
  occ: CalendarOccurrence,
  run: CronRunWithTick | null,
): OccurrenceStatus {
  if (occ.at > Date.now()) return { kind: "scheduled", at: occ.at };
  if (run) return { kind: "ran", at: occ.at, raw: run.status };
  return { kind: "past", at: occ.at };
}

function OccurrenceStatusBadge({ status }: { status: OccurrenceStatus }) {
  if (status.kind === "scheduled") {
    return <Pill cls="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">scheduled</Pill>;
  }
  if (status.kind === "past") {
    return <Pill cls="bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30">past</Pill>;
  }
  // Past run with a known status — show OpenClaw's raw string, color by it.
  return <Pill cls={colorForRawStatus(status.raw)}>{status.raw}</Pill>;
}

function colorForRawStatus(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "ok") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  }
  if (lower === "error") {
    return "bg-destructive/10 text-destructive border-destructive/40";
  }
  return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30";
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function CronActions({
  cronId,
  cronName,
  disabled,
  onAfter,
}: {
  cronId: string;
  cronName: string;
  disabled: boolean;
  onAfter: () => void;
}) {
  function run(
    label: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    void (async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? `Failed to ${label}`);
      else toast.success(`${label}: ${cronName}`);
      onAfter();
    })();
  }

  return (
    <>
      {disabled ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("Enabled", () => resumeCronAction(cronId))}
        >
          <Play className="mr-1.5 size-3.5" />
          Enable
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("Disabled", () => pauseCronAction(cronId))}
        >
          <Pause className="mr-1.5 size-3.5" />
          Disable
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (typeof window !== "undefined" && !window.confirm(`Delete cron "${cronName}"?`)) return;
          run("Deleted", () => deleteCronAction(cronId));
        }}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="mr-1.5 size-3.5" />
        Delete
      </Button>
    </>
  );
}
