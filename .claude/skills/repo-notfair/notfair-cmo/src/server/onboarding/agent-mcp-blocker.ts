import { templateForKey } from "@/server/agent-templates";
import { findMcpToken } from "@/server/mcp/tokens";
import { getMcpCatalog } from "@/server/mcp-catalog";
import type { AgentTemplateKey } from "@/server/agent-templates";

/**
 * Pure predicate the agent layout calls to decide whether to render the
 * "Connect <Platform> MCP" blocker instead of the agent's chat/tasks UI.
 *
 * Returns null when the agent can proceed (CMO and other tools-less
 * templates, or specialists whose required MCP is connected). Returns a
 * BlockerInfo when the agent's template declares a `requires_mcp_key`
 * and that token row is missing from `mcp_tokens` for the project.
 *
 * Separate from rendering so the predicate is tractable to unit-test
 * without spinning up React.
 */

export type AgentMcpBlocker = {
  /** Catalog key the user needs to connect (e.g. "notfair-googleads"). */
  mcp_key: string;
  /** Display name shown in the blocker copy ("Google Ads"). */
  mcp_display_name: string;
  /** Agent display label for the secondary line ("the Meta Ads agent"). */
  agent_display_name: string;
};

export function resolveAgentMcpBlocker(
  project_slug: string,
  template_key: AgentTemplateKey | undefined,
): AgentMcpBlocker | null {
  if (!template_key) return null;
  const template = templateForKey(template_key);
  if (!template?.requires_mcp_key) return null;

  const token = findMcpToken(project_slug, template.requires_mcp_key);
  if (token) return null;

  // Pull the display name from the catalog so the blocker calls the
  // connector by the same label the Connections page uses (the catalog
  // is the source of truth — templates only carry the catalog *key*).
  const catalog = getMcpCatalog(project_slug);
  const entry = catalog.find((c) => c.key === template.requires_mcp_key);
  return {
    mcp_key: template.requires_mcp_key,
    mcp_display_name: entry?.display_name ?? template.display_name,
    agent_display_name: template.display_name,
  };
}
