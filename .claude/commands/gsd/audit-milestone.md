---
name: gsd:audit-milestone
归档前对照初始意图审计里程碑完成情况。
argument-hint: "[version]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
  - Write
requires: [execute-phase]
---
<objective>
验证里程碑是否达到了其完成定义。检查需求覆盖范围、跨阶段集成和端到端流程。

**此命令是编排器。** 读取现有的 VERIFICATION.md 文件（在 execute-phase 期间已验证的阶段），汇总技术债务和延迟的差距，然后生成集成检查器进行跨阶段连接。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/audit-milestone.md
</execution_context>

<context>
版本：$ARGUMENTS（可选——默认为当前里程碑）

核心规划文件在工作流中解析（`init milestone-op`）并仅在需要时加载。

**已完成的工作：**
Glob：.planning/phases/*/*-SUMMARY.md
Glob：.planning/phases/*/*-VERIFICATION.md
</context>

<process>
端到端执行。
保留所有工作流关卡（范围确定、验证读取、集成检查、需求覆盖、路由）。
</process>
