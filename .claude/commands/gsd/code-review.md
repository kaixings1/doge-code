---
name: gsd:code-review
审查阶段内变更的源文件，查找错误、安全问题和代码质量问题。
argument-hint: "<phase-number> [--depth=quick|standard|deep] [--files file1,file2,...] [--fix [--all] [--auto]]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Agent
requires: [config, import, phase, quick, review]
---
<objective>
审查阶段内更改的源文件，查找错误、安全漏洞和代码质量问题。

生成 gsd-code-reviewer 智能体，按指定的深度级别分析代码。在阶段目录中生成 REVIEW.md 工件，包含按严重程度分类的发现。

参数：
- 阶段编号（必需）——要审查哪个阶段的更改（例如 "2" 或 "02"）
- `--depth=quick|standard|deep`（可选）——审查深度级别，覆盖 workflow.code_review_depth 配置
  - quick：仅模式匹配（约 2 分钟）
  - standard：按文件分析，带有语言特定检查（约 5-15 分钟，默认）
  - deep：跨文件分析，包括导入图和调用链（约 15-30 分钟）
- `--files file1,file2,...`（可选）——显式的逗号分隔文件列表，跳过 SUMMARY/git 范围确定（最高优先级）
- `--fix`（可选）——审查完成后（或 REVIEW.md 已存在），自动应用发现的修复。生成 gsd-code-fixer 智能体。接受子标志：
  - `--all`——将信息性发现包含在修复范围内（默认：仅严重 + 警告）
  - `--auto`——启用修复 + 重新审查迭代循环，上限为 3 次迭代

输出：阶段目录中的 {padded_phase}-REVIEW.md + 内联发现摘要
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/code-review.md
</execution_context>

<context>
阶段：$ARGUMENTS（第一个位置参数是阶段编号）

从 $ARGUMENTS 解析的可选标志：
- `--depth=VALUE` — 深度覆盖（quick|standard|deep）。如果提供，覆盖 workflow.code_review_depth 配置。
- `--files=file1,file2,...` — 显式文件列表覆盖。根据 D-08 对文件范围确定具有最高优先级。提供时，工作流完全跳过 SUMMARY.md 提取和 git diff 回退。

上下文文件（CLAUDE.md、SUMMARY.md、阶段状态）在工作流内部通过 `gsd-sdk query init.phase-op` 解析，并通过 `<files_to_read>` 块委托给智能体。
</context>

<process>
此命令是一个薄分发层。它解析参数并委托给工作流。

端到端执行。

工作流（而非此命令）强制执行以下关卡：
- 阶段验证（配置关之前）
- 配置关检查（workflow.code_review）
- 文件范围确定（--files 覆盖 > SUMMARY.md > git diff 回退）
- 空范围检查（如果没有文件则跳过）
- 智能体生成（gsd-code-reviewer）
- 结果展示（内联摘要 + 后续步骤）
</process>
