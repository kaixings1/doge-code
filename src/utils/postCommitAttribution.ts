import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logForDebugging } from './debug.js'

/**
 * Install a `prepare-commit-msg` hook in a git worktree so that commit messages
 * are automatically annotated with Claude Code attribution trailers.
 *
 * @param worktreePath  - Absolute path to the worktree's git working directory.
 * @param hooksDir      - Optional absolute path to the worktree's hooks dir.
 *                         Falls back to `<worktreePath>/.git/hooks` when omitted.
 */
export async function installPrepareCommitMsgHook(
  worktreePath: string,
  hooksDir?: string,
): Promise<void> {
  const targetDir = hooksDir ?? join(worktreePath, '.git', 'hooks')
  const hookPath = join(targetDir, 'prepare-commit-msg')

  try {
    // Idempotent: if the hook already exists and is ours, skip.
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, 'utf-8')
      if (existing.includes('Claude Code attribution hook')) {
        logForDebugging(
          `installPrepareCommitMsgHook: hook already present at ${hookPath}, skipping`,
        )
        return
      }
    }

    const script = getPrepareCommitMsgScript(worktreePath)

    writeFileSync(hookPath, script, { mode: 0o755 })
    logForDebugging(
      `installPrepareCommitMsgHook: installed hook at ${hookPath}`,
    )
  } catch (error) {
    logForDebugging(
      `installPrepareCommitMsgHook: failed — ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrepareCommitMsgScript(worktreePath: string): string {
  // Escaped worktree path for use in shell strings.
  const escapedWorktree = worktreePath.replace(/'/g, "'\\''")

  return `#!/bin/sh
# Claude Code attribution hook — injected by installPrepareCommitMsgHook
# Appends contribution trailers to commit messages for internal repos.
#
# Invoked by git with: prepare-commit-msg <commit-msg-file> <commit-source> <sha1>

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
SHA1="$3"

# Only process normal commits (not merges, amend, or rebase continues)
case "$COMMIT_SOURCE" in
  message|template|commit|merge) ;;
  *) exit 0 ;;
esac

# Resolve the Claude Code installation directory relative to this hook.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_ROOT="$(dirname "$SCRIPT_DIR")/../.."

# Check if attribution is enabled for this repo.
if [ ! -f "$CLAUDE_ROOT/.claude-attribution-enabled" ]; then
  exit 0
fi

# Delegate to the Node.js attribution engine to build trailers.
# The engine checks the internal-repo allowlist itself.
node "$CLAUDE_ROOT/src/utils/attributionTrailer.js" \\
  --worktree '${escapedWorktree}' \\
  --sha1 "$SHA1" \\
  --commit-msg-file "$COMMIT_MSG_FILE" 2>/dev/null || true

exit 0
`
}
