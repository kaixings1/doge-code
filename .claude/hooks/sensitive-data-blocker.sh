#!/bin/bash
# Sensitive Data Blocker Hook (PreToolUse - Bash)
# Blocks database queries that reference sensitive PII fields like TIN, SSN, etc.
# Even encrypted values must never be exposed.
# Exit code 2 = BLOCK the action.

# Thin wrapper: detection lives in sensitive_data.py, because MSYS2 corrupts
# regex arguments passed from bash (see hook-lib.sh for details).

. "$(dirname "$0")/hook-lib.sh"

PY=$(hook_python) || exit 0

"$PY" "$(dirname "$0")/sensitive_data.py" input
exit $?
