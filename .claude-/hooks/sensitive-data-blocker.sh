#!/bin/bash
# Sensitive Data Blocker Hook (PreToolUse - Bash)
# Blocks database queries that reference sensitive PII fields like TIN, SSN, etc.
# Even encrypted values must never be exposed.
# Exit code 2 = BLOCK the action.

# Read the tool input from stdin
INPUT=$(cat)

# Extract the command being run
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    inp = data.get('tool_input', {})
    if tool == 'Bash':
        print(inp.get('command', ''))
except:
    pass
" 2>/dev/null)

if [ -z "$COMMAND" ]; then
    exit 0
fi

# Only check commands that interact with MongoDB
if ! echo "$COMMAND" | grep -qE 'mongosh|mongo '; then
    exit 0
fi

# Case-insensitive check for sensitive field names in the query
SENSITIVE_PATTERN='\b(TIN|Tin|TaxId|TaxIdentificationNumber|EIN|SSN|SocialSecurityNumber|Social|EncryptedTin|EncryptedSSN|EncryptedTaxId|BankAccountNumber|AccountNumber|RoutingNumber)\b'

if echo "$COMMAND" | grep -qE "$SENSITIVE_PATTERN"; then
    echo "BLOCKED: Database query references a sensitive PII field (TIN, SSN, bank account, etc.)"
    echo "These fields contain encrypted sensitive data that must never be queried or displayed."
    echo "Use explicit inclusion projections with only non-sensitive fields."
    echo "If you need to work with this data, use the application UI instead."
    exit 2
fi

exit 0
