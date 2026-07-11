---
name: gsd:workspace
管理 GSD 工作区 - 创建、列出或移除隔离的工作区环境。
argument-hint: "[--new | --list | --remove] [name]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
使用单一统一命令管理 GSD 工作区。

模式路由：
- **--new**：创建带有仓库副本和独立 .planning/ 的隔离工作区 → new-workspace 工作流
- **--list**：列出活跃的 GSD 工作区及其状态 → list-workspaces 工作流
- **--remove**：移除 GSD 工作区并清理 worktree → remove-workspace 工作流
</objective>

<routing>

| Flag | Action | Workflow |
|------|--------|----------|
| --new | Create workspace with worktree/clone strategy | new-workspace |
| --list | Scan ~/gsd-workspaces/, show summary table | list-workspaces |
| --remove | Confirm and remove workspace directory | remove-workspace |

</routing>

<execution_context>
@~/.claude/get-shit-done/workflows/new-workspace.md
@~/.claude/get-shit-done/workflows/list-workspaces.md
@~/.claude/get-shit-done/workflows/remove-workspace.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--new`: strip the flag, pass remainder (--name, --repos, --path, --strategy, --branch, --auto flags) to new-workspace workflow
- If it is `--list`: execute list-workspaces workflow (no argument needed)
- If it is `--remove`: strip the flag, pass remainder (workspace-name) to remove-workspace workflow
- Otherwise (no flag): show usage — one of --new, --list, or --remove is required
</context>

<process>
1. Parse the leading flag from $ARGUMENTS.
2. Load and execute the appropriate workflow end-to-end based on the routing table above.
3. Preserve all workflow gates from the target workflow (validation, approvals, commits, routing).
</process>
