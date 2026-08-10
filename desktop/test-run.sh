#!/bin/bash
cd "D:/doge-code/desktop"
nohup bun x tsx scripts/launch-electron.ts > "D:/doge-code/desktop/electron-launch.log" 2>&1 &
sleep 12
echo "---CHECKING LOG---"
grep -E "DIAG|AUTO-TEST|MAIN-IPC|PREFIX|EXACT" "D:/doge-code/desktop/electron-launch.log" | head -30
