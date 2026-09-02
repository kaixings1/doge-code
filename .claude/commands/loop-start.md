---
name: loop-start
description: "启动循环操作员 — 支持 11 种循环模式：串行/并行/流水线/扇出/事件驱动/状态机/共识/自愈/限速/优先级/链式"
argument-hint: "<pattern> <tasks...> [--max-iterations N] [--budget-tokens N] [--parallelism N] [--mode safe|fast]"
model: sonnet
color: orange
---

# Loop Start

> **Guard**: 如果 `$ARGUMENTS` 为空，立即输出以下内容并停止：
> ```
> 用法: /loop-start <pattern> <tasks...> [options]
>
> 可用模式: sequential, parallel, pipeline, fanout, event-driven, state-machine,
>          consensus, self-healing, rate-limited, priority, chaining
>
> 示例:
>   /loop-start sequential "lint" "test" "build"
>   /loop-start parallel "analyze src/" "analyze api/" --parallelism 2
> ```
> 输出后立即停止，不要执行任何循环。

启动循环操作员，支持多种循环模式。

## Usage

`/loop-start <pattern> <tasks...> [options]`

### Patterns

| Pattern | 描述 | 适用场景 |
|---------|------|----------|
| `sequential` | 串行循环 | 任务有依赖关系 |
| `parallel` | 并行循环 | 任务独立，需要速度 |
| `pipeline` | 流水线 | 多阶段处理，输出链式传递 |
| `fanout` | 扇出/扇入 | 大批量任务分拆聚合 |
| `event-driven` | 事件驱动 | 文件变化/Git/PR 事件 |
| `state-machine` | 状态机 | 复杂多阶段状态转移 |
| `consensus` | 多模型共识 | 高价值决策需要多模型确认 |
| `self-healing` | 自愈循环 | 需要自动错误恢复 |
| `rate-limited` | 速率限制 | API 调用需要限流 |
| `priority` | 优先级调度 | 任务有紧急程度差异 |
| `chaining` | 循环链 | 多循环串联执行 |

### Options

- `--max-iterations N` — 最大迭代次数（默认 10）
- `--budget-tokens N` — Token 预算（默认 100000）
- `--parallelism N` — 并行度（默认 4，仅 parallel/fanout 模式）
- `--mode` — `safe`（严格质量门控，默认）或 `fast`（快速模式）

## Examples

```bash
# 串行循环：依次执行 3 个任务
/loop-start sequential "lint" "test" "build"

# 并行循环：同时分析 3 个模块
/loop-start parallel "analyze src/commands/" "analyze src/api/" "analyze src/components/" --parallelism 3

# 流水线：lint → test → build → deploy
/loop-start pipeline "bun run lint" "bun test" "bun run build" "bun run deploy"

# 扇出：并行分析所有子目录
/loop-start fanout "src/commands" "src/api" "src/components" "src/utils"

# 自愈循环：启动服务器（失败自动恢复）
/loop-start self-healing "bun run src/server/server.ts"

# 多模型共识：代码审查
/loop-start consensus "Review src/commands/loop-v2/index.ts for security issues"

# 优先级调度
/loop-start priority "fix-critical-bug" "add-docs" "refactor" --priorities 0 2 3
```

## Required Safety Checks

Before starting any loop:

1. Verify tests pass before first iteration.
2. Ensure loop has explicit stop condition.
3. Set budget tokens to prevent runaway costs.
4. Configure checkpoint directory for crash recovery.
5. Verify dead letter queue directory is writable.

## Stop Conditions

Loops stop when:
- All tasks completed successfully
- Max iterations reached
- Budget tokens exceeded
- Circuit breaker triggered (consecutive failures)
- User interrupt (Ctrl+C)

## Monitoring

Use `/loop-status` to inspect running loops:
```bash
/loop-status              # Show all active loops
/loop-status --watch      # Real-time monitoring
/loop-status --loop-id <id>  # Specific loop
```

## Integration with /ship

Loop 可与 `/ship` 工作流配合使用：

```bash
/loop-start pipeline "bun run lint" "bun test" "bun run build"
```

`/ship` 内置 `ship-ci-review-loop.ts`，提供 CI 监控（`getCIStatus`）和 PR 评论循环（`getPRFeedback`），可用 loop 驱动其多轮迭代。

## Arguments

$ARGUMENTS:
- `<pattern>` optional — Loop pattern (see table above)
- `<tasks...>` optional — Tasks to execute in the loop
- `--max-iterations N` optional
- `--budget-tokens N` optional
- `--parallelism N` optional
- `--mode safe|fast` optional
