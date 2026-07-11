---
description: 清理已合并的分支
---

清理已合并的分支。用法: `/cleanup-branches [--dry-run]`

如果 `$ARGUMENTS` 包含 "dry-run" 或 "--dry-run"，仅列出将会被删除的分支——不实际删除。

## 步骤 1：查找已合并的分支

查找所有已完全合并到当前分支的本地和远程分支：

```bash
git branch --merged
git branch -r --merged
```

排除受保护的分支——绝不删除：
- `main`、`master`、`develop`、`development`
- `staging`、`Staging`
- `Dev`、`QA`
- 项目 CLAUDE.md 流水线配置表中列出的任何分支

## 步骤 2：识别候选分支

仅筛选出遵循命名规范或常见模式的功能/工作分支：

- `feature/*`、`story/*`、`bugfix/*`、`hotfix/*`、`work/*`
- `release/*-to-*`、`cherry-pick/*`、`revert/*`
- 任务分支（例如 `T3796`、`U3297`）

展示列表：

```
## 分支清理

### 要删除的分支（{count} 个）：
| 分支 | 最后提交 | 合并到 |
|--------|-------------|-------------|
| story/AB#4521-admin-export | 2026-03-18 | develop |
| bugfix/AB#4589-login-plus-sign | 2026-03-19 | develop |
| release/24-to-staging | 2026-03-21 | staging |
| cherry-pick/2026-03-22-to-production | 2026-03-22 | main |

### 受保护（不会被删除）：
- main、develop、staging

删除 {count} 个已合并分支？（是/否）
```

如果是 `--dry-run`，显示列表但不需要确认，也不删除。

等待确认后再继续。

## 步骤 3：删除

对每个已确认的分支：

```bash
# 删除本地分支
git branch -d <branch-name>

# 删除远程分支
git push origin --delete <branch-name>
```

报告结果：

```
已清理 {count} 个分支。

已删除：
- story/AB#4521-admin-export（本地 + 远程）
- bugfix/AB#4589-login-plus-sign（本地 + 远程）
- release/24-to-staging（仅远程）
- cherry-pick/2026-03-22-to-production（仅远程）
```
