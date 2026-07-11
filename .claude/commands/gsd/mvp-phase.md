---
name: gsd:mvp-phase
将阶段规划为垂直 MVP 切片 - 用户故事、SPIDR 拆分，然后进行 plan-phase。
argument-hint: "<phase-number>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
requires: [new-project, phase, plan-phase]
---
<objective>
引导用户完成阶段的 MVP 模式规划。此命令：

1. 提示用户输入"作为 / 我想要 / 以便"用户故事（三个结构化问题）
2. 运行 SPIDR 拆分检查——如果故事太大，遍历 Spike/Paths/Interfaces/Data/Rules 并提供拆分为多个阶段的选项
3. 将 `**Mode:** mvp` 和重新格式化的 `**Goal:**` 写入阶段的 ROADMAP.md 部分
4. 委托给 `/gsd plan-phase <N>`，它会通过路线图字段自动检测 MVP 模式

垂直 MVP 切片 PRD 的阶段 1 提供了规划器端机制；此命令是其用户入口点。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/mvp-phase.md
@~/.claude/get-shit-done/references/spidr-splitting.md
@~/.claude/get-shit-done/references/user-story-template.md
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. Equivalent API.
</runtime_note>

<context>
Phase number: $ARGUMENTS (required — integer or decimal like `2.1`)

The phase must already exist in ROADMAP.md (created via `/gsd new-project`, `/gsd add-phase`, or `/gsd insert-phase`). This command does not create new phases — it converts an existing phase to MVP mode.
</context>

<process>
Execute the mvp-phase workflow from @~/.claude/get-shit-done/workflows/mvp-phase.md end-to-end.
Preserve all gates: phase existence, status guard (refuse in_progress/completed), user-story format validation, SPIDR splitting check, ROADMAP write confirmation, plan-phase delegation.
</process>
