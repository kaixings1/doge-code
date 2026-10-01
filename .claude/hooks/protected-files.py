#!/usr/bin/env python3
"""Protected Files Guard (PreToolUse - Edit/Write).

Blocks edits to production/staging config, warns on other critical files.
Exit 2 = block, exit 0 = allow.

Python (not grep) because MSYS2 rewrites regex arguments passed from bash.
"""
import json
import os
import sys

BLOCKED = (
    'appsettings.Production.json',
    'appsettings.Staging.json',
)

WARN = (
    'CLAUDE.md',
    '.gitignore',
    'azure-pipelines.yml',
    'staticwebapp.config.json',
    'Program.cs',
    'DependencyInjection.cs',
)


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        return 0

    file_path = (data.get('tool_input') or {}).get('file_path', '') or ''
    if not file_path:
        return 0

    name = os.path.basename(file_path.rstrip('/\\'))

    for blocked in BLOCKED:
        if name == blocked or blocked in file_path:
            print('BLOCKED: Cannot modify production/staging config: ' + blocked)
            print('If you need to change production settings, do it in Azure App Configuration or Key Vault.')
            return 2

    for warn in WARN:
        if name == warn or warn in file_path:
            print('WARNING: Modifying critical file: ' + warn + ' — make sure this change is intentional.')

    return 0


if __name__ == '__main__':
    sys.exit(main())
