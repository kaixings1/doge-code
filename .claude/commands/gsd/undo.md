---
name: gsd:undo
安全的 git 回滚。使用阶段清单和依赖关系来回滚阶段或计划提交。
argument-hint: "--last N | --phase NN | --plan NN-MM"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
requires: [phase]
---

<objective>
安全 git 回滚——使用阶段清单回滚 GSD 阶段或计划提交，在执行前进行依赖检查和确认关卡。

三种模式：
- **--last N**：显示最近的 GSD 提交用于交互式选择
- **--phase NN**：回滚一个阶段的所有提交（清单 + git 日志回退）
- **--plan NN-MM**：回滚特定计划的所有提交
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/undo.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/gate-prompts.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute end-to-end.
</process>
