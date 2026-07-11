---
name: gsd:resume-work
从上一会话恢复工作并完整恢复上下文。
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - SlashCommand
---

<objective>
从上一会话无缝恢复完整的项目上下文并恢复工作。

路由到 resume-project 工作流，它处理：

- STATE.md 加载（如果缺失则重建）
- 检查点检测（.continue-here 文件）
- 未完成工作检测（有 PLAN 无 SUMMARY）
- 状态展示
- Context-aware next action routing
  </objective>

<execution_context>
@~/.claude/get-shit-done/workflows/resume-project.md
</execution_context>

<process>
Execute end-to-end.
</process>
