@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
:: Doge Code - Ollama 快速启动
:: ============================================================
:: 用法：start-ollama.bat [模型名称]
:: 示例：start-ollama.bat qwen3.5:35b
:: ============================================================

set "DEFAULT_MODEL=qwen3.5:35b"
set "BASE_URL=http://localhost:11434"
set "API_KEY=ollama"

:: 获取参数
set "MODEL=%~1"
if "%MODEL%"=="" set "MODEL=%DEFAULT_MODEL%"

echo.
echo ============================================================
echo     Doge Code - Ollama 快速启动
echo ============================================================
echo   模型：%MODEL%
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

:: 检查 Ollama 服务
echo [检查] 正在检查 Ollama 服务...
curl -s "%BASE_URL%/api/tags" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [启动] Ollama 服务未运行，正在启动...
    start "" "ollama serve"
    timeout /t 3 /nobreak >nul
)
echo [成功] Ollama 服务运行正常

:: 检查模型
echo [检查] 正在检查模型...
curl -s "%BASE_URL%/api/tags" | findstr /i "%MODEL%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [警告] 模型 "%MODEL%" 可能不存在
    echo [提示] 运行 "ollama pull %MODEL%" 下载
    echo.
    set /p "DOWNLOAD=是否现在下载？(Y/N): "
    if /i "!DOWNLOAD!"=="Y" (
        echo [下载] 正在下载...
        ollama pull %MODEL%
    )
)

:: 保存配置
echo [保存] 正在保存配置...
call :SaveConfig "%MODEL%"

echo.
echo [环境] ANTHROPIC_BASE_URL=%BASE_URL%
echo [环境] DOGE_API_KEY=%API_KEY%
echo [环境] ANTHROPIC_MODEL=%MODEL%
echo [环境] CLAUDE_CODE_COMPATIBLE_API_PROVIDER=openai
echo.
echo [启动] 正在启动 Doge Code...
echo [提示] 按 Ctrl+C 可退出
echo.

set "ANTHROPIC_BASE_URL=%BASE_URL%"
set "DOGE_API_KEY=%API_KEY%"
set "ANTHROPIC_MODEL=%MODEL%"
set "CLAUDE_CODE_COMPATIBLE_API_PROVIDER=openai"
bun run dev

endlocal
exit /b 0

:SaveConfig
set "MODEL_ARG=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0save-config.ps1" ^
    -ConfigFile "%USERPROFILE%\.doge\.claude.json" ^
    -BaseURL "%BASE_URL%" ^
    -ApiKey "%API_KEY%" ^
    -Model "%MODEL_ARG%"
exit /b 0
