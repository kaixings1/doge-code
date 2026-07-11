---
name: gsd-context
代码库智能 | 映射 图谱化 文档 经验。
argument-hint: ""
allowed-tools:
  - Read
  - Skill
requires: [map-codebase, graphify, docs-update, extract-learnings]
---

根据用户意图路由到适当的代码库智能技能。
`gsd-scan` 和 `gsd-intel` 已通过 #2790 合并到 `gsd-map-codebase` 标志中。

| 用户想要 | 调用 |
|---|---|
| 映射完整代码库结构 | gsd-map-codebase |
| 快速轻量级代码库扫描 | gsd-map-codebase --fast |
| 查询映射的智能文件 | gsd-map-codebase --query |
| 生成知识图谱 | gsd-graphify |
| 更新项目文档 | gsd-docs-update |
| Extract learnings from a completed phase | gsd-extract-learnings |

Invoke the matched skill directly using the Skill tool.
