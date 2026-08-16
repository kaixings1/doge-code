import type { HarnessEvent } from "../types";

/**
 * Claude Code emits one JSON object per line on stdout when invoked with
 * `--output-format stream-json`. The shape (per the SDK docs) is a tagged
 * union: assistant messages contain `content` blocks (text or tool_use),
 * `result` messages signal turn completion, and `system` messages carry
 * lifecycle metadata.
 *
 * This parser converts each line into zero or more HarnessEvents, tracking
 * the byte offset of text already emitted so deltas are monotonic even when
 * Claude re-broadcasts the running buffer.
 */
export interface ClaudeStreamState {
  /** Last text length we forwarded as a delta — anything past this is new. */
  emittedTextLen: number;
  /** Concatenated assistant text seen so far this turn. */
  assistantText: string;
  /** Whether we've forwarded a `final` event yet. */
  finalized: boolean;
  /** Whether we've already emitted the `session` event this turn. */
  sessionEmitted: boolean;
}

export function makeClaudeStreamState(): ClaudeStreamState {
  return {
    emittedTextLen: 0,
    assistantText: "",
    finalized: false,
    sessionEmitted: false,
  };
}

interface ClaudeContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ClaudeStreamMessage {
  type?: string;
  subtype?: string;
  message?: {
    content?: ClaudeContentBlock[];
    role?: string;
    id?: string;
  };
  result?: string;
  /** Error fields when subtype === "error". */
  is_error?: boolean;
  error?: { message?: string };
  /** Some emitters use top-level `text` instead of nested message.content[].text. */
  text?: string;
  delta?: string;
  /** Session id from the system event so we can correlate. */
  session_id?: string;
}

/**
 * Parse one Claude Code stream-json line. Returns the events that should be
 * forwarded and mutates `state` to track progress.
 */
export function parseClaudeLine(
  line: string,
  state: ClaudeStreamState,
): HarnessEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: ClaudeStreamMessage;
  try {
    msg = JSON.parse(trimmed) as ClaudeStreamMessage;
  } catch {
    return [];
  }

  const events: HarnessEvent[] = [];

  if (msg.type === "system") {
    if (typeof msg.subtype === "string") {
      events.push({ kind: "lifecycle", phase: msg.subtype });
    }
    if (!state.sessionEmitted && typeof msg.session_id === "string") {
      state.sessionEmitted = true;
      events.push({ kind: "session", harnessSessionId: msg.session_id });
    }
    return events;
  }

  if (msg.type === "assistant" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "text" && typeof block.text === "string") {
        state.assistantText += block.text;
        if (state.assistantText.length > state.emittedTextLen) {
          const delta = state.assistantText.slice(state.emittedTextLen);
          state.emittedTextLen = state.assistantText.length;
          events.push({ kind: "delta", text: delta });
        }
      } else if (block.type === "tool_use") {
        const toolCallId = block.id ?? "";
        const name = block.name ?? "tool";
        events.push({
          kind: "tool",
          phase: "start",
          toolCallId,
          name,
          label: labelForToolInput(name, block.input),
        });
      }
    }
    return events;
  }

  if (msg.type === "user" && msg.message?.content) {
    // tool_result blocks come back as user messages; we surface them as `tool`
    // result events so the UI can mark the in-progress step as done.
    for (const block of msg.message.content) {
      if (block.type === "tool_result") {
        const toolCallId = (block as ClaudeContentBlock & { tool_use_id?: string }).tool_use_id ?? "";
        events.push({
          kind: "tool",
          phase: "result",
          toolCallId,
          name: "",
        });
      }
    }
    return events;
  }

  if (msg.type === "result") {
    state.finalized = true;
    if (msg.subtype === "error_max_turns" || msg.subtype === "error_during_execution") {
      events.push({
        kind: "error",
        message: msg.error?.message ?? msg.subtype,
      });
      return events;
    }
    const finalText = typeof msg.result === "string" ? msg.result : state.assistantText;
    // Emit any trailing delta we missed (defensive — should be empty).
    if (finalText.length > state.emittedTextLen) {
      const delta = finalText.slice(state.emittedTextLen);
      state.emittedTextLen = finalText.length;
      events.push({ kind: "delta", text: delta });
    }
    events.push({ kind: "final", text: finalText });
    return events;
  }

  return events;
}

function labelForToolInput(name: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  const tryKey = (k: string): string | null => {
    const v = obj[k];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };
  // Bash command first line
  if (name === "Bash" || name === "bash" || name === "exec") {
    const cmd = tryKey("command") ?? tryKey("cmd") ?? tryKey("script");
    if (cmd) {
      const nl = cmd.indexOf("\n");
      const line = nl >= 0 ? cmd.slice(0, nl) : cmd;
      return line.length > 160 ? `${line.slice(0, 159)}…` : line;
    }
  }
  // File paths
  const path = tryKey("file_path") ?? tryKey("path") ?? tryKey("filename");
  if (path) return shortenPath(path);
  // URLs
  const url = tryKey("url") ?? tryKey("uri");
  if (url) return url;
  return undefined;
}

function shortenPath(p: string): string {
  const segs = p.split("/");
  if (segs.length <= 2) return p;
  return `…/${segs[segs.length - 2]}/${segs[segs.length - 1]}`;
}
