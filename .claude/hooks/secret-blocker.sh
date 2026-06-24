#!/bin/bash
# Secret Blocker Hook (PreToolUse - Write/Edit)
# Blocks file writes that contain hardcoded secrets, API keys, or credentials.
# Exit code 2 = BLOCK the action.

# Read the tool input from stdin
INPUT=$(cat)

# Extract the file content being written (new_string for Edit, content for Write)
CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    inp = data.get('tool_input', {})
    if tool == 'Write':
        print(inp.get('content', ''))
    elif tool == 'Edit':
        print(inp.get('new_string', ''))
except:
    pass
" 2>/dev/null)

if [ -z "$CONTENT" ]; then
    exit 0
fi

# Patterns that indicate hardcoded secrets
BLOCKED=false
REASON=""

# MongoDB connection strings with credentials
if echo "$CONTENT" | grep -qE 'mongodb\+srv://[^$\{]+:[^$\{]+@'; then
    BLOCKED=true
    REASON="Hardcoded MongoDB connection string with credentials"
fi

# AWS keys
if echo "$CONTENT" | grep -qE 'AKIA[0-9A-Z]{16}'; then
    BLOCKED=true
    REASON="AWS access key detected"
fi

# Stripe secret keys (not env var references)
if echo "$CONTENT" | grep -qE 'sk_live_[a-zA-Z0-9]{20,}'; then
    BLOCKED=true
    REASON="Stripe live secret key detected"
fi

# Private keys
if echo "$CONTENT" | grep -qE 'BEGIN (RSA |EC |DSA )?PRIVATE KEY'; then
    BLOCKED=true
    REASON="Private key detected"
fi

# Generic password assignments (but not placeholder patterns)
if echo "$CONTENT" | grep -qiE '"(password|secret|apikey|api_key|token)"\s*:\s*"[^$\{\}][^"]{8,}"' | grep -vqE 'Admin123!|Test123|placeholder|your-.*-here|xxx'; then
    BLOCKED=true
    REASON="Possible hardcoded credential"
fi

if [ "$BLOCKED" = true ]; then
    echo "BLOCKED: $REASON"
    echo "Use environment variables or Azure Key Vault instead of hardcoding secrets."
    exit 2
fi

exit 0
