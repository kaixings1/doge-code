---
name: gsd:autonomous
自主运行所有剩余阶段 - 每阶段讨论、规划、执行。
argument-hint: "[--from N] [--to N] [--only N] [--interactive]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
requires: [cleanup, phase, progress]
---
<objective>
自主执行所有剩余里程碑阶段。对每个阶段：讨论 → 规划 → 执行。仅在需要用户决策时暂停（灰色区域接受、阻塞项、验证请求）。

使用 ROADMAP.md 阶段发现和每个阶段命令的 Skill() 扁平调用。所有阶段完成后：里程碑审计 → 完成 → 清理。

**创建/更新：**
- `.planning/STATE.md` — 每个阶段后更新
- `.planning/ROADMAP.md` — 每个阶段后更新进度
- 阶段工件 — 每个阶段的 CONTEXT.md、PLAN、SUMMARY

**完成后：** 里程碑完成并清理。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/autonomous.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
可选标志：
- `--from N` — 从阶段 N 开始，而不是第一个未完成的阶段。
- `--to N` — 在阶段 N 完成后停止（停止而不是前进到下一阶段）。
- `--only N` — 仅执行阶段 N（单阶段模式）。
- `--interactive` — 内联运行讨论并提问（非自动回答），然后将规划→执行分派为后台智能体。保持主上下文精简，同时保留用户对决策的输入。

项目上下文、阶段列表和状态在工作流内部使用 init 命令解析（`gsd-sdk query init.milestone-op`、`gsd-sdk query roadmap.analyze`）。无需预先加载上下文。
</context>

<process>
端到端执行。
保留所有工作流关卡（阶段发现、逐阶段执行、阻塞处理、进度显示）。
</process>
