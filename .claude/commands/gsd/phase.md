---
name: gsd:phase
对 ROADMAP.md 中的阶段进行增删改查 - 添加、插入、移除或编辑阶段。
argument-hint: "[--insert | --remove | --edit] <phase-name-or-number>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
使用单一统一命令管理 ROADMAP.md 中的阶段。

模式路由：
- **默认**（无标志）：在当前期末添加一个新的整数阶段 → add-phase 工作流
- **--insert**：将紧急工作作为小数阶段（例如 72.1）插入到现有阶段之间 → insert-phase 工作流
- **--remove**：移除未来阶段并重新编号后续阶段 → remove-phase 工作流
- **--edit**：原地编辑现有阶段的任何字段 → edit-phase 工作流
</objective>

<routing>

| Flag | Action | Workflow |
|------|--------|----------|
| (none) | Add new integer phase at end of milestone | add-phase |
| --insert | Insert decimal phase (e.g., 72.1) after specified phase | insert-phase |
| --remove | Remove future phase, renumber subsequent | remove-phase |
| --edit | Edit fields of existing phase in place | edit-phase |

</routing>

<execution_context>
@~/.claude/get-shit-done/workflows/add-phase.md
@~/.claude/get-shit-done/workflows/insert-phase.md
@~/.claude/get-shit-done/workflows/remove-phase.md
@~/.claude/get-shit-done/workflows/edit-phase.md
</execution_context>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--insert`: strip the flag, pass remainder (format: <after-phase-number> <description>) to insert-phase workflow
- If it is `--remove`: strip the flag, pass remainder (phase number) to remove-phase workflow
- If it is `--edit`: strip the flag, pass remainder (phase-number [--force]) to edit-phase workflow
- Otherwise: pass all of $ARGUMENTS (phase description) to add-phase workflow

Roadmap and state are resolved in-workflow via `init phase-op` and targeted reads.
</context>

<process>
1. Parse the leading flag (if any) from $ARGUMENTS.
2. Load and execute the appropriate workflow end-to-end based on the routing table above.
3. Preserve all validation gates from the target workflow.
</process>
