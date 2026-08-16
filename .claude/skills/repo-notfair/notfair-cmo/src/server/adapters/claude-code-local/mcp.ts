import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpRegistrationSpec } from "../types";

/**
 * Per-agent MCP wiring for Claude Code.
 *
 * Claude Code reads MCP server definitions from `<workspace>/.mcp.json`
 * (project-scoped) and `~/.claude/mcp_servers.json` (user-scoped). We use
 * the workspace-scoped file because notfair-cmo wants tokens to be
 * project-scoped — one agent's notfair-googleads connection must not bleed
 * into another agent's account.
 */
interface ClaudeMcpServerStdio {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeMcpServerHttp {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

type ClaudeMcpServer = ClaudeMcpServerStdio | ClaudeMcpServerHttp;

interface ClaudeMcpFile {
  mcpServers: Record<string, ClaudeMcpServer>;
}

function mcpFilePath(workspaceDir: string): string {
  return join(workspaceDir, ".mcp.json");
}

async function readMcpFile(workspaceDir: string): Promise<ClaudeMcpFile> {
  const path = mcpFilePath(workspaceDir);
  if (!existsSync(path)) return { mcpServers: {} };
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<ClaudeMcpFile>;
    return { mcpServers: parsed.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

async function writeMcpFile(workspaceDir: string, file: ClaudeMcpFile): Promise<void> {
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(mcpFilePath(workspaceDir), JSON.stringify(file, null, 2), "utf8");
}

export async function registerClaudeCodeMcp(
  workspaceDir: string,
  spec: McpRegistrationSpec,
): Promise<void> {
  const file = await readMcpFile(workspaceDir);
  if (spec.transport.type === "stdio") {
    file.mcpServers[spec.serverName] = {
      type: "stdio",
      command: spec.transport.command,
      args: spec.transport.args,
      env: spec.transport.env,
    };
  } else {
    file.mcpServers[spec.serverName] = {
      type: "http",
      url: spec.transport.url,
      headers: spec.transport.headers,
    };
  }
  await writeMcpFile(workspaceDir, file);
}

export async function unregisterClaudeCodeMcp(
  workspaceDir: string,
  serverName: string,
): Promise<void> {
  const file = await readMcpFile(workspaceDir);
  delete file.mcpServers[serverName];
  await writeMcpFile(workspaceDir, file);
}
