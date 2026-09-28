---
description: 从提交到生产的完整 PR 工作流，带验证
argument-hint: "[--strategy STRATEGY] [--skip-tests] [--dry-run] [--state-file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task
---

# /ship - 完整 PR 工作流

端到端工作流：提交 - PR - CI - 审查 - 合并 - 部署 - 验证 - 生产。

自动适配你的项目的 CI 平台、部署平台和分支策略。

---

<mandatory-steps>
## 强制步骤 - 无捷径

阶段 4（CI 与审查监控循环）即使从 /next-task 调用也是强制的。

| 步骤 | 要求 | 为什么重要 |
|------|-------------|----------------|
| 3 分钟初始等待 | PR 创建后必须等待 | 自动审查者需要时间分析 |
| 监控循环迭代 | 必须运行完整循环 | 捕获人类遗漏的问题 |
| 处理所有评论 | 零未解决线程 | 质量门禁，否则阻塞合并 |

### 禁止的操作
- 只检查一次 CI 就继续合并
- 跳过为自动审查者设置的 3 分钟初始等待
- 忽略 "minor" 或 "nit" 类评论
- 带着未解决的评论线程进行合并
- 把 "还没有评论就意味着可以合并" 合理化

### 必需的验证输出

在继续合并之前，输出：
```
[VERIFIED] Phase 4: wait=180s, iterations=N, unresolved=0
```
</mandatory-steps>

---

## 快速参考

| 阶段 | 描述 | 详情 |
|-------|-------------|---------|
| 1-3 | 预检、提交、创建 PR | 本文件 |
| 4 | CI 与审查监控循环 | 见 `ship-ci-review-loop.md` |
| 5 | 子代理审查（独立运行时） | 本文件 |
| 6 | 合并 PR | 本文件 |
| 7-10 | 部署与验证 | 见 `ship-deployment.md` |
| 11-12 | 清理与报告 | 本文件 |
| 错误 | 错误处理与回滚 | 见 `ship-error-handling.md` |

## 与 /next-task 的集成

从 `/next-task` 工作流调用时（通过 `--state-file`）：
- **跳过阶段 5** 的内部审查代理（阶段 9 的审查循环已完成）
- **跳过 deslop/docs**（deslop-work、docs-updater 已完成）
- **信任**所有质量门禁都已通过

**关键：阶段 4 始终运行** —— 即使从 /next-task 调用。外部自动审查者（Gemini、Copilot、CodeRabbit）在 PR 创建**之后**才评论，必须被处理。

独立调用时，运行包含审查在内的完整工作流。

## 参数

从 $ARGUMENTS 解析：
- **--strategy**：合并策略：`squash`（默认） | `merge` | `rebase`
- **--skip-tests**：跳过测试验证（危险）
- **--dry-run**：展示将会发生什么，但不实际执行
- **--state-file**：工作流状态文件路径（用于 /next-task 集成）

## 状态集成

```javascript
const { getPluginRoot } = require('@awesome-slash/lib/cross-platform');
const pluginRoot = getPluginRoot('ship');
if (!pluginRoot) { console.error('Error: Could not locate ship plugin root'); process.exit(1); }

const args = '$ARGUMENTS'.split(' ');
const stateIdx = args.indexOf('--state-file');
let workflowState = null;
if (stateIdx >= 0) {
  workflowState = require(`${pluginRoot}/lib/state/workflow-state.js`);
}

function updatePhase(phase, result) {
  if (!workflowState) return;
  workflowState.startPhase(phase);
  if (result) workflowState.completePhase(result);
}
```

## 阶段 1：预检

```bash
# Detect platform and project configuration
PLUGIN_PATH=$(node -e "const { getPluginRoot, normalizePathForRequire } = require('@awesome-slash/lib/cross-platform'); const root = getPluginRoot('ship'); if (!root) { console.error('Error: Could not locate ship plugin root'); process.exit(1); } console.log(normalizePathForRequire(root));")
PLATFORM=$(node "$PLUGIN_PATH/lib/platform/detect-platform.js")
TOOLS=$(node "$PLUGIN_PATH/lib/platform/verify-tools.js")

# Extract critical info
CI_PLATFORM=$(echo $PLATFORM | jq -r '.ci')
DEPLOYMENT=$(echo $PLATFORM | jq -r '.deployment')
BRANCH_STRATEGY=$(echo $PLATFORM | jq -r '.branchStrategy')
MAIN_BRANCH=$(echo $PLATFORM | jq -r '.mainBranch')

# Check required tools
GH_AVAILABLE=$(echo $TOOLS | jq -r '.gh.available')
if [ "$GH_AVAILABLE" != "true" ]; then
  echo "ERROR: GitHub CLI (gh) required for PR workflow"
  exit 1
fi

# Determine workflow type
if [ "$BRANCH_STRATEGY" = "multi-branch" ]; then
  WORKFLOW="dev-prod"
  PROD_BRANCH="stable"
else
  WORKFLOW="single-branch"
fi
```

### 验证 Git 状态

```bash
# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  NEEDS_COMMIT="true"
else
  NEEDS_COMMIT="false"
fi

# Must be on feature branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
  echo "ERROR: Cannot ship from $MAIN_BRANCH, must be on feature branch"
  exit 1
fi
```

### 干跑模式

如果提供了 `--dry-run`，展示计划并退出：
```markdown
## Dry Run: What Would Happen
**Branch**: ${CURRENT_BRANCH} → **Target**: ${MAIN_BRANCH}
**Workflow**: ${WORKFLOW} | **CI**: ${CI_PLATFORM} | **Deploy**: ${DEPLOYMENT}
```

## 阶段 2：提交当前工作

仅当 `NEEDS_COMMIT=true` 时：

```bash
# Stage relevant files (exclude secrets)
git status --porcelain | awk '{print $2}' | grep -v '\.env' | xargs git add

# Generate semantic commit message
# Format: <type>(<scope>): <subject>
# Types: feat, fix, docs, refactor, test, chore

git commit -m "$(cat <<'EOF'
${COMMIT_MESSAGE}
EOF
)"

COMMIT_SHA=$(git rev-parse HEAD)
echo "[OK] Committed: $COMMIT_SHA"
```

## 阶段 3：创建拉取请求

```bash
# Push to remote
git push -u origin $CURRENT_BRANCH

# Create PR
PR_URL=$(gh pr create \
  --base "$MAIN_BRANCH" \
  --title "$PR_TITLE" \
  --body "$(cat <<'EOF'
## Summary
- Bullet points of changes

## Test Plan
- How to test

## Related Issues
Closes #X
EOF
)")

PR_NUMBER=$(echo $PR_URL | grep -oP '/pull/\K\d+')
echo "[OK] Created PR #$PR_NUMBER: $PR_URL"
```

<phase-4>
## 阶段 4：CI 与审查监控循环

**阻塞关卡** —— 此阶段是强制的。未完成不得继续合并。

完整实现细节见 `ship-ci-review-loop.md`。

### 摘要

监控循环必须：
1. 等待 CI 通过
2. 为自动审查者等待 3 分钟（第一轮迭代强制）
3. 处理所有评论（零未解决线程）
4. 迭代直到干净

**每条评论都必须被处理：**
- Critical/High 问题：立即修复
- Medium/Minor 问题：修复（体现质量）
- 提问：给出解释作答
- 误报：回复说明原因，然后标记为已解决

不要忽略评论。不要留下未解决的评论。
不要跳过 3 分钟等待。不要只检查一次 CI 就合并。

### 循环结构

```bash
MAX_ITERATIONS=10
INITIAL_WAIT=180  # 3 minutes - do not reduce or skip

iteration=0
while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "[CI Monitor] Iteration $iteration"

  # 1. Wait for CI to complete
  wait_for_ci || { fix_ci_failures; continue; }

  # 2. First iteration must wait for auto-reviews
  if [ $iteration -eq 1 ]; then
    echo "Waiting ${INITIAL_WAIT}s for auto-reviewers..."
    sleep $INITIAL_WAIT
    echo "[DONE] Initial wait complete"
  fi

  # 3. Check feedback
  FEEDBACK=$(check_pr_feedback $PR_NUMBER)
  UNRESOLVED=$(echo "$FEEDBACK" | jq -r '.unresolvedThreads')

  echo "Unresolved threads: $UNRESOLVED"

  # 4. Exit only if zero unresolved
  if [ "$UNRESOLVED" -eq 0 ]; then
    echo "[OK] All comments resolved - ready to merge"
    break
  fi

  # 5. Address all feedback (see ship-ci-review-loop.md)
  address_all_feedback $PR_NUMBER

  # 6. Commit and push fixes
  commit_and_push_fixes "fix: address review feedback (iteration $iteration)"

  # 7. Wait before next iteration
  sleep 30
done

# Verification output - mandatory
echo "[VERIFIED] Phase 4: wait=180s, iterations=$iteration, unresolved=0"
```

### 阶段 4 中禁止的操作
- `sleep 0` 或移除初始等待
- 只检查一次 CI 而不运行循环
- 带着未解决评论跳出循环
- 没有验证输出就跳到阶段 6（合并）
</phase-4>

## 阶段 5：审查循环（仅独立运行时）

**从 /next-task 调用时跳过**（审查已完成）。

```javascript
if (workflowState) {
  const state = workflowState.readState();
  const reviewPhase = state?.phases?.history?.find(p => p.phase === 'review-loop');
  if (reviewPhase?.result?.approved) {
    SKIP_REVIEW = true;  // Skip to Phase 6
  }
}
```

独立运行时，并行启动核心审查遍（错误处理属于代码质量的一部分）：

```javascript
const reviewPasses = [
  { id: 'code-quality', role: 'code quality reviewer' },
  { id: 'security', role: 'security reviewer' },
  { id: 'performance', role: 'performance reviewer' },
  { id: 'test-coverage', role: 'test coverage reviewer' }
];

// Add specialists based on repo signals (db, architecture, api, frontend, backend, devops)
// Then launch in parallel:
reviewPasses.map(pass => Task({
  subagent_type: "review",
  prompt: `Role: ${pass.role}. Review PR #${PR_NUMBER} and return JSON findings.`
}));
```

迭代直到不再有未解决（非误报）的问题（独立运行时最多 3 轮）。

<phase-6>
## 阶段 6：合并 PR

合并前检查（不要跳过）：

```bash
# 1. Verify mergeable status
MERGEABLE=$(gh pr view $PR_NUMBER --json mergeable --jq '.mergeable')
[ "$MERGEABLE" != "MERGEABLE" ] && { echo "[ERROR] PR not mergeable"; exit 1; }

# 2. Verify all comments resolved (zero unresolved threads)
# Use separate gh calls for cleaner extraction (avoids cut parsing issues)
OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO=$(gh repo view --json name --jq '.name')

# NOTE: Fetches first 100 threads. For PRs with >100 comment threads (rare),
# implement pagination using pageInfo.hasNextPage and pageInfo.endCursor.
# This covers 99.9% of PRs - pagination is left as a future enhancement.
UNRESOLVED=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes { isResolved }
        }
      }
    }
  }
' -f owner="$OWNER" -f repo="$REPO" -F pr=$PR_NUMBER \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')

if [ "$UNRESOLVED" -gt 0 ]; then
  echo "[ERROR] Cannot merge: $UNRESOLVED unresolved comment threads"
  echo "Go back to Phase 4 and address all comments"
  exit 1
fi

echo "[OK] All comments resolved"

# 3. Merge with strategy (default: squash)
STRATEGY=${STRATEGY:-squash}
gh pr merge $PR_NUMBER --$STRATEGY --delete-branch

# Update local
git checkout $MAIN_BRANCH
git pull origin $MAIN_BRANCH

# Update repo-map if it exists (non-blocking)
node -e "const { getPluginRoot } = require('@awesome-slash/lib/cross-platform'); const pluginRoot = getPluginRoot('ship'); if (!pluginRoot) { console.log('Plugin root not found, skipping repo-map'); process.exit(0); } const repoMap = require(\`\${pluginRoot}/lib/repo-map\`); if (repoMap.exists(process.cwd())) { repoMap.update(process.cwd(), {}).then(() => console.log('[OK] Repo-map updated')).catch((e) => console.log('[WARN] Repo-map update failed: ' + e.message)); } else { console.log('Repo-map not found, skipping'); }" || true
MERGE_SHA=$(git rev-parse HEAD)
echo "[OK] Merged PR #$PR_NUMBER at $MERGE_SHA"
```
</phase-6>

## 阶段 7-10：部署与验证

**如果 `WORKFLOW="single-branch"` 则跳过**

平台专属细节见 `ship-deployment.md`：
- 阶段 7：部署到开发环境（Railway、Vercel、Netlify）
- 阶段 8：验证开发环境（健康检查、冒烟测试）
- 阶段 9：部署到生产环境（合并到生产分支）
- 阶段 10：验证生产环境（失败时自动回滚）

## 阶段 11：清理

```bash
# Clean up worktrees
git worktree list --porcelain | grep "worktree" | grep -v "$(git rev-parse --show-toplevel)" | while read -r wt; do
  WORKTREE_PATH=$(echo $wt | awk '{print $2}')
  git worktree remove $WORKTREE_PATH --force 2>/dev/null || true
done
```

### 关闭 GitHub Issue（如适用）

如果任务来自 GitHub issue，用完成评论关闭它：

```bash
if [ -n "$TASK_ID" ] && [ "$TASK_SOURCE" = "github" ]; then
  # Post completion comment
  gh issue comment "$TASK_ID" --body "$(cat <<'EOF'
[DONE] **Task Completed Successfully**

**PR**: #${PR_NUMBER}
**Status**: Merged to ${MAIN_BRANCH}
**Commit**: ${MERGE_SHA}

### Summary
- Implementation completed as planned
- All review comments addressed
- CI checks passed
- Merged successfully

---
_This issue was automatically processed by awesome-slash /next-task workflow._
_Closing issue as the work has been completed and merged._
EOF
)"

  # Close the issue
  gh issue close "$TASK_ID" --reason completed

  echo "[OK] Closed issue #$TASK_ID with completion comment"
fi
```

### 从注册表移除任务

```javascript
// Remove completed task from ${STATE_DIR}/tasks.json
if (workflowState) {
  const state = workflowState.readState();
  const mainRepoPath = state?.git?.mainRepoPath || process.cwd();
  const taskId = state?.task?.id;

  if (taskId) {
    const registryPath = path.join(mainRepoPath, '.claude', 'tasks.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.tasks = registry.tasks.filter(t => t.id !== taskId);
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`[OK] Removed task #${taskId} from registry`);
  }
}
```

### 本地分支清理

```bash
git checkout $MAIN_BRANCH
# Feature branch already deleted by --delete-branch
git branch -D $CURRENT_BRANCH 2>/dev/null || true
```

## 阶段 12：完成报告

```markdown
# Deployment Complete

## Pull Request
**Number**: #${PR_NUMBER} | **Status**: Merged to ${MAIN_BRANCH}

## Review Results
- Code Quality: [OK] | Error Handling: [OK] | Test Coverage: [OK] | CI: [OK]

## Deployments
${WORKFLOW === 'dev-prod' ?
  `Development: ${DEV_URL} [OK] | Production: ${PROD_URL} [OK]` :
  `Production: Deployed to ${MAIN_BRANCH}`}

[OK] Successfully shipped!
```

### 工作流 Hook 响应

展示完成报告后，为 SubagentStop hook 输出 JSON：

```json
{"ok": true, "nextPhase": "completed", "status": "shipped"}
```

这让 `/next-task` 工作流能检测到 `/ship` 已成功完成。

## 错误处理

详细的错误处理见 `ship-error-handling.md`：
- GitHub CLI 不可用
- CI 失败
- 合并冲突
- 部署失败
- 生产验证失败并回滚

## 重要说明

- PR 工作流需要 GitHub CLI (gh)
- 自动适配单分支或多分支工作流
- 平台专属的 CI 与部署监控
- 生产失败时自动回滚
- 尊重项目约定（提交风格、PR 格式）

现在开始阶段 1。
