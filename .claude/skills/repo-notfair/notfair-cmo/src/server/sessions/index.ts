import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/db";
import type { HarnessAdapterId } from "@/server/adapters/types";

/**
 * Session / thread management.
 *
 * A "session" is one chat thread between the user and an agent. Each agent
 * can have many sessions (named "main", "Q4 audit", etc.). The session id
 * is a stable notfair-cmo UUID; we also store the adapter's own session id
 * (e.g. Claude Code's session UUID for resumption) when known.
 *
 * Replaces OpenClaw's session-key namespace + JSONL transcript files.
 */
export interface Session {
  id: string;
  project_slug: string;
  agent_id: string;
  label: string;
  harness_adapter: HarnessAdapterId;
  harness_session_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptEvent {
  id: string;
  session_id: string;
  seq: number;
  kind: "user" | "delta" | "tool" | "lifecycle" | "final" | "error";
  payload_json: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  project_slug: string;
  agent_id: string;
  label: string;
  harness_adapter: string;
  harness_session_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSession(row: SessionRow): Session {
  return { ...row, harness_adapter: row.harness_adapter as HarnessAdapterId };
}

export function getOrCreateSession(input: {
  project_slug: string;
  agent_id: string;
  label: string;
  harness_adapter: HarnessAdapterId;
  task_id?: string | null;
}): Session {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT * FROM sessions WHERE project_slug = ? AND agent_id = ? AND label = ?",
    )
    .get(input.project_slug, input.agent_id, input.label) as SessionRow | undefined;
  if (existing) return rowToSession(existing);

  const session: Session = {
    id: randomUUID(),
    project_slug: input.project_slug,
    agent_id: input.agent_id,
    label: input.label,
    harness_adapter: input.harness_adapter,
    harness_session_id: null,
    task_id: input.task_id ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO sessions (id, project_slug, agent_id, label, harness_adapter, harness_session_id, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)",
  ).run(
    session.id,
    session.project_slug,
    session.agent_id,
    session.label,
    session.harness_adapter,
    session.task_id,
    session.created_at,
    session.updated_at,
  );
  return session;
}

export function getSession(id: string): Session | null {
  const row = getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listAgentSessions(project_slug: string, agent_id: string): Session[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM sessions WHERE project_slug = ? AND agent_id = ? ORDER BY updated_at DESC",
    )
    .all(project_slug, agent_id) as SessionRow[];
  return rows.map(rowToSession);
}

export function touchSession(id: string, harness_session_id?: string): void {
  const now = new Date().toISOString();
  if (harness_session_id) {
    getDb()
      .prepare(
        "UPDATE sessions SET updated_at = ?, harness_session_id = COALESCE(harness_session_id, ?) WHERE id = ?",
      )
      .run(now, harness_session_id, id);
  } else {
    getDb().prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, id);
  }
}

export function appendTranscriptEvent(
  session_id: string,
  kind: TranscriptEvent["kind"],
  payload: unknown,
): void {
  const db = getDb();
  const seqRow = db
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM transcript_events WHERE session_id = ?")
    .get(session_id) as { next: number };
  const id = randomUUID();
  const seq = seqRow.next;
  const created_at = new Date().toISOString();
  const payload_json = JSON.stringify(payload);
  db.prepare(
    "INSERT INTO transcript_events (id, session_id, seq, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, session_id, seq, kind, payload_json, created_at);
  // Push to live subscribers AFTER the INSERT commits. Inline import to
  // keep this module free of the live-events dependency at module load —
  // matters for the migration tests that don't want EventEmitter eagerness.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { publishSessionEvent } =
    require("@/server/live-events/emitter") as typeof import("@/server/live-events/emitter");
  publishSessionEvent(session_id, {
    id,
    session_id,
    seq,
    kind,
    payload_json,
    created_at,
  });
}

export function listTranscriptEvents(
  session_id: string,
  opts: { sinceSeq?: number; limit?: number } = {},
): TranscriptEvent[] {
  const limit = opts.limit ?? 1000;
  const since = opts.sinceSeq ?? 0;
  return getDb()
    .prepare(
      "SELECT * FROM transcript_events WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
    )
    .all(session_id, since, limit) as TranscriptEvent[];
}
