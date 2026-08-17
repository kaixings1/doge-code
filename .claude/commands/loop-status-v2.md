---
description: 检查增强版循环操作员（loop-v2）的运行状态、进度、指标和死信队列
argument-hint: "[--watch] [--loop-id ID] [--json] [--dead-letter]"
---

# Loop Status V2

检查增强版循环操作员的运行状态、进度、指标和死信队列。

## Usage

`/loop-status-v2 [options]`

### Options

- `--watch` — 实时监控模式，持续刷新状态
- `--loop-id ID` — 查看特定循环的详细状态
- `--json` — 输出 JSON 格式（便于脚本解析）
- `--dead-letter` — 只显示死信队列
- `--metrics` — 只显示指标统计
- `--checkpoints` — 只显示检查点历史
- `--clean` — 清理过期的检查点和指标（>7 天）

## What It Reports

### Active Loops
- Loop ID
- Pattern (sequential/parallel/pipeline/etc.)
- Current iteration / max iterations
- Status (running/paused/completed/failed)
- Start time and duration
- Token consumption
- Success/failure counts

### Dead Letter Queue
- Task ID
- Loop ID
- Error message
- Retry count
- Created at
- Status (pending/reviewed/retried/discarded)

### Metrics Summary
- Total loops executed
- Success rate
- Average duration
- Total token consumption
- Cost estimate

## Examples

```bash
# 查看所有活跃循环
/loop-status-v2

# 实时监控
/loop-status-v2 --watch

# 查看特定循环
/loop-status-v2 --loop-id 1692345678-abc123

# JSON 输出（脚本解析）
/loop-status-v2 --json

# 查看死信队列
/loop-status-v2 --dead-letter

# 查看指标统计
/loop-status-v2 --metrics

# 清理过期数据
/loop-status-v2 --clean
```

## Storage Locations

- Checkpoints: `~/.doge/loops/checkpoints/{loop-id}.json`
- Dead Letter Queue: `~/.doge/loops/dead-letter-queue/{task-id}.json`
- Metrics: `~/.doge/loops/metrics.json`
- Logs: `~/.doge/loops/logs/{loop-id}.jsonl`

## Watch Mode

When `--watch` is present, refreshes status every 5 seconds until interrupted (Ctrl+C).

## JSON Output Format

```json
{
  "activeLoops": [
    {
      "loopId": "1692345678-abc123",
      "pattern": "parallel",
      "status": "running",
      "currentIteration": 3,
      "maxIterations": 10,
      "startTime": "2025-08-17T10:00:00.000Z",
      "durationMs": 45000,
      "tokensUsed": 12000,
      "successCount": 2,
      "failureCount": 1
    }
  ],
  "deadLetterQueue": [
    {
      "taskId": "1692345680-def456",
      "loopId": "1692345678-abc123",
      "error": "MODULE_NOT_FOUND",
      "retries": 3,
      "status": "pending"
    }
  ],
  "metrics": {
    "totalLoops": 42,
    "successRate": 0.95,
    "avgDurationMs": 120000,
    "totalTokens": 500000
  }
}
```

## Troubleshooting

### Loop Stuck
- Check last checkpoint timestamp
- If no heartbeat for > 3 minutes, loop may be wedged
- Use `/loop-status-v2 --watch` to confirm

### High Failure Rate
- Check dead letter queue for common errors
- Review circuit breaker status
- Consider adjusting `--max-retries` or `--budget-tokens`

### Token Budget Exhausted
- Check metrics for total token consumption
- Reduce parallelism or switch to cheaper model
- Increase `--budget-tokens` if necessary
