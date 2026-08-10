#!/bin/bash
cd "D:/doge-code/desktop"
node scripts/dev.mjs > /tmp/dev-output.log 2>&1 &
DEV_PID=$!
sleep 30
echo "=== FIRST 80 LINES ==="
head -80 /tmp/dev-output.log
echo ""
echo "=== LAST 20 LINES ==="
tail -20 /tmp/dev-output.log
kill $DEV_PID 2>/dev/null
