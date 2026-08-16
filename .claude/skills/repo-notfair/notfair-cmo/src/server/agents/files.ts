import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { workspaceDirFor } from "./provisioning";

/**
 * Workspace file listing + reading. notfair-cmo owns the agent workspace
 * dir under `~/.notfair-cmo/agents/<id>/`, so file IO is a direct fs read
 * — no harness subprocess or RPC needed.
 */
export interface AgentFileEntry {
  name: string;
  size: number;
  updatedAtMs: number;
  missing: boolean;
}

export interface AgentFileList {
  files: AgentFileEntry[];
  /** Absolute path to the workspace dir — surfaced by the UI as a hint. */
  workspace: string;
}

export async function listAgentFiles(agent_id: string): Promise<AgentFileList> {
  const dir = workspaceDirFor(agent_id);
  if (!existsSync(dir)) return { files: [], workspace: dir };
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { files: [], workspace: dir };
  }
  const files: AgentFileEntry[] = [];
  for (const name of entries.sort()) {
    try {
      const s = await stat(join(dir, name));
      if (!s.isFile()) continue;
      files.push({
        name,
        size: s.size,
        updatedAtMs: s.mtimeMs,
        missing: false,
      });
    } catch {
      files.push({ name, size: 0, updatedAtMs: 0, missing: true });
    }
  }
  return { files, workspace: dir };
}

export interface AgentFileContent {
  file: {
    name: string;
    content: string;
    size: number;
    updatedAtMs: number;
  };
}

export async function getAgentFile(
  agent_id: string,
  name: string,
): Promise<AgentFileContent> {
  if (name.includes("..") || name.includes("/")) {
    throw new Error(`Invalid file name: ${name}`);
  }
  const path = join(workspaceDirFor(agent_id), name);
  const [content, s] = await Promise.all([readFile(path, "utf8"), stat(path)]);
  return {
    file: { name, content, size: s.size, updatedAtMs: s.mtimeMs },
  };
}
