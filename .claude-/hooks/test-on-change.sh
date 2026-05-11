#!/bin/bash
# Test Runner Hook (PostToolUse - Edit/Write)
# Suggests running related tests when source files are modified.
# Does NOT auto-run tests (too slow) — just reminds which tests to run.

INPUT=$(cat)

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

EXT="${FILE_PATH##*.}"

# Only suggest for source files, not tests or configs
if echo "$FILE_PATH" | grep -qE '(Test|test|spec|__tests__)'; then
    exit 0
fi

case "$EXT" in
    cs)
        if echo "$FILE_PATH" | grep -q "Glasswing"; then
            echo "Run: dotnet test src/Glasswing.Tests/ --filter \"$(basename ${FILE_PATH%.cs})\""
        elif echo "$FILE_PATH" | grep -q "Monarch"; then
            echo "Run: dotnet test src/Monarch.Tests/ --filter \"$(basename ${FILE_PATH%.cs})\""
        fi
        ;;
    ts|tsx)
        if echo "$FILE_PATH" | grep -q "glasswing-client"; then
            echo "Run: cd src/glasswing-client && npx vitest run --reporter=verbose"
        elif echo "$FILE_PATH" | grep -q "monarch-client"; then
            echo "Run: cd src/monarch-client && npx vitest run --reporter=verbose"
        fi
        ;;
esac

exit 0
