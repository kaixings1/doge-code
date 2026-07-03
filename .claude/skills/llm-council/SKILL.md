---
name: llm-council
description: "运行 Fireworks 托管的开源模型委员会，比较响应并综合最终答案。"
allowed-tools: Read, Write, Bash, AskUserQuestion
category: "ai-agents"
risk: "safe"
source: "official"
source_repo: "dair-ai/dair-academy-plugins"
source_type: "official"
date_added: "2026-06-19"
author: "DAIR.AI"
license: "MIT"
license_source: "https://github.com/dair-ai/dair-academy-plugins/blob/main/README.md#license"
tags:
  - dair-academy
  - ai
  - workflow
tools:
  - claude-code
  - codex-cli
  - cursor
---

# LLM Council (Fireworks AI)

## When to Use

Use when this workflow matches the user request: Use this skill for its documented workflow.


_Source: [dair-ai/dair-academy-plugins](https://github.com/dair-ai/dair-academy-plugins) (MIT)._

This skill implements Karpathy's LLM Council concept where multiple open-weight LLMs deliberate on a query, powered entirely by Fireworks AI:

1. **Phase 1**: All models respond to the query independently (parallel)
2. **Phase 2**: Models rank each other's anonymized responses
3. **Phase 3**: A Chairman LLM synthesizes the final answer

All inference runs through **Fireworks AI** using open-weight models. The speed and pricing of Fireworks makes it practical to run multi-model deliberation that would be slow or expensive on other providers.

## CRITICAL RULES

1. **ALWAYS use AskUserQuestion** to let the user select council models (multiselect) and the Chairman model
2. **ALWAYS save raw responses to files** - never summarize or truncate API outputs
3. **ALWAYS show full transparency** - display all individual responses, all rankings, AND the final synthesis
4. **NEVER skip the ranking phase** - it is essential to the council deliberation process
5. **Read from files for display** - ensures content is shown unmodified
6. **ALWAYS display the final output to the user** after Phase 3 completes

## Pre-flight Check

Before running any phase, verify the Fireworks API key is set:

```bash
if [ -z "$FIREWORKS_API_KEY" ]; then
  echo "ERROR: FIREWORKS_API_KEY is not set."
  echo "Create a Fireworks AI account at: https://fireworks.ai/"
  echo "Then export it in your shell profile (~/.zshrc or ~/.bashrc):"
  echo '  export FIREWORKS_API_KEY="your_api_key_here"'
  exit 1
fi
echo "FIREWORKS_API_KEY is set."
```

## Available Models

Present these options to the user via AskUserQuestion (multiselect):

| Model | Fireworks ID | Provider |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 35 MINUTES 07 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE