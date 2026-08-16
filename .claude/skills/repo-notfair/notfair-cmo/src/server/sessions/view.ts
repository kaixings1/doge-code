import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/db";
import { getProject } from "@/server/db/projects";
import { DEFAULT_HARNESS_ADAPTER } from "@/server/adapters/registry";
import { listTasksByAgent } from "@/server/db/tasks";
import { listCronsForProject } from "@/server/scheduler/display";
import type { Session } from "./index";
import { getOrCreateSession, listAgentSessions } from "./index";

/**
 * UI-facing session shape preserved from the previous OpenClaw-backed module.
 * The chat thread dropdown rendered against this in v0.1.0; keeping the field
 * names lets the existing component continue to work.
 */
export interface SessionView {
  /** Stable thread label used in URLs (`/chat/<label>`). */
  sessionId: string;
  /** Short label shown in the dropdown. */
  label: string;
  /** Compatibility — earlier code carried a backend session-key string. */
  sessionKey: string;
  /** Last interaction (ms epoch). 0 when freshly minted. */
  lastInteractionAt: number;
  /** True when the row exists only in our cookie (no turns yet). */
  pending: boolean;
}

function cookieName(project_slug: string, agent_template_key: string): string {
  return `notfair_active_session_${project_slug}_${agent_template_key}`;
}

function sessionRowToView(s: Session): SessionView {
  return {
    sessionId: s.label,
    label: s.label,
    sessionKey: s.id,
    lastInteractionAt: Date.parse(s.updated_at) || 0,
    pending: false,
  };
}

export function listSessionsForAgent(
  project_slug: string,
  agent_id: string,
): SessionView[] {
  const rows = listAgentSessions(project_slug, agent_id);
  return rows.map(sessionRowToView);
}

export function buildPendingSessionKey(_agent_id: string, label: string): string {
  return label;
}

export function newSessionId(): string {
  return randomUUID();
}

export function findSessionBySessionId(
  project_slug: string,
  agent_id: string,
  label: string,
): SessionView | null {
  // Always scope by project_slug — even though agent_id encodes the slug,
  // a project whose slug is a prefix of another's (e.g. "acme" vs "acme-q4")
  // can produce overlapping agent_id patterns. Querying by project_slug
  // closes that hole.
  const row = getDb()
    .prepare(
      "SELECT * FROM sessions WHERE project_slug = ? AND agent_id = ? AND label = ? LIMIT 1",
    )
    .get(project_slug, agent_id, label) as Session | undefined;
  return row ? sessionRowToView(row) : null;
}

/**
 * Build the chat dropdown view: the currently-active thread plus the full
 * list of threads. If the cookie points at a label not yet in the table
 * (user clicked New, hasn't sent a message), it appears at the top as
 * pending.
 */
export async function getSessionsView(
  project_slug: string,
  agent_template_key: string,
  agent_full_id: string,
): Promise<{ active: SessionView; all: SessionView[] }> {
  const existing = listSessionsForAgent(project_slug, agent_full_id);
  const c = await cookies();
  const cookieLabel = c.get(cookieName(project_slug, agent_template_key))?.value;

  let active: SessionView | undefined;
  if (cookieLabel) {
    active = existing.find((s) => s.label === cookieLabel);
    if (!active) {
      active = {
        sessionId: cookieLabel,
        label: cookieLabel.slice(0, 8),
        sessionKey: cookieLabel,
        lastInteractionAt: 0,
        pending: true,
      };
    }
  }

  if (!active) {
    if (existing.length > 0) {
      active = existing[0]!;
    } else {
      const newLabel = "main";
      active = {
        sessionId: newLabel,
        label: newLabel,
        sessionKey: newLabel,
        lastInteractionAt: 0,
        pending: true,
      };
    }
  }

  const all = active.pending && !existing.find((s) => s.label === active!.label)
    ? [active, ...existing]
    : existing;

  return { active, all };
}

export async function setActiveSession(
  project_slug: string,
  agent_template_key: string,
  label: string,
): Promise<void> {
  const c = await cookies();
  c.set(cookieName(project_slug, agent_template_key), label, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Materialize a session row immediately (used when the first chat turn is
 * about to fire and the caller wants the session UUID to exist). Falls back
 * to the project's chosen harness adapter when one isn't passed.
 */
export function materializeSession(input: {
  project_slug: string;
  agent_id: string;
  label: string;
  task_id?: string | null;
}): Session {
  const project = getProject(input.project_slug);
  const harness = project?.harness_adapter ?? DEFAULT_HARNESS_ADAPTER;
  return getOrCreateSession({
    project_slug: input.project_slug,
    agent_id: input.agent_id,
    label: input.label,
    harness_adapter: harness,
    task_id: input.task_id ?? null,
  });
}

// ── Thread origins ──────────────────────────────────────────────────

export type SessionOrigin =
  | { kind: "task"; display_id: string; title: string | null }
  | { kind: "cron"; cron_name: string }
  | { kind: "chat"; preview: string };

const CRON_LABEL_PREFIX = "cron:";

export function isTaskOrCronSession(
  label: string,
  taskThreadIds: ReadonlySet<string>,
): boolean {
  return label.startsWith(CRON_LABEL_PREFIX) || taskThreadIds.has(label);
}

export function pickLatestChatSession<S extends { label: string }>(
  sessions: readonly S[],
  taskThreadIds: ReadonlySet<string>,
): S | undefined {
  return sessions.find((s) => !isTaskOrCronSession(s.label, taskThreadIds));
}

const PREVIEW_MAX_CHARS = 40;

/**
 * Classify each session by origin so the dropdown can show meaningful labels.
 * Tasks come from the project DB (`tasks.thread_id === session.label`); crons
 * are identified by a `cron:<name>` label prefix; free chats fall back to a
 * preview of the first user message stored in `transcript_events`.
 */
export async function classifySessions(
  agent_id: string,
  project_slug: string,
  sessions: SessionView[],
): Promise<Map<string, SessionOrigin>> {
  const out = new Map<string, SessionOrigin>();
  if (sessions.length === 0) return out;

  const taskByThread = new Map<string, { display_id: string; title: string | null }>();
  const tasks = listTasksByAgent(agent_id);
  for (const t of tasks) {
    if (t.thread_id) {
      taskByThread.set(t.thread_id, { display_id: t.display_id, title: t.title });
    }
  }

  const cronNames = new Map<string, string>();
  try {
    const view = await listCronsForProject(project_slug);
    for (const g of view.groups) {
      for (const c of g.crons) {
        cronNames.set(c.short_name, c.short_name);
      }
    }
  } catch {
    // best-effort
  }

  for (const s of sessions) {
    if (s.pending) continue;
    if (s.label.startsWith(CRON_LABEL_PREFIX)) {
      const name = s.label.slice(CRON_LABEL_PREFIX.length);
      out.set(s.label, {
        kind: "cron",
        cron_name: cronNames.get(name) ?? name,
      });
      continue;
    }
    const task = taskByThread.get(s.label);
    if (task) {
      out.set(s.label, {
        kind: "task",
        display_id: task.display_id,
        title: task.title,
      });
      continue;
    }
    out.set(s.label, {
      kind: "chat",
      preview: readFirstUserMessagePreview(project_slug, agent_id, s.label),
    });
  }
  return out;
}

function readFirstUserMessagePreview(
  project_slug: string,
  agent_id: string,
  label: string,
): string {
  const session = getDb()
    .prepare(
      "SELECT id FROM sessions WHERE project_slug = ? AND agent_id = ? AND label = ?",
    )
    .get(project_slug, agent_id, label) as { id: string } | undefined;
  if (!session) return "";
  const row = getDb()
    .prepare(
      "SELECT payload_json FROM transcript_events WHERE session_id = ? AND kind = 'user' ORDER BY seq ASC LIMIT 1",
    )
    .get(session.id) as { payload_json: string } | undefined;
  if (!row) return "";
  try {
    const payload = JSON.parse(row.payload_json) as { text?: string };
    if (typeof payload.text !== "string") return "";
    return shorten(payload.text);
  } catch {
    return "";
  }
}

function shorten(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_MAX_CHARS) return flat;
  return flat.slice(0, PREVIEW_MAX_CHARS - 1) + "…";
}
