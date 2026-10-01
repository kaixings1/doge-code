#!/bin/bash
# Secret Blocker Hook (PreToolUse - Write/Edit)
# Blocks file writes that contain hardcoded secrets, API keys, or credentials.
# Exit code 2 = BLOCK the action.
#
# NOTE: MSYS2 mangles `grep -E` brace quantifiers ({20,}) and `python3` pipes,
# so all matching is delegated to a standalone Python helper invoked by absolute
# path. Do not inline regex into this script.

PY=""
for c in /d/Python312/python.exe python.exe /c/Python312/python.exe; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  # No Python available: fail open rather than blocking every edit.
  exit 0
fi

INPUT=$(cat)

printf '%s' "$INPUT" | "$PY" "$(dirname "$0")/secret-scanner.py"
RC=$?

if [ "$RC" -eq 2 ]; then
  exit 2
fi
exit 0
