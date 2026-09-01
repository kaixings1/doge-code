---
description: Inspect active loop state, progress, failure signals, and recommended intervention.
argument-hint: "[--watch] [--loop-id ID] [--json] [--dead-letter] [--metrics]"
model: sonnet
---

# Loop Status

Inspect active loop state, progress, and failure signals.

## Usage

`/loop-status [--watch] [--loop-id ID] [--json] [--dead-letter] [--metrics] [--clean]`

### Options

- `--watch` — Real-time monitoring, refresh every 5 seconds
- `--loop-id ID` — Inspect a specific loop
- `--json` — Output JSON format (for scripts)
- `--dead-letter` — Show only dead letter queue
- `--metrics` — Show only metrics summary
- `--checkpoints` — Show only checkpoint history
- `--clean` — Clean expired checkpoints and metrics (>7 days old)

## Data Sources

### Primary: Local File System

Read directly from local loop storage:

- **Checkpoints**: `~/.doge/loops/checkpoints/*.json`
- **Dead Letter Queue**: `~/.doge/loops/dead-letter-queue/*.json`
- **Metrics**: `~/.doge/loops/metrics.json`
- **Logs**: `~/.doge/loops/logs/*.jsonl`

### Secondary: Cross-Session CLI

If `ecc-universal` is installed, also scan Claude transcripts:

```bash
npx --package ecc-universal ecc loop-status --json
```

This scans local Claude transcript JSONL files under `~/.claude/projects/**` and reports stale `ScheduleWakeup` calls or `Bash` tool calls that have no matching `tool_result`.

## What to Report

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

## Implementation

When user runs `/loop-status`:

1. Read all checkpoint files from `~/.doge/loops/checkpoints/`
2. Read metrics from `~/.doge/loops/metrics.json`
3. Read dead letter queue from `~/.doge/loops/dead-letter-queue/`
4. Aggregate and format report
5. If `--json`, output machine-readable JSON
6. If `--watch`, refresh every 5 seconds until interrupted

## Watch Mode

When `--watch` is present, refresh status periodically. With `--json`, each refresh is emitted as one JSON object per line so another terminal or script can consume the stream.

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
- Use `--watch` to confirm

### High Failure Rate
- Check dead letter queue for common errors
- Review circuit breaker status
- Consider adjusting `--max-retries` or `--budget-tokens`

### Token Budget Exhausted
- Check metrics for total token consumption
- Reduce parallelism or switch to cheaper model
- Increase `--budget-tokens` if necessary

## Cross-Session CLI Reference

Only available if `ecc-universal` is installed:

- `ecc loop-status --json` — machine-readable status for recent local transcripts
- `ecc loop-status --home <dir>` — scan a different home directory
- `ecc loop-status --transcript <session.jsonl>` — inspect one transcript directly
- `ecc loop-status --bash-timeout-seconds 1800` — adjust stale Bash threshold
- `ecc loop-status --exit-code` — exit `2` when stale signals found
- `--exit-code` with `--watch` requires `--watch-count`
- `ecc loop-status --watch` — refresh status until interrupted
- `ecc loop-status --watch --watch-count 3 --exit-code` — bounded watch stream
- `ecc loop-status --watch --write-dir ~/.claude/loops` — maintain index.json and per-session snapshots

## Arguments

$ARGUMENTS:
- `--watch` optional
- `--loop-id ID` optional
- `--json` optional
- `--dead-letter` optional
- `--metrics` optional
- `--checkpoints` optional
- `--clean` optional
