---
name: 数据库迁移
description: 数据库迁移命令
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /database-migration

在处理 `everything-claude-code` 中的 **database-migration** 时使用此工作流。

## 目标

数据库模式变更与迁移文件

## 常见文件

- `**/schema.*`
- `migrations/*`

## 建议顺序

1. 在编辑前了解当前状态和失败模式。
2. 做出满足工作流目标的最小一致性更改。
3. 对涉及的文件的运行最相关的验证。
4. 总结变更内容以及仍需审查的部分。

## 典型提交信号

- 创建迁移文件
- 更新模式定义
- 生成/更新类型

## 备注

- 将其视为脚手架，而非硬编码脚本。
- 如果工作流发生重大演变，请更新此命令。