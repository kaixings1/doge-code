---
name: ralph-loop
description: "Ralph 迭代式自主循环 — 自动分解目标、执行、验证，循环直到完成"
argument-hint: "<goal> [--max-iterations N] [--completion-promise TEXT]"
allowed-tools: ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "TaskCreate", "TaskUpdate", "TaskList", "Agent"]
model: sonnet
color: orange
---

# Ralph Loop — 迭代式自主循环

Ralph 循环是一种目标驱动的自主迭代模式。它自动将大目标分解为可执行子任务，逐轮执行、验证、调整，直到目标达成或达到最大迭代次数。

## Core Philosophy

```
Goal → Decompose → Execute → Verify → Learn → (loop back if needed)
```

每一轮迭代都比上一轮更接近目标。如果验证失败，Ralph 会分析失败原因，调整策略，再次尝试。

## Usage

`/ralph-loop <goal> [options]`

### Arguments

- `<goal>` — 要达成的目标描述（必填）
  - 示例: "重构 src/utils/ 目录，消除重复代码"
  - 示例: "为所有命令添加单元测试，覆盖率 > 80%"
  - 示例: "修复 CI 中的所有 failing tests"

### Options

- `--max-iterations N` — 最大迭代次数（默认 10）
- `--completion-promise TEXT` — 完成承诺描述（用于验证目标是否达成）
- `--strategy auto|explore|exploit` — 策略选择
  - `auto` (默认): 前3轮探索，之后利用已知有效方法
  - `explore`: 每轮尝试不同方法，适合不确定场景
  - `exploit`: 坚持已有效的方法，适合已知路径

## Workflow

### Phase 1: Goal Analysis（目标分析）

读取当前项目状态，理解目标：
1. 如果是代码任务：读取相关文件，了解当前实现
2. 如果是测试任务：运行现有测试，了解覆盖率
3. 如果是修复任务：读取错误日志，定位问题

输出：`goal_context.md`（临时文件，包含目标分析和当前状态）

### Phase 2: Decomposition（任务分解）

将目标分解为 3-5 个可执行子任务：
1. 每个子任务有明确的输入、输出、验证标准
2. 子任务之间尽量独立，减少依赖
3. 按优先级排序（P0 → P1 → P2）

输出：`subtasks.md`（临时文件，包含子任务列表）

### Phase 3: Iterative Execution（迭代执行）

```
for iteration in 1..max_iterations:
  1. 选择下一个子任务
  2. 执行子任务
  3. 验证结果（运行测试 / 检查文件 / 编译验证）
  4. 记录：成功 / 失败 / 部分成功
  5. 如果全部子任务完成 → 进入 Phase 4
  6. 如果失败 → 分析原因，调整策略，继续
```

每轮迭代输出：
- 完成的子任务
- 失败的子任务 + 原因
- 下一轮计划

### Phase 4: Completion Verification（完成验证）

使用 `--completion-promise` 或自动检测验证目标是否达成：

自动检测规则：
- 测试任务：`bun test` / `pytest` / `go test` 全部通过
- 代码任务：编译无错误 + 关键文件已修改
- 修复任务：原错误不再出现
- 重构任务：功能测试全部通过

如果验证通过 → 输出成功报告
如果验证失败 → 返回 Phase 3，最多再尝试 3 轮

## Stop Conditions

循环在以下情况停止：
- ✅ 所有子任务完成且验证通过
- ✅ 达到 `--max-iterations` 上限
- ✅ 连续 3 轮无进展（检测到死循环）
- ✅ 用户中断（Ctrl+C）
- ⚠️ 达到成本预算（默认 100k tokens/迭代）

## Examples

```bash
# 基础用法：重构 utils 目录
/ralph-loop "重构 src/utils/ 目录，消除重复代码，合并相似函数"

# 测试覆盖任务
/ralph-loop "为 src/commands/ 下的所有命令添加单元测试，覆盖率 > 80%" --completion-promise "所有命令测试覆盖率 >= 80%"

# CI 修复任务
/ralph-loop "修复 CI 中的所有 failing tests" --max-iterations 5 --strategy exploit

# 探索模式：不确定最佳方案时
/ralph-loop "优化启动速度" --strategy explore --max-iterations 8
```

## Integration with Loop V2

Ralph Loop 可以与 Loop V2 的监控系统集成：

```bash
# 启动 Ralph 循环时同时启动监控
/loop-status --watch
/ralph-loop "重构任务" --max-iterations 10
```

Ralph Loop 的状态会被记录到：
- `~/.doge/loops/checkpoints/ralph-{timestamp}.json`
- `~/.doge/loops/metrics.json`

## Differences from /loop

| Feature | /loop | /ralph-loop |
|---------|-------|-------------|
| Goal decomposition | ❌ 用户提供 | ✅ 自动分解 |
| Iteration strategy | 固定模式 | 自适应（auto/explore/exploit） |
| Completion detection | 用户定义 | 自动 + 用户定义 |
| Subtask tracking | ❌ | ✅ 子任务级追踪 |
| Learning across iterations | ❌ | ✅ 记录成功/失败模式 |

## Output Format

```
RALPH LOOP — 迭代报告

Goal: <用户输入的目标>
Strategy: auto|explore|exploit
Max Iterations: N

=== Iteration 1 ===
[Decompose] 分解为 4 个子任务
[Execute] 完成 2/4 子任务
  ✅ 子任务1: xxx (成功)
  ✅ 子任务2: yyy (成功)
  ❌ 子任务3: zzz (失败 — 原因: ...)
  ⏸️ 子任务4: www (待执行)

Learnings:
  - 子任务3需要 xxx 依赖，当前环境缺少
  - 调整：先安装依赖，下一轮执行子任务3

=== Iteration 2 ===
...

=== Final Result ===
Status: SUCCESS | PARTIAL | FAILED
Completed: 4/4 subtasks
Duration: 5 iterations, 12 minutes
Tokens: 45,000
Files modified: 12
Tests added: 8
```

## Troubleshooting

### Loop stuck in same iteration
- 检查子任务是否过于复杂，需要进一步分解
- 切换到 `--strategy explore` 尝试不同方法

### High token consumption
- 减少 `--max-iterations`
- 使用 `--strategy exploit` 减少探索成本
- 降低子任务粒度（每个子任务更小）

### Completion never reached
- 检查 `--completion-promise` 是否过于严格
- 使用自动检测而非手动承诺
- 考虑拆分目标为多个 Ralph Loop
