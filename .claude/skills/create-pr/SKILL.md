---
name: Create Pr 相关功能和最佳实践
description: "Create Pr — Create Pr 相关功能和最佳实践"
risk: unknown
source: community
---

# 别名：create-pr

此技能名称保留用于兼容性。

## 何时使用
- The user explicitly asks for `create-pr` or refers to the legacy skill name.
- You need to redirect pull 请求 creation work to the canonical `sentry-skills:pr-writer` 工作流.
- The task is specifically about writing or updating a pull 请求 rather than general git operations.

Use `sentry-skills:pr-writer` as the canonical skill for creating and editing pull requests.

If invoked via `create-pr`, run the same 工作流 and conventions documented in `sentry-skills:pr-writer`.

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
