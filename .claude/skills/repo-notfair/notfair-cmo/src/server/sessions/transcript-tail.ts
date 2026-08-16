import { getDb } from "@/server/db/db";
import type { TranscriptEvent as RawEvent, Session } from "./index";

/**
 * UI-facing transcript event shape preserved from the previous OpenClaw-backed
 * JSONL reader. The chat polling endpoint returns a flat array of these so the
 * live-transcript component can replay events on re-attach.
 */
export type TranscriptEvent =
  | { kind: "user_message"; id: string; ts: number; body: string }
  | { kind: "assistant_text"; id: string; ts: number; body: string }
  | {
      kind: "tool_call";
      id: string;
      ts: number;
      tool_call_id: string;
      name: string;
      label: string | null;
    }
  | {
      kind: "tool_result";
      id: string;
      ts: number;
      tool_call_id: string;
      name: string;
      summary: string | null;
      ok: boolean;
    }
  | { kind: "lifecycle"; id: string; ts: number; phase: string }
  | { kind: "unknown"; id: string; ts: number; raw_type: string };

/**
 * Resolve a URL thread id to a notfair-cmo `sessions` row by label.
 * Returns null when no session has been created yet (e.g., the user just
 * clicked New and hasn't sent a turn).
 */
export function resolveSessionForThread(
  project_slug: string,
  agent_id: string,
  thread: string,
): Session | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM sessions WHERE project_slug = ? AND agent_id = ? AND label = ?",
    )
    .get(project_slug, agent_id, thread) as
    | (Session & { harness_adapter: string })
    | undefined;
  if (!row) return null;
  return row as Session;
}

/**
 * Read transcript events for a thread after `cursor`. We expose the same
 * shape the JSONL tail used (an `byteOffset` integer the client carries
 * across polls) — only here it indexes the monotonically-increasing `seq`
 * column on `transcript_events`. Callers don't care what backs the cursor;
 * they just hand back what they received.
 */
export function readTranscriptTail(
  project_slug: string,
  agent_id: string,
  thread: string,
  cursor: number,
): { events: TranscriptEvent[]; byteOffset: number; fileSize: number } {
  const session = resolveSessionForThread(project_slug, agent_id, thread);
  if (!session) return { events: [], byteOffset: cursor, fileSize: 0 };

  const rows = getDb()
    .prepare(
      "SELECT * FROM transcript_events WHERE session_id = ? AND seq > ? ORDER BY seq ASC",
    )
    .all(session.id, cursor) as RawEvent[];

  const events: TranscriptEvent[] = [];
  let last = cursor;
  for (const row of rows) {
    last = row.seq;
    const ts = Date.parse(row.created_at) || Date.now();
    const payload = safeParse(row.payload_json);
    const id = row.id;
    if (row.kind === "user") {
      const text = typeof payload.text === "string" ? payload.text : "";
      events.push({ kind: "user_message", id, ts, body: text });
    } else if (row.kind === "delta") {
      const text = typeof payload.text === "string" ? payload.text : "";
      events.push({ kind: "assistant_text", id, ts, body: text });
    } else if (row.kind === "tool") {
      const phase = typeof payload.phase === "string" ? payload.phase : "start";
      const tool_call_id =
        typeof payload.toolCallId === "string" ? payload.toolCallId : "";
      const name = typeof payload.name === "string" ? payload.name : "tool";
      if (phase === "result") {
        events.push({
          kind: "tool_result",
          id,
          ts,
          tool_call_id,
          name,
          summary: null,
          ok: true,
        });
      } else {
        const label = typeof payload.label === "string" ? payload.label : null;
        events.push({
          kind: "tool_call",
          id,
          ts,
          tool_call_id,
          name,
          label,
        });
      }
    } else if (row.kind === "lifecycle") {
      const phase = typeof payload.phase === "string" ? payload.phase : "unknown";
      events.push({ kind: "lifecycle", id, ts, phase });
    } else if (row.kind === "final") {
      // Already covered by the accumulated delta stream; surface as a no-op
      // lifecycle so clients can show "done" if they want.
      events.push({ kind: "lifecycle", id, ts, phase: "done" });
    } else if (row.kind === "error") {
      const text = typeof payload.message === "string" ? payload.message : "";
      events.push({ kind: "assistant_text", id, ts, body: `⚠ ${text}` });
    } else {
      events.push({ kind: "unknown", id, ts, raw_type: row.kind });
    }
  }

  // fileSize legacy field — for the JSONL reader this was the source file
  // size in bytes. The UI uses it only to decide whether more data may exist;
  // we substitute the highest seq seen so far.
  return { events, byteOffset: last, fileSize: last };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Coerce a raw payload value into the UI's TranscriptEvent flat-text body. */
export function rawEntryToEvents(_raw: unknown): TranscriptEvent[] {
  // Compat shim. The previous JSONL reader exposed a row-level parser so the
  // shadow tee in `chat/route.ts` could echo entries to the SSE bridge. The new
  // chat route persists structured events directly into `transcript_events`,
  // so this helper is unused — kept as an empty array to avoid breaking
  // existing imports while the live SSE bridge is rewritten on the new model.
  return [];
}
