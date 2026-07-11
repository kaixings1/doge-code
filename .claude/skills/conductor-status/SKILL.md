---
name: 显示项目状态、活动轨道和下一步行动
description: "显示项目状态、活动轨道和下一步行动"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Conductor 状态

显示 Conductor 项目的当前状态，包括总体进度、活跃轨道和下一步行动。

## 使用此技能的场景

- 处理 Conductor 状态任务或工作流时
- 需要 Conductor 状态的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与 Conductor 状态无关时
- 需要此范围之外的领域或工具时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证方法。
- 如需详细示例，请打开 `resources/implementation-playbook.md`。

## 预检检查

1. 验证 Conductor 是否已初始化：
   - 检查 `conductor/product.md` 是否存在
   - 检查 `conductor/tracks.md` 是否存在
   - 如果缺失：显示错误并建议先运行 `/conductor:设置`

2. 检查是否有任何轨道：
   - 读取 `conductor/tracks.md`
   - 如果没有注册轨道：显示设置完成消息并建议创建第一个轨道

## 数据收集

### 1. 项目信息

读取 `conductor/product.md` 并提取：

- 项目名称
- 项目描述

### 2. 轨道概述

读取 `conductor/tracks.md` 并解析：

- 轨道总数
- 已完成的轨道（标记为 `[x]`）
- 进行中的轨道（标记为 `[~]`）
- 待处理的轨道（标记为 `[ ]`）

### 3. 详细轨道分析

针对 `conductor/tracks/` 中的每个轨道：

读取 `conductor/tracks/{trackId}/plan.md`：

- 统计总任务数（匹配 `- [x]`、`- [~]`、`- [ ]` 且带 Task 前缀的行）
- 统计已完成任务数（`[x]`）
- 统计进行中任务数（`[~]`）
- 统计待处理任务数（`[ ]`）
- 识别当前阶段（第一个存在未完成任务的阶段）
- 识别下一个待处理任务

读取 `conductor/tracks/{trackId}/metadata.json`：

- 轨道类型（功能、bug、杂务、重构）
- 创建日期
- 最后更新日期
- 状态

读取 `conductor/tracks/{trackId}/spec.md`：

- 检查是否有任何标记的阻塞项或依赖

### 4. 阻塞检测

扫描潜在的阻塞项：

- 标记为 `BLOCKED:` 前缀的任务
- 依赖未完成轨道的依赖项
- 失败的验证任务

## 输出格式

### Full Project 状态 (no 参数)

```
================================================================================
                        PROJECT STATUS: {Project Name}
================================================================================
Last Updated: {current timestamp}

--------------------------------------------------------------------------------
                              OVERALL PROGRESS
--------------------------------------------------------------------------------

Tracks:     {completed}/{total} completed ({percentage}%)
Tasks:      {completed}/{total} completed ({percentage}%)

Progress:   [##########..........] {percentage}%

--------------------------------------------------------------------------------
                              TRACK SUMMARY
--------------------------------------------------------------------------------

| Status | Track ID          | Type    | Tasks      | Last Updated |
|--------|-------------------|---------|------------|--------------|
| [x]    | auth_20250110     | feature | 12/12 (100%)| 2025-01-12  |
| [~]    | dashboard_20250112| feature | 7/15 (47%) | 2025-01-15  |
| [ ]    | nav-fix_20250114  | bug     | 0/4 (0%)   | 2025-01-14  |

--------------------------------------------------------------------------------
                              CURRENT FOCUS
--------------------------------------------------------------------------------

Active Track:  dashboard_20250112 - Dashboard Feature
Current Phase: Phase 2: Core Components
Current Task:  [~] Task 2.3: Implement chart rendering

Progress in Phase:
  - [x] Task 2.1: Create dashboard layout
  - [x] Task 2.2: Add data fetching hooks
  - [~] Task 2.3: Implement chart rendering
  - [ ] Task 2.4: Add 过滤器 controls

--------------------------------------------------------------------------------
                              NEXT ACTIONS
--------------------------------------------------------------------------------

1. Complete: Task 2.3 - Implement chart rendering (dashboard_20250112)
2. Then: Task 2.4 - Add 过滤器 controls (dashboard_20250112)
3. After Phase 2: Phase verification checkpoint

--------------------------------------------------------------------------------
                               BLOCKERS
--------------------------------------------------------------------------------

{If blockers found:}
! BLOCKED: Task 3.1 in dashboard_20250112 depends on api_20250111 (incomplete)

{If no blockers:}
No blockers identified.

================================================================================
Commands: /conductor:implement {trackId} | /conductor:new-track | /conductor:revert
================================================================================
```

### Single Track 状态 (with track-id 参数)

```
================================================================================
                    TRACK STATUS: {Track Title}
================================================================================
Track ID:    {trackId}
Type:        {feature|bug|chore|refactor}
Status:      {Pending|In Progress|Complete}
Created:     {date}
Updated:     {date}

--------------------------------------------------------------------------------
                              SPECIFICATION
--------------------------------------------------------------------------------

Summary: {brief summary from spec.md}

Acceptance Criteria:
  - [x] {Criterion 1}
  - [ ] {Criterion 2}
  - [ ] {Criterion 3}

--------------------------------------------------------------------------------
                              IMPLEMENTATION
--------------------------------------------------------------------------------

Overall:    {completed}/{total} tasks ({percentage}%)
Progress:   [##########..........] {percentage}%

## Phase 1: {Phase Name} [COMPLETE]
  - [x] Task 1.1: {description}
  - [x] Task 1.2: {description}
  - [x] Verification: {description}

## Phase 2: {Phase Name} [IN PROGRESS]
  - [x] Task 2.1: {description}
  - [~] Task 2.2: {description}  <-- CURRENT
  - [ ] Task 2.3: {description}
  - [ ] Verification: {description}

## Phase 3: {Phase Name} [PENDING]
  - [ ] Task 3.1: {description}
  - [ ] Task 3.2: {description}
  - [ ] Verification: {description}

--------------------------------------------------------------------------------
                              GIT HISTORY
--------------------------------------------------------------------------------

Related Commits:
  abc1234 - feat: add login form ({trackId})
  def5678 - feat: add password validation ({trackId})
  ghi9012 - chore: mark task 1.2 complete ({trackId})

--------------------------------------------------------------------------------
                              NEXT STEPS
--------------------------------------------------------------------------------

1. Current: Task 2.2 - {description}
2. Next: Task 2.3 - {description}
3. Phase 2 verification pending

================================================================================
Commands: /conductor:implement {trackId} | /conductor:revert {trackId}
================================================================================
```

## 状态标记图例

在底部显示（如果有助于理解）：

```
图例：
  [x] = 已完成
  [~] = 进行中
  [ ] = 待处理
  [!] = 已阻塞
```

## 错误状态

### 未找到轨道

```
================================================================================
                        项目状态：{项目名称}
================================================================================

Conductor 已设置但尚未创建任何轨道。

要开始：
  /conductor:new-track "你的功能描述"

================================================================================
```

### Conductor 未初始化

```
错误：Conductor 未初始化

找不到 conductor/product.md

运行 /conductor:设置 为此项目初始化 Conductor。
```

### 未找到轨道（带参数时）

```
错误：未找到轨道：{参数}

可用轨道：
  - auth_20250115
  - dashboard_20250112
  - nav-fix_20250114

用法：/conductor:status [track-id]
```

## 计算逻辑

### 任务计数

```
对于每个 plan.md：
  - 已完成：统计匹配 /^- \[x\] Task/ 的行数
  - 进行中：统计匹配 /^- \[~\] Task/ 的行数
  - 待处理：统计匹配 /^- \[ \] Task/ 的行数
  - 总计：已完成 + 进行中 + 待处理
```

### 阶段检测

```
当前阶段 = 第一个紧跟未完成任务（[ ] 或 [~]）的阶段标题
```

### 进度条

```
已填充 = 向下取整((已完成 / 总计) * 20)
空 = 20 - 已填充
条 = "[" + "#".repeat(已填充) + ".".repeat(空) + "]"
```

## 快速模式

如果使用 `--quick` 或 `-q` 参数调用：

```
{项目名称}：{已完成}/{总数} 任务（{百分比}%）
活跃：{trackId} - 任务 {X.Y}
```

## JSON 输出

如果使用 `--json` 参数调用：

```json
{
  "project": "{name}",
  "timestamp": "ISO_TIMESTAMP",
  "tracks": {
    "total": N,
    "completed": X,
    "in_progress": Y,
    "pending": Z
  },
  "tasks": {
    "total": M,
    "completed": A,
    "in_progress": B,
    "pending": C
  },
  "current": {
    "track": "{trackId}",
    "phase": N,
    "task": "{X.Y}"
  },
  "blockers": []
}
```

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
