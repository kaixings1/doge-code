---
name: monte-carlo-validation-notebook
description: "为 dbt PR 变更生成 SQL 验证 notebook，包含前后对比查询。"
category: data
risk: safe
source: community
source_repo: monte-carlo-data/mc-agent-toolkit
source_type: community
date_added: "2026-04-08"
author: monte-carlo-data
tags: [data-observability, validation, dbt, monte-carlo, sql-notebook]
tools: [claude, cursor, codex]
---

> **Tip:** This skill works well with Sonnet. Run `/model sonnet` before invoking for faster generation.

Generate a SQL Notebook with validation queries for dbt changes.

**Arguments:** $ARGUMENTS

## When to Use

Use this skill when the user wants to validate dbt model or snapshot changes with Monte Carlo SQL Notebook queries, either from a GitHub PR or a local dbt repository.

Parse the arguments:
- **Target** (required): first argument — a GitHub PR URL or local dbt repo path
- **MC Base URL** (optional): `--mc-base-url <URL>` — defaults to `https://getmontecarlo.com`
- **Models** (optional): `--models <model1,model2,...>` — comma-separated list of model filenames (without `.sql` extension) to generate queries for. Only these models will be included. By default, all changed models are included up to a maximum of 10.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 32 MINUTES 55 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE