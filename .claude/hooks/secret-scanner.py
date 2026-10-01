#!/usr/bin/env python3
"""Secret scanner for the secret-blocker PreToolUse hook.

Reads the Claude Code hook payload on stdin, extracts the content being written,
and exits 2 (with a reason on stdout) if a hardcoded secret is detected.

Kept as a standalone file because MSYS2 mangles brace quantifiers in `grep -E`
and corrupts multi-line `python3 -c` scripts piped through bash.
"""
import json
import re
import sys

PATTERNS = [
    (re.compile(r'mongodb\+srv://[^$\{]+:[^$\{]+@'),
     'Hardcoded MongoDB connection string with credentials'),
    (re.compile(r'AKIA[0-9A-Z]{16}'),
     'AWS access key detected'),
    (re.compile(r'sk_live_[a-zA-Z0-9]{20,}'),
     'Stripe live secret key detected'),
    (re.compile(r'BEGIN (RSA |EC |DSA )?PRIVATE KEY'),
     'Private key detected'),
]

# Generic credential assignments, excluding obvious placeholders.
CREDENTIAL = re.compile(
    r'"(password|secret|apikey|api_key|token)"\s*:\s*"[^$\{\}][^"]{8,}"',
    re.IGNORECASE,
)
PLACEHOLDER = re.compile(
    r'Admin123!|Test123|placeholder|your-.*-here|xxx',
    re.IGNORECASE,
)


def extract(raw):
    try:
        data = json.loads(raw)
    except Exception:
        return ''
    tool = data.get('tool_name', '')
    inp = data.get('tool_input', {}) or {}
    if tool == 'Write':
        return inp.get('content', '') or ''
    if tool == 'Edit':
        return inp.get('new_string', '') or ''
    return ''


def main():
    content = extract(sys.stdin.read())
    if not content:
        return 0

    for pattern, reason in PATTERNS:
        if pattern.search(content):
            print('BLOCKED: ' + reason)
            print('Use environment variables or Azure Key Vault instead of hardcoding secrets.')
            return 2

    if CREDENTIAL.search(content) and not PLACEHOLDER.search(content):
        print('BLOCKED: Possible hardcoded credential')
        print('Use environment variables or Azure Key Vault instead of hardcoding secrets.')
        return 2

    return 0


if __name__ == '__main__':
    sys.exit(main())
