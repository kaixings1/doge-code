---
name: gsd:settings
配置 GSD 工作流切换和模型配置。
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
requires: [quick]
---

<objective>
通过多问题提示进行 GSD 工作流智能体和模型配置文件的交互式配置。

路由到 settings 工作流，它处理：
- 确保配置存在
- 读取和解析当前设置
- 交互式 5 问题提示（模型、研究、计划检查、验证器、分支）
- 配置合并和写入
- 带有快速命令参考的确认展示
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/settings.md
</execution_context>

<process>
Execute end-to-end.
</process>
