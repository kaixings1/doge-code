---
allowed-tools: Bash(./scripts/gh.sh:*), Bash(./scripts/comment-on-duplicates.sh:*)
description: 查找重复的 GitHub 问题
---

查找给定 GitHub 问题的重复问题（最多 3 个）。

操作步骤：

1. 使用代理检查 GitHub 问题（a）是否已关闭、（b）不需要去重（例如，因为它是广泛的产品反馈而没有特定解决方案，或是正面反馈）、或（c）已经有你 earlier 评论的 duplicates 评论。如果是，则不要继续。
2. 使用代理查看 GitHub 问题，并要求代理返回问题摘要
3. 然后，启动 5 个并行代理搜索 GitHub，查找此问题的重复问题，使用 #1 中的摘要
4. 接下来，将 #1 和 #2 的结果输入另一个代理，以过滤误判，这些可能实际上不是原始问题的重复问题。如果没有剩余的重复问题，则不要继续。
5. 最后，使用评论脚本发布重复问题：
   ```
   ./scripts/comment-on-duplicates.sh --potential-duplicates <dup1> <dup2> <dup3>
   ```

注意（务必告诉你的代理）：

- 使用 `./scripts/gh.sh` 与 GitHub 交互，而不是 web fetch 或 raw `gh`。示例：
  - `./scripts/gh.sh issue view 123` — 查看问题
  - `./scripts/gh.sh issue view 123 --comments` — 查看带评论
  - `./scripts/gh.sh issue list --state open --limit 20` — 列出问题
  - `./scripts/gh.sh search issues "query" --limit 10` — 搜索问题
- 不要使用其他工具，除了 `./scripts/gh.sh` 和评论脚本（例如，不要使用其他 MCP 服务器、文件编辑等）
- 先创建一个待办列表
