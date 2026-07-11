---
name: e Carlo 监控器，生成
description: "通过 MCP 工具指导创建 Monte Carlo 监控器，生成用于 CI/CD 部署的 monitors-as-code YAML。"
category: data
risk: safe
source: community
source_repo: monte-carlo-data/mc-agent-toolkit
source_type: community
date_added: "2026-04-08"
author: monte-carlo-data
tags: [data-observability, monitoring, monte-carlo, monitors-as-code]
tools: [claude, 游标, codex]
---

# Monte Carlo 监控器创建技能

本技能教你如何通过 MCP 正确创建 Monte Carlo 监控器。每个创建工具在**干运行模式**下运行，返回 monitors-as-code（MaC）YAML。不会直接创建监控器——用户通过 Monte Carlo CLI 或 CI/CD 应用 YAML。

Reference files live next to this skill file. **Use the Read tool** (not MCP resources) to access them:

- Metric monitor details: `references/metric-monitor.md` (relative to this file)
- Validation monitor details: `references/validation-monitor.md` (relative to this file)
- Custom SQL monitor details: `references/custom-sql-monitor.md` (relative to this file)
- Comparison monitor details: `references/comparison-monitor.md` (relative to this file)
- Table monitor details: `references/table-monitor.md` (relative to this file)

## When to activate this skill

Activate when the user:

- Asks to create, add, or set up a monitor (e.g. "add a monitor for...", "create a freshness check on...", "set up validation for...")
- Mentions monitoring a specific table, field, or metric
- Wants to check data quality rules or enforce data contracts
- Asks about monitoring options for a table or dataset
- Requests monitors-as-code YAML generation
- Wants to add monitoring after new transformation logic (when the prevent skill is not active)

## When NOT to activate this skill

Do not activate when the user is:

- Just querying data or exploring table contents
- Triaging or responding to active alerts (use the prevent skill's 工作流 3)
- Running impact assessments before code changes (use the prevent skill's 工作流 4)
- Asking about existing monitor 配置 (use `getMonitors` directly)
- Editing or deleting existing monitors
