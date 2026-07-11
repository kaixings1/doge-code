---
name: gsd:new-milestone
启动新里程碑周期 - 更新 PROJECT.md 并路由到需求。
argument-hint: "[milestone name, e.g., 'v1.1 Notifications']"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
  - AskUserQuestion
requires: [new-project, phase, plan-phase]
---
<objective>
启动新里程碑：提问 → 研究（可选）→ 需求 → 路线图。

Brownfield 版本的 new-project。项目存在，PROJECT.md 有历史记录。收集"下一步是什么"，更新 PROJECT.md，然后运行需求 → 路线图循环。

**创建/更新：**
- `.planning/PROJECT.md` — 以新的里程碑目标更新
- `.planning/research/` — 领域研究（可选，仅新功能）
- `.planning/REQUIREMENTS.md` — 此里程碑的范围需求
- `.planning/ROADMAP.md` — 阶段结构（继续编号）
- `.planning/STATE.md` — 为新里程碑重置

**之后：** `/gsd:plan-phase [N]` 开始执行。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/new-milestone.md
@~/.claude/get-shit-done/references/questioning.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/templates/project.md
@~/.claude/get-shit-done/templates/requirements.md
</execution_context>

<context>
Milestone name: $ARGUMENTS (optional - will prompt if not provided)

Project and milestone context files are resolved inside the workflow (`init new-milestone`) and delegated via `<files_to_read>` blocks where subagents are used.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (validation, questioning, research, requirements, roadmap approval, commits).
</process>
