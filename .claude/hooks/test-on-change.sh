#!/bin/bash
# Test Runner Hook (PostToolUse - Edit/Write)
# Suggests running related tests when source files are modified.
# Does NOT auto-run tests (too slow) — just reminds which tests to run.

# Path matching lives in test-on-change.py: MSYS2 corrupts `grep -E` patterns
# passed from bash (see hook-lib.sh for details).

. "$(dirname "$0")/hook-lib.sh"

PY=$(hook_python) || exit 0

"$PY" "$(dirname "$0")/test-on-change.py"
exit 0
