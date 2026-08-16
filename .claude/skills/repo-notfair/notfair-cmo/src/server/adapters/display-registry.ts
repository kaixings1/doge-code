import type { HarnessAdapterId } from "./types";

/**
 * UI metadata for the harness adapters. Mirrors paperclip's
 * `adapter-display-registry.ts`. Drives the onboarding picker and any "you're
 * using X" UI surface.
 */
export interface HarnessDisplay {
  id: HarnessAdapterId;
  label: string;
  /** One-line description shown under the label on the picker card. */
  description: string;
  /** Show "Recommended" badge + put in the primary row of the picker. */
  recommended: boolean;
  /** Where to point a user who doesn't have the CLI installed. */
  installUrl: string;
  /** CLI binary name (for doctor checks, install hints). */
  binary: string;
}

// Insertion order is the display order — Object.values preserves it.
// Codex first + recommended; Claude Code second, available but not promoted.
export const HARNESS_DISPLAY: Record<HarnessAdapterId, HarnessDisplay> = {
  "codex-local": {
    id: "codex-local",
    label: "Codex",
    description: "Run agents through OpenAI's Codex CLI. Uses your existing codex login.",
    recommended: true,
    installUrl: "https://github.com/openai/codex",
    binary: "codex",
  },
  "claude-code-local": {
    id: "claude-code-local",
    label: "Claude Code",
    description: "Run agents through Anthropic's Claude Code CLI. Uses your existing claude login.",
    recommended: false,
    installUrl: "https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview",
    binary: "claude",
  },
};

export function listRecommendedHarnesses(): HarnessDisplay[] {
  return Object.values(HARNESS_DISPLAY).filter((h) => h.recommended);
}

export function listMoreHarnesses(): HarnessDisplay[] {
  return Object.values(HARNESS_DISPLAY).filter((h) => !h.recommended);
}

export function getHarnessDisplay(id: HarnessAdapterId): HarnessDisplay {
  return HARNESS_DISPLAY[id];
}
