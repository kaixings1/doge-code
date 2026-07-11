---
name: gsd:eval-review
审计已执行的 AI 阶段的评估覆盖范围并生成 EVAL-REVIEW.md 修复计划。
argument-hint: "[phase number]"
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
对已完成的 AI 阶段进行回溯性评估覆盖审计。
检查 AI-SPEC.md 中的评估策略是否已实施。
生成带有评分、判定、差距和修复计划的 EVAL-REVIEW.md。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/eval-review.md
@~/.claude/get-shit-done/references/ai-evals.md
</execution_context>

<context>
阶段：$ARGUMENTS — 可选，默认为最后完成的阶段。
</context>

<process>
端到端执行。
保留所有工作流关卡。
</process>
