#!/usr/bin/env python3
"""Test Runner Hook (PostToolUse - Edit/Write).

Suggests related test commands when a source file is modified. Never runs tests
itself (too slow). Exit code is always 0 — this hook only prints reminders.

Path matching is done here rather than in bash because MSYS2 rewrites regular
expressions passed as command-line arguments.
"""
import json
import os
import re
import sys

TEST_PATH = re.compile(r'(Test|test|spec|__tests__)')


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        return 0

    file_path = (data.get('tool_input') or {}).get('file_path', '') or ''
    if not file_path or TEST_PATH.search(file_path):
        return 0

    ext = os.path.splitext(file_path)[1].lstrip('.').lower()
    stem = os.path.splitext(os.path.basename(file_path))[0]

    if ext == 'cs':
        if 'Glasswing' in file_path:
            print('Run: dotnet test src/Glasswing.Tests/ --filter "%s"' % stem)
        elif 'Monarch' in file_path:
            print('Run: dotnet test src/Monarch.Tests/ --filter "%s"' % stem)
    elif ext in ('ts', 'tsx'):
        if 'glasswing-client' in file_path:
            print('Run: cd src/glasswing-client && npx vitest run --reporter=verbose')
        elif 'monarch-client' in file_path:
            print('Run: cd src/monarch-client && npx vitest run --reporter=verbose')

    return 0


if __name__ == '__main__':
    sys.exit(main())
