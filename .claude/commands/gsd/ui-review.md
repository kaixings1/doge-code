---
name: gsd:ui-review
对已实现的前端代码进行事后 6 支柱视觉审计。
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
requires: [phase]
---
<objective>
进行事后 6 支柱视觉审计。生成带有分级评估（每支柱 1-4 分）的 UI-REVIEW.md。
适用于任何项目。
输出：{phase_num}-UI-REVIEW.md
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/ui-review.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>
