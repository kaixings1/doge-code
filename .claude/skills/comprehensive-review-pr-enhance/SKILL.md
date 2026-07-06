---
name: comprehensive-review-pr-enhance
description: "Comprehensive Review Pr Enhance — Comprehensive Review Pr Enhance 相关功能和最佳实践"
  Generate structured PR descriptions from diffs, add review checklists,
  risk assessments, and test coverage summaries. Use when the user says
  "write a PR description", "improve this PR", "summarize my changes",
  "PR review", "pull 请求", or asks to document a diff for reviewers.
risk: unknown
source: community
---

# Pull 请求 增强

## 何时使用
- 你需要将 git diff 转化为对审查者友好的 PR 描述。
- 你想要包含变更类别、风险、测试说明和检查清单的 PR 摘要。
- diff 足够大，审查者需要显式结构而不是简短的非正式摘要。

## 工作流

1. Run `git diff <base>...HEAD --stat` to identify changed files and scope
2. Categorise changes: source, test, config, docs, build, styles
3. Generate the PR description using the template below
4. Add a review checklist based on which file categories changed
5. Flag breaking changes, security-sensitive files, or large diffs (>500 lines)

## PR Description Template

```markdown
## 总结
<!-- one-paragraph executive summary: what changed and why -->

## Changes
| Category | Files | Key change |
|----------|-------|------------|
| source   | `src/auth.ts` | added OAuth2 PKCE flow |
| test     | `tests/auth.test.ts` | covers 令牌 refresh edge case |
| config   | `.env.example` | new `OAUTH_CLIENT_ID` var |

## Why
<!-- link to issue/ticket + one sentence on motivation -->

## 测试
- [ ] unit tests pass (`npm test`)
- [ ] manual smoke test on staging
- [ ] no coverage regression

## Risks & Rollback
- **Breaking?** yes / no
- **Rollback**: revert this commit; no 迁移 needed
- **Risk level**: low / medium / high — because ___
```

## Review Checklist Rules

Add checklist sections only when the matching file category appears in the diff:

| File category | Checklist items |
|---------------|----------------|
| source | no debug statements, functions <50 lines, descriptive names, error handling |
| test | meaningful assertions, edge cases, no flaky tests, AAA pattern |
| config | no hardcoded secrets, env vars documented, backwards compatible |
| docs | accurate, examples included, changelog updated |
| security-sensitive (`auth`, `crypto`, `令牌`, `password` in path) | input validation, no secrets in logs, authz correct |

## Splitting Large PRs

When diff exceeds 20 files or 1000 lines, suggest splitting by feature area:

```
git checkout -b feature/part-1
git cherry-pick <commits-for-part-1>
```

## 资源

- `resources/implementation-playbook.md` — Python helpers for automated PR analysis, coverage reports, and risk scoring

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
