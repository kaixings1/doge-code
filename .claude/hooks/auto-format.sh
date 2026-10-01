#!/bin/bash
# Auto-Format Hook (PostToolUse - Edit/Write)
# Runs the appropriate formatter on files after they're modified.

# Field extraction uses the shared helper: MSYS2 collapses the old multi-line
# `python3 -c` snippet into one line and raises IndentationError.

. "$(dirname "$0")/hook-lib.sh"

PY=$(hook_python) || exit 0

FILE_PATH=$(hook_field "$PY" file_path)
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

EXT="${FILE_PATH##*.}"

case "$EXT" in
    cs)
        # .NET files — run dotnet format on the file (quiet, no restore)
        PROJECT_DIR=$(printf '%s' "$FILE_PATH" | "$PY" "$(dirname "$0")/match-project-dir.py")
        if [ -n "$PROJECT_DIR" ] && ls "${PROJECT_DIR}"*.csproj >/dev/null 2>&1; then
            dotnet format "$PROJECT_DIR" --include "$FILE_PATH" --no-restore --verbosity quiet 2>/dev/null
        fi
        ;;
    ts|tsx|js|jsx)
        # TypeScript/JavaScript — find nearest node_modules and run eslint fix
        DIR=$(dirname "$FILE_PATH")
        while [ "$DIR" != "/" ]; do
            if [ -f "$DIR/node_modules/.bin/eslint" ]; then
                "$DIR/node_modules/.bin/eslint" --fix --quiet "$FILE_PATH" 2>/dev/null
                break
            fi
            DIR=$(dirname "$DIR")
        done
        ;;
esac

exit 0
