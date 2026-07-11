---
name: 添加语言规则
description: 添加语言规则
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-language-rules

在处理 `everything-claude-code` 中的 **add-language-rules** 时使用此工作流。

## 目标

向规则系统中添加新的编程语言，包括编码风格、钩子、模式、安全和测试指南。

## 常见文件

- `rules/*/coding-style.md`
- `rules/*/hooks.md`
- `rules/*/patterns.md`
- `rules/*/security.md`
- `rules/*/testing.md`

## 建议顺序

1. 在编辑前了解当前状态和失败模式。
2. 做出满足工作流目标的最小一致性更改。
3. 对涉及的文件的运行最相关的验证。
4. 总结变更内容以及仍需审查的部分。

## 典型提交信号

- 在 rules/{language}/ 下创建新目录
- 添加特定于语言的 coding-style.md、hooks.md、patterns.md、security.md 和 testing.md 文件
- 可选地引用或链接到相关技能

## 备注

- 将其视为脚手架，而非硬编码脚本。
- 如果工作流发生重大演变，请更新此命令。