---
name: gsd:progress
检查进度、推进工作流或发送自由意图 - 统一的 GSD 情境命令。
argument-hint: "[--forensic | --next | --do \"task description\"]"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - SlashCommand
  - AskUserQuestion
requires: [phase]
---
<objective>
检查项目进度，总结最近的工作和后续计划，然后智能路由到下一个操作。

三种模式：
- **默认**：显示进度报告 + 智能路由到下一个操作（执行或规划）。在继续工作前提供态势感知。
- **--next**：无需手动路由选择，自动前进到下一个逻辑步骤。读取 STATE.md、ROADMAP.md 和阶段目录。支持 `--force` 绕过安全关卡。
- **--do "task description"**：分析自由格式的自然语言并分派到最合适的 GSD 命令。绝不自行完成工作——匹配意图、确认、移交。
- **--forensic**：在标准进度报告后附加 6 项完整性审计。
</objective>

<flags>
- **--next**: Detect current project state and automatically invoke the next logical GSD workflow step. Scans all prior phases for incomplete work before routing. `--next --force` bypasses safety gates.
- **--do "..."**: Smart dispatcher — match freeform intent to the best GSD command using routing rules, confirm the match, then hand off.
- **--forensic**: Run 6-check integrity audit after the standard progress report.
- **(no flag)**: Standard progress check + intelligent routing (Routes A through F).
</flags>

<execution_context>
@~/.claude/get-shit-done/workflows/progress.md
@~/.claude/get-shit-done/workflows/next.md
@~/.claude/get-shit-done/workflows/do.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<process>
Arguments provided: "$ARGUMENTS"
Parse the first token from the provided arguments:
- If it is `--next`: strip the flag, execute the next workflow (passing remaining args e.g. --force).
- If it is `--do`: strip the flag, pass remainder as freeform intent to the do workflow.
- Otherwise: execute the progress workflow end-to-end (pass --forensic through if present).

Preserve all routing logic from the target workflow.
</process>
