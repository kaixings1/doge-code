import { describe, expect, it } from "vitest";
import { makeCodexStreamState, parseCodexLine } from "./parse";

describe("parseCodexLine", () => {
  it("ignores blank and malformed lines", () => {
    const state = makeCodexStreamState();
    expect(parseCodexLine("", state)).toEqual([]);
    expect(parseCodexLine("not json", state)).toEqual([]);
  });

  it("captures the thread id on thread.started and emits a session event", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({ type: "thread.started", thread_id: "abc-123" }),
      state,
    );
    expect(out).toEqual([
      { kind: "lifecycle", phase: "start" },
      { kind: "session", harnessSessionId: "abc-123" },
    ]);
    expect(state.threadId).toBe("abc-123");
  });

  it("emits a tool start event on item.started for a command_execution", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "item.started",
        item: {
          type: "command_execution",
          id: "cmd_1",
          command: "ls -la\nsecond line",
        },
      }),
      state,
    );
    // Shell command items get a stable `"shell"` name so the chat UI can
    // route them to the Terminal icon + humanize the intent from the
    // command line. The raw command stays in `label`.
    expect(out).toEqual([
      {
        kind: "tool",
        phase: "start",
        toolCallId: "cmd_1",
        name: "shell",
        label: "ls -la",
      },
    ]);
  });

  it("emits a tool start event for an mcp_tool_call item using <server>.<tool> naming", () => {
    // Codex 0.132+ surfaces MCP invocations as their own item type with
    // distinct `server` + `tool` fields. The UI matches tool calls to
    // catalog entries via a `<server>.<tool>` shape, so the parser
    // normalizes to that.
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "item.started",
        item: {
          type: "mcp_tool_call",
          id: "mcp_1",
          server: "notfair_demo__notfair_googleads",
          tool: "listAdAccounts",
          arguments: { query: "active campaigns" },
        },
      }),
      state,
    );
    expect(out).toEqual([
      {
        kind: "tool",
        phase: "start",
        toolCallId: "mcp_1",
        name: "notfair_demo__notfair_googleads.listAdAccounts",
        label: "active campaigns",
      },
    ]);
  });

  it("emits a tool result event when an mcp_tool_call completes", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          id: "mcp_1",
          server: "notfair_demo__notfair_googleads",
          tool: "listAdAccounts",
        },
      }),
      state,
    );
    expect(out).toEqual([
      {
        kind: "tool",
        phase: "result",
        toolCallId: "mcp_1",
        name: "notfair_demo__notfair_googleads.listAdAccounts",
      },
    ]);
  });

  it("keeps the declared name when item.name is provided (real MCP tool call)", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "item.started",
        item: {
          type: "tool_call",
          id: "tc_1",
          name: "notfair_demo__notfair_googleads__listAdAccounts",
          arguments: { query: "active campaigns" },
        },
      }),
      state,
    );
    expect(out).toEqual([
      {
        kind: "tool",
        phase: "start",
        toolCallId: "tc_1",
        name: "notfair_demo__notfair_googleads__listAdAccounts",
        label: "active campaigns",
      },
    ]);
  });

  it("emits a delta when an agent_message item completes", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "Sure thing." },
      }),
      state,
    );
    expect(out).toEqual([{ kind: "delta", text: "Sure thing." }]);
    expect(state.assistantText).toBe("Sure thing.");
  });

  it("marks the turn finalized on turn.completed", () => {
    const state = makeCodexStreamState();
    state.assistantText = "Done";
    state.emittedTextLen = 4;
    const out = parseCodexLine(
      JSON.stringify({ type: "turn.completed", usage: {} }),
      state,
    );
    expect(out).toEqual([{ kind: "final", text: "Done" }]);
    expect(state.finalized).toBe(true);
  });

  it("emits an error event on turn.failed", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "turn.failed",
        error: { message: "rate limit hit" },
      }),
      state,
    );
    expect(out).toEqual([
      { kind: "error", message: "rate limit hit", transient: false },
    ]);
    expect(state.finalized).toBe(true);
  });

  it("tags Codex MCP reconnect chatter as transient and leaves the turn un-finalized", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "turn.failed",
        error: {
          message: "Reconnecting... 2/5 (timeout waiting for child process to exit)",
        },
      }),
      state,
    );
    expect(out).toEqual([
      {
        kind: "error",
        message: "Reconnecting... 2/5 (timeout waiting for child process to exit)",
        transient: true,
      },
    ]);
    // Critically: a transient error must NOT finalize the turn, otherwise
    // execute.ts's close handler suppresses the richer post-exit error.
    expect(state.finalized).toBe(false);
  });

  it("tags `type: error` lines that match the reconnect pattern as transient", () => {
    const state = makeCodexStreamState();
    const out = parseCodexLine(
      JSON.stringify({
        type: "error",
        message: "Reconnecting... 1/5",
      }),
      state,
    );
    expect(out).toEqual([
      { kind: "error", message: "Reconnecting... 1/5", transient: true },
    ]);
  });
});
