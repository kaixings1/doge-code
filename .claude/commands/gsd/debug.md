---
name: gsd:debug
在上下文重置间保持持久状态的系统化调试。
argument-hint: "[list | status <slug> | continue <slug> | --diagnose] [issue description]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
  - AskUserQuestion
---

<objective>
使用科学方法和子智能体隔离进行调试。

**编排器角色：** 收集症状、生成 gsd-debugger 智能体、处理检查点、生成续接。

**标志：**
- `--diagnose` — 仅诊断。返回根本原因报告，不应用修复。

**子命令：** `list` · `status <slug>` · `continue <slug>`
</objective>

<available_agent_types>
有效的 GSD 子智能体类型（使用确切名称——不要回退到 'general-purpose'）：
- gsd-debug-session-manager — 在隔离上下文中管理调试检查点/续接循环
- gsd-debugger — 使用科学方法调查错误
</available_agent_types>

<execution_context>
@~/.claude/get-shit-done/workflows/debug.md
</execution_context>

<context>
用户输入：$ARGUMENTS

在活动会话检查之前从 $ARGUMENTS 解析子命令和标志：
- 如果 $ARGUMENTS 以 "list" 开头：SUBCMD=list，无更多参数
- 如果 $ARGUMENTS 以 "status " 开头：SUBCMD=status，SLUG=剩余部分（去除空白）
- 如果 $ARGUMENTS 以 "continue " 开头：SUBCMD=continue，SLUG=剩余部分（去除空白）
- 如果 $ARGUMENTS 包含 `--diagnose`：SUBCMD=debug，diagnose_only=true，从描述中移除 `--diagnose`
- 否则：SUBCMD=debug，diagnose_only=false

检查活动会话（用于非 list/status/continue 流程）：
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```
</context>

<process>
端到端执行。
</process>
