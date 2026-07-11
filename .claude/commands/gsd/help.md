---
name: gsd:help
显示可用的 GSD 命令和使用指南。
argument-hint: "[--brief | --full | <topic> | --brief <topic>]"
allowed-tools:
  - Read
---
<objective>
按用户要求的级别显示 GSD 帮助：简要（一行刷新）、默认（一页概览）、完整（完整参考）、单个主题部分，或一个主题的紧凑范围查找（`--brief <topic>`：签名 + 一行摘要）。

仅输出所选级别的参考内容。不要添加：
- 项目特定的分析
- Git 状态或文件上下文
- 下一步建议
- 超出参考范围的任何评论
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/help.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
Follow ~/.claude/get-shit-done/workflows/help.md with $ARGUMENTS.
</process>
