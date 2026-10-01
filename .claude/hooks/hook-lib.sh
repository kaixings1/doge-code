#!/bin/bash
# Shared helpers for bash hooks.
#
# Why this exists: MSYS2 on Windows mangles `grep -E` brace quantifiers and
# collapses multi-line `python3 -c "..."` scripts into a single line. Both broke
# the hooks silently. All JSON parsing and regex matching is therefore delegated
# to standalone Python helpers invoked by absolute path.
#
# Usage:
#   . "$(dirname "$0")/hook-lib.sh"
#   PY=$(hook_python) || exit 0
#   FILE_PATH=$(printf '%s' "$INPUT" | hook_field "$PY" file_path)
#
#   if printf '%s' "$TEXT" | hook_match "$PY" '<regex>'; then ... fi

# Locate a working Python interpreter, preferring an absolute path so MSYS2
# does not wrap it. Returns non-zero when none is found (hooks fail open).
hook_python() {
    for c in /d/Python312/python.exe python.exe /c/Python312/python.exe; do
        if command -v "$c" >/dev/null 2>&1; then
            printf '%s' "$c"
            return 0
        fi
    done
    return 1
}

# hook_field <python> <key>...  — reads hook JSON on stdin, prints one line per key.
hook_field() {
    local py="$1"
    shift
    "$py" "$(dirname "${BASH_SOURCE[0]}")/hook-input.py" "$@"
}

# hook_match <python> <regex>  — reads text on stdin, returns 0 when it matches.
hook_match() {
    local py="$1"
    local pattern="$2"
    "$py" "$(dirname "${BASH_SOURCE[0]}")/hook-match.py" "$pattern"
}
