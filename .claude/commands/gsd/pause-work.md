---
name: gsd:pause-work
在阶段中途暂停工作时创建上下文交接。
argument-hint: "[--report]"
allowed-tools:
  - Read
  - Write
  - Bash
requires: [phase, progress]
---

<objective>
创建 `.continue-here.md` 交接文件以在会话间保留完整的工作状态。

路由到 pause-work 工作流，它处理：
- 从最近的文件检测当前阶段
- 完整状态收集（位置、已完成工作、剩余工作、决策、阻塞项）
- 创建包含所有上下文部分的交接文件
- 作为 WIP 的 Git 提交
- 恢复说明
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/pause-work.md
</execution_context>

<context>
State and phase progress are gathered in-workflow with targeted reads.
</context>

<process>
If `--report` is in $ARGUMENTS:
Read and execute `~/.claude/get-shit-done/workflows/session-report.md` end-to-end.

**Follow the pause-work workflow**.

The workflow handles all logic including:
1. Phase directory detection
2. State gathering with user clarifications
3. Handoff file writing with timestamp
4. Git commit
5. Confirmation with resume instructions
</process>
