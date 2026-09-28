<ci-review-loop>
# 阶段 4：CI 与审查监控循环 - 参考

本文件包含 `/ship` 的 CI 与审查监控循环阶段的详细实现。

**父文档**：`ship.md`

---

<mandatory-requirements>
## 此阶段是强制的

这不是可选的。你必须：
1. 为自动审查者等待完整的 3 分钟
2. 运行监控循环（而不是只检查一次）
3. 合并前处理所有评论
</mandatory-requirements>

---

<pr-auto-review>
## PR 自动审查流程

PR 会收到来自已配置自动审查者（Copilot、Gemini、CodeRabbit 等）的自动审查。

**强制工作流：**
1. PR 创建后，为第一轮审查等待**至少 3 分钟**
2. 阅读所有审查者的**全部评论**
3. 处理**每一条评论** —— 没有例外
4. 迭代直到**零未解决线程**（通常 2-4 轮）

**规则：**
- 始终处理所有评论，包括 "minor" 或 "nit" 类建议
- 除非评论事实上错误或经用户同意，否则不要跳过任何评论
- 把所有反馈视为**必须的修改**，而非建议
</pr-auto-review>

---

<overview>
## 总览

监控循环必须等待：
1. CI 通过
2. 所有评论已解决（已处理或已回复）
3. 不再有 "changes requested" 状态的审查

## 为什么所有评论都重要

**每条评论都必须被处理：**
- Critical/High 问题：立即修复
- Medium 问题：修复（不要延后）
- Minor/Nit 问题：修复（体现对质量的关注）
- 风格建议：修复（保持代码库一致性）
- 提问：给出解释作答
- 误报：回复说明原因，然后标记为已解决
- 不相关：回复说明原因，然后标记为已解决

不要忽略评论。不要留下未解决的评论。干净的 PR 有零个未解决对话。
</overview>

## 监控循环算法

> **注意：** 下面的 JavaScript 是展示算法流程的**概念性伪代码**。
> 请使用本文件定义的 bash 函数来实现。

```javascript
const MAX_ITERATIONS = 10;  // Safety limit
const INITIAL_WAIT_MS = 180000;  // 3 minutes - wait for auto-reviews
const ITERATION_WAIT_MS = 30000;  // 30 seconds between iterations
let iteration = 0;

while (iteration < MAX_ITERATIONS) {
  iteration++;
  console.log(`\n## CI & Review Monitor - Iteration ${iteration}`);

  // Step 1: Wait for CI to complete
  const ciStatus = await waitForCI();
  if (ciStatus === 'failed') {
    await fixCIFailures();
    continue;  // Push fix, re-run CI
  }

  // Step 1.5: First iteration only - wait for auto-reviews
  if (iteration === 1) {
    console.log("Waiting 3 minutes for auto-reviews...");
    await sleep(INITIAL_WAIT_MS);
  }

  // Step 2: Check for PR comments and reviews
  const feedback = await checkPRFeedback();

  if (feedback.unresolvedCount === 0 && !feedback.changesRequested) {
    console.log("[OK] CI passed, all comments resolved");
    break;  // Ready to merge!
  }

  // Step 3: Address ALL feedback
  await addressAllFeedback(PR_NUMBER);

  // Step 4: Push fixes
  if (feedback.hasCodeChanges) {
    await commitAndPush(`fix: address review feedback (iteration ${iteration})`);
  }

  // Step 5: Sleep before next check
  await sleep(ITERATION_WAIT_MS);
}
```

## 步骤 1：等待 CI

```bash
wait_for_ci() {
  echo "Waiting for CI checks..."

  while true; do
    CHECKS=$(gh pr checks $PR_NUMBER --json name,state 2>/dev/null || echo "[]")

    PENDING=$(echo "$CHECKS" | jq '[.[] | select(.state | IN("PENDING", "QUEUED", "IN_PROGRESS"))] | length')
    FAILED=$(echo "$CHECKS" | jq '[.[] | select(.state | IN("FAILURE", "CANCELLED"))] | length')
    PASSED=$(echo "$CHECKS" | jq '[.[] | select(.state=="SUCCESS")] | length')

    if [ "$FAILED" -gt 0 ]; then
      echo "[ERROR] CI failed ($FAILED checks)"
      gh pr checks $PR_NUMBER
      return 1
    elif [ "$PENDING" -eq 0 ] && [ "$PASSED" -gt 0 ]; then
      echo "[OK] CI passed ($PASSED checks)"
      return 0
    elif [ "$PENDING" -eq 0 ] && [ "$PASSED" -eq 0 ]; then
      echo "[WARN] No CI checks found, proceeding..."
      return 0
    fi

    echo "  Waiting... ($PENDING pending, $PASSED passed)"
    sleep 15
  done
}
```

## 步骤 2：检查 PR 反馈

```bash
check_pr_feedback() {
  local pr_number=$1

  echo "Checking PR feedback..."

  # Extract owner and repo from git remote
  REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
  OWNER=$(echo "$REPO_INFO" | cut -d'/' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d'/' -f2)

  # Get review state
  REVIEWS=$(gh pr view $pr_number --json reviews --jq '.reviews')
  CHANGES_REQUESTED=$(echo "$REVIEWS" | jq '[.[] | select(.state=="CHANGES_REQUESTED")] | length')

  # Get unresolved review threads
  # NOTE: Fetches first 100 threads. For PRs with >100 threads, implement pagination.
  UNRESOLVED_THREADS=$(gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
            }
          }
        }
      }
    }
  ' -f owner="$OWNER" -f repo="$REPO" -F pr=$pr_number \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')

  echo "  Unresolved threads: $UNRESOLVED_THREADS"
  echo "  Changes requested: $CHANGES_REQUESTED"

  echo "{\"unresolvedThreads\": $UNRESOLVED_THREADS, \"changesRequested\": $CHANGES_REQUESTED}"
}
```

### 获取完整线程详情

```bash
get_unresolved_threads() {
  local pr_number=$1

  REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
  OWNER=$(echo "$REPO_INFO" | cut -d'/' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d'/' -f2)

  # NOTE: Fetches first 100 threads. For PRs with >100, implement pagination.
  gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              path
              line
              diffHunk
              comments(first: 1) {
                nodes {
                  id
                  body
                }
              }
            }
          }
        }
      }
    }
  ' -f owner="$OWNER" -f repo="$REPO" -F pr=$pr_number \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
}
```

## 步骤 3：处理所有反馈

> **注意：** 这是展示算法流程的**概念性伪代码**。
> 请使用以下方式实现：gh api、Read、Edit、Task (ci-fixer) 等。

```javascript
async function addressAllFeedback(prNumber) {
  const threads = await getUnresolvedThreads(prNumber);

  console.log(`\nAddressing ${threads.length} unresolved threads...`);

  for (const thread of threads) {
    console.log(`\n--- Thread: ${thread.path}:${thread.line} ---`);
    const analysis = analyzeComment(thread);

    switch (analysis.type) {
      case 'code_fix_required':
        console.log(`Action: Fixing code issue`);
        await implementFix(thread);  // Use Task(ci-fixer) or Edit tool
        break;

      case 'style_suggestion':
        console.log(`Action: Applying style fix`);
        await implementFix(thread);
        break;

      case 'question':
        console.log(`Action: Answering question`);
        await replyToComment(prNumber, thread.commentId, generateAnswer(thread));
        await resolveThread(thread.id);
        break;

      case 'false_positive':
        console.log(`Action: Explaining false positive`);
        await replyToComment(prNumber, thread.commentId,
          `This is a false positive because: ${analysis.reason}\n\n` +
          `Resolving. Please reopen if you disagree.`
        );
        await resolveThread(thread.id);
        break;

      case 'not_relevant':
        console.log(`Action: Explaining out of scope`);
        await replyToComment(prNumber, thread.commentId,
          `Outside scope of this PR: ${analysis.reason}\n\n` +
          `Resolving. Please reopen if needed.`
        );
        await resolveThread(thread.id);
        break;

      case 'already_addressed':
        console.log(`Action: Confirming addressed`);
        await replyToComment(prNumber, thread.commentId,
          `Addressed in commit ${gitRevParseHead}.`
        );
        await resolveThread(thread.id);
        break;
    }
  }

  // Request re-review from those who requested changes
  const changesRequestedReviews = await getChangesRequestedReviews(prNumber);
  for (const review of changesRequestedReviews) {
    await requestReReview(prNumber, review.author);
  }
}
```

## 评论分析启发式规则

> **注意：** 用于评论处理的分类启发式规则。

```javascript
function analyzeComment(thread) {
  const body = thread.body.toLowerCase();

  // Question patterns
  if (body.includes('?') || body.startsWith('why') || body.startsWith('how') ||
      body.startsWith('what') || body.startsWith('could you explain')) {
    return { type: 'question', reason: 'Comment is a question' };
  }

  // Style/nit patterns
  if (body.includes('nit:') || body.includes('nitpick') || body.includes('minor:') ||
      body.includes('style:') || body.includes('consider') || body.includes('optional')) {
    return { type: 'style_suggestion', reason: 'Style or minor suggestion' };
  }

  // Out of scope patterns
  if (!thread.diffHunk || commentRefersToUnchangedCode(thread)) {
    return { type: 'not_relevant', reason: 'Comment refers to unchanged code' };
  }

  // Default: treat as code fix required
  return { type: 'code_fix_required', reason: 'Valid code feedback' };
}
```

## 实施修复

代码变更使用 ci-fixer 代理：

```javascript
Task({
  subagent_type: "next-task:ci-fixer",
  prompt: `Fix the following review comment:

**File**: ${thread.path}
**Line**: ${thread.line}
**Comment**: ${thread.body}
**Code Context**:
\`\`\`
${thread.diffHunk}
\`\`\`

Requirements:
1. Make the minimal change to address the feedback
2. Do NOT over-engineer or add unrelated changes
3. Ensure tests still pass after the fix`
});
```

## 解决线程

```bash
resolve_thread() {
  local thread_id=$1

  gh api graphql -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread {
          isResolved
        }
      }
    }
  ' -f threadId="$thread_id"
}

reply_to_comment() {
  local pr_number=$1
  local comment_id=$2
  local body=$3

  REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
  OWNER=$(echo "$REPO_INFO" | cut -d'/' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d'/' -f2)

  gh api -X POST "repos/$OWNER/$REPO/pulls/$pr_number/comments" \
    -f body="$body" \
    -F in_reply_to="$comment_id"
}
```

## 步骤 4：提交并推送

```bash
commit_and_push_fixes() {
  local message=$1
  local branch=${2:-$(git branch --show-current)}

  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "$message"
    git push origin "$branch"
    echo "[OK] Pushed fixes"
    return 0
  else
    echo "No code changes to commit (only comment replies)"
    return 1
  fi
}
```

## 完整循环脚本

```bash
#!/bin/bash
# Phase 4: CI & Review Monitor Loop

MAX_ITERATIONS=10
INITIAL_WAIT=${SHIP_INITIAL_WAIT:-180}  # Configurable via env var
ITERATION_WAIT=30
iteration=0

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "[CI Monitor] Iteration $iteration"

  # Step 1: Wait for CI
  if ! wait_for_ci; then
    echo "CI failed - launching ci-fixer agent..."
    continue
  fi

  # Step 1.5: First iteration - wait for auto-reviews
  if [ $iteration -eq 1 ] && [ "$INITIAL_WAIT" -gt 0 ]; then
    echo "First iteration - waiting ${INITIAL_WAIT}s for auto-reviews..."
    sleep $INITIAL_WAIT
  fi

  # Step 2: Check feedback
  FEEDBACK=$(check_pr_feedback $PR_NUMBER)
  UNRESOLVED=$(echo "$FEEDBACK" | jq -r '.unresolvedThreads')
  CHANGES_REQ=$(echo "$FEEDBACK" | jq -r '.changesRequested')

  if [ "$UNRESOLVED" -eq 0 ] && [ "$CHANGES_REQ" -eq 0 ]; then
    echo "[OK] ALL CHECKS PASSED"
    echo "[OK] ALL COMMENTS RESOLVED"
    echo "Ready to merge!"
    break
  fi

  # Step 3: Address all feedback
  echo "Addressing $UNRESOLVED unresolved threads..."

  # Step 4: Commit and push
  commit_and_push_fixes "fix: address review feedback (iteration $iteration)"

  # Step 5: Wait before next iteration
  echo "Waiting ${ITERATION_WAIT}s..."
  sleep $ITERATION_WAIT
done

if [ $iteration -ge $MAX_ITERATIONS ]; then
  echo "[ERROR] Max iterations reached - manual intervention required"
  exit 1
fi
```

<iteration-summary>
## 迭代摘要输出

```markdown
## Iteration ${iteration} Summary

**CI Status**: [OK] Passed
**Comments Addressed**: ${addressedCount}
  - Code fixes: ${codeFixCount}
  - Answered questions: ${questionCount}
  - Resolved as not applicable: ${notApplicableCount}
**Remaining Unresolved**: ${remainingCount}

${remainingCount > 0 ? 'Continuing...' : 'Ready to merge!'}
```
</iteration-summary>
</ci-review-loop>
