import { getProject } from "@/server/db/projects";
import { requireAdapter } from "@/server/adapters/registry";
import { getOrCreateSession, appendTranscriptEvent, touchSession } from "@/server/sessions";
import {
  dueJobs,
  markJobRun,
  startJobRun,
  finishJobRun,
  type ScheduledJob,
} from "./index";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Scheduler tick loop.
 *
 * Started once on first import via `ensureSchedulerRunning()`. The Next.js
 * dev server can reload modules, so the loop guards against multiple
 * concurrent intervals with a module-scoped flag — there's only ever one
 * tick at a time per process.
 */
let started = false;
let timer: NodeJS.Timeout | null = null;
const TICK_INTERVAL_MS = 30_000;

export function ensureSchedulerRunning(): void {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    runTickSafe().catch((err) => console.error("[scheduler] tick failed:", err));
  }, TICK_INTERVAL_MS);
  // First tick on the next event-loop turn so callers can return immediately.
  setImmediate(() => runTickSafe().catch(() => undefined));
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

async function runTickSafe(): Promise<void> {
  const jobs = dueJobs();
  for (const job of jobs) {
    // Mark next run forward IMMEDIATELY so concurrent ticks (process reloads,
    // etc.) don't double-fire the same job.
    markJobRun(job.id);
    const runId = startJobRun(job.id);
    try {
      const summary = await dispatchJob(job);
      finishJobRun(runId, "done", null, summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] job ${job.id} failed:`, err);
      finishJobRun(runId, "failed", message);
    }
  }
}

function workspaceDirFor(agentId: string): string {
  const dataDir = process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
  return join(dataDir, "agents", agentId);
}

async function dispatchJob(job: ScheduledJob): Promise<string | null> {
  const project = getProject(job.project_slug);
  if (!project) {
    throw new Error(`project not found: ${job.project_slug}`);
  }
  const adapter = requireAdapter(project.harness_adapter);
  const session = getOrCreateSession({
    project_slug: project.slug,
    agent_id: job.agent_id,
    label: `cron:${job.name}`,
    harness_adapter: project.harness_adapter,
  });
  appendTranscriptEvent(session.id, "user", { text: job.message, source: "cron" });

  // Prefer the adapter's explicit `final` event for the summary; fall back to
  // concatenated `delta` chunks if the adapter only streams text. Truncate so
  // we never bloat the DB with a multi-MB run row.
  let finalText: string | null = null;
  let deltaBuffer = "";
  const MAX_SUMMARY = 4000;
  const errors: { message: string; transient: boolean }[] = [];

  for await (const evt of adapter.execute({
    projectSlug: project.slug,
    agentId: job.agent_id,
    workspaceDir: workspaceDirFor(job.agent_id),
    message: job.message,
    threadId: session.id,
    harnessSessionId: session.harness_session_id,
  })) {
    if (evt.kind === "session") {
      touchSession(session.id, evt.harnessSessionId);
      continue;
    }
    appendTranscriptEvent(session.id, evt.kind, evt);
    if (evt.kind === "final") {
      finalText = evt.text;
    } else if (evt.kind === "delta" && deltaBuffer.length < MAX_SUMMARY) {
      deltaBuffer += evt.text;
    } else if (evt.kind === "error") {
      // Buffer rather than throw. Adapters (notably codex-local) can emit
      // several error events during a single retry burst — the last one is
      // usually the richest (exit code + stderr tail from execute.ts's
      // close handler). Throwing on the first event surfaced opaque retry
      // chatter like "Reconnecting... 2/5 (...)" and discarded the
      // actionable post-exit message that arrived a few hundred ms later.
      errors.push({ message: evt.message, transient: evt.transient ?? false });
    }
  }
  touchSession(session.id);

  // No `final` and we have errors → the turn failed. Prefer the most recent
  // non-transient error (the terminal exit-code message). Fall back to the
  // last entry when everything was tagged transient (we ran out of richer
  // signal; the retry chatter is all we have).
  if (finalText === null && errors.length > 0) {
    const terminal = [...errors].reverse().find((e) => !e.transient);
    throw new Error((terminal ?? errors[errors.length - 1]!).message);
  }

  const raw = (finalText ?? deltaBuffer).trim();
  if (!raw) return null;
  return raw.length > MAX_SUMMARY ? `${raw.slice(0, MAX_SUMMARY)}…` : raw;
}
