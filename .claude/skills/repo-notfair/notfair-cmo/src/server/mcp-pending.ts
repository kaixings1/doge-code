/**
 * In-process map of pending MCP OAuth flows. Keyed by `state` (the CSRF
 * token in the authorize URL). Lives in the Next.js server process and is
 * lost on restart — that's fine because the flow is short-lived: from
 * "click Connect" to "back at callback" is seconds, not days.
 *
 * Keeping this in-memory (vs. SQLite) avoids a migration + cleanup job for
 * what is otherwise transient data. Two entries with the same `state` is
 * cryptographically improbable; we still use `consume` (pop, not peek) so
 * a replayed callback can't reuse the same exchange context.
 */

export type PendingMcpFlow = {
  /** Catalog identifier (e.g. `notfair-googleads`) — what the UI shows. */
  catalog_key: string;
  /** Project-scoped display name; mirrors the catalog spec. */
  display_name: string;
  resource_url: string;
  /** OAuth issuer (the protected resource's authorization server). */
  issuer: string;
  /** The token endpoint resolved during start. */
  token_endpoint: string;
  client_id: string;
  /** May be undefined for public clients registered with auth_method=none. */
  client_secret?: string;
  code_verifier: string;
  redirect_uri: string;
  /** Project slug (the active project at the time the flow started). */
  project_slug: string;
  /**
   * Local path to redirect to after the callback finishes (e.g. the chat
   * URL the user started from). Validated to be same-origin/path-only when
   * stashed. Falls back to /connections when absent.
   */
  return_to?: string;
  created_at: number;
};

// In Next dev, edits to any file in the action's module graph trigger a
// recompile that re-evaluates this module — a fresh `Map()` drops every
// in-flight flow. Pinning to `globalThis` survives hot reloads because the
// global is not recreated. The single-process invariant still holds (the
// CLI launches one local Next.js server), so we don't need a real KV.
const GLOBAL_KEY = "__notfair_cmo_mcp_pending__";
type GlobalSlot = { store?: Map<string, PendingMcpFlow> };
const slot = globalThis as unknown as GlobalSlot;
const STORE: Map<string, PendingMcpFlow> = slot.store ?? (slot.store = new Map());
const TTL_MS = 10 * 60 * 1000;

function evictExpired() {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of STORE) {
    if (v.created_at < cutoff) STORE.delete(k);
  }
}

export function setPending(state: string, flow: PendingMcpFlow): void {
  evictExpired();
  STORE.set(state, flow);
}

export function consumePending(state: string): PendingMcpFlow | null {
  evictExpired();
  const hit = STORE.get(state);
  if (!hit) return null;
  STORE.delete(state);
  return hit;
}
