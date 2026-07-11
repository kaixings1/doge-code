---
name: gsd:capture
捕获想法、任务、笔记和创意种子到指定目的地。
argument-hint: "[--note | --backlog | --seed | --list] [text]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
捕获想法、任务、笔记和创意种子到 GSD 系统中各自的目的地。

模式路由：
- **默认**（无标志）：捕获为结构化待办事项以进行后续工作 → add-todo 工作流
- **--note**：零摩擦想法捕获（追加/列表/提升）→ note 工作流
- **--backlog**：将想法添加到积压工作停车场（999.x 编号）→ add-backlog 工作流
- **--seed**：捕获带有触发条件的前瞻性想法 → plant-seed 工作流
- **--list**：列出待处理待办事项并选择一个开始处理 → check-todos 工作流
</objective>

<routing>

| 标志 | 目的地 | 工作流 |
|------|-------------|----------|
| (none) | .planning/todos/ 中的结构化待办事项 | add-todo |
| --note | 带时间戳的笔记文件、列表或提升 | note |
| --backlog | ROADMAP.md 积压工作部分（999.x） | add-backlog |
| --seed | .planning/seeds/SEED-NNN-slug.md | plant-seed |
| --list | 交互式待办事项浏览器 + 操作路由器 | check-todos |

</routing>

<execution_context>
@~/.claude/get-shit-done/workflows/add-todo.md
@~/.claude/get-shit-done/workflows/note.md
@~/.claude/get-shit-done/workflows/add-backlog.md
@~/.claude/get-shit-done/workflows/plant-seed.md
@~/.claude/get-shit-done/workflows/check-todos.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
参数：$ARGUMENTS

解析 $ARGUMENTS 的第一个令牌：
- 如果是 `--note`：去掉标志，将剩余部分传递给 note 工作流
- 如果是 `--backlog`：去掉标志，将剩余部分传递给 add-backlog 工作流
- 如果是 `--seed`：去掉标志，将剩余部分传递给 plant-seed 工作流
- 如果是 `--list`：将剩余部分（可选区域筛选器）传递给 check-todos 工作流
- 否则：将所有 $ARGUMENTS 传递给 add-todo 工作流
</context>

<process>
1. 从 $ARGUMENTS 解析前导标志（如有）。
2. 根据上述路由表端到端加载并执行适当的工作流。
3. 保留目标工作流的所有工作流关卡（目录结构、重复检测、提交等）。
</process>
