---
name: e2e-testing-patterns
description: "构建可靠、快速且可维护的端到端测试套件，让您有信心快速发布代码并在用户之前捕获回归。"
risk: safe
source: community
date_added: "2026-02-27"
---

# E2E Testing Patterns

Build reliable, fast, and maintainable end-to-end test suites that provide confidence to ship code quickly and catch regressions before users do.

## 使用此技能的场景

- Implementing end-to-end test automation
- Debugging flaky or unreliable tests
- Testing critical user workflows
- Setting up CI/CD test pipelines
- Testing across multiple browsers
- Validating accessibility requirements
- Testing responsive designs
- Establishing E2E testing standards

## 不要使用此技能的场景

- You only need unit or integration tests
- The environment cannot support stable UI automation
- You cannot provision safe test accounts or data

## 使用说明

1. Identify critical user journeys and success criteria.
2. Build stable selectors and test data strategies.
3. Implement tests with retries, tracing, and isolation.
4. Run in CI with parallelization and artifact capture.

## 安全

- Avoid running destructive tests against production.
- Use dedicated test data and scrub sensitive output.

## 资源

- `resources/implementation-playbook.md` for detailed E2E patterns and templates.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
