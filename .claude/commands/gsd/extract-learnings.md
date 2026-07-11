---
name: gsd:extract-learnings
从已完成阶段的产物中提取决策、经验、模式和意外发现。
argument-hint: <phase-number>
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
type: prompt
requires: [phase]
---
<objective>
从已完成的阶段工件（PLAN.md、SUMMARY.md、VERIFICATION.md、UAT.md、STATE.md）中提取结构化的经验教训，写入 LEARNINGS.md 文件，捕获决策、经验教训、发现的模式和遇到的意外情况。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/extract-learnings.md
</execution_context>

Execute the extract-learnings workflow from @~/.claude/get-shit-done/workflows/extract-learnings.md end-to-end.
