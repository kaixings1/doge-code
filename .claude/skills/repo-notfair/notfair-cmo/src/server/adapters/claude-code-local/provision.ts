import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentProvisionSpec } from "../types";

/**
 * Provision a workspace for Claude Code.
 *
 * Layout under `<workspaceDir>/`:
 *   IDENTITY.md   — system prompt (notfair-cmo's source of truth)
 *   CLAUDE.md     — same content (Claude Code auto-loads CLAUDE.md from cwd)
 *   SKILL.md      — shared orchestration skill text (sidecar for humans)
 *   PROJECT.md    — project brief if available (sidecar for humans)
 *
 * No subprocess calls. Claude Code discovers the workspace lazily on first
 * invocation; there's no "register agent" step.
 */
export async function provisionClaudeCodeAgent(spec: AgentProvisionSpec): Promise<void> {
  await mkdir(spec.workspaceDir, { recursive: true });
  await Promise.all([
    writeFile(join(spec.workspaceDir, "IDENTITY.md"), spec.identityMd, "utf8"),
    // Mirror to CLAUDE.md so the harness auto-loads it without us passing
    // --append-system-prompt — useful when users open the workspace directly.
    writeFile(join(spec.workspaceDir, "CLAUDE.md"), spec.identityMd, "utf8"),
    spec.skillMd
      ? writeFile(join(spec.workspaceDir, "SKILL.md"), spec.skillMd, "utf8")
      : Promise.resolve(),
    spec.projectMd
      ? writeFile(join(spec.workspaceDir, "PROJECT.md"), spec.projectMd, "utf8")
      : Promise.resolve(),
  ]);
}
