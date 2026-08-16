import { homedir } from "node:os";
import { join } from "node:path";
import { requireAdapter } from "@/server/adapters/registry";
import type { HarnessAdapterId, AgentProvisionSpec } from "@/server/adapters/types";

/**
 * Generic agent provisioning. The adapter writes whatever workspace files
 * the harness needs (IDENTITY.md, CLAUDE.md, AGENTS.md, etc.) — notfair-cmo
 * supplies the rendered prompt content + workspace path.
 */
export function workspaceDirFor(agentId: string): string {
  const dataDir = process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
  return join(dataDir, "agents", agentId);
}

export interface ProvisionInput {
  projectSlug: string;
  agentId: string;
  displayName: string;
  templateKey: string;
  identityMd: string;
  skillMd?: string;
  projectMd?: string;
  harnessAdapter: HarnessAdapterId;
}

export async function provisionAgent(input: ProvisionInput): Promise<void> {
  const adapter = requireAdapter(input.harnessAdapter);
  const spec: AgentProvisionSpec = {
    projectSlug: input.projectSlug,
    agentId: input.agentId,
    displayName: input.displayName,
    templateKey: input.templateKey,
    workspaceDir: workspaceDirFor(input.agentId),
    identityMd: input.identityMd,
    skillMd: input.skillMd,
    projectMd: input.projectMd,
  };
  await adapter.provisionAgent(spec);
}
