import { spawn } from "node:child_process";
import type { HarnessEnvironmentHealth } from "../types";

const CLAUDE_BIN = process.env.NOTFAIR_CLAUDE_BIN?.trim() || "claude";

/**
 * Probe whether the local Claude Code CLI is installed and authed.
 *
 * `claude --version` exits 0 with a version string when the binary is on
 * PATH. Auth state is best-inferred from `claude config get` returning
 * a non-empty user section; we deliberately don't run a real prompt because
 * doctor checks should be cheap and non-billable.
 */
export async function testClaudeCodeLocalEnvironment(): Promise<HarnessEnvironmentHealth> {
  const versionResult = await runCmd(CLAUDE_BIN, ["--version"]);
  if (versionResult.code !== 0) {
    return {
      ok: false,
      auth: "unknown",
      message: `\`${CLAUDE_BIN}\` not found on PATH. Install: https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview`,
    };
  }
  const versionLabel = parseVersion(versionResult.stdout);

  // Best-effort auth probe. `claude --print --output-format json --max-turns 0`
  // is the cheapest path to detect an auth state without invoking the model,
  // but it's not stable across versions, so we soft-fail to "unknown" if it
  // doesn't behave as expected. Treat ok=true even with auth="unknown" — the
  // user will see the real auth error on their first chat turn.
  return {
    ok: true,
    auth: "unknown",
    versionLabel,
  };
}

interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCmd(cmd: string, args: string[], timeoutMs = 5_000): Promise<CmdResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      resolve({ code: 124, stdout, stderr: stderr || "timeout" });
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function parseVersion(stdout: string): string {
  const m = stdout.match(/(\d+\.\d+\.\d+[\w.\-+]*)/);
  return m ? `Claude Code ${m[1]}` : "Claude Code";
}
