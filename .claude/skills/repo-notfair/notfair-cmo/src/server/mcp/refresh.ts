import { updateMcpTokenSecrets, type McpToken } from "./tokens";

/**
 * Exchange a stored refresh_token for a fresh access_token at the upstream
 * OAuth token endpoint, persist the rotated pair, and return the updated row.
 *
 * Returns `null` (and leaves the row alone) when:
 *   - the row has no refresh_token / token_endpoint / client_id stored
 *     (legacy rows from before migration 013 + callback fix), OR
 *   - the token endpoint rejects the refresh (revoked, expired, scope drift).
 *
 * Callers should treat `null` as "the user must reconnect" and surface the
 * existing stale-token UX. We deliberately don't delete the row on a failed
 * refresh — the user might be offline, and a transient 5xx shouldn't nuke
 * their connection.
 */
export async function refreshMcpToken(token: McpToken): Promise<McpToken | null> {
  if (!token.refresh_token_enc || !token.token_endpoint || !token.client_id) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token_enc,
    client_id: token.client_id,
  });
  if (token.client_secret) body.set("client_secret", token.client_secret);

  let res: Response;
  try {
    res = await fetch(token.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (err) {
    console.warn(
      `[mcp-refresh] network error refreshing ${token.server_name}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }

  if (!res.ok) {
    // Don't log the body — refresh failures from some providers echo the
    // refresh token verbatim in the error payload. Status is enough to
    // distinguish "token revoked" (4xx) from "provider hiccup" (5xx).
    console.warn(
      `[mcp-refresh] ${token.server_name} refresh failed: HTTP ${res.status}`,
    );
    return null;
  }

  let parsed: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch (err) {
    console.warn(
      `[mcp-refresh] ${token.server_name} returned non-JSON body:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }

  if (!parsed.access_token) {
    console.warn(`[mcp-refresh] ${token.server_name} response missing access_token`);
    return null;
  }

  const expires_at =
    typeof parsed.expires_in === "number"
      ? new Date(Date.now() + parsed.expires_in * 1000).toISOString()
      : null;

  return updateMcpTokenSecrets(token.id, {
    access_token: parsed.access_token,
    // Per RFC 6749 §6, the response MAY include a new refresh_token. When
    // present, providers expect us to replace the old one (Stripe rotates,
    // Google doesn't). When absent, COALESCE in updateMcpTokenSecrets keeps
    // the existing one.
    refresh_token: parsed.refresh_token ?? null,
    expires_at,
  });
}

/**
 * True iff the access token is either expired or within `skewMs` of expiry.
 * Used to decide whether to refresh proactively before an MCP RPC. We keep
 * the skew tight (default 60s) so we don't refresh every single call — only
 * when we're actually close to a 401.
 *
 * Rows with no `expires_at` (legacy or providers that omit `expires_in`)
 * return `false`: we can't tell if they're expiring, so we let the call
 * proceed and rely on the 401 reactive path.
 */
export function isExpiringSoon(token: McpToken, skewMs = 60_000): boolean {
  if (!token.expires_at) return false;
  const expiresMs = Date.parse(token.expires_at);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs - Date.now() < skewMs;
}
