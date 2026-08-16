import { spawn } from "node:child_process";
import type { HarnessEnvironmentHealth } from "../types";

const CODEX_BIN = process.env.NOTFAIR_CODEX_BIN?.trim() || "codex";

export async function testCodexLocalEnvironment(): Promise<HarnessEnvironmentHealth> {
  const versionResult = await runCmd(CODEX_BIN, ["--version"]);
  if (versionResult.code !== 0) {
    return {
      ok: false,
      auth: "unknown",
      message: `\`${CODEX_BIN}\` not found on PATH. Install: https://github.com/openai/codex`,
    };
  }
  return {
    ok: true,
    auth: "unknown",
    versionLabel: parseVersion(versionResult.stdout),
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
  return m ? `Codex ${m[1]}` : "Codex";
}
