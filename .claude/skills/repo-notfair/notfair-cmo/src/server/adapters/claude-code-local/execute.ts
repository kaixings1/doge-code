import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessEvent, HarnessExecuteContext } from "../types";
import { makeClaudeStreamState, parseClaudeLine } from "./parse";

const CLAUDE_BIN = process.env.NOTFAIR_CLAUDE_BIN?.trim() || "claude";

/**
 * Stream one chat turn through the Claude Code CLI.
 *
 * Wire shape:
 *   - We spawn `claude --print --output-format stream-json --input-format text`
 *     with the user message piped in on stdin.
 *   - The agent's IDENTITY.md is passed as the system prompt via
 *     `--append-system-prompt`. Claude Code already auto-loads workspace
 *     CLAUDE.md if present; the IDENTITY.md content takes priority either way.
 *   - We resume threads via `--resume <session-id>` when notfair-cmo's threadId
 *     maps onto an existing Claude session. First turn for a thread is fresh.
 *   - Each stdout line is a JSON event; we forward as HarnessEvents.
 */
export async function* executeClaudeCodeLocal(
  ctx: HarnessExecuteContext,
): AsyncGenerator<HarnessEvent, void, void> {
  let identityMd = "";
  try {
    identityMd = await readFile(join(ctx.workspaceDir, "IDENTITY.md"), "utf8");
  } catch {
    // Missing IDENTITY.md isn't fatal — the workspace dir may still have a
    // CLAUDE.md Claude Code will auto-load. We pass a brief default below.
  }

  const args: string[] = [
    "--print",
    "--output-format",
    "stream-json",
    "--input-format",
    "text",
    "--verbose",
  ];
  if (identityMd.trim().length > 0) {
    args.push("--append-system-prompt", identityMd);
  }

  // Resume a Claude session only when we've actually seen one for this
  // thread before. notfair-cmo's `sessions.id` UUID is meaningless to
  // Claude — passing it to --resume would fail immediately with
  // "no session found". The first turn of a thread always runs fresh.
  if (ctx.harnessSessionId && isUuid(ctx.harnessSessionId)) {
    args.push("--resume", ctx.harnessSessionId);
  }

  const child = spawn(CLAUDE_BIN, args, {
    cwd: ctx.workspaceDir,
    env: { ...process.env, NOTFAIR_PROJECT_SLUG: ctx.projectSlug, NOTFAIR_AGENT_ID: ctx.agentId },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const abortHandler = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // already dead
    }
  };
  ctx.signal?.addEventListener("abort", abortHandler, { once: true });

  child.stdin.write(ctx.message);
  child.stdin.end();

  const state = makeClaudeStreamState();
  let stdoutBuf = "";
  const events: HarnessEvent[] = [];
  let exited = false;
  let exitErr: string | null = null;
  let resolveWait: (() => void) | null = null;
  const wake = () => {
    const r = resolveWait;
    resolveWait = null;
    if (r) r();
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuf += chunk;
    let idx: number;
    while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      const out = parseClaudeLine(line, state);
      for (const evt of out) events.push(evt);
      if (out.length > 0) wake();
    }
  });

  let stderrBuf = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
    // Stream stderr lines as warnings — Claude Code uses stderr for status
    // messages too, so we don't treat presence of stderr as an error.
  });

  child.on("error", (err) => {
    exited = true;
    exitErr = err instanceof Error ? err.message : String(err);
    wake();
  });
  child.on("close", (code) => {
    // Flush any tail bytes (no trailing newline case).
    if (stdoutBuf.trim().length > 0) {
      const out = parseClaudeLine(stdoutBuf, state);
      for (const evt of out) events.push(evt);
      stdoutBuf = "";
    }
    if (code !== 0 && !state.finalized) {
      const tail = stderrBuf.trim().split("\n").slice(-5).join("\n");
      events.push({
        kind: "error",
        message: `claude exited with code ${code}${tail ? `: ${tail}` : ""}`,
      });
    }
    exited = true;
    wake();
  });

  try {
    while (!exited || events.length > 0) {
      while (events.length > 0) {
        const evt = events.shift()!;
        yield evt;
      }
      if (exited) break;
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
        // Safety: never hang forever. Long tool calls can pause the stream;
        // 5 min is generous for a single turn.
        setTimeout(() => {
          if (resolveWait === resolve) {
            resolveWait = null;
            resolve();
          }
        }, 300_000);
      });
    }
    if (exitErr) {
      yield { kind: "error", message: exitErr };
    }
  } finally {
    ctx.signal?.removeEventListener("abort", abortHandler);
    if (!exited) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
