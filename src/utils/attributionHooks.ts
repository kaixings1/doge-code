import { writeFileSync } from 'fs'
import { join } from 'path'
import { logForDebugging } from '../debug.js'

/**
 * In-memory cache for per-file attribution content, keyed by absolute path.
 * Populated during attribution calculation and swept after each compaction.
 */
const fileContentCache = new Map<string, { content: string; timestamp: number }>()

/**
 * Maximum age (ms) for cached file content before it is considered stale.
 */
const FILE_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Register git hooks that enable automatic commit-attribution tracking.
 *
 * Installs a `prepare-commit-msg` hook in the current repository (if inside
 * one) so that every commit message is annotated with Claude Code contribution
 * metadata.  The hook is idempotent — re-running is safe.
 *
 * File-system work is deferred to the next tick so this function can be
 * called synchronously from setup.ts without blocking.
 */
export function registerAttributionHooks(): void {
  setImmediate(async () => {
    try {
      const { findGitRoot } = await import('./git.js')
      const { getCwd } = await import('./cwd.js')
      const cwd = getCwd()
      const gitRoot = findGitRoot(cwd)

      if (!gitRoot) {
        logForDebugging('registerAttributionHooks: not in a git repo, skipping')
        return
      }

      const hookPath = join(gitRoot, '.git', 'hooks', 'prepare-commit-msg')
      const hookScript = getAttributionHookScript()

      writeFileSync(hookPath, hookScript, { mode: 0o755 })
      logForDebugging(`registerAttributionHooks: installed hook at ${hookPath}`)
    } catch (error) {
      logForDebugging(
        `registerAttributionHooks: failed — ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}

/**
 * Clear all in-memory attribution caches.
 *
 * Called on app shutdown or when a fresh attribution calculation is needed.
 */
export function clearAttributionCaches(): void {
  fileContentCache.clear()
  logForDebugging('clearAttributionCaches: fileContentCache cleared')
}

/**
 * Remove stale entries from the per-file content cache.
 *
 * Called after each conversation compaction to bound memory growth.  Only
 * entries older than {@link FILE_CONTENT_CACHE_TTL_MS} are removed.
 */
export function sweepFileContentCache(): void {
  const now = Date.now()
  let swept = 0
  for (const [key, entry] of fileContentCache.entries()) {
    if (now - entry.timestamp > FILE_CONTENT_CACHE_TTL_MS) {
      fileContentCache.delete(key)
      swept++
    }
  }
  if (swept > 0) {
    logForDebugging(`sweepFileContentCache: removed ${swept} stale entries`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAttributionHookScript(): string {
  return `#!/bin/sh
# Claude Code attribution hook — added by registerAttributionHooks()
# Appends Claude contribution metadata to commit messages.

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
SHA1="$3"

# Only process normal commits (not merges, amend, or squash)
case "$COMMIT_SOURCE" in
  message|template|commit|merge) ;;
  *) exit 0 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$(dirname "$SCRIPT_DIR")/../.."

if [ -f "$CLAUDE_DIR/.claude-attribution-enabled" ]; then
  node "$CLAUDE_DIR/src/utils/attributionHooks.js" inject-trailer "$COMMIT_MSG_FILE" "$SHA1" 2>/dev/null || true
fi

exit 0
`
}
