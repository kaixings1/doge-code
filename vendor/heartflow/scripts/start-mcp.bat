@echo off
rem HeartFlow MCP launcher.
rem
rem IMPORTANT: do NOT launch "node src/mcp-server.js" directly here.
rem Without HEARTFLOW_MCP_TOKEN being injected, mcp-server.js:193 falls back
rem to a random ephemeral token, so every client request returns 401 and no
rem error is printed. Only ecosystem.config.js (via dotenv) injects the token
rem from .env correctly.
rem
rem So this script just delegates to the pm2-based startup path.
rem Keep ASCII-only: cmd.exe mangles full-width CJK punctuation.

setlocal
set "HF_DIR=%~dp0.."

echo Delegating to pm2 startup (token is injected via ecosystem.config.js) ...
call "%~dp0startup-heartflow.bat"

if %ERRORLEVEL%==0 (
  echo HeartFlow MCP is up on http://127.0.0.1:8099/mcp
) else (
  echo [ERROR] Failed to start HeartFlow MCP.
)
exit /b %ERRORLEVEL%
