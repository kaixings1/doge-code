---
name: gsd:ai-integration-phase
为涉及构建 AI 系统的阶段生成 AI-SPEC.md 设计合约。
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - WebFetch
  - WebSearch
  - AskUserQuestion
  - mcp__context7__*
requires: [phase]
---
<objective>
为涉及 AI 系统开发的阶段创建 AI 设计合约（AI-SPEC.md）。
编排 gsd-framework-selector → gsd-ai-researcher → gsd-domain-researcher → gsd-eval-planner。
流程：选择框架 → 研究文档 → 研究领域 → 设计评估策略 → 完成
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/ai-integration-phase.md
@~/.claude/get-shit-done/references/ai-frameworks.md
@~/.claude/get-shit-done/references/ai-evals.md
</execution_context>

<context>
阶段编号：$ARGUMENTS — 可选，如果省略则自动检测下一个未规划的阶段。
</context>

<process>
端到端执行。
保留所有工作流关卡。
</process>
