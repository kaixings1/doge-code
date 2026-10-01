#!/usr/bin/env python3
"""Shared stdin reader for bash hooks.

Replaces the `echo "$INPUT" | python3 -c "..."` pattern used across the shell
hooks. MSYS2 collapses multi-line inline Python into a single line piped through
bash, which raises IndentationError and silently breaks every hook that used it.

Usage:
    hook-input.py file_path      # tool_input.file_path
    hook-input.py content        # Write.content or Edit.new_string
    hook-input.py command        # tool_input.command
    hook-input.py tool_name      # tool_name
    hook-input.py file_path content   # multiple keys, one per line (empty if absent)

Exits 0 always; missing keys print an empty line rather than failing.
"""
import json
import sys


def load():
    try:
        return json.loads(sys.stdin.read())
    except Exception:
        return {}


# Keys that live at the top level of the hook payload rather than in tool_input.
TOP_LEVEL_ALIASES = {
    'event': 'hook_event_name',
    'task_id': 'task_id',
    'task_subject': 'task_subject',
}


def value_for(data, key):
    if key in TOP_LEVEL_ALIASES:
        return data.get(TOP_LEVEL_ALIASES[key], '')
    tool = data.get('tool_name', '')
    inp = data.get('tool_input', {}) or {}
    if key == 'content':
        if tool == 'Write':
            return inp.get('content', '')
        if tool == 'Edit':
            return inp.get('new_string', '')
        return inp.get('content', '') or inp.get('new_string', '')
    if key == 'tool_name':
        return tool
    return inp.get(key, '')


def main():
    keys = sys.argv[1:] or ['file_path']
    data = load()
    for key in keys:
        val = value_for(data, key)
        print(val if isinstance(val, str) else json.dumps(val))
    return 0


if __name__ == '__main__':
    sys.exit(main())
