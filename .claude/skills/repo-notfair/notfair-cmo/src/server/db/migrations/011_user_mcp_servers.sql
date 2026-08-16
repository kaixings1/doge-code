-- Migration 011: user-added MCP servers.
--
-- The Connections page used to render a hardcoded preset catalog
-- (notfair-googleads). Users now register arbitrary OAuth-2.0 MCP servers
-- (Stripe, Vercel, Supabase, etc.) from the UI. Each row is project-scoped
-- and joined alongside the preset list in `getMcpCatalog`.
--
-- The `key` column carries the same identifier that mcp_tokens.server_name
-- uses, so the OAuth callback + token storage + adapter registration paths
-- work without changes.

CREATE TABLE IF NOT EXISTS user_mcp_servers (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES projects(slug),
  key           TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  resource_url  TEXT NOT NULL,
  discovery_url TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(project_slug, key)
);
CREATE INDEX IF NOT EXISTS idx_user_mcp_servers_project ON user_mcp_servers(project_slug);
