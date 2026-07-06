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

# 文件规划系统

像 Manus 一样工作：用持久化的 Markdown 文件作为你的"磁盘工作记忆"。

## 第一步：恢复上下文（v2.2.0）

**在做任何事之前**，检查规划文件是否存在并读取它们：

1. 如果 `task_plan.md` 存在，立即读取 `task_plan.md`、`progress.md` 和 `findings.md`。
2. 然后检查上一个会话是否有未同步的上下文：

```bash
# Linux/macOS — 自动检测技能目录
SKILL_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/planning-with-files}"
$(command -v python3 || command -v python) "${SKILL_DIR}/scripts/会话-catchup.py" "$(pwd)"
```

```powershell
# Windows PowerShell
& (Get-Command python -ErrorAction SilentlyContinue).Source "$env:USERPROFILE\.claude\skills\planning-with-files\scripts\会话-catchup.py" (Get-Location)
```

如果恢复报告显示有未同步的上下文：
1. 运行 `git diff --stat` 查看实际代码变更
2. 读取当前规划文件
3. 根据恢复报告和 git diff 更新规划文件
4. 然后继续任务

## 重要：文件存放位置

- **模板**在 `${CLAUDE_PLUGIN_ROOT}/templates/` 中
- **你的规划文件**放在**你的项目目录**中

| 位置 | 存放内容 |