#!/usr/bin/env python3
"""Extract the .../src/<project>/ prefix from a file path.

Replaces `grep -oE '.*/src/[^/]+/'`, whose pattern MSYS2 corrupts when passed
from bash. Reads the path on stdin, prints the prefix (empty when not found).
"""
import re
import sys

PATTERN = re.compile(r'^(.*/src/[^/]+/)')


def main():
    match = PATTERN.search(sys.stdin.read().strip())
    print(match.group(1) if match else '')
    return 0


if __name__ == '__main__':
    sys.exit(main())
