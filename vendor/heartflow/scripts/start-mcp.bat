@echo off
setlocal
set "HF_DIR=%~dp0.."
set "PORT=8099"

if /i "%~1"=="/bg" goto :bg

echo Starting HeartFlow MCP (port %PORT%) ...
cd /d "%HF_DIR%"
node src/mcp-server.js --port %PORT%
goto :eof

:bg
echo Starting HeartFlow MCP in background (port %PORT%) ...
cd /d "%HF_DIR%"
start "HeartFlow MCP" /min node src/mcp-server.js --port %PORT% 1> "%HF_DIR%\mcp.log" 2>&1
echo Started in background. Log: %HF_DIR%\mcp.log
goto :eof
