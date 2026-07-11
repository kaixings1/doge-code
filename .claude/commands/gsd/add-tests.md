---
name: gsd:add-tests
基于 UAT 标准和实施结果为已完成的阶段生成测试。
argument-hint: "<phase> [additional instructions]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
argument-instructions: |
  Parse the argument as a phase number (integer, decimal, or letter-suffix), plus optional free-text instructions.
  Example: /gsd:add-tests 12
  Example: /gsd:add-tests 12 focus on edge cases in the pricing module
requires: [phase]
---
<objective>
为已完成的阶段生成单元测试和 E2E 测试，使用其 SUMMARY.md、CONTEXT.md 和 VERIFICATION.md 作为规范。

分析实现文件，将其分类为 TDD（单元）、E2E（浏览器）或跳过类别，展示测试计划供用户批准，然后按照红-绿约定生成测试。

输出：测试文件以消息 `test(phase-{N}): add unit and E2E tests from add-tests command` 提交
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/add-tests.md
</execution_context>

<context>
阶段：$ARGUMENTS

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
端到端执行。
保留所有工作流关卡（分类批准、测试计划批准、红-绿验证、差距报告）。
</process>
