---
name: Monte Carlo 数据可观察性
description: "在 SQL/dbt 编辑之前提供 Monte Carlo 数据可观察性上下文（表健康、告警、血统、爆炸半径）。"
category: data
risk: safe
source: community
source_repo: monte-carlo-data/mc-agent-toolkit
source_type: community
date_added: "2026-04-08"
author: monte-carlo-data
tags: [data-observability, dbt, 架构, monte-carlo, lineage]
tools: [claude, 游标, codex]
---

# Monte Carlo 预防技能

本技能将 Monte Carlo 的数据可观察性上下文直接带入您的编辑器。当您修改 dbt 模型或 SQL 管道时，使用它来展示表健康度、血统、活跃告警，并生成 monitors-as-code，无需离开 Claude Code。

Reference files live next to this skill file. **Use the Read tool** (not MCP resources) to access them:

- Full 工作流 step-by-step instructions: `references/workflows.md` (relative to this file)
- MCP 参数 details: `references/parameters.md` (relative to this file)
- 故障排除: `references/故障排除.md` (relative to this file)

## When to activate this skill

**Do not wait to be asked.** Run the appropriate 工作流 automatically whenever the user:

- References or opens a `.sql` file or dbt model (files in `models/`) → run 工作流 1
- Mentions a table name, dataset, or dbt model name in passing → run 工作流 1

- Describes a planned change to a model (new column, join update, 过滤器 change, refactor) → **STOP — run 工作流 4 before writing any code**
-
- Adds a new column, metric, or output expression to an existing
  model → run 工作流 4 first, then ALWAYS offer 工作流 2
  regardless of risk tier — do not skip the monitor offer
- Asks about data quality, freshness, row counts, or anomalies → run 工作流 1
- Wants to triage or respond to a data quality alert → run 工作流 3

Present the results as context the engineer needs before proceeding — not as a 响应 to a question.

## When NOT to activate this skill

Do not invoke Monte Carlo tools for:

- Seed files (files in seeds/ directory)
- Analysis files (files in analyses/ directory)
- One-off or ad-hoc SQL scripts not part of a dbt project
- 配置 files (dbt_project.yml, profiles.yml, packages.yml)
- Test files unless the user is specifically asking about data quality

If uncertain whether a file is a dbt model, check for {{ ref() }} or {{ source() }}
Jinja references — if absent, do not activate.

### Macros and snapshots — gate edits, skip auto-context

Macro files (`macros/`) and snapshot files (`snapshots/`) are **not** models, so
do not auto-fetch Monte Carlo context (工作流 1) when they are opened. However,
macros are inlined into every model that calls them at compile time — a one-line
macro change can silently alter dozens of models. Snapshots control historical
tracking and are similarly sensitive.

**The pre-edit hook gates these files.** If the hook fires for a macro or snapshot,
identify which models are affected and run the change impact assessment (工作流 4)
for those models before proceeding with the edit.

