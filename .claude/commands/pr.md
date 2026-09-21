---
description: "从当前分支及未推送的提交创建 GitHub PR —— 发现模板、分析变更、推送"
argument-hint: "[base-branch] (default: main)"
---

# 创建 Pull Request

**输入**：`$ARGUMENTS` —— 可选，可能包含基础分支名和/或标志（例如 `--draft`）。

**解析 `$ARGUMENTS`**：
- 提取任何已识别的标志（`--draft`）
- 把其余非标志文本作为基础分支名
- 未指定时基础分支默认为 `main`

---

## 阶段 1 —— 校验（VALIDATE）

检查前置条件：

```bash
git branch --show-current
git status --short
git log origin/<base>..HEAD --oneline
```

| 检查 | 条件 | 失败时的动作 |
|---|---|---|
| 不在基础分支上 | 当前分支 ≠ base | 停止："Switch to a feature branch first." |
| 工作目录干净 | 无未提交变更 | 警告："You have uncommitted changes. Commit or stash first." |
| 有领先的提交 | `git log origin/<base>..HEAD` 非空 | 停止："No commits ahead of `<base>`. Nothing to PR." |
| 无既有 PR | `gh pr list --head <branch> --json number` 为空 | 停止："PR already exists: #<number>. Use `gh pr view <number> --web` to open it." |

如果所有检查都通过，继续。

---

## 阶段 2 —— 发现（DISCOVER）

### PR 模板

按顺序搜索 PR 模板：

1. `.github/PULL_REQUEST_TEMPLATE/` 目录 —— 如果存在，列出文件让用户选择（或使用 `default.md`）
2. `.github/PULL_REQUEST_TEMPLATE.md`
3. `.github/pull_request_template.md`
4. `docs/pull_request_template.md`

如果找到，读取它并用其结构作为 PR 正文。

### 提交分析

```bash
git log origin/<base>..HEAD --format="%h %s" --reverse
```

分析提交以确定：
- **PR 标题**：使用带类型前缀的约定式提交格式 —— `feat: ...`、`fix: ...` 等
  - 如果有多个类型，使用占主导的那个
  - 如果是单个提交，直接使用其消息
- **变更摘要**：按类型/领域对提交分组

### 文件分析

```bash
git diff origin/<base>..HEAD --stat
git diff origin/<base>..HEAD --name-only
```

对变更文件分类：源码、测试、文档、配置、迁移。

### 规划工件

检查由 `/plan-prd`、`/plan` 或旧版 PRP 工作流产出的相关工件：
- `.claude/prds/` —— 本 PR 实现了其中某个里程碑的 PRD
- `.claude/plans/` —— 本 PR 执行的计划
- `.claude/PRPs/prds/` —— 旧版 PRP PRD
- `.claude/PRPs/plans/` —— 旧版 PRP 实现计划
- `.claude/PRPs/reports/` —— 旧版 PRP 实现报告

如果它们存在，在 PR 正文中引用。

---

## 阶段 3 —— 推送（PUSH）

```bash
git push -u origin HEAD
```

如果推送因分叉而失败：
```bash
git fetch origin
git rebase origin/<base>
git push -u origin HEAD
```

如果 rebase 出现冲突，停止并告知用户。

---

## 阶段 4 —— 创建（CREATE）

### 有模板时

如果在阶段 2 找到了 PR 模板，使用提交和文件分析填写每个章节。保留所有模板章节 —— 不适用的章节留为 "N/A" 而不是删除它们。

### 无模板时

使用此默认格式：

```markdown
## Summary

<1-2 sentence description of what this PR does and why>

## Changes

<bulleted list of changes grouped by area>

## Files Changed

<table or list of changed files with change type: Added/Modified/Deleted>

## Testing

<description of how changes were tested, or "Needs testing">

## Related Issues

<linked issues with Closes/Fixes/Relates to #N, or "None">
```

### 创建 PR

```bash
gh pr create \
  --title "<PR title>" \
  --base <base-branch> \
  --body "<PR body>"
  # Add --draft if the --draft flag was parsed from $ARGUMENTS
```

---

## 阶段 5 —— 验证（VERIFY）

```bash
gh pr view --json number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles
gh pr checks --json name,status,conclusion 2>/dev/null || true
```

---

## 阶段 6 —— 输出（OUTPUT）

向用户报告：

```
PR #<number>: <title>
URL: <url>
Branch: <head> → <base>
Changes: +<additions> -<deletions> across <changedFiles> files

CI Checks: <status summary or "pending" or "none configured">

Artifacts referenced:
  - <any PRDs/plans linked in PR body>

Next steps:
  - gh pr view <number> --web   → open in browser
  - /code-review <number>       → review the PR
  - gh pr merge <number>        → merge when ready
```

---

## 边界情况

- **没有 `gh` CLI**：以 "GitHub CLI (`gh`) is required. Install: <https://cli.github.com/>" 停止
- **未认证**：以 "Run `gh auth login` first." 停止
- **需要强制推送**：如果远端已分叉且已执行 rebase，使用 `git push --force-with-lease`（绝不用 `--force`）。
- **多个 PR 模板**：如果 `.github/PULL_REQUEST_TEMPLATE/` 有多个文件，列出它们并让用户选择。
- **大型 PR（>20 个文件）**：警告 PR 体积。如果变更在逻辑上可分离，建议拆分。
