import { EventEmitter } from "node:events";
import type { TranscriptEvent } from "@/server/sessions";

/**
 * In-process pub/sub for transcript events.
 *
 * Mirrors paperclip's live-events EventEmitter pattern: every time the
 * dispatcher persists a row to `transcript_events`, it also publishes the
 * event to subscribers keyed by `session_id`. SSE bridges open during a
 * live turn receive the event in milliseconds instead of waiting for the
 * next 500ms DB poll.
 *
 * Single-process only (notfair-cmo is a local Next.js app). If we ever
 * cluster, swap this for a Redis pub/sub or move events through the DB
 * with NOTIFY/LISTEN — same subscriber API at the call site.
 */
const emitter = new EventEmitter();
// Generous default — many tabs can attach to the same session on a single
// machine (user has multiple windows / agents page polls + chat tab open).
emitter.setMaxListeners(50);

export type SessionEventListener = (event: TranscriptEvent) => void;

/**
 * Subscribe to all transcript events for one session. Returns an
 * unsubscribe callback the caller MUST invoke when the consumer goes
 * away (SSE client disconnect, route shutdown), otherwise we leak
 * listeners.
 */
export function subscribeSessionEvents(
  session_id: string,
  listener: SessionEventListener,
): () => void {
  emitter.on(session_id, listener);
  return () => {
    emitter.off(session_id, listener);
  };
}

/**
 * Publish a transcript event to all live subscribers for a session.
 *
 * Called by `appendTranscriptEvent` immediately AFTER the SQLite INSERT
 * commits — the DB write is the source of truth and the emit is a best-
 * effort push notification. A late or missed listener can always
 * recover by re-reading the table from the last-seen `seq`.
 */
export function publishSessionEvent(
  session_id: string,
  event: TranscriptEvent,
): void {
  emitter.emit(session_id, event);
}
