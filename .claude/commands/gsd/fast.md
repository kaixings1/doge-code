---
name: gsd:fast
内联执行快速任务 - 无需子代理、无需计划开销。
argument-hint: "[task description]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
requires: [config, quick]
---

<objective>
在当前上下文中直接执行琐碎任务，无需生成子智能体或生成 PLAN.md 文件。
适用于太小而不值得规划开销的任务：拼写错误修复、配置更改、小型重构、遗漏的提交、简单的添加。

这不是 /gsd:quick 的替代品——对于需要研究、多步骤规划或验证的任何事项，使用 /gsd:quick。/gsd:fast 适用于你可以用一句话描述并在 2 分钟内执行的任务。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/fast.md
</execution_context>

<process>
Execute end-to-end.
</process>
