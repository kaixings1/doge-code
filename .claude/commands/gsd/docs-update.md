---
name: gsd:docs-update
生成或更新经过代码库验证的项目文档。
argument-hint: "[--force] [--verify-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
requires: [update]
---
<objective>
为当前项目生成和更新多达 9 个文档文件。每种文档类型由 gsd-doc-writer 子智能体编写，它会直接探索代码库——不会产生幻觉路径、幻影端点或过时的签名。

标志处理规则：
- 下面记录的可选标志是可用的行为，而非隐含的活跃行为
- 标志仅在其字面令牌出现在 `$ARGUMENTS` 中时才活跃
- 如果某个记录的标志在 `$ARGUMENTS` 中不存在，将其视为不活跃
- `--force`：跳过保留提示，无论现有内容或 GSD 标记如何，重新生成所有文档
- `--verify-only`：对照代码库检查现有文档的准确性，不生成（完整验证需要阶段 4 验证器）
- 如果 `--force` 和 `--verify-only` 都出现在 `$ARGUMENTS` 中，`--force` 优先
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/docs-update.md
</execution_context>

<context>
参数：$ARGUMENTS

**可用的可选标志（仅文档说明——不是自动激活的）：**
- `--force` — 重新生成所有文档。覆盖手写文档和 GSD 文档。无保留提示。
- `--verify-only` — 对照代码库检查现有文档的准确性。不写入文件。报告 VERIFY 标记计数。完整的代码库事实检查需要 gsd-doc-verifier 智能体（阶段 4）。

**活跃标志必须从 `$ARGUMENTS` 推导：**
- 仅当字面 `--force` 令牌出现在 `$ARGUMENTS` 中时，`--force` 才活跃
- 仅当字面 `--verify-only` 令牌出现在 `$ARGUMENTS` 中时，`--verify-only` 才活跃
- 如果两个令牌都不存在，运行标准的完整阶段生成流程
- 不要仅仅因为某个标志在此提示中被记录就推断它处于活跃状态
</context>

<process>
端到端执行。
保留所有工作流关卡（保留检查、标志处理、波次执行、单体仓库分发、提交、报告）。
</process>
