@echo off
chcp 65001 >/dev/null
setlocal

:: ========== DOGE CLI 启动包装器 ==========
:: 在任意目录运行时自动配置所需环境，避免常见报错

:: 跳过非必要流量和遥测
set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
set CLAUDE_CODE_ENABLE_TELEMETRY=0
set CLAUDE_CODE_ATTRIBUTION_HEADER=0
set CLAUDE_CODE_SIMPLE=1

:: 超时设置
set BASH_DEFAULT_TIMEOUT_MS=600000
set BASH_MAX_TIMEOUT_MS=600000
set STREAM_IDLE_TIMEOUT_MS=600000
set API_TIMEOUT_MS=600000
set CLAUDE_STREAM_IDLE_TIMEOUT_MS=1080000
set MCP_TIMEOUT=180

:: 确保必要的配置目录存在
if not exist "$USERPROFILE\.doge\commands" mkdir "$USERPROFILE\.doge\commands" >/dev/null 2>&1
if not exist "$USERPROFILE\.doge\skills" mkdir "$USERPROFILE\.doge\skills" >/dev/null 2>&1

:: 如果系统有 rg 命令，优先使用系统 ripgrep
where rg >/dev/null 2>&1
if $errorlevel equ 0 (
    set USE_BUILTIN_RIPGREP=0
)

:: 运行
"$~dp0doge.exe" *
