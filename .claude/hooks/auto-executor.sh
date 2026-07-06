#!/bin/bash
# 自动化任务执行器钩子

TASK_LOG=".claude/hooks/logs/auto-executor.log"
mkdir -p "$(dirname "$TASK_LOG")"

INPUT=$(cat)

EVENT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hook_event_name',''))" 2>/dev/null)
TASK_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))" 2>/dev/null)
TASK_SUBJECT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_subject',''))" 2>/dev/null)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Event=$EVENT Task=$TASK_ID Subject=$TASK_SUBJECT" >> "$TASK_LOG"

case "$EVENT" in
  TaskCreated)
    echo "$TASK_ID|$TASK_SUBJECT|created|$(date +%s)" >> ".claude/hooks/logs/task-queue.log"
    echo "Task $TASK_ID created: $TASK_SUBJECT"
    ;;
  TaskCompleted)
    echo "Task $TASK_ID completed: $TASK_SUBJECT"
    sed -i "s/^$TASK_ID|.*|created|/$TASK_ID|$TASK_SUBJECT|completed|$(date +%s)|/" ".claude/hooks/logs/task-queue.log" 2>/dev/null || true
    ;;
  *)
    echo "Unknown event: $EVENT"
    ;;
esac

exit 0
