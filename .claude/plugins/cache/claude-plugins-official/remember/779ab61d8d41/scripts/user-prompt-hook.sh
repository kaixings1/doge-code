#!/bin/bash
# ============================================================================
# user-prompt-hook.sh — UserPromptSubmit hook for the Remember plugin
# ============================================================================
#
# DESCRIPTION
#   Runs on every user prompt submission. Injects the current timestamp
#   so the agent knows what time it is during the conversation.
#
# USAGE
#   Called automatically by Claude Code's UserPromptSubmit hook system.
#   Not intended for manual invocation.
#
# ENVIRONMENT
#   CLAUDE_PLUGIN_ROOT   Plugin install directory (set by Claude Code)
#   CLAUDE_PROJECT_DIR   Project root (default: .)
#
# DEPENDENCIES
#   jq (for config.json reading via log.sh)
#   log.sh (for timezone, dispatch via hooks.d/)
#
# EXIT CODES
#   0   Always (hook must not block the agent)
#
# OUTPUT
#   Prints "[HH:MM TZ — username]" to stdout.
#
# ============================================================================

# --- Resolve paths ---
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-.}/.claude/remember}"
PROJECT="${CLAUDE_PROJECT_DIR:-.}"
PROJECT_DIR="$PROJECT"
source "$PLUGIN_ROOT/scripts/log.sh" 2>/dev/null

# --- Timestamp + context injection ---
CTX_PCT=""
if [ -f /tmp/claude-ctx-pct ]; then
  CTX_PCT=$(cat /tmp/claude-ctx-pct 2>/dev/null)
fi
if [ -n "$CTX_PCT" ]; then
  TIMESTAMP="[$(TZ="$REMEMBER_TZ" date '+%H:%M %Z') — $(whoami) — ${CTX_PCT}%]"
  echo "$TIMESTAMP"
  if [ "$CTX_PCT" -ge 95 ] 2>/dev/null; then
    echo "WARNING: Context at ${CTX_PCT}%. Run /remember to save session state before context death."
  fi
else
  echo "[$(TZ="$REMEMBER_TZ" date '+%H:%M %Z') — $(whoami)]"
fi

# ── Dispatch: after_user_prompt ─────────────────────────────────────────
dispatch "after_user_prompt"
