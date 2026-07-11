---
name: gsd:validate-phase
对已完成阶段进行事后审计并填补 Nyquist 验证遗漏。
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
requires: [phase]
---
<objective>
审计已完成阶段的 Nyquist 验证覆盖范围。三种状态：
- (A) VALIDATION.md 存在——审计并填补差距
- (B) 无 VALIDATION.md，SUMMARY.md 存在——从工件重建
- (C) 阶段未执行——带指导退出

输出：更新后的 VALIDATION.md + 生成的测试文件。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/validate-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>
