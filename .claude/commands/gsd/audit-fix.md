---
type: prompt
name: gsd:audit-fix
自主审计修复流水线 - 发现问题、分类、修复、测试、提交。
argument-hint: "--source <audit-uat> [--severity <medium|high|all>] [--max N] [--dry-run]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
requires: [audit-uat]
---
<objective>
运行审计，将发现分类为可自动修复与仅手动修复，然后自主修复
可自动修复的问题，包含测试验证和原子提交。

标志：
- `--max N` — 最多修复的发现数（默认：5）
- `--severity high|medium|all` — 要处理的最低严重程度（默认：medium）
- `--dry-run` — 对发现进行分类但不修复（显示分类表）
- `--source <audit>` — 要运行的审计（默认：audit-uat）
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/audit-fix.md
</execution_context>

<process>
端到端执行。
</process>
