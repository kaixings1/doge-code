---
name: gsd:health
诊断规划目录健康状况并选择性地修复问题。
argument-hint: "[--repair] [--context]"
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
requires: [thread]
---
<objective>
验证 `.planning/` 目录完整性并报告可操作的问题。检查缺失文件、无效配置、不一致状态和孤立计划。

`--context` 运行一个正交检查：运行中会话的上下文利用率。工作流要求模型的 tokensUsed + contextWindow，调用 `gsd-sdk query validate.context`，并呈现三种状态之一：

| 利用率 | 状态 | 操作 |
|-------------|----------|-------------------------------------------------------|
| < 60% | 健康 | 无需操作——上下文舒适 |
| 60% – 70% | 警告 | 建议 `/gsd:thread` 重新开始 |
| ≥ 70% | 严重 | 推理质量可能超过断裂点而下降 |
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/health.md
</execution_context>

<process>
Execute end-to-end.
Parse `--repair` and `--context` flags from arguments and pass to workflow.
</process>
