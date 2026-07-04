---
name: grilling
description: "Grilling — 对计划或设计进行全面深入盘问，以压力测试决策和澄清需求"
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

当此工作流匹配用户请求时使用：对用户关于计划或设计进行彻底盘问。当用户想要在构建前对计划进行压力测试，或使用任何"grill"触发短语时使用。


_来源：[mattpocock/skills](https://github.com/mattpocock/skills) (MIT)。_对这个计划的每个方面进行不懈地盘问，直到达成共同理解。遍历设计树的每个分支，逐一解决决策之间的依赖关系。对每个问题，提供您推荐的答案。

一次只问一个问题，在继续之前等待每个问题的反馈。一次性问多个问题会让人困惑。

如果可以通过探索代码库来回答问题，则改为探索代码库。


## 局限性

- 当工作流指定了上游工具、账户、API 密钥或本地设置时，需要这些条件。
- 未经用户明确批准，不授权破坏性、生产环境、付费或外部消息操作。
- 在将生成的工件或建议视为最终结果之前，请对照用户的真实来源进行验证。
