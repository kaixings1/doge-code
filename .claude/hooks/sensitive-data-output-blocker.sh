#!/bin/bash
# Sensitive Data Output Blocker Hook (PostToolUse - Bash, Read, Grep, MCP DB tools)
# Scans tool output for sensitive PII field names that may have been returned
# by broad database queries, file reads of seed/dump data, or grep results.
# Exit code 2 = BLOCK (prevents the output from being used).

# Thin wrapper: detection lives in sensitive_data.py, because MSYS2 corrupts
# regex arguments passed from bash (see hook-lib.sh for details).

. "$(dirname "$0")/hook-lib.sh"

PY=$(hook_python) || exit 0

"$PY" "$(dirname "$0")/sensitive_data.py" output
exit $?
