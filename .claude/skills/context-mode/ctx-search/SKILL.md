---
name: ctx-search
description: |
  在 context-mode 的 FTS5 持久知识库中搜索此前已索引的
  本地项目内容、文档或会话记忆。
  触发：/context-mode:ctx-search
user-invocable: true
---

# Context Mode 搜索

搜索已索引内容，而无需把原始来源重读进对话上下文。

## 操作步骤

1. 可用时优先用 `ctx_search` MCP 工具。
2. 把所有相关问题放进一个 `queries` 数组里批量查询。
3. 当用户指明某个项目或已索引标签时，用 `source` 限定范围。
4. 使用两到四个技术术语的简短、具体的查询。

```javascript
ctx_search({
  source: "project:<name>",
  queries: ["authentication middleware", "token refresh"],
  limit: 5
})
```

5. 如果 MCP 工具不可用，退回到 CLI：

```bash
context-mode search "authentication middleware" --source project:<name> --limit 5
```

6. 如果索引为空，告诉用户先运行 `/context-mode:ctx-index` 或 `context-mode index <path>`。
