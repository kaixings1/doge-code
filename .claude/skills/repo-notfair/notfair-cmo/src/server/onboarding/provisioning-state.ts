import { agentExists } from "@/server/agent-templates";

/**
 * In-process map tracking async OpenClaw agent provisioning per project.
 *
 * Why this exists: per D6, `createProjectAction` fires `ensureProjectAgents`
 * without awaiting it so the form returns immediately and the user can begin
 * the OAuth redirect. The audit SSE route (a separate request, after OAuth)
 * still needs to wait until provisioning completes before calling MCP — per
 * D13 with an 8s ceiling. The Promise from the form action's request scope
 * is gone by the time the audit route runs; we stash it here so the audit
 * route can `await` it.
 *
 * Pattern mirrors `server/mcp-pending.ts`: globalThis-pinned map that
 * survives Next.js dev hot-reload. Single-process invariant holds because
 * the CLI launches one Next.js server per user.
 *
 * Cold-start fallback: if the process restarted between form submit and
 * audit start (user closed the tab and returned hours later), the Map is
 * empty. `awaitProvisioning` falls back to a fast filesystem-level check via
 * `agentExists` so the audit can still proceed.
 */

export type ProvisionResult = {
  created: string[];
  existed: string[];
  failed: Array<{ name: string; error: string }>;
};

export type AwaitResult =
  | { kind: "ready"; via_fallback: boolean; result?: ProvisionResult }
  | { kind: "timeout" }
  | { kind: "no-agents"; via_fallback: true };

const GLOBAL_KEY = "__notfair_cmo_provisioning__";
type GlobalSlot = { store?: Map<string, Promise<ProvisionResult>> };
const slot = globalThis as unknown as Record<string, GlobalSlot>;
const STORE: Map<string, Promise<ProvisionResult>> =
  (slot[GLOBAL_KEY] ??= {}).store ??
  ((slot[GLOBAL_KEY] as GlobalSlot).store = new Map());

/**
 * Register a provisioning Promise for a project slug. The Promise is held
 * until consumed by `awaitProvisioning`; subsequent calls for the same slug
 * after consumption see no entry and fall through to the agentExists
 * fast-check.
 */
export function startProvisioning(
  slug: string,
  promise: Promise<ProvisionResult>,
): void {
  STORE.set(slug, promise);
}

/**
 * Wait for provisioning to complete (Promise resolution) or fall back to
 * checking agentExists if no Promise is registered (cold-start path).
 * Returns:
 *  - `ready` with the result when the Promise resolves before the timeout
 *  - `ready` via_fallback when the Map was empty but both expected agents
 *    are present on disk (process restart, work is done)
 *  - `no-agents` when the Map was empty AND agents are NOT present (cold
 *    start before any provisioning ever happened — caller should error)
 *  - `timeout` when the Promise didn't resolve within timeoutMs
 */
export async function awaitProvisioning(
  slug: string,
  timeoutMs: number,
): Promise<AwaitResult> {
  const existing = STORE.get(slug);

  if (existing) {
    try {
      const result = await Promise.race([
        existing.then((r) => ({ kind: "ready" as const, result: r })),
        new Promise<{ kind: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ kind: "timeout" }), timeoutMs),
        ),
      ]);
      if (result.kind === "ready") {
        STORE.delete(slug);
        return { kind: "ready", via_fallback: false, result: result.result };
      }
      return { kind: "timeout" };
    } catch {
      // Promise rejected. Treat as "not ready" — caller can decide to retry.
      STORE.delete(slug);
      return { kind: "timeout" };
    }
  }

  // Cold-start path: check whether the expected agents exist on disk.
  const cmoId = `${slug}-cmo`;
  const googleAdsId = `${slug}-google-ads`;
  const [hasCmo, hasGoogleAds] = await Promise.all([
    agentExists(cmoId),
    agentExists(googleAdsId),
  ]);
  if (hasCmo && hasGoogleAds) {
    return { kind: "ready", via_fallback: true };
  }
  return { kind: "no-agents", via_fallback: true };
}

/**
 * Drop any in-flight or stale provisioning Promise for a slug. Called by
 * deleteProjectAction so a deleted project doesn't leak its Promise entry
 * in the global Map (and so re-creating a project with the same slug
 * later starts from a clean state).
 */
export function clearProvisioning(slug: string): void {
  STORE.delete(slug);
}

/** Test helper: drain the global Map. Never call in production code. */
export function __resetProvisioningForTesting(): void {
  STORE.clear();
}
