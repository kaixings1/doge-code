/**
 * Per-slug in-memory provisioning progress, published by
 * `ensureProjectAgents` and consumed by the onboarding "Setting up your
 * agents…" screen. Each step (CMO, Google Ads, gateway registration)
 * transitions pending → in_progress → done so the UI can render a live
 * checklist instead of a single opaque spinner.
 *
 * Pattern matches `provisioning-state.ts`: globalThis-pinned Map that
 * survives Next.js dev hot-reload. Single-process invariant holds
 * because the CLI launches one Next.js server per user.
 */

export type ProgressStatus = "pending" | "in_progress" | "done" | "failed";

export type ProgressStep = {
  /** Stable key — `cmo`, `google_ads`, `seo`, `gateway`. */
  key: string;
  /** Human label rendered as the row text. */
  label: string;
  status: ProgressStatus;
  error?: string;
};

export type ProvisioningProgress = {
  slug: string;
  steps: ProgressStep[];
  /** Overall verdict — `running` until every step is terminal. */
  overall: "running" | "done" | "failed";
};

const GLOBAL_KEY = "__notfair_cmo_provisioning_progress__";
type GlobalSlot = { store?: Map<string, ProgressStep[]> };
const slot = globalThis as unknown as Record<string, GlobalSlot>;
const STORE: Map<string, ProgressStep[]> =
  (slot[GLOBAL_KEY] ??= {}).store ??
  ((slot[GLOBAL_KEY] as GlobalSlot).store = new Map());

export function initProgress(slug: string, steps: ProgressStep[]): void {
  STORE.set(
    slug,
    steps.map((s) => ({ ...s })),
  );
}

export function updateStep(
  slug: string,
  key: string,
  patch: Partial<Pick<ProgressStep, "status" | "error">>,
): void {
  const steps = STORE.get(slug);
  if (!steps) return;
  const idx = steps.findIndex((s) => s.key === key);
  if (idx < 0) return;
  steps[idx] = { ...steps[idx]!, ...patch };
}

export function getProgress(slug: string): ProvisioningProgress | null {
  const steps = STORE.get(slug);
  if (!steps) return null;
  const overall = steps.some((s) => s.status === "failed")
    ? "failed"
    : steps.every((s) => s.status === "done")
      ? "done"
      : "running";
  return { slug, steps: steps.map((s) => ({ ...s })), overall };
}

export function clearProgress(slug: string): void {
  STORE.delete(slug);
}

/** Test helper: drain the global Map. */
export function __resetProgressForTesting(): void {
  STORE.clear();
}
