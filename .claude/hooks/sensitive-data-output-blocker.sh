#!/bin/bash
# Sensitive Data Output Blocker Hook (PostToolUse - Bash, Read, Grep, MCP DB tools)
# Scans tool output for sensitive PII field names that may have been returned
# by broad database queries, file reads of seed/dump data, or grep results.
# Exit code 2 = BLOCK (prevents the output from being used).

# Read the tool result from stdin
INPUT=$(cat)

# Extract output from any tool type (Bash stdout, Read content, Grep results, MCP results)
OUTPUT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    result = data.get('tool_result', '')

    # Handle different result shapes
    if isinstance(result, dict):
        # Bash tool: check stdout
        text = result.get('stdout', '')
        # MCP/other tools: check content or stringify the whole result
        if not text:
            text = result.get('content', '')
        if not text:
            text = json.dumps(result)
    elif isinstance(result, str):
        text = result
    else:
        text = str(result)

    print(text)
except:
    pass
" 2>/dev/null)

if [ -z "$OUTPUT" ]; then
    exit 0
fi

# Check if output contains sensitive field names as keys (indicating PII was returned)
# These patterns match field names in JSON documents, MongoDB output, C# properties, etc.
SENSITIVE_PATTERNS=(
    # JSON/MongoDB style: "TIN": or 'TIN':
    '"(TIN|Tin|TaxId|TaxIdentificationNumber|EIN|SSN|SocialSecurityNumber|EncryptedTin|EncryptedSSN|EncryptedTaxId|BankAccountNumber|AccountNumber|RoutingNumber)"\s*:'
    # C# property style: .TIN = or .TaxId =
    '\.(TIN|TaxId|TaxIdentificationNumber|EIN|SSN|SocialSecurityNumber|EncryptedTin|EncryptedSSN|EncryptedTaxId|BankAccountNumber|AccountNumber|RoutingNumber)\s*='
    # YAML/config style: TIN: (start of line or after whitespace)
    '(^|\s)(TIN|TaxId|TaxIdentificationNumber|EIN|SSN|SocialSecurityNumber|EncryptedTin|EncryptedSSN|EncryptedTaxId|BankAccountNumber|AccountNumber|RoutingNumber):\s'
)

for PATTERN in "${SENSITIVE_PATTERNS[@]}"; do
    if echo "$OUTPUT" | grep -qE "$PATTERN"; then
        echo "BLOCKED: Output contains sensitive PII fields (TIN, SSN, bank account, etc.)"
        echo "The output includes documents or data with sensitive fields."
        echo "For database queries: use an explicit inclusion projection listing only non-sensitive fields."
        echo "For code searches: avoid reading seed data, test fixtures, or dump files containing PII."
        echo "If you need to work with this data, use the application UI instead."
        exit 2
    fi
done

exit 0
