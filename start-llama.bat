@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
:: Doge Code - llama-server 快速启动
:: ============================================================
:: 说明：llama-server 已运行时使用此脚本
:: 配置：自动获取模型 ID，使用 32K 上下文
:: ============================================================

set "PORT=8080"
set "BASE_URL=http://localhost:%PORT%"
set "API_KEY=llama"

echo.
echo ============================================================
echo     Doge Code - llama-server 快速启动
echo ============================================================
echo   地址：%BASE_URL%
echo   兼容模式：OpenAI
echo ============================================================
echo.

:: 检查 Bun
where bun >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Bun
    echo 安装：powershell -c "irm bun.sh/install.ps1 | iex"
    pause
    exit /b 1
)

:: 检查 llama-server 连接
echo [检查] 正在检查 llama-server 连接...
curl -s "%BASE_URL%/health" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 无法连接到 llama-server
    echo [提示] 请先运行：start-llama-server.bat
    pause
    exit /b 1
)
echo [成功] llama-server 运行正常

:: 获取模型 ID
echo [获取] 正在获取模型 ID...
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "$r=Invoke-RestMethod '%BASE_URL%/v1/models' 2>$null; if($r.data){$r.data[0].id}else{''}"') do set "MODEL=%%i"

if "!MODEL!"=="" (
    echo [错误] 无法获取模型 ID
    pause
    exit /b 1
)
echo [模型] !MODEL!

:: 保存配置
echo [保存] 正在保存配置...
call :SaveConfig "!MODEL!"

echo.
echo [环境] ANTHROPIC_BASE_URL=%BASE_URL%
echo [环境] DOGE_API_KEY=%API_KEY%
echo [环境] ANTHROPIC_MODEL=!MODEL!
echo [环境] CLAUDE_CODE_COMPATIBLE_API_PROVIDER=openai
echo.
echo [启动] 正在启动 Doge Code...
echo [提示] 按 Ctrl+C 可退出
echo.

:: 启动 Doge Code
set "ANTHROPIC_BASE_URL=%BASE_URL%"
set "DOGE_API_KEY=%API_KEY%"
set "ANTHROPIC_MODEL=!MODEL!"
set "CLAUDE_CODE_COMPATIBLE_API_PROVIDER=openai"
bun run dev

endlocal
exit /b 0

:: ============================================================
:: 函数：保存配置
:: ============================================================
:SaveConfig
set "MODEL_ARG=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0save-config.ps1" ^
    -ConfigFile "%USERPROFILE%\.doge\.claude.json" ^
    -BaseURL "%BASE_URL%" ^
    -ApiKey "%API_KEY%" ^
    -Model "%MODEL_ARG%"
exit /b 0
