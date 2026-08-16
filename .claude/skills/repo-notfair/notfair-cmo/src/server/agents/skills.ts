import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceDirFor } from "./provisioning";

/**
 * Skill listing — replaces the OpenClaw gateway RPC that backed the per-agent
 * Skills tab. With the harness-adapter model, "skills" are workspace files
 * (SKILL.md, PROJECT.md, IDENTITY.md) that every adapter consumes the same way.
 *
 * For now we expose just the orchestration SKILL.md as the single "skill"
 * every agent has. Future adapters that expose discoverable skills (Claude
 * Code Skills, Codex prompts) can extend this list via adapter introspection.
 */
export interface SkillEntry {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: "workspace" | "global";
  source?: string;
}

export interface SkillStatus {
  skills: SkillEntry[];
}

export async function getSkillStatus(agent_id: string): Promise<SkillStatus> {
  const skills: SkillEntry[] = [];
  const dir = workspaceDirFor(agent_id);

  const skillPath = join(dir, "SKILL.md");
  if (existsSync(skillPath)) {
    let description = "Orchestration skill.";
    try {
      const raw = await readFile(skillPath, "utf8");
      const firstLine = raw.split("\n").find((l) => l.trim().length > 0);
      if (firstLine) description = firstLine.replace(/^#+\s*/, "").slice(0, 200);
    } catch {
      // best-effort
    }
    skills.push({
      key: "notfair-orchestration",
      name: "Orchestration",
      description,
      enabled: true,
      scope: "workspace",
      source: skillPath,
    });
  }

  return { skills };
}
