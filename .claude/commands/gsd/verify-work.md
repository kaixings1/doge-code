---
name: gsd:verify-work
通过对话式 UAT 验证已构建的功能。
argument-hint: "[phase number, e.g., '4'] [--ws <name>]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - Agent
requires: [execute-phase, phase]
---
<objective>
通过带有持久状态的对话式测试验证已构建的功能。

目的：从用户角度确认 Claude 构建的内容确实有效。一次一个测试，纯文本响应，不进行盘问。当发现问题时，自动诊断、规划修复并准备执行。

输出：{phase_num}-UAT.md 跟踪所有测试结果。如果发现问题：已诊断的差距、已验证的修复计划，可用于 /gsd:execute-phase
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/verify-work.md
@~/.claude/get-shit-done/templates/UAT.md
</execution_context>

<context>
Phase: $ARGUMENTS (optional)
- If provided: Test specific phase (e.g., "4")
- If not provided: Check for active sessions or prompt for phase

Context files are resolved inside the workflow (`init verify-work`) and delegated via `<files_to_read>` blocks.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (session management, test presentation, diagnosis, fix planning, routing).
</process>
