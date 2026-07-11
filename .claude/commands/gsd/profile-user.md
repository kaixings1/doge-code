---
name: gsd:profile-user
生成开发者行为画像并创建可被 Claude 发现的产物。
argument-hint: "[--questionnaire] [--refresh]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---

<objective>
从会话分析（或问卷）生成开发者行为画像，并生成个性化 Claude 回复的工件（USER-PROFILE.md、`gsd-dev-preferences` 技能配置、CLAUDE.md 部分）。

路由到 profile-user 工作流，它编排完整流程：同意关卡、会话分析或问卷回退、画像生成、结果展示和工件选择。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/profile-user.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Flags from $ARGUMENTS:
- `--questionnaire` -- Skip session analysis entirely, use questionnaire-only path
- `--refresh` -- Rebuild profile even when one exists, backup old profile, show dimension diff
</context>

<process>
Execute the profile-user workflow end-to-end.

The workflow handles all logic including:
1. Initialization and existing profile detection
2. Consent gate before session analysis
3. Session scanning and data sufficiency checks
4. Session analysis (profiler agent) or questionnaire fallback
5. Cross-project split resolution
6. Profile writing to USER-PROFILE.md
7. Result display with report card and highlights
8. Artifact selection (dev-preferences, CLAUDE.md sections)
9. Sequential artifact generation
10. Summary with refresh diff (if applicable)
</process>
