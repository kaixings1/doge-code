---
name: gsd:import
在写入任何内容前对项目决策进行冲突检测并导入外部计划。
argument-hint: "--from <filepath> | --from-gsd2"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---

<objective>
将外部计划文件导入 GSD 规划系统，并进行针对 PROJECT.md 决策的冲突检测。

- **--from**：导入外部计划文件，检测冲突，写入为 GSD PLAN.md，通过 gsd-plan-checker 验证。
- **--from-gsd2**：将 GSD-2 项目（`.gsd/` 目录）反向迁移回 GSD v1（`.planning/`）格式。运行 `gsd-tools.cjs from-gsd2`。传递 `--path <dir>` 以迁移其他路径下的项目。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/import.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/gate-prompts.md
@~/.claude/get-shit-done/references/doc-conflict-engine.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
If `--from-gsd2` is in $ARGUMENTS:
Run: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" from-gsd2`
Pass `--path <dir>` if provided. Present the migration result to the user.
Stop here (do not run the standard import workflow).

Otherwise, execute the import workflow end-to-end.
</process>
