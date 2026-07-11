---
name: 功能开发
description: 功能开发工作流
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development

在处理 `everything-claude-code` 中的 **feature-development** 时使用此工作流。

## 目标

标准功能实现工作流

## 常见文件

- `manifests/*`
- `schemas/*`
- `**/*.test.*`
- `**/api/**`

## 建议顺序

1. 在编辑前了解当前状态和失败模式。
2. 做出满足工作流目标的最小一致性更改。
3. 对涉及的文件的运行最相关的验证。
4. 总结变更内容以及仍需审查的部分。

## 典型提交信号

- 添加功能实现
- 添加功能测试
- 更新文档

## 备注

- 将其视为脚手架，而非硬编码脚本。
- 如果工作流发生重大演变，请更新此命令。