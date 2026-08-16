import { cache } from "react";
import { CronExpressionParser } from "cron-parser";
import { getDb } from "@/server/db/db";
import {
  createScheduledJob,
  deleteScheduledJob,
  listJobRuns,
  setJobEnabled,
  type CreateScheduledJobInput,
  type ScheduledJob,
} from "./index";

/**
 * UI-facing view of a scheduled job.
 *
 * Shape preserved from the previous OpenClaw-backed `DisplayCron` so pages
 * and components keep rendering without refactoring. `agent_slug` is the
 * project-prefix-stripped agent id used for color lookup; `schedule_raw`
 * mirrors OpenClaw's tagged union so calendar code still works.
 */
export type CronSchedule = { kind: "cron"; expr: string; tz?: string };

export interface DisplayCron {
  id: string;
  name: string;
  short_name: string;
  agent_id: string;
  agent_slug: string;
  schedule_raw: CronSchedule | undefined;
  schedule_text: string;
  next_run_text: string;
  last_run_text: string;
  status_text: string;
  disabled: boolean;
  message?: string;
  description?: string;
  last_run_at_ms?: number;
  last_status?: string;
  last_error?: string;
  next_run_at_ms?: number;
}

export interface CronGroup {
  agent: string;
  crons: DisplayCron[];
}

export interface ProjectCronView {
  project_slug: string;
  groups: CronGroup[];
}

const NAME_SEPARATOR = "/";

function shortenAgentId(agentId: string, project_slug: string): string {
  const prefix = `${project_slug}-`;
  return agentId.startsWith(prefix) ? agentId.slice(prefix.length) : agentId;
}

function isoMs(iso: string | null): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function formatSchedule(expr: string): string {
  return expr;
}

function formatRelativeMs(ms: number | undefined): string {
  if (!ms) return "—";
  const delta = ms - Date.now();
  const abs = Math.abs(delta);
  const seconds = Math.round(abs / 1000);
  if (seconds < 60) return delta > 0 ? `in ${seconds}s` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return delta > 0 ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return delta > 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return delta > 0 ? `in ${days}d` : `${days}d ago`;
}

function normalizeRunStatus(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s === "done") return "ok";
  if (s === "failed") return "error";
  return s;
}

function jobToDisplay(job: ScheduledJob, project_slug: string): DisplayCron {
  // Most recent run gives us the last_status / last_error fields the UI surfaces.
  const recent = listJobRuns(job.id, 1)[0];
  const lastStatus = normalizeRunStatus(recent?.status);
  const lastError = recent?.error_message ?? undefined;
  const lastRunMs = isoMs(job.last_run_at) ?? (recent ? Date.parse(recent.started_at) : undefined);
  const nextRunMs = isoMs(job.next_run_at);
  const disabled = job.enabled === 0;
  const shortAgent = shortenAgentId(job.agent_id, project_slug);
  return {
    id: job.id,
    name: `${project_slug}${NAME_SEPARATOR}${shortAgent}${NAME_SEPARATOR}${job.name}`,
    short_name: job.name,
    agent_id: job.agent_id,
    agent_slug: shortAgent,
    schedule_raw: { kind: "cron", expr: job.cron_expr },
    schedule_text: formatSchedule(job.cron_expr),
    next_run_text: formatRelativeMs(nextRunMs),
    last_run_text: formatRelativeMs(lastRunMs),
    status_text: disabled ? "disabled" : lastStatus ?? "idle",
    disabled,
    message: job.message,
    last_run_at_ms: lastRunMs,
    last_status: lastStatus ?? undefined,
    last_error: lastError,
    next_run_at_ms: nextRunMs,
  };
}

export const listCronsForProject = cache(
  async (project_slug: string): Promise<ProjectCronView> => {
    const rows = getDb()
      .prepare(
        "SELECT * FROM scheduled_jobs WHERE project_slug = ? ORDER BY created_at DESC",
      )
      .all(project_slug) as ScheduledJob[];
    const byAgent = new Map<string, DisplayCron[]>();
    for (const job of rows) {
      const display = jobToDisplay(job, project_slug);
      const list = byAgent.get(display.agent_slug) ?? [];
      list.push(display);
      byAgent.set(display.agent_slug, list);
    }
    const groups: CronGroup[] = Array.from(byAgent.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([agent, crons]) => ({ agent, crons }));
    return { project_slug, groups };
  },
);

/** Per-run history view, preserved from the OpenClaw-backed `CronRun` shape. */
export interface CronRun {
  run_at_ms: number;
  finished_at_ms: number;
  status: string;
  summary: string;
  error?: string;
  duration_ms?: number;
  session_id?: string;
  model?: string;
  provider?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

export function loadCronRuns(cron_id: string, limit = 100): CronRun[] {
  const runs = listJobRuns(cron_id, limit);
  return runs.map((r) => {
    const startedMs = Date.parse(r.started_at);
    const finishedMs = r.finished_at ? Date.parse(r.finished_at) : startedMs;
    return {
      run_at_ms: startedMs,
      finished_at_ms: finishedMs,
      status: normalizeRunStatus(r.status) ?? r.status,
      summary: r.summary ?? "",
      error: r.error_message ?? undefined,
      duration_ms: Number.isFinite(finishedMs - startedMs) ? finishedMs - startedMs : undefined,
    };
  });
}

/**
 * Find the most recent scheduled tick at or before `at` for a given cron.
 * Used to attribute a run back to its calendar occurrence.
 */
export function tickAtOrBefore(
  schedule: CronSchedule | undefined,
  at: number,
  lookbackMs = 14 * 24 * 60 * 60 * 1000,
): number | undefined {
  if (!schedule || schedule.kind !== "cron") return undefined;
  const from = at - lookbackMs;
  try {
    const it = CronExpressionParser.parse(schedule.expr, {
      currentDate: new Date(from),
      endDate: new Date(at + 1),
      tz: schedule.tz ?? "UTC",
    });
    let last: number | undefined;
    for (let i = 0; i < 10_000; i++) {
      try {
        const t = it.next().toDate().getTime();
        if (t > at) break;
        last = t;
      } catch {
        break;
      }
    }
    return last;
  } catch {
    return undefined;
  }
}

export interface CronOccurrence {
  at: number;
  cron_id: string;
  cron_name: string;
  short_name: string;
  agent_id: string;
  agent_slug: string;
  schedule_text: string;
  run_status?: string;
}

/** Expand one cron's schedule into occurrences inside [from, until]. */
export function expandSchedule(
  cron_id: string,
  schedule: CronSchedule | undefined,
  range: { from: number; until: number },
  meta: { name: string; short_name: string; agent_id: string; agent_slug: string; schedule_text: string },
  maxPerCron = 60,
): CronOccurrence[] {
  if (!schedule || schedule.kind !== "cron") return [];
  const { from, until } = range;
  const out: CronOccurrence[] = [];
  try {
    const it = CronExpressionParser.parse(schedule.expr, {
      currentDate: new Date(from),
      endDate: new Date(until),
      tz: schedule.tz ?? "UTC",
    });
    while (out.length < maxPerCron) {
      try {
        const next = it.next();
        out.push({
          at: next.toDate().getTime(),
          cron_id,
          cron_name: meta.name,
          short_name: meta.short_name,
          agent_id: meta.agent_id,
          agent_slug: meta.agent_slug,
          schedule_text: meta.schedule_text,
        });
      } catch {
        break;
      }
    }
  } catch {
    return [];
  }
  return out;
}

/** Attach run status to occurrences by mapping each completed run back to its tick. */
export function annotateOccurrencesWithRunStatus(
  occurrences: CronOccurrence[],
  schedulesByCronId: Map<string, CronSchedule | undefined>,
): CronOccurrence[] {
  const byCron = new Map<string, CronOccurrence[]>();
  for (const occ of occurrences) {
    const arr = byCron.get(occ.cron_id) ?? [];
    arr.push(occ);
    byCron.set(occ.cron_id, arr);
  }
  for (const [cronId, occs] of byCron) {
    const schedule = schedulesByCronId.get(cronId);
    if (!schedule) continue;
    const runs = loadCronRuns(cronId, 200);
    const statusByTick = new Map<number, string>();
    for (const run of runs) {
      const tick = tickAtOrBefore(schedule, run.run_at_ms);
      if (tick != null && !statusByTick.has(tick)) {
        statusByTick.set(tick, run.status);
      }
    }
    for (const o of occs) {
      const s = statusByTick.get(o.at);
      if (s) o.run_status = s;
    }
  }
  return occurrences;
}

/** Compatibility no-op — the new scheduler has no subprocess cache to invalidate. */
export function invalidateCronCache(): void {}

export async function disableCron(id: string): Promise<void> {
  setJobEnabled(id, false);
}

export async function enableCron(id: string): Promise<void> {
  setJobEnabled(id, true);
}

export async function removeCron(id: string): Promise<void> {
  deleteScheduledJob(id);
}

export interface CreateCronInput {
  project_slug: string;
  agent_slug: string;
  agent_full_id: string;
  cron_name: string;
  schedule: { kind: "cron"; expr: string; tz?: string };
  message: string;
  description?: string;
}

export interface CreateCronResult {
  id: string;
  name: string;
}

export async function createCron(input: CreateCronInput): Promise<CreateCronResult> {
  const jobInput: CreateScheduledJobInput = {
    project_slug: input.project_slug,
    agent_id: input.agent_full_id,
    name: input.cron_name,
    cron_expr: input.schedule.expr,
    message: input.message,
    enabled: true,
  };
  const job = createScheduledJob(jobInput);
  return {
    id: job.id,
    name: `${input.project_slug}/${input.agent_slug}/${input.cron_name}`,
  };
}

/** Bucket occurrences into day-aligned arrays starting at `startOfFirstDay`. */
export function groupOccurrencesByDay(
  occurrences: CronOccurrence[],
  startOfFirstDay: number,
  numDays: number,
): CronOccurrence[][] {
  const days: CronOccurrence[][] = Array.from({ length: numDays }, () => []);
  const dayMs = 24 * 60 * 60 * 1000;
  for (const o of occurrences) {
    const dayIndex = Math.floor((o.at - startOfFirstDay) / dayMs);
    if (dayIndex < 0 || dayIndex >= numDays) continue;
    days[dayIndex]!.push(o);
  }
  for (const day of days) day.sort((a, b) => a.at - b.at);
  return days;
}
