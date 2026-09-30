@echo off
rem HeartFlow MCP auto-start script (called from shell:startup shortcut).
rem NOTE: "pm2 startup" does not work on Windows (no init system), so we use
rem the Startup folder instead. Keep this file ASCII-only: cmd.exe mangles
rem full-width CJK punctuation in comments.
rem
rem We call "pm2 start" directly instead of "pm2 resurrect" because resurrect
rem restores every app in dump.pm2 and blocks for a long time on Windows.

set "HF_HOME=D:\doge-code\vendor\heartflow"
set "PM2_BIN=%HF_HOME%\node_modules\pm2\bin\pm2"
set "PS_CHECK=powershell -NoProfile -Command try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8099/health' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"

cd /d "%HF_HOME%"

rem Exit early if the service is already listening.
%PS_CHECK%
if %ERRORLEVEL%==0 exit /b 0

rem Start heartflow (idempotent: pm2 reuses the existing app if present).
node "%PM2_BIN%" start ecosystem.config.js >nul 2>&1

rem Give the engine time to load 132 modules before reporting failure.
timeout /t 12 /nobreak >nul 2>&1

%PS_CHECK%
if not %ERRORLEVEL%==0 (
  node "%PM2_BIN%" start ecosystem.config.js >nul 2>&1
  timeout /t 12 /nobreak >nul 2>&1
  node "%PM2_BIN%" save >nul 2>&1
)

exit /b 0
