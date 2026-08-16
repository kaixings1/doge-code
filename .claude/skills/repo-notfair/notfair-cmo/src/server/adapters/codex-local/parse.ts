import type { HarnessEvent } from "../types";

/**
 * Codex CLI emits one JSON event per line on stdout when invoked with
 * `codex exec --json ...`. Event shape (per the OpenAI codex docs):
 *
 *   { type: "thread.started", thread_id: "..." }
 *   { type: "item.started",   item: { type: "agent_message" | "tool_call", ... } }
 *   { type: "item.completed", item: { type: "agent_message", text: "..." } }
 *   { type: "turn.completed", usage: { ... } }
 *   { type: "turn.failed",    error: { message: "..." } }
 *   { type: "error",          message: "..." }
 *
 * Codex does NOT emit token-by-token deltas — agent_message text arrives
 * whole on item.completed. We forward it as one delta + a final at
 * turn.completed so the UI flow matches Claude Code's event sequence.
 */
export interface CodexStreamState {
  emittedTextLen: number;
  assistantText: string;
  finalized: boolean;
  threadId: string | null;
}

export function makeCodexStreamState(): CodexStreamState {
  return { emittedTextLen: 0, assistantText: "", finalized: false, threadId: null };
}

interface CodexEvent {
  type?: string;
  thread_id?: string;
  message?: string;
  item?: {
    type?: string;
    text?: string;
    name?: string;
    id?: string;
    command?: string;
    arguments?: Record<string, unknown>;
    /**
     * Fields specific to `mcp_tool_call` items in codex 0.13x+. The
     * gateway invokes a registered MCP server's tool and emits the
     * server/tool pair separately from the generic `name` slot.
     */
    server?: string;
    tool?: string;
    tool_name?: string;
  };
  error?: { message?: string };
}

/**
 * Item type ids codex emits for things we want to surface as "tool"
 * events in the UI. Centralized so the started/completed branches stay
 * in sync — historically they drifted, missing newer types like
 * `mcp_tool_call` (added in codex 0.132+) which left MCP invocations
 * silently invisible in the chat.
 */
const TOOLISH_ITEM_TYPES = new Set([
  "command_execution",
  "tool_call",
  "function_call",
  "mcp_tool_call",
  "mcp_call",
]);

export function parseCodexLine(
  line: string,
  state: CodexStreamState,
): HarnessEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let event: CodexEvent;
  try {
    event = JSON.parse(trimmed) as CodexEvent;
  } catch {
    return [];
  }

  const events: HarnessEvent[] = [];

  if (event.type === "thread.started") {
    state.threadId = event.thread_id ?? state.threadId;
    events.push({ kind: "lifecycle", phase: "start" });
    if (state.threadId) {
      events.push({ kind: "session", harnessSessionId: state.threadId });
    }
    return events;
  }

  if (event.type === "item.started" && event.item) {
    const item = event.item;
    if (item.type && TOOLISH_ITEM_TYPES.has(item.type)) {
      const toolName = nameForToolishItem(item);
      events.push({
        kind: "tool",
        phase: "start",
        toolCallId: item.id ?? "",
        name: toolName,
        label: labelForCodexInput(toolName, item),
      });
    }
    return events;
  }

  if (event.type === "item.completed" && event.item) {
    const item = event.item;
    if (item.type === "agent_message" && typeof item.text === "string") {
      state.assistantText += item.text;
      if (state.assistantText.length > state.emittedTextLen) {
        const delta = state.assistantText.slice(state.emittedTextLen);
        state.emittedTextLen = state.assistantText.length;
        events.push({ kind: "delta", text: delta });
      }
    } else if (item.type && TOOLISH_ITEM_TYPES.has(item.type)) {
      events.push({
        kind: "tool",
        phase: "result",
        toolCallId: item.id ?? "",
        name: nameForToolishItem(item),
      });
    }
    return events;
  }

  if (event.type === "turn.completed") {
    state.finalized = true;
    events.push({ kind: "final", text: state.assistantText });
    return events;
  }

  if (event.type === "turn.failed") {
    const message = event.error?.message ?? "codex turn failed";
    const transient = isTransientCodexError(message);
    // Only flip `finalized` on a *terminal* failure. Transient retry
    // chatter (Codex's MCP reconnect loop: "Reconnecting... N/5 ...")
    // arrives on `turn.failed` too — if we marked the turn finalized
    // there, the close handler in execute.ts would suppress the richer
    // "codex exited with code N: <stderr tail>" error that lands after
    // the process actually gives up.
    if (!transient) state.finalized = true;
    events.push({ kind: "error", message, transient });
    return events;
  }

  if (event.type === "error") {
    const message = event.message ?? "codex error";
    events.push({
      kind: "error",
      message,
      transient: isTransientCodexError(message),
    });
    return events;
  }

  return events;
}

/**
 * Codex's MCP reconnect loop prints `Reconnecting... N/5 (...)` whenever
 * a streamable-HTTP MCP server connection drops mid-turn. These are
 * intermediate retry-state snapshots, not the terminal error — the real
 * cause (network blip, expired token, etc.) is what eventually shows up
 * on stderr when codex finally gives up. Surfacing the retry message as
 * the run's error makes failures look opaque ("2/5 — why not 5/5?");
 * tagging them lets the scheduler prefer the post-exit message instead.
 */
const TRANSIENT_CODEX_ERROR_PATTERNS: RegExp[] = [
  /^Reconnecting\.\.\.\s+\d+\/\d+/,
];

export function isTransientCodexError(message: string): boolean {
  const trimmed = message.trim();
  return TRANSIENT_CODEX_ERROR_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Derive the canonical tool `name` field the UI will see for any codex
 * item type we route through as a tool event. The shape matters: the
 * chat client maps the name to (a) an icon, (b) a humanized verb,
 * (c) an MCP brand favicon. Conventions:
 *
 *   - `mcp_tool_call` / `mcp_call` items get `<server>.<tool>` so the
 *     UI's `<server>.<tool>` matcher resolves the server brand from
 *     the project's MCP catalog. The codex namespace prefix
 *     (`notfair_<projectSlug>__<serverName>`) is what `server` carries
 *     — the matcher already strips the project prefix.
 *   - Shell-style `command_execution` items lose their raw command from
 *     the name (it would render as garbage in the UI) — name becomes
 *     a stable `"shell"` token, and the command stays in the label.
 *   - Generic `tool_call` / `function_call` items keep their declared
 *     `name` so unknown function tools surface their real identifier.
 *   - Items missing every signal degrade to `"tool"`.
 */
function nameForToolishItem(item: {
  type?: string;
  name?: string;
  command?: string;
  server?: string;
  tool?: string;
  tool_name?: string;
}): string {
  if (item.type === "mcp_tool_call" || item.type === "mcp_call") {
    const server = item.server ?? "";
    const tool = item.tool ?? item.tool_name ?? item.name ?? "tool";
    if (server) return `${server}.${tool}`;
    return tool;
  }
  if (item.type === "command_execution") {
    // Shell items expose only `command`; we want the chat UI to see a
    // stable `"shell"` slug rather than the raw command (which produces
    // garbage verbs like "Called md\"" after the tool-name humanizer
    // splits on dots in the command).
    return "shell";
  }
  // tool_call / function_call / fallthrough.
  const raw = item.name ?? item.tool ?? item.tool_name ?? (item.command ? "shell" : "tool");
  return raw.split("\n")[0]!;
}

function labelForCodexInput(
  name: string,
  item: { command?: string; arguments?: Record<string, unknown> },
): string | undefined {
  if (item.command && item.command.trim().length > 0) {
    const firstLine = item.command.split("\n")[0];
    return firstLine.length > 160 ? `${firstLine.slice(0, 159)}…` : firstLine;
  }
  if (!item.arguments) return undefined;
  const tryKey = (k: string): string | null => {
    const v = item.arguments?.[k];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };
  return (
    tryKey("file_path") ??
    tryKey("path") ??
    tryKey("url") ??
    tryKey("query") ??
    undefined
  );
}
