---
name: monte-carlo-prevent
description: "在 SQL/dbt 编辑之前提供 Monte Carlo 数据可观察性上下文（表健康、告警、血统、爆炸半径）。"
category: data
risk: safe
source: community
source_repo: monte-carlo-data/mc-agent-toolkit
source_type: community
date_added: "2026-04-08"
author: monte-carlo-data
tags: [data-observability, dbt, schema, monte-carlo, lineage]
tools: [claude, cursor, codex]
---

# Monte Carlo Prevent Skill

This skill brings Monte Carlo's data observability context directly into your editor. When you're modifying a dbt model or SQL pipeline, use it to surface table health, lineage, active alerts, and to generate monitors-as-code without leaving Claude Code.

Reference files live next to this skill file. **Use the Read tool** (not MCP resources) to access them:

- Full workflow step-by-step instructions: `references/workflows.md` (relative to this file)
- MCP parameter details: `references/parameters.md` (relative to this file)
- Troubleshooting: `references/TROUBLESHOOTING.md` (relative to this file)

## When to activate this skill

**Do not wait to be asked.** Run the appropriate workflow automatically whenever the user:

- References or opens a `.sql` file or dbt model (files in `models/`) → run Workflow 1
- Mentions a table name, dataset, or dbt model name in passing → run Workflow 1

- Describes a planned change to a model (new column, join update, filter change, refactor) → **STOP — run Workflow 4 before writing any code**
-
- Adds a new column, metric, or output expression to an existing
  model → run Workflow 4 first, then ALWAYS offer Workflow 2
  regardless of risk tier — do not skip the monitor offer
- Asks about data quality, freshness, row counts, or anomalies → run Workflow 1
- Wants to triage or respond to a data quality alert → run Workflow 3

Present the results as context the engineer needs before proceeding — not as a response to a question.

## When NOT to activate this skill

Do not invoke Monte Carlo tools for:

- Seed files (files in seeds/ directory)
- Analysis files (files in analyses/ directory)
- One-off or ad-hoc SQL scripts not part of a dbt project
- Configuration files (dbt_project.yml, profiles.yml, packages.yml)
- Test files unless the user is specifically asking about data quality

If uncertain whether a file is a dbt model, check for {{ ref() }} or {{ source() }}
Jinja references — if absent, do not activate.

### Macros and snapshots — gate edits, skip auto-context

Macro files (`macros/`) and snapshot files (`snapshots/`) are **not** models, so
do not auto-fetch Monte Carlo context (Workflow 1) when they are opened. However,
macros are inlined into every model that calls them at compile time — a one-line
macro change can silently alter dozens of models. Snapshots control historical
tracking and are similarly sensitive.

**The pre-edit hook gates these files.** If the hook fires for a macro or snapshot,
identify which models are affected and run the change impact assessment (Workflow 4)
for those models before proceeding with the edit.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 32 MINUTES 57 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE