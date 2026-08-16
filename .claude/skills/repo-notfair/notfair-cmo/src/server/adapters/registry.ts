import type { HarnessAdapter, HarnessAdapterId } from "./types";
import { claudeCodeLocalAdapter } from "./claude-code-local";
import { codexLocalAdapter } from "./codex-local";

const adapters = new Map<HarnessAdapterId, HarnessAdapter>();

function registerBuiltins(): void {
  adapters.set(claudeCodeLocalAdapter.id, claudeCodeLocalAdapter);
  adapters.set(codexLocalAdapter.id, codexLocalAdapter);
}
registerBuiltins();

export function getAdapter(id: HarnessAdapterId): HarnessAdapter | null {
  return adapters.get(id) ?? null;
}

export function requireAdapter(id: HarnessAdapterId): HarnessAdapter {
  const hit = adapters.get(id);
  if (!hit) {
    throw new Error(`Unknown harness adapter: ${id}`);
  }
  return hit;
}

export function listAdapters(): HarnessAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Default adapter used when a project hasn't picked one. Claude Code is the
 * recommended default per the onboarding UX.
 */
export const DEFAULT_HARNESS_ADAPTER: HarnessAdapterId = "claude-code-local";

export function isHarnessAdapterId(value: unknown): value is HarnessAdapterId {
  return value === "claude-code-local" || value === "codex-local";
}
