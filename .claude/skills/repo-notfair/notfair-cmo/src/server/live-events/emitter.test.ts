import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publishSessionEvent,
  subscribeSessionEvents,
} from "./emitter";
import type { TranscriptEvent } from "@/server/sessions";

function makeEvent(overrides: Partial<TranscriptEvent> = {}): TranscriptEvent {
  return {
    id: "row-1",
    session_id: "s1",
    seq: 1,
    kind: "delta",
    payload_json: JSON.stringify({ text: "hi" }),
    created_at: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("session event pub/sub", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()!();
  });

  it("delivers a published event to a session's subscriber", () => {
    const listener = vi.fn();
    cleanups.push(subscribeSessionEvents("s1", listener));
    publishSessionEvent("s1", makeEvent());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].kind).toBe("delta");
  });

  it("does not deliver events from other sessions", () => {
    const listener = vi.fn();
    cleanups.push(subscribeSessionEvents("s1", listener));
    publishSessionEvent("s2", makeEvent({ session_id: "s2" }));
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribeSessionEvents("s1", listener);
    off();
    publishSessionEvent("s1", makeEvent());
    expect(listener).not.toHaveBeenCalled();
  });

  it("fans out to every active subscriber for the same session", () => {
    const tabA = vi.fn();
    const tabB = vi.fn();
    cleanups.push(subscribeSessionEvents("s1", tabA));
    cleanups.push(subscribeSessionEvents("s1", tabB));
    publishSessionEvent("s1", makeEvent());
    expect(tabA).toHaveBeenCalledTimes(1);
    expect(tabB).toHaveBeenCalledTimes(1);
  });
});
