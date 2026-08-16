import { describe, expect, it } from "vitest";
import { makeClaudeStreamState, parseClaudeLine } from "./parse";

describe("parseClaudeLine", () => {
  it("ignores blank and malformed lines", () => {
    const state = makeClaudeStreamState();
    expect(parseClaudeLine("", state)).toEqual([]);
    expect(parseClaudeLine("not json", state)).toEqual([]);
    expect(state.assistantText).toBe("");
  });

  it("forwards a `system` event as a lifecycle", () => {
    const state = makeClaudeStreamState();
    const out = parseClaudeLine(
      JSON.stringify({ type: "system", subtype: "init" }),
      state,
    );
    expect(out).toEqual([{ kind: "lifecycle", phase: "init" }]);
  });

  it("emits a session event once when the system message carries a session_id", () => {
    const state = makeClaudeStreamState();
    const first = parseClaudeLine(
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "claude-session-uuid",
      }),
      state,
    );
    expect(first).toEqual([
      { kind: "lifecycle", phase: "init" },
      { kind: "session", harnessSessionId: "claude-session-uuid" },
    ]);
    // Second system event with the same session_id must not re-emit.
    const second = parseClaudeLine(
      JSON.stringify({
        type: "system",
        subtype: "another_hook",
        session_id: "claude-session-uuid",
      }),
      state,
    );
    expect(second).toEqual([{ kind: "lifecycle", phase: "another_hook" }]);
  });

  it("emits a delta when an assistant text block arrives", () => {
    const state = makeClaudeStreamState();
    const out = parseClaudeLine(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello" }] },
      }),
      state,
    );
    expect(out).toEqual([{ kind: "delta", text: "Hello" }]);
    expect(state.assistantText).toBe("Hello");
    expect(state.emittedTextLen).toBe(5);
  });

  it("emits only the new suffix on subsequent assistant blocks", () => {
    const state = makeClaudeStreamState();
    parseClaudeLine(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello" }] },
      }),
      state,
    );
    const out = parseClaudeLine(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: " world" }] },
      }),
      state,
    );
    expect(out).toEqual([{ kind: "delta", text: " world" }]);
    expect(state.assistantText).toBe("Hello world");
  });

  it("surfaces a tool_use block as a `tool` start event", () => {
    const state = makeClaudeStreamState();
    const out = parseClaudeLine(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "call_42",
              name: "Bash",
              input: { command: "pnpm test" },
            },
          ],
        },
      }),
      state,
    );
    expect(out).toEqual([
      {
        kind: "tool",
        phase: "start",
        toolCallId: "call_42",
        name: "Bash",
        label: "pnpm test",
      },
    ]);
  });

  it("marks state.finalized and emits a final event on result", () => {
    const state = makeClaudeStreamState();
    state.assistantText = "Hi";
    state.emittedTextLen = 2;
    const out = parseClaudeLine(
      JSON.stringify({ type: "result", subtype: "success", result: "Hi" }),
      state,
    );
    expect(out).toEqual([{ kind: "final", text: "Hi" }]);
    expect(state.finalized).toBe(true);
  });

  it("emits an error event when the result subtype is an error", () => {
    const state = makeClaudeStreamState();
    const out = parseClaudeLine(
      JSON.stringify({
        type: "result",
        subtype: "error_max_turns",
        error: { message: "too many turns" },
      }),
      state,
    );
    expect(out).toEqual([{ kind: "error", message: "too many turns" }]);
    expect(state.finalized).toBe(true);
  });
});
