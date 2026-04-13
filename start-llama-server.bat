@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
:: llama-server 启动脚本（大上下文模式）
:: ============================================================
:: 模型：Qwen3.5-27B-Uncensored-KL
:: 上下文：32768 tokens
:: GPU 卸载：全部层
:: ============================================================

set "MODEL_PATH=D:\LLM\LuffyTheFox\Qwen3.5-27B-Claude-4.6-Opus-Uncensored-V2-Kullback-Leibler-GGUF\Qwen3.5-27B-Uncensored-KL.Q4_K_M.gguf"
set "PORT=8080"
set "CTX_SIZE=32768"
set "GPU_LAYERS=99"

echo.
echo ============================================================
echo     llama-server 启动脚本
echo ============================================================
echo   模型：Qwen3.5-27B-Uncensored-KL
echo   上下文：%CTX_SIZE% tokens
echo   端口：%PORT%
echo   GPU 层数：%GPU_LAYERS%
echo ============================================================
echo.

:: 检查模型文件
if not exist "%MODEL_PATH%" (
    echo [错误] 模型文件不存在：%MODEL_PATH%
    echo.
    echo 可用模型目录：
    dir /b D:\LLM\*.gguf 2>nul
    pause
    exit /b 1
)

echo [模型] 文件存在，大小：
for %%A in ("%MODEL_PATH%") do echo        %%~zA 字节

echo.
echo [启动] 正在启动 llama-server...
echo [提示] 按 Ctrl+C 可停止服务器
echo [提示] 服务器启动后，打开新窗口运行 start-llama.bat
echo.

:: 启动 llama-server
llama-server ^
    -m "%MODEL_PATH%" ^
    --port %PORT% ^
    -c %CTX_SIZE% ^
    -ngl %GPU_LAYERS% ^
    --n_parallel 4 ^
    --flash-attn ^
    -b 512

endlocal
