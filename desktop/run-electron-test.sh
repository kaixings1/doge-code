#!/bin/bash
cd "D:/doge-code/desktop"
bun x tsx scripts/launch-electron.ts > /tmp/electron-run.log 2>&1 &
sleep 8
echo "---EARLY OUTPUT---"
grep -E "DIAG|AUTO-TEST|MAIN-IPC|onChunk|PREFIX|EXACT|sendMessage" /tmp/electron-run.log | head -30
