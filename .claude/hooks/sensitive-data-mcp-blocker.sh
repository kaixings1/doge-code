#!/bin/bash
# Sensitive Data MCP Blocker Hook (PreToolUse - MCP MongoDB/MSSQL/Postgres tools)
# Blocks MCP database tool calls that reference sensitive PII fields.
# Even encrypted values must never be exposed.
# Exit code 2 = BLOCK the action.

# Thin wrapper: detection lives in sensitive_data.py, because MSYS2 corrupts
# regex arguments passed from bash (see hook-lib.sh for details).

. "$(dirname "$0")/hook-lib.sh"

PY=$(hook_python) || exit 0

"$PY" "$(dirname "$0")/sensitive_data.py" mcp
exit $?
