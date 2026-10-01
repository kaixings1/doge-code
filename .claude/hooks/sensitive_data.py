#!/usr/bin/env python3
"""Shared PII field detection for the sensitive-data hooks.

Usage:
    sensitive_data.py input   < hook_json   # PreToolUse: scan the command / MCP args
    sensitive_data.py output  < hook_json   # PostToolUse: scan tool output text
    sensitive_data.py mcp     < hook_json   # PreToolUse: scan MCP tool arguments

Exit 2 = block. Python rather than grep -E because MSYS2 rewrites brace
quantifiers and escaped dots in regex arguments passed from bash.
"""
import json
import re
import sys

FIELDS = (
    'TIN', 'Tin', 'TaxId', 'TaxIdentificationNumber', 'EIN', 'SSN',
    'SocialSecurityNumber', 'Social', 'EncryptedTin', 'EncryptedSSN',
    'EncryptedTaxId', 'BankAccountNumber', 'AccountNumber', 'RoutingNumber',
)

# output: "TIN": / 'TIN': / .TIN = / TIN: at line start or after whitespace
OUTPUT_PATTERNS = [
    re.compile(r'"(?:' + '|'.join(FIELDS) + r')"\s*:'),
    re.compile(r"'(" + '|'.join(FIELDS) + r")'\s*:"),
    re.compile(r'\.(?:' + '|'.join(FIELDS) + r')\s*='),
    re.compile(r'(?:^|\s)(?:' + '|'.join(FIELDS) + r'):\s', re.MULTILINE),
]

# input/mcp: bare field names anywhere
WORD_PATTERN = re.compile(r'\b(?:' + '|'.join(FIELDS) + r')\b')

MONGO_PATTERN = re.compile(r'mongosh|mongo ')


def read_json():
    try:
        return json.loads(sys.stdin.read())
    except Exception:
        return {}


def output_text(data):
    result = data.get('tool_result', '')
    if isinstance(result, dict):
        text = result.get('stdout', '') or result.get('content', '')
        return text if text else json.dumps(result)
    if isinstance(result, str):
        return result
    return str(result)


def block(lines):
    for line in lines:
        print(line)
    return 2


def cmd_input(data):
    inp = data.get('tool_input') or {}
    command = inp.get('command', '')
    if not command or not MONGO_PATTERN.search(command):
        return 0
    if WORD_PATTERN.search(command):
        return block([
            'BLOCKED: Database query references a sensitive PII field (TIN, SSN, bank account, etc.)',
            'These fields contain encrypted sensitive data that must never be queried or displayed.',
            'Use explicit inclusion projections with only non-sensitive fields.',
            'If you need to work with this data, use the application UI instead.',
        ])
    return 0


def cmd_output(data):
    text = output_text(data)
    if not text:
        return 0
    if any(p.search(text) for p in OUTPUT_PATTERNS):
        return block([
            'BLOCKED: Output contains sensitive PII fields (TIN, SSN, bank account, etc.)',
            'The output includes documents or data with sensitive fields.',
            'For database queries: use an explicit inclusion projection listing only non-sensitive fields.',
            'For code searches: avoid reading seed data, test fixtures, or dump files containing PII.',
            'If you need to work with this data, use the application UI instead.',
        ])
    return 0


def cmd_mcp(data):
    inp = json.dumps(data.get('tool_input') or {})
    if WORD_PATTERN.search(inp):
        return block([
            'BLOCKED: MCP database query references a sensitive PII field (TIN, SSN, bank account, etc.)',
            'These fields contain encrypted sensitive data that must never be queried or displayed.',
            'Use explicit inclusion projections with only non-sensitive fields.',
            'If you need to work with this data, use the application UI instead.',
        ])
    return 0


MODES = {'input': cmd_input, 'output': cmd_output, 'mcp': cmd_mcp}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in MODES:
        return 0
    return MODES[sys.argv[1]](read_json())


if __name__ == '__main__':
    sys.exit(main())
