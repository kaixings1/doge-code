import { randomUUID } from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { getDb } from "@/server/db/db";

/**
 * Native cron scheduler for notfair-cmo.
 *
 * Schedules live in SQLite (`scheduled_jobs`). A single setInterval in the
 * Next.js process polls every minute, finds jobs whose next_run_at is due,
 * and dispatches them through the project's harness adapter.
 *
 * Replaces OpenClaw's cron CLI. notfair-cmo now owns the schedule registry,
 * the tick loop, and the run history.
 */
export interface ScheduledJob {
  id: string;
  project_slug: string;
  agent_id: string;
  name: string;
  cron_expr: string;
  message: string;
  enabled: 0 | 1;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledJobInput {
  project_slug: string;
  agent_id: string;
  name: string;
  cron_expr: string;
  message: string;
  enabled?: boolean;
}

function computeNextRun(cron_expr: string, from = new Date()): string | null {
  try {
    const it = CronExpressionParser.parse(cron_expr, { currentDate: from, tz: "UTC" });
    return it.next().toISOString();
  } catch {
    return null;
  }
}

export function createScheduledJob(input: CreateScheduledJobInput): ScheduledJob {
  const db = getDb();
  const now = new Date().toISOString();
  const next_run_at = input.enabled === false ? null : computeNextRun(input.cron_expr);
  const job: ScheduledJob = {
    id: randomUUID(),
    project_slug: input.project_slug,
    agent_id: input.agent_id,
    name: input.name,
    cron_expr: input.cron_expr,
    message: input.message,
    enabled: input.enabled === false ? 0 : 1,
    last_run_at: null,
    next_run_at,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    "INSERT INTO scheduled_jobs (id, project_slug, agent_id, name, cron_expr, message, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
  ).run(
    job.id,
    job.project_slug,
    job.agent_id,
    job.name,
    job.cron_expr,
    job.message,
    job.enabled,
    job.next_run_at,
    job.created_at,
    job.updated_at,
  );
  return job;
}

export function getScheduledJob(id: string): ScheduledJob | null {
  return (
    (getDb()
      .prepare("SELECT * FROM scheduled_jobs WHERE id = ?")
      .get(id) as ScheduledJob | undefined) ?? null
  );
}

export function listProjectScheduledJobs(project_slug: string): ScheduledJob[] {
  return getDb()
    .prepare("SELECT * FROM scheduled_jobs WHERE project_slug = ? ORDER BY created_at DESC")
    .all(project_slug) as ScheduledJob[];
}

export function listAgentScheduledJobs(project_slug: string, agent_id: string): ScheduledJob[] {
  return getDb()
    .prepare(
      "SELECT * FROM scheduled_jobs WHERE project_slug = ? AND agent_id = ? ORDER BY created_at DESC",
    )
    .all(project_slug, agent_id) as ScheduledJob[];
}

export function setJobEnabled(id: string, enabled: boolean): void {
  const job = getScheduledJob(id);
  if (!job) return;
  const next = enabled ? computeNextRun(job.cron_expr) : null;
  getDb()
    .prepare(
      "UPDATE scheduled_jobs SET enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?",
    )
    .run(enabled ? 1 : 0, next, new Date().toISOString(), id);
}

export function deleteScheduledJob(id: string): void {
  getDb().prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id);
}

export function dueJobs(now = new Date()): ScheduledJob[] {
  return getDb()
    .prepare(
      "SELECT * FROM scheduled_jobs WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC",
    )
    .all(now.toISOString()) as ScheduledJob[];
}

export function markJobRun(id: string, ran_at = new Date()): void {
  const job = getScheduledJob(id);
  if (!job) return;
  const next = computeNextRun(job.cron_expr, ran_at);
  getDb()
    .prepare(
      "UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?",
    )
    .run(ran_at.toISOString(), next, new Date().toISOString(), id);
}

export interface ScheduledJobRun {
  id: string;
  scheduled_job_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  error_message: string | null;
  summary: string | null;
}

export function startJobRun(scheduled_job_id: string): string {
  const id = randomUUID();
  getDb()
    .prepare(
      "INSERT INTO scheduled_job_runs (id, scheduled_job_id, started_at, finished_at, status, error_message, summary) VALUES (?, ?, ?, NULL, 'running', NULL, NULL)",
    )
    .run(id, scheduled_job_id, new Date().toISOString());
  return id;
}

export function finishJobRun(
  run_id: string,
  status: "done" | "failed",
  error_message: string | null = null,
  summary: string | null = null,
): void {
  getDb()
    .prepare(
      "UPDATE scheduled_job_runs SET finished_at = ?, status = ?, error_message = ?, summary = ? WHERE id = ?",
    )
    .run(new Date().toISOString(), status, error_message, summary, run_id);
}

export function listJobRuns(scheduled_job_id: string, limit = 50): ScheduledJobRun[] {
  return getDb()
    .prepare(
      "SELECT * FROM scheduled_job_runs WHERE scheduled_job_id = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(scheduled_job_id, limit) as ScheduledJobRun[];
}
