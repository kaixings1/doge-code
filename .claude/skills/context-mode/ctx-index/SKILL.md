---
name: ctx-index
description: |
  把本地文件或目录索引进 context-mode 的 FTS5 持久知识库，
  以便之后的 ctx_search 调用能取回聚焦片段，而无需重读原始文件。
  触发：/context-mode:ctx-index
user-invocable: true
---

# Context Mode 索引

索引本地项目内容，供后续搜索使用。

## 操作步骤

1. 可用时优先用 `ctx_index` MCP 工具。
2. 仅当用户没有提供路径、且当前项目根目录不明确时，才询问路径。
3. 用 `path`，不要用大段内联 `content`，这样文件字节不会进入对话。
4. 索引代码仓库时，传保守的上限和一个清晰的来源标签：

```javascript
ctx_index({
  path: ".",
  source: "project:<name>",
  maxDepth: 5,
  maxFiles: 200
})
```

5. 如果 MCP 工具不可用，退回到 CLI：

```bash
context-mode index . --source project:<name>
```

6. 报告已索引的来源标签、文件数或章节数，以及对应的搜索命令：

```javascript
ctx_search({ source: "project:<name>", queries: ["..."] })
```

## 安全

- 不要索引依赖目录、构建产物、密钥或生成的文件。
- 对于项目里噪声大的路径，优先用 `--exclude` 或 `exclude`。
- 对较大的仓库，在把 `maxFiles` 调到 500 以上之前先询问用户。
