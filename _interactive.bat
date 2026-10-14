@echo off
REM temp: launch an INTERACTIVE doge instance on port 6004 (real TTY window).
REM Interactive mode is required for streaming deltas to reach the phone.
setlocal
set CLAUDE_CODE_MOBILE_BRIDGE=1
set CLAUDE_CODE_MOBILE_PORT=6004
set CLAUDE_CODE_MOBILE_SECRET=
set DOGE_SESSION_LABEL=cursor-live
cd /d D:\doge-code
start "doge-6004" cmd /k "chcp 65001 >nul && set CLAUDE_CODE_MOBILE_BRIDGE=1 && set CLAUDE_CODE_MOBILE_PORT=6004 && set DOGE_SESSION_LABEL=cursor-live && cd /d D:\doge-code && doge.exe --dangerously-skip-permissions"
endlocal
echo LAUNCHED
