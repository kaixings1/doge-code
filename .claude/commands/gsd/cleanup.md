---
name: gsd:cleanup
归档已完成里程碑中的累计阶段目录。
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
requires: [phase]
---
<objective>
将已完成里程碑中的阶段目录归档到 `.planning/milestones/v{X.Y}-phases/`。

当 `.planning/phases/` 中积累了来自过去里程碑的目录时使用。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/cleanup.md
</execution_context>

<process>
端到端执行。
识别已完成的里程碑，显示预演摘要，并在确认时进行归档。
</process>
