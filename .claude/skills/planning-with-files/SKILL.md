---
name: planning-with-files
description: 基于Manus风格的文件规划系统
user-invocable: true
allowed-tools: "Read Write Edit Bash Glob Grep"
hooks:
  UserPromptSubmit:
    - hooks:
        - type: command
          command: "SH=\"${CLAUDE_SKILL_DIR}/scripts/inject-plan.sh\"; [ -f \"$SH\" ] || SH=$(ls \"$HOME/.claude/skills/planning-with-files/scripts/inject-plan.sh\" \"$HOME/.claude/plugins/marketplaces/planning-with-files/scripts/inject-plan.sh\" 2>/dev/null | head -1); [ -n \"$SH\" ] && [ -f \"$SH\" ] && sh \"$SH\" --context=userprompt; exit 0"
  PreToolUse:
    - matcher: "Write|Edit|Bash|Read|Glob|Grep"
      hooks:
        - type: command
          command: "SH=\"${CLAUDE_SKILL_DIR}/scripts/inject-plan.sh\"; [ -f \"$SH\" ] || SH=$(ls \"$HOME/.claude/skills/planning-with-files/scripts/inject-plan.sh\" \"$HOME/.claude/plugins/marketplaces/planning-with-files/scripts/inject-plan.sh\" 2>/dev/null | head -1); [ -n \"$SH\" ] && [ -f \"$SH\" ] && sh \"$SH\" --context=pretool; exit 0"
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "if [ -f task_plan.md ] || [ -f .planning/.active_plan ] || ls .planning/*/task_plan.md >/dev/null 2>&1; then echo '[planning-with-files] Update progress.md with what you just did. If a phase is now complete, update task_plan.md status.'; fi"
  Stop:
    - hooks:
        - type: command
          command: "SKILL_PS1=\"${CLAUDE_SKILL_DIR}/scripts/check-complete.ps1\"; SKILL_SH=\"${CLAUDE_SKILL_DIR}/scripts/gate-stop.sh\"; KNOWN_PS1=$(ls \"$HOME/.claude/skills/planning-with-files/scripts/check-complete.ps1\" \"$HOME/.claude/plugins/marketplaces/planning-with-files/scripts/check-complete.ps1\" 2>/dev/null | head -1); KNOWN_SH=$(ls \"$HOME/.claude/skills/planning-with-files/scripts/gate-stop.sh\" \"$HOME/.claude/plugins/marketplaces/planning-with-files/scripts/gate-stop.sh\" 2>/dev/null | head -1); TARGET_PS1=\"${SKILL_PS1:-$KNOWN_PS1}\"; TARGET_SH=\"${SKILL_SH:-$KNOWN_SH}\"; if [ -n \"$TARGET_PS1\" ] && [ -f \"$TARGET_PS1\" ]; then powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File \"$TARGET_PS1\" -Gate 2>/dev/null; elif [ -n \"$TARGET_SH\" ] && [ -f \"$TARGET_SH\" ]; then sh \"$TARGET_SH\" 2>/dev/null; fi"
  PreCompact:
    - matcher: "*"
      hooks:
        - type: command
          command: "SH=\"${CLAUDE_SKILL_DIR}/scripts/inject-plan.sh\"; [ -f \"$SH\" ] || SH=$(ls \"$HOME/.claude/skills/planning-with-files/scripts/inject-plan.sh\" \"$HOME/.claude/plugins/marketplaces/planning-with-files/scripts/inject-plan.sh\" 2>/dev/null | head -1); [ -n \"$SH\" ] && [ -f \"$SH\" ] && sh \"$SH\" --context=precompact; exit 0"
metadata:
  version: "3.1.3"
---

# Planning with Files

Work like Manus: Use persistent markdown files as your "working memory on disk."

## FIRST: Restore Context (v2.2.0)

**Before doing anything else**, check if planning files exist and read them:

1. If `task_plan.md` exists, read `task_plan.md`, `progress.md`, and `findings.md` immediately.
2. Then check for unsynced context from a previous session:

```bash
# Linux/macOS — auto-detects skill directory (plugin env or default install path)
SKILL_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/planning-with-files}"
$(command -v python3 || command -v python) "${SKILL_DIR}/scripts/session-catchup.py" "$(pwd)"
```

```powershell
# Windows PowerShell
& (Get-Command python -ErrorAction SilentlyContinue).Source "$env:USERPROFILE\.claude\skills\planning-with-files\scripts\session-catchup.py" (Get-Location)
```

If catchup report shows unsynced context:
1. Run `git diff --stat` to see actual code changes
2. Read current planning files
3. Update planning files based on catchup + git diff
4. Then proceed with task

## Important: Where Files Go

- **Templates** are in `${CLAUDE_PLUGIN_ROOT}/templates/`
- **Your planning files** go in **your project directory**

| Location | What Goes There |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 30 MINUTES 39 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE