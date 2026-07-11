---
name: gsd:ultraplan-phase
【测试版】将计划阶段卸载到 Claude Code 的 ultraplan 云端；在浏览器中审查并导回。
argument-hint: "[phase-number]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
requires: [import, phase, plan-phase]
---

<objective>
将 GSD 的规划阶段卸载到 Claude Code 的 ultraplan 云端基础设施。

Ultraplan 在远程云会话中起草计划，你的终端保持空闲。
在浏览器中审查和评论计划，然后通过 /gsd:import --from 将其导入回来。

⚠ BETA：ultraplan 处于研究预览阶段。对于稳定的本地规划，使用 /gsd:plan-phase。
要求：Claude Code v2.1.91+、claude.ai 账户、GitHub 仓库。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/ultraplan-phase.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the ultraplan-phase workflow end-to-end.
</process>
