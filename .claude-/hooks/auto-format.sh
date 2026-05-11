#!/bin/bash
# Auto-Format Hook (PostToolUse - Edit/Write)
# Runs the appropriate formatter on files after they're modified.

INPUT=$(cat)

# Extract the file path
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    inp = data.get('tool_input', {})
    print(inp.get('file_path', ''))
except:
    pass
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

case "$EXT" in
    cs)
        # .NET files — run dotnet format on the file (quiet, no restore)
        PROJECT_DIR=$(echo "$FILE_PATH" | grep -oE '.*/src/[^/]+/')
        if [ -n "$PROJECT_DIR" ] && [ -f "${PROJECT_DIR}*.csproj" ] 2>/dev/null; then
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
