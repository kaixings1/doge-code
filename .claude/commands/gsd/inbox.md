---
name: gsd:inbox
对照项目模板和贡献指南对开放的 GitHub issue 和 PR 进行分类和审查。
argument-hint: "[--issues] [--prs] [--label] [--close-incomplete] [--repo owner/repo]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Grep
  - Glob
  - AskUserQuestion
requires: [review]
---
<objective>
一键分类项目的 GitHub 收件箱。获取所有开放的议题和 PR，
根据相应的模板要求（功能、增强、错误、杂务、修复 PR、增强 PR、功能 PR）审查每个议题/PR，
报告完整性和合规性，并可选择应用标签或关闭不合规的提交。

**流程：** 检测仓库 → 获取开放的议题 + PR → 按类型分类 → 对照模板审查 → 报告发现 → 可选操作（标签、评论、关闭）
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/inbox.md
</execution_context>

<context>
**Flags:**
- `--issues` — Review only issues (skip PRs)
- `--prs` — Review only PRs (skip issues)
- `--label` — Auto-apply recommended labels after review
- `--close-incomplete` — Close issues/PRs that fail template compliance (with comment explaining why)
- `--repo owner/repo` — Override auto-detected repository (defaults to current git remote)
</context>

<process>
Execute end-to-end.
Parse flags from arguments and pass to workflow.
</process>
