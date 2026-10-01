REM echo [%DATE% %TIME%] DOGE_START >> D:\doge-code\trace.log

@echo off

REM Switch to UTF-8 code page BEFORE any non-ASCII byte in this file.
REM cmd.exe parses each line using the ANSI code page (GBK on zh-CN) until
REM chcp runs; a UTF-8 Chinese char on the line above would desync the line
REM boundary and truncate every following line. Keep this line pure ASCII.
chcp 65001 >nul

del /q .bun-build* 2>nul
rd /s /q node_modules\.cache 2>nul

REM === 环境变量已迁移到配置文件 ===
REM 全部 200 个 CLAUDE_CODE_* / FEATURE / 运行时变量现由以下配置文件提供：
REM   ~/.doge/settings.json  ->  "env" 字段（用户级，优先级最高，对所有项目生效）
REM   <项目>/.claude/settings.json -> "env" 字段（项目级，团队共享）
REM 修改方式：/config env.KEY=value   或直接编辑上述 JSON 的 env 字段
REM 仅 DOGE_API_JSON 因依赖 %1 参数而保留在此处。
REM
REM 例外：TERMINAL_PANEL 必须在此显式设置。settings.json 的 env 会被
REM managedEnv 的 SAFE_ENV_VARS 白名单过滤掉（该白名单不含任何
REM CLAUDE_CODE_FEATURE_*），因此走配置文件无法到达 process.env。
set CLAUDE_CODE_FEATURE_TERMINAL_PANEL=1

if "%1"=="" (
    set DOGE_API_JSON=.doge\api.json
) else (
    set DOGE_API_JSON=.doge\%1.json
)


REM === Local bridge server: start in background if 5678 is not listening ===
netstat -ano -p tcp | findstr ":5678" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [d.bat] Starting local bridge server on port 5678 ...
    start "doge-bridge" /MIN bun run "D:\doge-code\scripts\bridge.ts"
    REM Wait for the server to become ready by polling the port
    for /L %%i in (1,1,25) do (
        timeout /t 1 /nobreak >nul 2>&1
        netstat -ano -p tcp | findstr ":5678" | findstr "LISTENING" >nul 2>&1
        if not errorlevel 1 goto :bridge_ready
    )
    echo [d.bat] WARNING: bridge server not ready, local bridge unavailable
) else (
    echo [d.bat] Bridge server already running on port 5678
)
:bridge_ready
REM echo BEFORE_DOGE_EXE >> trace.log
REM "D:\doge-code\doge.exe" --dangerously-skip-permissions --verbose %2 %3 %4 %5 --debug-file ./debug1.txt

bun run "D:\doge-code\src\bootstrap-entry.ts" --dangerously-skip-permissions --verbose %2 %3 --debug-file ./debug2.txt
