import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/db";

/**
 * MCP token storage for notfair-cmo.
 *
 * Replaces OpenClaw's config-file storage (`openclaw mcp set/unset`). Tokens
 * are project-scoped — one project's notfair-googleads connection never bleeds
 * into another's.
 *
 * `access_token_enc` / `refresh_token_enc` columns are encrypted-at-rest
 * placeholders today (we store the raw JSON envelope from the OAuth callback)
 * but the schema is ready for a keytar-backed encryption pass.
 *
 * `token_endpoint`, `client_id`, `client_secret` were added in migration 013
 * so the refresh helper (`mcp/refresh.ts`) can rotate access tokens without
 * sending the user back through consent. They are nullable: pre-013 rows
 * have them as NULL and stay on the legacy reconnect-on-401 path.
 */
export interface McpToken {
  id: string;
  project_slug: string;
  server_name: string;
  account_label: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scope: string | null;
  metadata_json: string | null;
  token_endpoint: string | null;
  client_id: string | null;
  client_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMcpTokenInput {
  project_slug: string;
  server_name: string;
  account_label?: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  metadata?: Record<string, unknown>;
  token_endpoint?: string;
  client_id?: string;
  client_secret?: string;
}

export function upsertMcpToken(input: UpsertMcpTokenInput): McpToken {
  const db = getDb();
  const account_label = input.account_label ?? "";
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      "SELECT * FROM mcp_tokens WHERE project_slug = ? AND server_name = ? AND account_label = ?",
    )
    .get(input.project_slug, input.server_name, account_label) as McpToken | undefined;

  if (existing) {
    db.prepare(
      `UPDATE mcp_tokens SET
         access_token_enc = ?,
         refresh_token_enc = ?,
         expires_at = ?,
         scope = ?,
         metadata_json = ?,
         token_endpoint = ?,
         client_id = ?,
         client_secret = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      input.access_token,
      input.refresh_token ?? null,
      input.expires_at ?? null,
      input.scope ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.token_endpoint ?? null,
      input.client_id ?? null,
      input.client_secret ?? null,
      now,
      existing.id,
    );
    return getMcpToken(existing.id)!;
  }

  const token: McpToken = {
    id: randomUUID(),
    project_slug: input.project_slug,
    server_name: input.server_name,
    account_label,
    access_token_enc: input.access_token,
    refresh_token_enc: input.refresh_token ?? null,
    expires_at: input.expires_at ?? null,
    scope: input.scope ?? null,
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    token_endpoint: input.token_endpoint ?? null,
    client_id: input.client_id ?? null,
    client_secret: input.client_secret ?? null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO mcp_tokens (
       id, project_slug, server_name, account_label,
       access_token_enc, refresh_token_enc, expires_at, scope, metadata_json,
       token_endpoint, client_id, client_secret,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token.id,
    token.project_slug,
    token.server_name,
    token.account_label,
    token.access_token_enc,
    token.refresh_token_enc,
    token.expires_at,
    token.scope,
    token.metadata_json,
    token.token_endpoint,
    token.client_id,
    token.client_secret,
    token.created_at,
    token.updated_at,
  );
  return token;
}

/**
 * In-place rotation of the access token (and optionally the refresh token —
 * some providers rotate it on every refresh). Used by `mcp/refresh.ts` after
 * a successful `grant_type=refresh_token` exchange. Leaves the OAuth client
 * fields untouched so the next refresh has what it needs.
 *
 * Returns the updated row, or null if `id` no longer exists (deleted between
 * lookup and refresh — race that's possible if the user disconnects mid-call).
 */
export function updateMcpTokenSecrets(
  id: string,
  patch: { access_token: string; refresh_token?: string | null; expires_at?: string | null },
): McpToken | null {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE mcp_tokens SET
         access_token_enc = ?,
         refresh_token_enc = COALESCE(?, refresh_token_enc),
         expires_at = ?,
         updated_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.access_token,
      patch.refresh_token ?? null,
      patch.expires_at ?? null,
      now,
      id,
    );
  if (result.changes === 0) return null;
  return getMcpToken(id);
}

export function getMcpToken(id: string): McpToken | null {
  return (
    (getDb()
      .prepare("SELECT * FROM mcp_tokens WHERE id = ?")
      .get(id) as McpToken | undefined) ?? null
  );
}

export function findMcpToken(
  project_slug: string,
  server_name: string,
  account_label = "",
): McpToken | null {
  return (
    (getDb()
      .prepare(
        "SELECT * FROM mcp_tokens WHERE project_slug = ? AND server_name = ? AND account_label = ?",
      )
      .get(project_slug, server_name, account_label) as McpToken | undefined) ?? null
  );
}

export function listProjectMcpTokens(project_slug: string): McpToken[] {
  return getDb()
    .prepare("SELECT * FROM mcp_tokens WHERE project_slug = ? ORDER BY server_name, account_label")
    .all(project_slug) as McpToken[];
}

export function deleteMcpToken(id: string): void {
  getDb().prepare("DELETE FROM mcp_tokens WHERE id = ?").run(id);
}

export function deleteProjectMcpTokens(project_slug: string): void {
  getDb().prepare("DELETE FROM mcp_tokens WHERE project_slug = ?").run(project_slug);
}
