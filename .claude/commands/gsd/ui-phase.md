---
name: gsd:ui-phase
为前端阶段生成 UI 设计合约（UI-SPEC.md）。
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - WebFetch
  - AskUserQuestion
  - mcp__context7__*
requires: [phase]
---
<objective>
为前端阶段创建 UI 设计合约（UI-SPEC.md）。
编排 gsd-ui-researcher 和 gsd-ui-checker。
流程：验证 → 研究 UI → 验证 UI-SPEC → 完成
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/ui-phase.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Phase number: $ARGUMENTS — optional, auto-detects next unplanned phase if omitted.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>
