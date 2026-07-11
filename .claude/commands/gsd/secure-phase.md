---
name: gsd:secure-phase
对已完成阶段的事后威胁缓解措施进行验证。
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
验证已完成阶段的威胁缓解措施。三种状态：
- (A) SECURITY.md 存在——审计并验证缓解措施
- (B) 无 SECURITY.md，但存在带有威胁模型的 PLAN.md——从工件运行
- (C) 阶段未执行——带指导退出

输出：更新后的 SECURITY.md。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/secure-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>
