---
name: gsd:pr-branch
通过过滤掉 .planning/ 提交来创建干净的 PR 分支 - 准备好进行代码审查。
argument-hint: "[target branch, default: main]"
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
requires: [review]
---

<objective>
通过从当前分支过滤掉 .planning/ 提交来创建适合拉取请求的干净分支。
审查者只能看到代码变更，看不到 GSD 规划工件。

这解决了 PR diff 被与代码审查无关的 PLAN.md、SUMMARY.md、STATE.md 变更所杂乱的问题。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/pr-branch.md
</execution_context>

<process>
Execute end-to-end.
</process>
