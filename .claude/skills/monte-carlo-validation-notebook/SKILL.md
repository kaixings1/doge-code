---
name: 为 dbt PR 变更生成 SQL 验证 notebook，包含前后对比查询
description: "为 dbt PR 变更生成 SQL 验证 notebook，包含前后对比查询。"
category: data
risk: safe
source: community
source_repo: monte-carlo-data/mc-agent-toolkit
source_type: community
date_added: "2026-04-08"
author: monte-carlo-data
tags: [data-observability, validation, dbt, monte-carlo, sql-notebook]
tools: [claude, 游标, codex]
---

# Monte Carlo 验证笔记本

> **Tip:** This skill works well with Sonnet. Run `/model sonnet` before invoking for faster generation.

Generate a SQL Notebook with validation queries for dbt changes.

**Arguments:** $ARGUMENTS

## 使用场景

当用户想要通过 Monte Carlo SQL Notebook 查询验证 dbt 模型或快照更改时使用此技能，无论是来自 GitHub PR 还是本地 dbt 仓库。

Parse the arguments:
- **Target** (required): first 参数 — a GitHub PR URL or local dbt repo path
- **MC Base URL** (optional): `--mc-base-url <URL>` — defaults to `https://getmontecarlo.com`
- **Models** (optional): `--models <model1,model2,...>` — comma-separated list of model filenames (without `.sql` extension) to generate queries for. Only these models will be included. By default, all changed models are included up to a maximum of 10.

