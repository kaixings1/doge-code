---
name: ctx-stats
description: |
  显示本会话中 context-mode 为你节省了多少上下文窗口。
  展示 token 消耗、上下文节省比例，以及按工具细分的数据。
  只读 —— 仅显示统计，没有重置功能。
  要彻底清空知识库，请改用 ctx_purge。
  触发：/context-mode:ctx-stats
user-invocable: true
---

# Context Mode 统计

显示当前会话的上下文节省情况。

## 操作步骤

1. 调用 `mcp__context-mode__ctx_stats` MCP 工具（无需参数）。
2. **关键**：你**必须**把工具输出的**全部内容**作为 markdown 文本直接复制粘贴进你的回复消息。不要总结，不要折叠，不要改写。用户必须在不按 ctrl+o 的情况下看到完整表格。按工具返回的样式逐行照抄。
3. 在完整输出之后，加**一句**话点出关键的节省指标，例如：
   - "context-mode 节省了 **12.4x** —— 92% 的数据留在了沙箱里。"
   - 如果还没有数据："本会话还没有任何 context-mode 调用。"

## 清空

- **`ctx_purge(confirm: true)`** —— 从知识库中永久删除所有已索引内容。用 `/context-mode:ctx-purge` 完成此操作。
