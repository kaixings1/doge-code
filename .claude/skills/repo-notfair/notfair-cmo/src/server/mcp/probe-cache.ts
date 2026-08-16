import type { McpRuntimeStatus } from "./state";

/**
 * In-process TTL cache for `getMcpStatus` probe results.
 *
 * Every server render of the Connections page (and the chat thread page,
 * which checks notfair-googleads liveness for its banner) fans out one
 * `initialize` JSON-RPC call per connector. Without a cache, navigating to
 * `/connections` thirty times in five minutes means thirty round-trips per
 * provider — fine for one user dogfooding, rude to upstreams long-term.
 *
 * The cache wraps just the RPC-bearing states. Stable "I have a token and
 * the server answered" results live for 60s (access tokens last hours, so
 * staleness here is invisible). "Provider is sick" results live for 10s so
 * we recover quickly when the provider comes back. "Token is stale" and
 * "nothing configured" are not cached — both are user-actionable states
 * where instant feedback matters after a reconnect or a fresh setup.
 *
 * Pinned to `globalThis` so Next.js HMR doesn't drop the cache on every
 * code edit (same pattern as `mcp-pending.ts`).
 */

type CacheEntry = { result: McpRuntimeStatus; expiresAt: number };

const GLOBAL_KEY = "__notfair_cmo_probe_cache__";
type GlobalSlot = { [GLOBAL_KEY]?: Map<string, CacheEntry> };
const slot = globalThis as unknown as GlobalSlot;
const STORE: Map<string, CacheEntry> =
  slot[GLOBAL_KEY] ?? (slot[GLOBAL_KEY] = new Map());

const TTL_CONNECTED_MS = 60_000;
const TTL_UNREACHABLE_MS = 10_000;

function cacheKey(project_slug: string, catalog_key: string): string {
  return `${project_slug}|${catalog_key}`;
}

/**
 * TTL (ms) for a given probe result. Returns 0 when the result should not
 * be cached at all — `stale_token` (user just needs to reconnect, instant
 * feedback wins), `not_configured` / `configured_no_token` (cheap DB-only
 * derivations, no upstream RPC to amortize).
 */
function ttlFor(state: McpRuntimeStatus["state"]): number {
  switch (state) {
    case "connected":
      return TTL_CONNECTED_MS;
    case "unreachable":
      return TTL_UNREACHABLE_MS;
    default:
      return 0;
  }
}

/** Read the cache. Returns null on miss or expired entry (and evicts the latter). */
export function getCachedProbe(
  project_slug: string,
  catalog_key: string,
): McpRuntimeStatus | null {
  const key = cacheKey(project_slug, catalog_key);
  const entry = STORE.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    STORE.delete(key);
    return null;
  }
  return entry.result;
}

/** Populate the cache, or clear any prior entry when the new state is not cacheable. */
export function setCachedProbe(
  project_slug: string,
  catalog_key: string,
  result: McpRuntimeStatus,
): void {
  const key = cacheKey(project_slug, catalog_key);
  const ttl = ttlFor(result.state);
  if (ttl <= 0) {
    // A previously-cached "connected" entry is now wrong; drop it so the
    // next read doesn't serve a stale-positive.
    STORE.delete(key);
    return;
  }
  STORE.set(key, { result, expiresAt: Date.now() + ttl });
}

/**
 * Drop the cached entry. Called from `setMcpBearer` (right after a fresh
 * OAuth callback writes new credentials — the badge should update on the
 * next render, not 60s later) and from `disconnectMcp`.
 */
export function invalidateProbe(project_slug: string, catalog_key: string): void {
  STORE.delete(cacheKey(project_slug, catalog_key));
}

/** Test-only escape hatch. */
export function _clearProbeCacheForTests(): void {
  STORE.clear();
}
