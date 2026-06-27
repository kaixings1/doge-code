# OpenCode IDE Support

## Overview

planning-with-files works with OpenCode as a personal or project skill.

## Installation

### Quick Install (Global, recommended)

```bash
npx skills add OthmanAdi/planning-with-files --skill planning-with-files -g
```

This installs the skill into `~/.config/opencode/skills/planning-with-files/SKILL.md` and makes it available to every OpenCode session.

### Quick Install (Project)

```bash
npx skills add OthmanAdi/planning-with-files --skill planning-with-files
```

This installs the skill into `.opencode/skills/planning-with-files/SKILL.md` inside the current project only.

### Manual install (git clone)

If you prefer a manual install, clone the repo into a scratch directory and copy
the OpenCode-specific skill folder into OpenCode's skill location:

**Global:**

```bash
git clone --depth 1 https://github.com/OthmanAdi/planning-with-files.git /tmp/pwf-repo
mkdir -p ~/.config/opencode/skills/planning-with-files
cp -r /tmp/pwf-repo/.opencode/skills/planning-with-files/* ~/.config/opencode/skills/planning-with-files/
rm -rf /tmp/pwf-repo
```

**Project:**

```bash
git clone --depth 1 https://github.com/OthmanAdi/planning-with-files.git ./.opencode/pwf-scratch
mkdir -p .opencode/skills/planning-with-files
cp -r ./.opencode/pwf-scratch/.opencode/skills/planning-with-files/* .opencode/skills/planning-with-files/
rm -rf ./.opencode/pwf-scratch
```

## Usage with Superpowers Plugin

If you have [obra/superpowers](https://github.com/obra/superpowers) OpenCode plugin:

```
Use the use_skill tool with skill_name: "planning-with-files"
```

## Usage without Superpowers

Manually read the skill file when starting complex tasks:

```bash
cat ~/.config/opencode/skills/planning-with-files/SKILL.md
```

## oh-my-opencode Compatibility

oh-my-opencode has Claude Code compatibility for skills. To use planning-with-files with oh-my-opencode:

### Step 1: Install the skill

```bash
mkdir -p ~/.config/opencode/skills/planning-with-files
cp -r .opencode/skills/planning-with-files/* ~/.config/opencode/skills/planning-with-files/
```

### Step 2: Configure oh-my-opencode

Add the skill to your `~/.config/opencode/oh-my-opencode.json` (or `.opencode/oh-my-opencode.json` for project-level):

```json
{
  "skills": {
    "sources": [
      { "path": "~/.config/opencode/skills/planning-with-files", "recursive": false }
    ],
    "enable": ["planning-with-files"]
  },
  "disabled_skills": []
}
```

### Step 3: Verify loading

Ask the agent: "Do you have access to the planning-with-files skill? Can you create task_plan.md?"

### Troubleshooting

If the agent forgets the planning rules:

1. **Check skill is loaded**: The skill should appear in oh-my-opencode's recognized skills
2. **Explicit invocation**: Tell the agent "Use the planning-with-files skill for this task"
3. **Check for conflicts**: If using superpowers plugin alongside oh-my-opencode, choose one method:
   - Use oh-my-opencode's native skill loading (recommended)
   - OR use superpowers' `use_skill` tool, but not both

## Known Limitations

### Session Catchup

The `session-catchup.py` script currently has limited support for OpenCode due to different session storage formats:

- **Claude Code**: Uses `.jsonl` files at `~/.claude/projects/`
- **OpenCode**: Uses the SQLite store at `${XDG_DATA_HOME:-~/.local/share}/opencode/opencode.db` (v2.38.0+)

When you run `/clear` in OpenCode, session catchup will detect OpenCode and read the SQLite store. If the query fails, **workaround**: manually read `task_plan.md`, `progress.md`, and `findings.md` to catch up after clearing context.

## Verification

**Global:**
```bash
ls -la ~/.config/opencode/skills/planning-with-files/SKILL.md
```

**Project:**
```bash
ls -la .opencode/skills/planning-with-files/SKILL.md
```

## Learn More

- [Installation Guide](installation.md)
- [Quick Start](quickstart.md)
- [Workflow Diagram](workflow.md)
