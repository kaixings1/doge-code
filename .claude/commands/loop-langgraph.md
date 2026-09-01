---
description: "LangGraph 循环引擎 — 状态图驱动 + 条件路由 + 循环"
argument-hint: "<task> [--graph-file PATH] [--max-iterations N]"
model: sonnet
color: orange
---

# Loop LangGraph — 状态图驱动循环

LangGraph 循环引擎使用状态图（State Graph）驱动任务执行。定义节点（states）和边（transitions），根据条件自动路由，支持循环和条件分支。

## Core Concept

```
State Graph:
  IDLE → (receive task) → ANALYZING
  ANALYZING → (plan ready) → EXECUTING
  ANALYZING → (need more info) → RESEARCHING
  RESEARCHING → (info gathered) → ANALYZING
  EXECUTING → (step complete) → VALIDATING
  EXECUTING → (error) → ERROR_HANDLING
  VALIDATING → (pass) → COMPLETED
  VALIDATING → (fail) → EXECUTING  // loop back
  ERROR_HANDLING → (fixed) → EXECUTING
  ERROR_HANDLING → (unfixable) → DEAD_LETTER
  COMPLETED → (new task) → ANALYZING  // loop back
  DEAD_LETTER → (manual review) → IDLE
```

## Usage

`/loop-langgraph <task> [options]`

### Arguments

- `<task>` — 要执行的任务描述（必填）
  - 示例: "重构 src/utils/ 目录"
  - 示例: "修复 CI 中的所有 failing tests"
  - 示例: "生成完整的项目文档"

### Options

- `--graph-file PATH` — 自定义状态图定义文件（JSON）
- `--max-iterations N` — 最大迭代次数（默认 10）
- `--state-dir PATH` — 状态持久化目录（默认 `~/.doge/loops/langgraph/`）

## Built-in State Graph

### Nodes

| Node | Description | Actions |
|------|-------------|---------|
| `IDLE` | 等待任务 | 接收新任务 |
| `ANALYZING` | 分析任务 | 读取相关文件，理解需求 |
| `RESEARCHING` | 信息收集 | 搜索文档，查找示例 |
| `EXECUTING` | 执行任务 | 编写代码，修改文件 |
| `VALIDATING` | 验证结果 | 运行测试，检查编译 |
| `ERROR_HANDLING` | 错误处理 | 分析错误，尝试修复 |
| `COMPLETED` | 任务完成 | 生成报告 |
| `DEAD_LETTER` | 死信 | 记录失败，等待人工 |

### Transitions

```
ANALYZING → EXECUTING    // 条件: 计划已就绪
ANALYZING → RESEARCHING  // 条件: 需要更多信息
EXECUTING → VALIDATING   // 条件: 执行完成
EXECUTING → ERROR_HANDLING  // 条件: 执行失败
VALIDATING → COMPLETED   // 条件: 验证通过
VALIDATING → EXECUTING   // 条件: 验证失败（重试）
ERROR_HANDLING → EXECUTING  // 条件: 错误已修复
ERROR_HANDLING → DEAD_LETTER  // 条件: 无法修复
COMPLETED → ANALYZING    // 条件: 有新任务
```

## Custom State Graphs

可以通过 `--graph-file` 提供自定义状态图：

```json
{
  "nodes": {
    "START": { "type": "entry" },
    "FETCH": { "type": "action", "prompt": "Fetch data from API" },
    "TRANSFORM": { "type": "action", "prompt": "Transform data" },
    "SAVE": { "type": "action", "prompt": "Save to database" },
    "END": { "type": "exit" }
  },
  "edges": [
    { "from": "START", "to": "FETCH", "condition": "always" },
    { "from": "FETCH", "to": "TRANSFORM", "condition": "fetch.success" },
    { "from": "FETCH", "to": "END", "condition": "fetch.failed" },
    { "from": "TRANSFORM", "to": "SAVE", "condition": "always" },
    { "from": "SAVE", "to": "END", "condition": "always" }
  ]
}
```

## State Persistence

状态持久化到 `~/.doge/loops/langgraph/{loop-id}.json`：

```json
{
  "loopId": "abc123",
  "currentNode": "EXECUTING",
  "state": {
    "task": "...",
    "plan": "...",
    "result": "...",
    "error": null,
    "iteration": 3
  },
  "history": [
    { "node": "ANALYZING", "timestamp": "...", "duration": 5000 },
    { "node": "EXECUTING", "timestamp": "...", "duration": 12000 }
  ]
}
```

## Examples

```bash
# 基础用法：自动状态图
/loop-langgraph "重构 src/utils/ 目录"

# 自定义状态图
/loop-langgraph "ETL 任务" --graph-file ./etl-graph.json

# 限制迭代
/loop-langgraph "复杂重构" --max-iterations 5
```

## Differences from /loop

| Feature | /loop | /loop-langgraph |
|---------|-------|-----------------|
| Execution model | 固定循环 | 状态机驱动 |
| Conditional routing | ❌ | ✅ 基于状态的条件分支 |
| State persistence | ❌ | ✅ 状态持久化到文件 |
| Custom graphs | ❌ | ✅ 可自定义状态图 |
| Visual debugging | ❌ | ✅ 状态历史追踪 |

## Integration with Loop V2

LangGraph 循环会记录到 Loop V2 监控系统：
- 每个状态转换作为 checkpoint
- 状态历史完整记录
- 死信队列自动管理
