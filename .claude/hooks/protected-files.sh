#!/bin/bash
# Protected Files Guard (PreToolUse - Edit/Write)
# Thin wrapper: all matching lives in protected-files.py, because MSYS2 corrupts
# regex/escape arguments passed from bash (see hook-lib.sh for details).
# Exit code 2 = BLOCK.

. "$(dirname "$0")/hook-lib.sh"

PY=$(hook_python) || exit 0

"$PY" "$(dirname "$0")/protected-files.py"
exit $?
