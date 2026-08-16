import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/db";
import { normalizeResourceUrl } from "@/server/mcp/discovery-url";

/**
 * Project-scoped storage for user-added MCP servers.
 *
 * Companion to `mcp_tokens` — the catalog row says "this MCP exists for
 * this project" (slug, name, URLs); the token row says "we have a bearer
 * for it." `getMcpCatalog` joins this table with the static preset list
 * so both surfaces render the same `McpSpec` shape.
 *
 * `key` is the same identifier used as `mcp_tokens.server_name`, so the
 * OAuth callback + adapter registration paths don't care whether the
 * MCP came from presets or this table.
 */
export interface UserMcpServer {
  id: string;
  project_slug: string;
  key: string;
  display_name: string;
  description: string;
  resource_url: string;
  discovery_url: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertUserMcpServerInput {
  project_slug: string;
  key: string;
  display_name: string;
  description?: string;
  resource_url: string;
  discovery_url: string;
}

export function insertUserMcpServer(input: UpsertUserMcpServerInput): UserMcpServer {
  const now = new Date().toISOString();
  const row: UserMcpServer = {
    id: randomUUID(),
    project_slug: input.project_slug,
    key: input.key,
    display_name: input.display_name,
    description: input.description ?? "",
    resource_url: input.resource_url,
    discovery_url: input.discovery_url,
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      "INSERT INTO user_mcp_servers (id, project_slug, key, display_name, description, resource_url, discovery_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      row.id,
      row.project_slug,
      row.key,
      row.display_name,
      row.description,
      row.resource_url,
      row.discovery_url,
      row.created_at,
      row.updated_at,
    );
  return row;
}

export function findUserMcpServer(
  project_slug: string,
  key: string,
): UserMcpServer | null {
  return (
    (getDb()
      .prepare(
        "SELECT * FROM user_mcp_servers WHERE project_slug = ? AND key = ?",
      )
      .get(project_slug, key) as UserMcpServer | undefined) ?? null
  );
}

/**
 * Find a row by normalized resource URL. Used to detect "this server is
 * already in the project" even when the key the caller would create
 * differs from the stored key (legacy slugification mismatches, etc).
 */
export function findUserMcpServerByResourceUrl(
  project_slug: string,
  resource_url: string,
): UserMcpServer | null {
  const target = normalizeResourceUrl(resource_url);
  return (
    listUserMcpServers(project_slug).find(
      (row) => normalizeResourceUrl(row.resource_url) === target,
    ) ?? null
  );
}

export function listUserMcpServers(project_slug: string): UserMcpServer[] {
  return getDb()
    .prepare(
      "SELECT * FROM user_mcp_servers WHERE project_slug = ? ORDER BY created_at",
    )
    .all(project_slug) as UserMcpServer[];
}

export function deleteUserMcpServer(project_slug: string, key: string): void {
  getDb()
    .prepare("DELETE FROM user_mcp_servers WHERE project_slug = ? AND key = ?")
    .run(project_slug, key);
}
