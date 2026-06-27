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

Your Claude agent remembers everything across sessions and projects.

## What it does

- **Persistent memory** — MEMORY.md hot cache + knowledge wiki with [[wikilinks]]
- **Multi-project support** — per-project backlogs and context isolation
- **Safety hooks** — prevent context loss during compression and long sessions
- **`/close-day`** — one command captures your entire day
- **`/tour`** — interactive guided walkthrough

## Quick Start

```bash
git clone https://github.com/awrshift/claude-memory-kit.git my-project
cd my-project
claude
```

## Built from production

700+ sessions across 7 projects. Adapted from Karpathy/Cole Medin's knowledge base pattern, simplified for daily CLI use.
