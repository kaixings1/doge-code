@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
:: Doge Code - llama-server 自动启动（一键启动全部）
:: ============================================================
:: 功能：自动启动 llama-server 和 Doge Code
:: 模型：Qwen3.5-27B-Uncensored-KL
:: 上下文：32768 tokens
:: ============================================================

set "MODEL_PATH=D:\LLM\LuffyTheFox\Qwen3.5-27B-Claude-4.6-Opus-Uncensored-V2-Kullback-Leibler-GGUF\Qwen3.5-27B-Uncensored-KL.Q4_K_M.gguf"
set "PORT=8080"
set "CTX_SIZE=32768"
set "GPU_LAYERS=99"
set "BASE_URL=http://localhost:%PORT%"
set "API_KEY=llama"

echo.
echo ============================================================
echo     Doge Code - llama-server 一键启动
echo ============================================================
echo   模型：Qwen3.5-27B-Uncensored-KL
echo   上下文：%CTX_SIZE% tokens
echo   端口：%PORT%
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

:: 检查模型
if not exist "%MODEL_PATH%" (
    echo [错误] 模型文件不存在：%MODEL_PATH%
    pause
    exit /b 1
)

:: 检查 llama-server 是否已运行
echo [检查] 正在检查 llama-server...
curl -s "%BASE_URL%/health" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [成功] llama-server 已在运行
    goto :GetModel
)

:: 启动 llama-server
echo [启动] 正在启动 llama-server...
start /B "" llama-server ^
    -m "%MODEL_PATH%" ^
    --port %PORT% ^
    -c %CTX_SIZE% ^
    -ngl %GPU_LAYERS% ^
    --n_parallel 4 ^
    --flash-attn ^
    -b 512

echo [等待] 等待服务器启动...
timeout /t 5 /nobreak >nul

:: 验证启动
curl -s "%BASE_URL%/health" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] llama-server 启动失败
    pause
    exit /b 1
)
echo [成功] llama-server 启动完成

:GetModel
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
echo [启动] 正在启动 Doge Code...
echo [提示] 按 Ctrl+C 退出 Doge Code（llama-server 继续运行）
echo.

set "ANTHROPIC_BASE_URL=%BASE_URL%"
set "DOGE_API_KEY=%API_KEY%"
set "ANTHROPIC_MODEL=!MODEL!"
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
