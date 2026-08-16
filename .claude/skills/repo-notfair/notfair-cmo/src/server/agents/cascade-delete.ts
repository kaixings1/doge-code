import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { AgentTemplate } from "@/server/agent-templates";
import { listProjectAgents } from "@/server/agent-meta";
import { getMcpCatalog } from "@/server/mcp-catalog";
import { listCronsForProject } from "@/server/scheduler/display";
import { listProjectMcpTokens, deleteProjectMcpTokens } from "@/server/mcp/tokens";
import { listAgentSessions } from "@/server/sessions";
import { workspaceDirFor } from "./provisioning";
import { getProject } from "@/server/db/projects";
import { requireAdapter } from "@/server/adapters/registry";
import { getDb } from "@/server/db/db";

export interface ProjectDeletionAgentSummary {
  template?: AgentTemplate["key"];
  display_name: string;
  agentId: string;
  exists: boolean;
  threadCount: number;
}

export interface ProjectDeletionMcpSummary {
  catalog_key: string;
  display_name: string;
  stored_key: string;
  configured: boolean;
}

export interface ProjectDeletionSummary {
  project_slug: string;
  agents: ProjectDeletionAgentSummary[];
  mcps: ProjectDeletionMcpSummary[];
  totals: {
    agents: number;
    threads: number;
    crons: number;
    mcps: number;
  };
}

/**
 * Inventory everything tied to a project so the confirmation dialog can show
 * the user exactly what will be deleted. Reads-only.
 */
export async function getProjectDeletionSummary(
  project_slug: string,
): Promise<ProjectDeletionSummary> {
  const entries = await listProjectAgents(project_slug);
  const agents: ProjectDeletionAgentSummary[] = entries.map((e) => {
    const dir = workspaceDirFor(e.agent_id);
    const exists = existsSync(dir);
    const threadCount = exists ? listAgentSessions(project_slug, e.agent_id).length : 0;
    return {
      template: e.template_key,
      display_name: e.name,
      agentId: e.agent_id,
      exists,
      threadCount,
    };
  });

  let cronCount = 0;
  try {
    const view = await listCronsForProject(project_slug);
    cronCount = view.groups.reduce((acc, g) => acc + g.crons.length, 0);
  } catch {
    // best-effort
  }

  // MCP connections live in the mcp_tokens table now. Per-catalog "configured"
  // status is derived from whether a token row exists for the (project, server)
  // pair.
  const tokens = listProjectMcpTokens(project_slug);
  const tokenServers = new Set(tokens.map((t) => t.server_name));
  const mcps: ProjectDeletionMcpSummary[] = getMcpCatalog(project_slug).map(
    (spec) => ({
      catalog_key: spec.key,
      display_name: spec.display_name,
      stored_key: `${project_slug}-${spec.key}`,
      configured: tokenServers.has(spec.key),
    }),
  );

  return {
    project_slug,
    agents,
    mcps,
    totals: {
      agents: agents.filter((a) => a.exists).length,
      threads: agents.reduce((acc, a) => acc + a.threadCount, 0),
      crons: cronCount,
      mcps: mcps.filter((m) => m.configured).length,
    },
  };
}

/**
 * Hard-delete every artifact tied to a project that lives outside the
 * `projects` row's own FK cascade: agent workspace dirs, the project's
 * scheduled jobs (and their runs), sessions + transcripts, MCP tokens.
 * The caller is expected to then call `deleteProjectRow()` to drop the
 * projects row itself + the FK-cascading children (tasks, approvals, etc).
 */
export async function cascadeDeleteProjectArtifacts(project_slug: string): Promise<void> {
  const project = getProject(project_slug);
  const adapter = project ? requireAdapter(project.harness_adapter) : null;
  const agents = await listProjectAgents(project_slug);

  // Unregister any MCP servers the adapter wrote into its config (so codex
  // global config doesn't leak rows for deleted projects, and claude-code
  // workspaces don't reference dead bearers).
  if (adapter) {
    const catalog = getMcpCatalog(project_slug);
    for (const agent of agents) {
      for (const spec of catalog) {
        try {
          await adapter.unregisterMcp({
            serverName: spec.key,
            projectSlug: project_slug,
            agentId: agent.agent_id,
          });
        } catch {
          // best-effort
        }
      }
    }
  }

  // Drop workspace dirs.
  for (const agent of agents) {
    try {
      await rm(workspaceDirFor(agent.agent_id), { recursive: true, force: true });
    } catch (err) {
      console.error(`[delete] failed to rm workspace ${agent.agent_id}:`, err);
    }
  }

  // Drop scheduled jobs (run rows cascade).
  getDb()
    .prepare("DELETE FROM scheduled_jobs WHERE project_slug = ?")
    .run(project_slug);

  // Drop sessions (transcript_events cascade).
  getDb()
    .prepare("DELETE FROM sessions WHERE project_slug = ?")
    .run(project_slug);

  // Drop MCP tokens.
  deleteProjectMcpTokens(project_slug);

  // Drop user-added MCP catalog entries for the project.
  getDb()
    .prepare("DELETE FROM user_mcp_servers WHERE project_slug = ?")
    .run(project_slug);
}
