#!/bin/bash
# Protected Files Guard (PreToolUse - Edit/Write)
# Warns before modifying critical files. Exit code 2 = BLOCK.

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

# Files that should never be modified without explicit intent
BLOCKED_FILES=(
    "appsettings.Production.json"
    "appsettings.Staging.json"
)

for blocked in "${BLOCKED_FILES[@]}"; do
    if echo "$FILE_PATH" | grep -q "$blocked"; then
        echo "BLOCKED: Cannot modify production/staging config: $blocked"
        echo "If you need to change production settings, do it in Azure App Configuration or Key Vault."
        exit 2
    fi
done

# Files that trigger a warning (but allow the edit)
WARN_FILES=(
    "CLAUDE.md"
    ".gitignore"
    "azure-pipelines.yml"
    "staticwebapp.config.json"
    "Program.cs"
    "DependencyInjection.cs"
)

for warn in "${WARN_FILES[@]}"; do
    if echo "$FILE_PATH" | grep -q "$warn"; then
        echo "WARNING: Modifying critical file: $warn — make sure this change is intentional."
    fi
done

exit 0
