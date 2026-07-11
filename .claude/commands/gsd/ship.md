---
name: gsd:ship
创建 PR、运行审查，并在验证通过后准备合并。
argument-hint: "[phase number or milestone, e.g., '4' or 'v1.0']"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - Write
  - AskUserQuestion
requires: [review, verify-work]
---
<objective>
桥接本地完成 → 合并的 PR。在 /gsd:verify-work 通过后，发布工作：推送分支、创建带有自动生成正文的 PR、可选触发审查，并跟踪合并。

关闭规划 → 执行 → 验证 → 发布循环。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/ship.md
</execution_context>

Execute the ship workflow from @~/.claude/get-shit-done/workflows/ship.md end-to-end.
