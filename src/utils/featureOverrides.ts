/**
 * Runtime feature override system.
 *
 * Architecture:
 * - Compile-time: `feature('X')` from `bun:bundle` does DCE — false branches are
 *   physically removed from the compiled binary. These CANNOT be resurrected at runtime.
 *
 * - Runtime: Many features have ADDITIONAL `process.env['CLAUDE_CODE_FEATURE_X']`
 *   checks (in commands.ts conditionalCommands, main.tsx, cli.tsx, etc.).
 *   These CAN be controlled at runtime. This module provides:
 *     1. A registry of overridable features
 *     2. applyFeatureOverrides() — reads config and sets env vars BEFORE modules load
 *     3. getFeatureOverrides() — reads from project config
 */

// Features that can be toggled at runtime via env var.
// Only includes features whose runtime code is guarded by process.env checks
// (NOT solely by feature() DCE — those cannot be overridden).
export const OVERRIDABLE_FEATURES = [
  'KAIROS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'KAIROS_PUSH_NOTIFICATION',
  'KAIROS_GITHUB_WEBHOOKS',
  'BRIDGE_MODE',
  'CCR_MIRROR',
  'CCR_AUTO_CONNECT',
  'CCR_REMOTE_SETUP',
  'PROACTIVE',
  'TRANSCRIPT_CLASSIFIER',
  'EXPERIMENTAL_SKILL_SEARCH',
  'MCP_SKILLS',
  'WORKFLOW_SCRIPTS',
  'UDS_INBOX',
  'DAEMON',
  'HISTORY_SNIP',
  'VOICE_MODE',
  'TORCH',
  'FORK_SUBAGENT',
  'BG_SESSIONS',
  'TEMPLATES',
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'COORDINATOR_MODE',
  'EXTRACT_MEMORIES',
  'CACHED_MICROCOMPACT',
  'FILE_PERSISTENCE',
  'DOWNLOAD_USER_SETTINGS',
  'LODESTONE',
  'DIRECT_CONNECT',
  'SSH_REMOTE',
  'UPLOAD_USER_SETTINGS',
  'CHICAGO_MCP',
  'WEB_BROWSER_TOOL',
  'HARD_FAIL',
  'OVERFLOW_TEST_TOOL',
  'CONTEXT_COLLAPSE',
  'TERMINAL_PANEL',
  'COMMIT_ATTRIBUTION',
  'STREAMLINED_OUTPUT',
  'TEAMMEM',
  'AGENT_MEMORY_SNAPSHOT',
  'ABLATION_BASELINE',
  'SELF_HOSTED_RUNNER',
  'BYOC_ENVIRONMENT_RUNNER',
  'WEBHOOKS',
  'PEERS',
] as const

export type OverridableFeatureName = (typeof OVERRIDABLE_FEATURES)[number]

const envKey = (name: string) => `CLAUDE_CODE_FEATURE_${name.toUpperCase()}`

/**
 * Apply feature overrides from a record. Sets process.env for each feature.
 * MUST be called before any module that checks CLAUDE_CODE_FEATURE_* env vars
 * is imported.
 */
export function applyFeatureOverrides(overrides: Record<string, boolean> | undefined): void {
  if (!overrides) return
  for (const [name, enabled] of Object.entries(overrides)) {
    if (OVERRIDABLE_FEATURES.includes(name as OverridableFeatureName)) {
      process.env[envKey(name)] = enabled ? '1' : '0'
    }
  }
}

/**
 * Read feature overrides from project config.
 * Reads raw JSON to avoid configReadingAllowed guard.
 */
export function getFeatureOverrides(): Record<string, boolean> {
  try {
    const { getCurrentProjectConfig } = require('./config.js') as {
      getCurrentProjectConfig: () => { featureOverrides?: Record<string, boolean> }
    }
    return getCurrentProjectConfig().featureOverrides ?? {}
  } catch {
    return {}
  }
}

/**
 * Clear all feature override env vars (for testing).
 */
export function clearFeatureOverrides(): void {
  for (const name of OVERRIDABLE_FEATURES) {
    delete process.env[envKey(name)]
  }
}
