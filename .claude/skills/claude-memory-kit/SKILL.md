---
name: claude-memory-kit
description: Claude Code的持久化内存系统。双层架构（热缓存+知识库），安全钩子，/close-day日终合成。零外部依赖。
author: awrshift
version: 3.2.0
tags: [memory, context-management, productivity, agent-memory]
repository: https://github.com/awrshift/claude-memory-kit
license: MIT
---

# Claude Memory Kit

您的 Claude 代理跨会话和项目记住所有内容。

## 功能

- **持久化内存** — MEMORY.md 热缓存 + 带有 [[wikilinks]] 的知识维基
- **多项目支持** — 每个项目的积压工作和上下文隔离
- **安全钩子** — 防止压缩和长会话期间的上下文丢失
- **`/close-day`** — 一个命令捕获您的整个一天
- **`/tour`** — interactive guided walkthrough

## Quick Start

```bash
git clone https://github.com/awrshift/claude-memory-kit.git my-project
cd my-project
claude
```

## Built from production

700+ sessions across 7 projects. Adapted from Karpathy/Cole Medin's knowledge base pattern, simplified for daily CLI use.
