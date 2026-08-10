#!/bin/bash
cd "D:/doge-code/desktop"
bun x tsx scripts/launch-electron.ts > /tmp/electron-log.txt 2>&1 &
sleep 5
echo "APP_STARTED"
