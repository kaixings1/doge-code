#!/bin/bash
# Regression suite for the bash hooks.
#
# Run:  bash .claude/hooks/test-hooks.sh
#
# Guards the MSYS2 fixes: every hook must still block its bad input and allow
# its clean input. Fixtures live in ./fixtures.

cd "$(dirname "$0")/../.." || exit 1
H=.claude/hooks
FIX="$H/fixtures"
pass=0
fail=0

# Keep fixture task ids out of the real task queue.
export HOOK_LOG_DIR="$H/fixtures/logs"
rm -rf "$HOOK_LOG_DIR"
trap 'rm -rf "$HOOK_LOG_DIR"' EXIT

run() {
  local label="$1" script="$2" input="$3" expect="$4"
  BASH_ENV= bash "$H/$script" < "$FIX/$input" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" = "$expect" ]; then
    echo "PASS  $label"
    pass=$((pass + 1))
  else
    echo "FAIL  $label  expected=$expect got=$rc"
    fail=$((fail + 1))
  fi
}

echo "--- 拦截型（期望 rc=2）---"
run "secret-blocker(AWS)"        secret-blocker.sh                aws.json          2
run "sensitive-blocker"          sensitive-data-blocker.sh        pii.json          2
run "output-blocker"             sensitive-data-output-blocker.sh pii.json          2
run "mcp-blocker"                sensitive-data-mcp-blocker.sh    mcp.json          2
run "protected-files"            protected-files.sh               prod-config.json  2

echo "--- 放行型（期望 rc=0）---"
run "secret-blocker(clean)"      secret-blocker.sh                clean.json        0
run "sensitive-blocker(clean)"   sensitive-data-blocker.sh        clean.json        0
run "output-blocker(clean)"      sensitive-data-output-blocker.sh clean.json        0
run "mcp-blocker(clean)"         sensitive-data-mcp-blocker.sh    clean.json        0
run "protected-files(clean)"     protected-files.sh               clean.json        0
run "test-on-change(src)"        test-on-change.sh                source.cs.json    0
run "auto-executor"              auto-executor.sh                 task-created.json 0

echo
echo "通过 $pass / 失败 $fail"
[ "$fail" -eq 0 ]
