-- Migration 012: per-project hide-list for preset MCP catalog entries.
--
-- Users can now "remove" a preset connector (NotFair Google Ads, etc.)
-- from a project's Connections page. Since the preset list is hardcoded
-- in source, removal stores the key in this column and getMcpCatalog
-- filters it out. Re-adding from "Browse connectors" deletes the key
-- here, so the preset reappears.
--
-- JSON-encoded string array, NOT NULL, defaulting to '[]' so existing
-- rows behave like "no presets hidden".

ALTER TABLE projects
  ADD COLUMN hidden_mcp_preset_keys_json TEXT NOT NULL DEFAULT '[]';
