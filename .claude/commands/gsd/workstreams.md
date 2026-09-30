---
name: gsd:workstreams
description: "管理并行工作流 - 列出、创建、切换、查看状态、进度、完成和恢复。"
allowed-tools:
  - Read
  - Bash
requires: [new-milestone, phase, progress, resume-work]
---

# /gsd:workstreams

管理并行工作线以进行并发里程碑工作。

## 用法

`/gsd:workstreams [subcommand] [args]`

### 子命令

| 命令 | 描述 |
|---------|-------------|
| `list` | 列出所有工作线及其状态 |
| `create <name>` | 创建新工作线 |
| `status <name>` | 查看一个工作线的详细状态 |
| `switch <name>` | 设置活跃工作线 |
| `progress` | 所有工作线的进度汇总 |
| `complete <name>` | 归档一个已完成的工作线 |
| `resume <name>` | 恢复某个工作线中的工作 |

## 第 1 步：解析子命令

解析用户输入，确定要执行哪个工作线操作。
若未给出子命令，默认为 `list`。

## 第 2 步：执行操作

### list
运行：`gsd-sdk query workstream.list --raw --cwd "$CWD"`
以表格形式展示各工作线，包含名称、状态、当前阶段和进度。

### create
运行：`gsd-sdk query workstream.create <name> --raw --cwd "$CWD"`
创建后，展示新工作线路径并建议后续步骤：
- `/gsd:new-milestone --ws <name>` to set up the milestone

### status
运行：`gsd-sdk query workstream.status <name> --raw --cwd "$CWD"`
展示详细的阶段分解与状态信息。

### switch
运行：`gsd-sdk query workstream.set <name> --raw --cwd "$CWD"`
当运行时支持时，同时为当前会话设置 `GSD_WORKSTREAM`。
若运行时暴露会话标识符，GSD 还会在会话本地存储活跃工作线，以免并发会话相互覆盖。

### progress
运行：`gsd-sdk query workstream.progress --raw --cwd "$CWD"`
展示所有工作线的进度总览。

### complete
运行：`gsd-sdk query workstream.complete <name> --raw --cwd "$CWD"`
将该工作线归档到 milestones/。

### resume
将该工作线设为活跃，并建议执行 `/gsd:resume-work --ws <name>`。

## 第 3 步：展示结果

把 gsd-sdk query 的 JSON 输出格式化为便于阅读的展示形式。
在任何路由建议中包含 `${GSD_WS}` 标志。
