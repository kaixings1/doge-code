---
name: gsd:explore
苏格拉底式构思和想法路由 - 在制定计划前深入思考。
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
---
<objective>
开放式的苏格拉底式构思会话。通过探究性问题引导开发者探索想法，
可选择性地生成研究，然后将输出路由到适当的 GSD 工件
（笔记、待办事项、种子、研究问题、需求或新阶段）。

接受可选的主题参数：`/gsd:explore authentication strategy`
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/explore.md
</execution_context>

<process>
Execute end-to-end.
</process>
