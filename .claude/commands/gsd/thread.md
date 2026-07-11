---
name: gsd:thread
管理跨会话工作的持久上下文任务线。
argument-hint: "[list [--open | --resolved] | close <slug> | status <slug> | name | description]"
allowed-tools:
  - Read
  - Write
  - Bash
requires: [phase]
---

<objective>
创建、列出、关闭或恢复持久上下文线程。线程是轻量级的跨会话知识存储，适用于跨越多
个会话但不属于任何特定阶段的工作。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/thread.md
</execution_context>

<process>
Execute end-to-end.
</process>
