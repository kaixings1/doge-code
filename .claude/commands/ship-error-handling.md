# 错误处理与恢复 - 参考

本文件包含 `/ship` 的错误处理流程。

**父文档**：`ship.md`

## GitHub CLI 不可用

```markdown
ERROR: GitHub CLI (gh) not found

Install: https://cli.github.com

Or use package manager:
  macOS: brew install gh
  Windows: winget install GitHub.cli
  Linux: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

Then authenticate:
  gh auth login
```

## CI 失败

```markdown
[ERROR] CI checks failed for PR #${PR_NUMBER}

View details:
  ${CI_URL}

Fix the failing tests/checks and push again.
The /ship command will resume from Phase 4 (CI monitoring).

To retry:
  git push
  /ship
```

### 用 ci-fixer 代理修复 CI

CI 失败时，使用 ci-fixer 代理：

```javascript
Task({
  subagent_type: "next-task:ci-fixer",
  prompt: `Fix CI failure for PR #${PR_NUMBER}

CI Output:
${CI_OUTPUT}

Failed checks:
${FAILED_CHECKS}

Requirements:
1. Analyze the failure reason
2. Make minimal fix to pass CI
3. Do not introduce unrelated changes
4. Ensure all tests pass after fix`
});
```

## 合并冲突

```markdown
[ERROR] Cannot merge PR #${PR_NUMBER}: conflicts with ${MAIN_BRANCH}

Resolve conflicts:
  git fetch origin
  git merge origin/${MAIN_BRANCH}
  # Resolve conflicts in your editor
  git add .
  git commit
  git push

Then retry:
  /ship
```

## 部署失败

```markdown
[ERROR] Deployment failed

${WORKFLOW === 'dev-prod' ? 'Development' : 'Production'} deployment did not succeed.

Check deployment logs:
  ${DEPLOYMENT === 'railway' ? 'railway logs' : ''}
  ${DEPLOYMENT === 'vercel' ? 'vercel logs' : ''}
  ${DEPLOYMENT === 'netlify' ? 'netlify logs' : ''}

Once fixed, deployment will retry automatically.
```

## 生产验证失败并回滚

```markdown
[ERROR] Production validation failed

ROLLBACK INITIATED

Production has been rolled back to previous version.
Previous deployment: ${PREVIOUS_SHA}

Issues detected:
  ${VALIDATION_ISSUES}

Fix the issues and try shipping again:
  /ship
```

## 推送失败

```markdown
[ERROR] Push to remote failed

Possible causes:
1. Authentication issue: gh auth status
2. Remote branch protected: check branch protection rules
3. Out of date: git pull --rebase origin ${CURRENT_BRANCH}

Resolve and retry:
  /ship
```

## PR 创建失败

```markdown
[ERROR] Failed to create PR

Possible causes:
1. Already exists: gh pr list --head ${CURRENT_BRANCH}
2. No commits: git log ${MAIN_BRANCH}..HEAD
3. Same branch: ensure not on ${MAIN_BRANCH}

Check existing PRs:
  gh pr list --state all --head ${CURRENT_BRANCH}
```

## 达到最大审查迭代次数

```markdown
[ERROR] Max iterations (${MAX_ITERATIONS}) reached

Unable to resolve all review comments automatically.
Manual intervention required.

Remaining unresolved threads: ${UNRESOLVED_COUNT}

View PR: ${PR_URL}

Options:
1. Manually address remaining comments
2. Request reviewer to close non-blocking items
3. Continue with /ship after resolving
```

## Worktree 清理失败

```markdown
[WARN] Failed to clean up worktree

Worktree at: ${WORKTREE_PATH}

Manual cleanup:
  git worktree remove ${WORKTREE_PATH} --force
  git worktree prune
```

## 强制推送安全

当回滚需要强制推送时：

```bash
# ALWAYS use --force-with-lease instead of --force
# This prevents overwriting unexpected remote changes

if ! git push --force-with-lease origin $PROD_BRANCH; then
  echo "[ERROR] Force push failed - remote has unexpected changes"
  echo "Someone else may have pushed to production"
  echo "Manual investigation required"
  exit 1
fi
```

## 恢复流程

### CI 修复后恢复

```bash
# After fixing CI locally
git add .
git commit -m "fix: address CI failures"
git push

# Resume shipping
/ship
```

### 冲突解决后恢复

```bash
# After resolving merge conflicts
git add .
git commit
git push

# Resume shipping
/ship
```

### 手动处理审查意见后恢复

```bash
# After manually addressing review comments
git add .
git commit -m "fix: address review feedback"
git push

# Resume shipping
/ship
```

### 取消并清理

```bash
# If you need to abandon the PR
gh pr close $PR_NUMBER --delete-branch

# Clean up local
git checkout $MAIN_BRANCH
git branch -D $CURRENT_BRANCH
```

## 退出码

| 退出码 | 含义 |
|------|---------|
| 0 | 成功 - PR 已合并 |
| 1 | 一般失败 |
| 2 | CI 失败（可重试） |
| 3 | 审查超时（需人工介入） |
| 4 | 部署失败 |
| 5 | 已触发回滚 |

## 调试日志

启用详细日志：

```bash
export SHIP_DEBUG=1
/ship
```

这会输出每个阶段的详细信息以便排查问题。
