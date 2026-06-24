#!/bin/bash
# Sensitive Data MCP Blocker Hook (PreToolUse - MCP MongoDB/MSSQL/Postgres tools)
# Blocks MCP database tool calls that reference sensitive PII fields.
# Even encrypted values must never be exposed.
# Exit code 2 = BLOCK the action.

# Read the tool input from stdin
INPUT=$(cat)

# Extract tool name and full input JSON
TOOL_INFO=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    inp = json.dumps(data.get('tool_input', {}))
    print(f'{tool}\n{inp}')
except:
    pass
" 2>/dev/null)

TOOL_NAME=$(echo "$TOOL_INFO" | head -1)
TOOL_INPUT=$(echo "$TOOL_INFO" | tail -1)

if [ -z "$TOOL_NAME" ]; then
    exit 0
fi

# Case-insensitive check for sensitive field names anywhere in the tool input
SENSITIVE_PATTERN='\b(TIN|Tin|TaxId|TaxIdentificationNumber|EIN|SSN|SocialSecurityNumber|Social|EncryptedTin|EncryptedSSN|EncryptedTaxId|BankAccountNumber|AccountNumber|RoutingNumber)\b'

if echo "$TOOL_INPUT" | grep -qE "$SENSITIVE_PATTERN"; then
    echo "BLOCKED: MCP database query references a sensitive PII field (TIN, SSN, bank account, etc.)"
    echo "These fields contain encrypted sensitive data that must never be queried or displayed."
    echo "Use explicit inclusion projections with only non-sensitive fields."
    echo "If you need to work with this data, use the application UI instead."
    exit 2
fi

exit 0
