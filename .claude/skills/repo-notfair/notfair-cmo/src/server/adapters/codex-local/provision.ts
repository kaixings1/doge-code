import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentProvisionSpec } from "../types";

/**
 * Provision a workspace for Codex CLI.
 *
 * Layout under `<workspaceDir>/`:
 *   IDENTITY.md   — notfair-cmo source of truth (also written so humans see it)
 *   AGENTS.md     — same content; codex auto-loads AGENTS.md from cwd
 *   SKILL.md      — shared orchestration skill text
 *   PROJECT.md    — project brief if available
 */
export async function provisionCodexAgent(spec: AgentProvisionSpec): Promise<void> {
  await mkdir(spec.workspaceDir, { recursive: true });
  await Promise.all([
    writeFile(join(spec.workspaceDir, "IDENTITY.md"), spec.identityMd, "utf8"),
    writeFile(join(spec.workspaceDir, "AGENTS.md"), spec.identityMd, "utf8"),
    spec.skillMd
      ? writeFile(join(spec.workspaceDir, "SKILL.md"), spec.skillMd, "utf8")
      : Promise.resolve(),
    spec.projectMd
      ? writeFile(join(spec.workspaceDir, "PROJECT.md"), spec.projectMd, "utf8")
      : Promise.resolve(),
  ]);
}
