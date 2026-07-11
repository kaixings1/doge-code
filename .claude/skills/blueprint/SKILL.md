---
name: Claude Code 通用命令蓝图
description: "Claude Code 通用命令蓝图——模板化命令定义、参数解析和工具编排框架。"
category: planning
risk: safe
source: community
date_added: "2026-03-10"
---

# /u84dd/u56fe — Construction Plan Generator

Turn a one-line objective into a step-by-step plan any coding agent can execute cold.

## 概述

Blueprint is for multi-会话, multi-agent engineering projects where each step must be independently executable by a fresh agent that has never seen the conversation history. Install it once, invoke it with `/blueprint <project> <objective>`.

## /u4f55/u65f6/u4f7f/u7528 This Skill

- Use when the task requires multiple PRs or sessions
- Use when multiple agents or team members need to share execution
- Use when you want adversarial review of the plan before execution
- Use when parallel step detection and dependency graphs matter

## 工作原理

1. **Research** — Scans the codebase, reads project memory, runs pre-flight checks
2. **Design** — Breaks the objective into one-PR-sized steps, identifies parallelism, assigns model tiers
3. **Draft** — Generates the plan from a structured template with branch 工作流 rules, CI policy, and rollback strategies inline
4. **Review** — Delegates adversarial review to a strongest-model sub-agent (falls back to default model if unavailable)
5. **Register** — Saves the plan and updates project memory

## 示例

### Example 1: Database migration
```
/blueprint myapp "migrate database to PostgreSQL"
```

### Example 2: Plugin extraction
```
/blueprint antbot "extract providers into plugins"
```

## 最佳实践

- ✅ Use for tasks requiring 3+ PRs or multiple sessions
- ✅ Let Blueprint auto-detect git/gh availability — it degrades gracefully
- ❌ Don't invoke for tasks completable in a single PR
- ❌ Don't invoke when the user says "just do it"

## Key Differentiators

- **Cold-start execution**: Every step has a self-contained context brief
- **Adversarial review gate**: Strongest-model review before execution
- **Zero runtime risk**: Pure markdown — no hooks, no scripts, no executable code
- **Plan mutation protocol**: Steps can be split, inserted, skipped with audit trail

## 安装

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/antbotlab/blueprint.git ~/.claude/skills/blueprint
```

## 其他资源

- [GitHub Repository](https://github.com/antbotlab/blueprint)
- [Examples: small plan](https://github.com/antbotlab/blueprint/blob/main/examples/small-plan.md)
- [Examples: large plan](https://github.com/antbotlab/blueprint/blob/main/examples/large-plan.md)

## /u9650/u5236
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
