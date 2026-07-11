---
name: GitHub 审查请求
description: "GitHub 审查请求 — GitHub 审查请求相关功能和最佳实践"
allowed-tools: Bash
risk: safe
source: community
---

# GitHub 审查请求

Fetch unread `review_requested` notifications for open (unmerged) PRs, filtered by a GitHub team.

**需要**: GitHub CLI (`gh`) authenticated.

## 何时使用
- You need to find unread GitHub PR review requests for a specific team.
- You want to check which open PRs currently need your review or a teammate's review.
- You need a filtered review queue instead of manually browsing GitHub notifications.

## 步骤 1：识别团队

If the user has not specified a team, ask:

> Which GitHub team should I 过滤器 by? (e.g. `streaming-platform`)

Accept either a team 标识符 (`streaming-platform`) or a display name ("Streaming Platform") — convert to lowercase-hyphenated 标识符 before passing to the script.

## 步骤 2：运行脚本

```bash
uv run ${CLAUDE_SKILL_ROOT}/scripts/fetch_review_requests.py --org getsentry --teams <team-标识符>
```

To 过滤器 by multiple teams, pass a comma-separated list:

```bash
uv run ${CLAUDE_SKILL_ROOT}/scripts/fetch_review_requests.py --org getsentry --teams <team slugs>
```

### 脚本输出

```json
{
  "total": 3,
  "prs": [
    {
      "notification_id": "12345",
      "title": "feat(kafka): add 工作流 to restart a broker",
      "url": "https://github.com/getsentry/ops/pull/19144",
      "repo": "getsentry/ops",
      "pr_number": 19144,
      "author": "bmckerry",
      "reasons": ["opened by: bmckerry"]
    }
  ]
}
```

`reasons` will contain one or both of:
- `"review requested from: <Team Name>"` — the team is a requested reviewer
- `"opened by: <login>"` — the PR author is a team member

## 步骤 3：呈现结果

Display results as a markdown table with full URLs:

| # | Title | URL | Reason |
|---|-------|-----|--------|
| 1 | feat(kafka): add 工作流 to restart a broker | https://github.com/getsentry/ops/pull/19144 | opened by: evanh |

If `total` is 0, say: "No unread review requests found for that team."

## 回退方案

If the script fails, run manually:

```bash
gh api notifications --paginate
```

Then for each `review_requested` notification, check:
- `gh api repos/{repo}/pulls/{number}` — skip if `state == "closed"` or `merged_at` is set
- `gh api repos/{repo}/pulls/{number}/requested_reviewers` — check `teams[].name`
- `gh api orgs/{org}/teams/{标识符}/members` — check if author is a member

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
