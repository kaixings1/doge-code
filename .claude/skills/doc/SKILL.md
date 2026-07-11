---
name: Doc 相关功能和最佳实践
description: "Doc — Doc 相关功能和最佳实践"
  Read, create, and edit .docx documents with formatting and layout fidelity via OpenAI's document skill.
triggers:
  - "openai doc"
  - "docx fidelity"
  - "word doc edit"
  - "layout doc"
od:
  mode: prototype
  category: documents
  upstream: "https://github.com/openai/skills"
---

# 文档

> Curated from OpenAI's skills repository.

## /u529f/u80fd/u8bf4/u660e

Read, create, and edit .docx documents with formatting and layout fidelity via OpenAI's document skill.

## /u6765/u6e90

- Upstream: https://github.com/openai/skills
- Category: `documents`

## /u4f7f/u7528/u65b9/u6cd5

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream 工作流 with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/openai/skills
```

Then ask the agent to invoke this skill by name (`doc`) or with
one of the trigger phrases listed in this skill's frontmatter.
