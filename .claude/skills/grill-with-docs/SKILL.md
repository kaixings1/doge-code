---
name: grill-with-docs
description: "Grill With Docs — 进行盘问同时创建文档（ADR 和术语表），完善计划并记录设计决策"
disable-model-invocation: true
category: "productivity"
risk: "safe"
source: "community"
source_repo: "mattpocock/skills"
source_type: "community"
date_added: "2026-06-19"
author: "Matt Pocock"
license: "MIT"
license_source: "https://github.com/mattpocock/skills/blob/main/LICENSE"
tags:
  - productivity
  - workflow
  - coding-agents
tools:
  - claude-code
  - codex-cli
  - cursor
---

## 何时使用

当此工作流匹配用户请求时使用：一场不懈的盘问以完善计划或设计，同时在此过程中创建文档（ADR 和术语表）。


_来源：[mattpocock/skills](https://github.com/mattpocock/skills) (MIT)。_使用 `/domain-modeling` 技能运行一个 `/grilling` 会话。


## 局限性

- 当工作流指定了上游工具、账户、API 密钥或本地设置时，需要这些条件。
- 未经用户明确批准，不授权破坏性、生产环境、付费或外部消息操作。
- 在将生成的工件或建议视为最终结果之前，请对照用户的真实来源进行验证。
