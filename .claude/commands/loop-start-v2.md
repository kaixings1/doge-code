---
description: 启动增强版循环操作员（loop-v2）— 支持 20 种高级循环模式
argument-hint: "<pattern> <tasks...> [--max-iterations N] [--budget-tokens N] [--parallelism N]"
---

# Loop Start V2

启动增强版循环操作员，支持 20 种高级循环模式。

## Usage

`/loop-start-v2 <pattern> <tasks...> [options]`

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
- `--checkpoint-dir PATH` — 检查点存储目录
- `--dead-letter-dir PATH` — 死信队列目录
- `--mode safe|fast` — safe=严格质量门控，fast=快速模式

## Examples

```bash
# 串行循环：依次执行 3 个任务
/loop-start-v2 sequential "lint" "test" "build"

# 并行循环：同时分析 3 个模块
/loop-start-v2 parallel "analyze src/commands/" "analyze src/api/" "analyze src/components/" --parallelism 3

# 流水线：lint → test → build → deploy
/loop-start-v2 pipeline "bun run lint" "bun test" "bun run build" "bun run deploy"

# 扇出：并行分析所有子目录
/loop-start-v2 fanout "src/commands" "src/api" "src/components" "src/utils"

# 自愈循环：启动服务器（失败自动恢复）
/loop-start-v2 self-healing "bun run src/server/server.ts"

# 多模型共识：代码审查
/loop-start-v2 consensus "Review src/commands/loop-v2/index.ts for security issues"

# 优先级调度
/loop-start-v2 priority "fix-critical-bug" "add-docs" "refactor" --priorities 0 2 3
```

## Safety Checks

Before starting any loop:

1. ✅ Verify tests pass before first iteration
2. ✅ Ensure loop has explicit stop condition
3. ✅ Set budget tokens to prevent runaway costs
4. ✅ Configure checkpoint directory for crash recovery
5. ✅ Verify dead letter queue directory is writable

## Output

The loop will output:
- Loop ID (for tracking)
- Pattern and configuration
- Real-time progress (checkpoints)
- Final result with metrics:
  - Total iterations
  - Success/failure counts
  - Token consumption
  - Duration
  - Dead letter queue entries (if any)

## Monitoring

Use `/loop-status-v2` to inspect running loops:
```bash
/loop-status-v2              # Show all active loops
/loop-status-v2 --watch      # Real-time monitoring
/loop-status-v2 --loop-id <id>  # Specific loop
```

## Stop Conditions

Loops stop when:
- All tasks completed successfully
- Max iterations reached
- Budget tokens exceeded
- Circuit breaker triggered (consecutive failures)
- User interrupt (Ctrl+C)

## Integration with /ship

Loop-v2 integrates with `/ship` workflow:
```bash
/ship --loop-pipeline sequential "lint" "test" "build"
```

This runs the ship phases as a loop pipeline, with each phase as a stage.
