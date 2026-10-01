#!/bin/bash
# 自动化任务执行器钩子
# 字段解析交给 hook-input.py：MSYS2 会破坏内联 python3 -c 管道。

. "$(dirname "$0")/hook-lib.sh"

LOG_DIR="$(dirname "$0")/logs"
TASK_LOG="$LOG_DIR/auto-executor.log"
QUEUE_LOG="$LOG_DIR/task-queue.log"
mkdir -p "$LOG_DIR"

PY=$(hook_python) || exit 0

INPUT=$(cat)

EVENT=$(printf '%s' "$INPUT" | hook_field "$PY" event)
TASK_ID=$(printf '%s' "$INPUT" | hook_field "$PY" task_id)
TASK_SUBJECT=$(printf '%s' "$INPUT" | hook_field "$PY" task_subject)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Event=$EVENT Task=$TASK_ID Subject=$TASK_SUBJECT" >> "$TASK_LOG"

case "$EVENT" in
  TaskCreated)
    echo "$TASK_ID|$TASK_SUBJECT|created|$(date +%s)" >> "$QUEUE_LOG"
    echo "Task $TASK_ID created: $TASK_SUBJECT"
    ;;
  TaskCompleted)
    echo "Task $TASK_ID completed: $TASK_SUBJECT"
    sed -i "s/^$TASK_ID|.*|created|/$TASK_ID|$TASK_SUBJECT|completed|$(date +%s)|/" "$QUEUE_LOG" 2>/dev/null || true
    ;;
  *)
    echo "Unknown event: $EVENT"
    ;;
esac

exit 0
