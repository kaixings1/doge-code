---
name: ctx-purge
description: |
  清空 context-mode 知识库。永久删除所有已索引内容，
  并重置会话统计。此操作具有破坏性，无法撤销。
  触发：/context-mode:ctx-purge
user-invocable: true
---

# Context Mode 清空

永久删除本项目的会话数据。支持两种范围（issue #520）：

- **项目范围**（`scope: "project"`）：清空一切 —— 知识库、每个会话的所有会话 DB 行、事件 markdown 和统计。
- **会话范围**（`sessionId: "<id>"` 或 `scope: "session"`）：只清空匹配会话的行 + FTS5 分块。同级会话、项目统计和 FTS5 存储文件都会保留。

## 操作步骤

1. 先与用户**确定范围**：
   - “只清空一个会话？” → 询问 `sessionId`。
   - “清空整个项目？” → 确认 scope:'project'（这是破坏性、不可逆的默认选项）。
2. **就 scope:'project' 向用户发出警告**。以下内容都会被删除：
   - FTS5 知识库（`ctx_index`、`ctx_fetch_and_index`、`ctx_batch_execute` 的全部已索引内容）
   - 项目中**所有**会话的会话事件 DB（分析、元数据、恢复快照）
   - 会话事件 markdown 文件
   - 内存中的会话统计 + 持久化的统计文件
3. 用选定的参数调用 `mcp__context-mode__ctx_purge` MCP 工具：
   - 限定范围：`{ confirm: true, sessionId: "<id>" }` —— 隐含 scope:'session'。
   - 项目：`{ confirm: true, scope: "project" }` —— 显式的破坏性形式。
   - 裸的 `{ confirm: true }` 仍可用，但会发出弃用警告。优先用显式形式。
4. 把结果报告给用户 —— 响应会列出确切删除了什么，并且（对限定范围的清空）确认其他会话和项目统计都已保留。

## Schema 规则

- `confirm: true` 始终必填。
- `sessionId` 与 `scope: "project"` 同时出现会被**拒绝**，因为含义不明（sessionId 隐含会话范围；与项目范围组合会违背意图）。
- `scope: "session"` 不带 `sessionId` 会抛错 —— sessionId 是必填的。

## 何时使用

- **限定范围（按会话）**：临时验收场景、演练重放、隔离被污染的会话而不丢失主工作会话的统计。
- **项目**：知识库中包含过时或错误内容、污染搜索结果时，在同一会话中切换不相关的项目时，想要彻底重新开始时。

## 重要

- `ctx_purge` 是删除会话数据的**唯一**途径。不存在其他机制。
- `ctx_stats` 是只读的 —— 只显示统计信息。
- `/clear` 和 `/compact` **不**影响任何 context-mode 数据。
- 没有撤销。需要内容就重新索引。
