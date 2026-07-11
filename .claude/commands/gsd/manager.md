---
name: gsd:manager
从单一终端管理多个阶段的交互式命令中心。
argument-hint: "[--analyze-deps]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Skill
  - Agent
requires: [phase]
---
<objective>
管理里程碑的单一终端命令中心。显示所有阶段的仪表盘，带有可视化状态指示器，推荐最佳下一步操作，并分发工作——讨论内联运行，规划/执行作为后台智能体运行。

专为希望从一个终端跨阶段并行化工作的高级用户设计：在一个阶段在后台规划或执行时讨论另一个阶段。

**创建/更新：**
- 不直接创建文件——通过 Skill() 和后台 Task 智能体分派到现有的 GSD 命令。
- 读取 `.planning/STATE.md`、`.planning/ROADMAP.md`、阶段目录以获取状态。

**完成后：** 用户完成管理后退出，或所有阶段完成并建议里程碑生命周期。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/manager.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
No arguments required. Requires an active milestone with ROADMAP.md and STATE.md.

Project context, phase list, dependencies, and recommendations are resolved inside the workflow using `gsd-sdk query init.manager`. No upfront context loading needed.
</context>

<process>
If `--analyze-deps` is in $ARGUMENTS:
Read and execute `~/.claude/get-shit-done/workflows/analyze-dependencies.md` end-to-end.

Execute end-to-end.
Maintain the dashboard refresh loop until the user exits or all phases complete.
</process>
