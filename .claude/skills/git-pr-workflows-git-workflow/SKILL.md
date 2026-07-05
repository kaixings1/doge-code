---
name: git-pr-workflows-git-workflow
description: "编排从代码审查到 PR 创建的全面 git 工作流，利用专门代理进行质量保证、测试和部署就绪性。"
risk: critical
source: community
date_added: "2026-02-27"
---

# 完整 Git 工作流（多代理编排）

Orchestrate a comprehensive git workflow from code review through PR creation, leveraging specialized agents for quality assurance, testing, and deployment readiness. This workflow implements modern git best practices including Conventional Commits, automated testing, and structured PR creation.

[Extended thinking: This workflow coordinates multiple specialized agents to ensure code quality before commits are made. The code-reviewer agent performs initial quality checks, test-automator ensures all tests pass, and deployment-engineer verifies production readiness. By orchestrating these agents sequentially with context passing, we prevent broken code from entering the repository while maintaining high velocity. The workflow supports both trunk-based and feature-branch strategies with configurable options for different team needs.]

## 使用此技能的场景

- Working on complete git workflow with multi-agent orchestration tasks or workflows
- Needing guidance, best practices, or checklists for complete git workflow with multi-agent orchestration

## 不要使用此技能的场景

- The task is unrelated to complete git workflow with multi-agent orchestration
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant best practices and validate outcomes.
- Provide actionable steps and verification.
- If detailed examples are required, open `resources/implementation-playbook.md`.

## 配置

**Target branch**: $ARGUMENTS (defaults to 'main' if not specified)

**Supported flags**:
- `--skip-tests`: Skip automated test execution (use with caution)
- `--draft-pr`: Create PR as draft for work-in-progress
- `--no-push`: Perform all checks but don't push to remote
- `--squash`: Squash commits before pushing
- `--conventional`: Enforce Conventional Commits format strictly
- `--trunk-based`: Use trunk-based development workflow
- `--feature-branch`: Use feature branch workflow (default)

## Phase 1: Pre-Commit Review and Analysis

### 1. Code Quality Assessment
- Use Task tool with subagent_type="code-reviewer"
- Prompt: "Review all uncommitted changes for code quality issues. Check for: 1) Code style violations, 2) 安全性 vulnerabilities, 3) 性能 concerns, 4) Missing error handling, 5) Incomplete implementations. Generate a detailed report with severity levels (critical/high/medium/low) and provide specific line-by-line feedback. Output format: JSON with {issues: [], summary: {critical: 0, high: 0, medium: 0, low: 0}, recommendations: []}"
- Expected output: Structured code review report for next phase

### 2. Dependency and Breaking Change Analysis
- Use Task tool with subagent_type="code-reviewer"
- Prompt: "Analyze the changes for: 1) New dependencies or version changes, 2) Breaking API changes, 3) Database schema modifications, 4) 配置 changes, 5) Backward compatibility issues. 上下文 from previous review: [insert issues summary]. Identify any changes that require migration scripts or documentation updates."
- 上下文 from previous: Code quality issues that might indicate breaking changes
- Expected output: Breaking change assessment and migration requirements

## Phase 2: Testing and Validation

### 1. Test Execution and Coverage
- Use Task tool with subagent_type="unit-testing::test-automator"
- Prompt: "Execute all test suites for the modified code. Run: 1) Unit tests, 2) 集成 tests, 3) End-to-end tests if applicable. Generate coverage report and identify any untested code paths. Based on review issues: [insert critical/high issues], ensure tests cover the problem areas. Provide test results in format: {passed: [], failed: [], skipped: [], coverage: {statements: %, branches: %, functions: %, lines: %}, untested_critical_paths: []}"
- 上下文 from previous: Critical code review issues that need test coverage
- Expected output: Complete test results and coverage metrics

### 2. Test Recommendations and Gap Analysis
- Use Task tool with subagent_type="unit-testing::test-automator"
- Prompt: "Based on test results [insert summary] and code changes, identify: 1) Missing test scenarios, 2) Edge cases not covered, 3) 集成 points needing verification, 4) 性能 benchmarks needed. Generate test implementation recommendations prioritized by risk. 考虑 the breaking changes identified: [insert breaking changes]."
- 上下文 from previous: Test results, breaking changes, untested paths
- Expected output: Prioritized list of additional tests needed

## Phase 3: Commit Message Generation

### 1. Change Analysis and Categorization
- Use Task tool with subagent_type="code-reviewer"
- Prompt: "Analyze all changes and categorize them according to Conventional Commits specification. Identify the primary change type (feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert) and scope. For changes: [insert file list and summary], determine if this should be a single commit or multiple atomic commits. 考虑 test results: [insert test summary]."
- 上下文 from previous: Test results, code review summary
- Expected output: Commit structure recommendation

### 2. Conventional Commit Message Creation
- Use Task tool with subagent_type="llm-application-dev::prompt-engineer"
- Prompt: "Create Conventional Commits format message(s) based on categorization: [insert categorization]. Format: <type>(<scope>): <subject> with blank line then <body> explaining what and why (not how), then <footer> with BREAKING CHANGE: if applicable. Include: 1) Clear subject line (50 chars max), 2) Detailed body explaining rationale, 3) 参考资料 to issues/tickets, 4) Co-authors if applicable. 考虑 the impact: [insert breaking changes if any]."
- 上下文 from previous: Change categorization, breaking changes
- Expected output: Properly formatted commit message(s)

## Phase 4: Branch Strategy and Push Preparation

### 1. Branch Management
- Use Task tool with subagent_type="cicd-automation::deployment-engineer"
- Prompt: "Based on workflow type [--trunk-based or --feature-branch], prepare branch strategy. For feature branch: ensure branch name follows pattern (feature|bugfix|hotfix)/<ticket>-<description>. For trunk-based: prepare for direct main push with feature flag strategy if needed. Current branch: [insert branch], target: [insert target branch]. Verify no conflicts with target branch."
- Expected output: Branch preparation commands and conflict status

### 2. Pre-Push Validation
- Use Task tool with subagent_type="cicd-automation::deployment-engineer"
- Prompt: "Perform final pre-push checks: 1) Verify all CI checks will pass, 2) Confirm no sensitive data in commits, 3) Validate commit signatures if required, 4) Check branch protection rules, 5) Ensure all review comments addressed. Test summary: [insert test results]. Review status: [insert review summary]."
- 上下文 from previous: All previous validation results
- Expected output: Push readiness confirmation or blocking issues

## Phase 5: Pull Request Creation

### 1. PR Description Generation
- Use Task tool with subagent_type="documentation-generation::docs-architect"
- Prompt: "Create comprehensive PR description including: 1) 总结 of changes (what and why), 2) Type of change checklist, 3) Testing performed summary from [insert test results], 4) Screenshots/recordings if UI changes, 5) 部署 notes from [insert deployment considerations], 6) 相关 issues/tickets, 7) Breaking changes section if applicable: [insert breaking changes], 8) Reviewer checklist. Format as GitHub-flavored Markdown."
- 上下文 from previous: All validation results, test outcomes, breaking changes
- Expected output: Complete PR description in Markdown

### 2. PR Metadata and Automation 设置
- Use Task tool with subagent_type="cicd-automation::deployment-engineer"
- Prompt: "Configure PR metadata: 1) Assign appropriate reviewers based on CODEOWNERS, 2) Add labels (type, priority, component), 3) Link related issues, 4) Set milestone if applicable, 5) Configure merge strategy (squash/merge/rebase), 6) Set up auto-merge if all checks pass. 考虑 draft status: [--draft-pr flag]. Include test status: [insert test summary]."
- 上下文 from previous: PR description, test results, review status
- Expected output: PR configuration commands and automation rules

## Success Criteria

- ✅ All critical and high-severity code issues resolved
- ✅ Test coverage maintained or improved (target: >80%)
- ✅ All tests passing (unit, integration, e2e)
- ✅ Commit messages follow Conventional Commits format
- ✅ No merge conflicts with target branch
- ✅ PR description complete with all required sections
- ✅ Branch protection rules satisfied
- ✅ 安全性 scanning completed with no critical vulnerabilities
- ✅ 性能 benchmarks within acceptable thresholds
- ✅ Documentation updated for any API changes

## Rollback Procedures

In case of issues after merge:

1. **Immediate Revert**: Create revert PR with `git revert <commit-hash>`
2. **Feature Flag Disable**: If using feature flags, disable immediately
3. **Hotfix Branch**: For critical issues, create hotfix branch from main
4. **Communication**: Notify team via designated channels
5. **Root Cause Analysis**: Document issue in postmortem template

## Best Practices Reference

- **Commit Frequency**: Commit early and often, but ensure each commit is atomic
- **Branch Naming**: `(feature|bugfix|hotfix|docs|chore)/<ticket-id>-<brief-description>`
- **PR Size**: Keep PRs under 400 lines for effective review
- **Review Response**: Address review comments within 24 hours
- **Merge Strategy**: Squash for feature branches, merge for release branches
- **Sign-Off**: Require at least 2 approvals for main branch changes

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
