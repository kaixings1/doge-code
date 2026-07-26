#!/bin/bash
# 初始化 PATH 环境（F:\bin\bash.exe 启动时环境为空）
export PATH="/f/bin:/c/Program Files/Git/cmd:/c/Program Files/Nodejs:/c/Program Files/Bun/bin:/c/Users/Administrator/.bun/bin:/c/Users/Administrator/AppData/Roaming/npm:/c/Users/Administrator/.cargo/bin:/c/Users/Administrator/Go/bin:/c/ProgramData/chocolatey/bin:/c/Windows/system32:/c/Windows:/c/Windows/System32/Wbem:/c/Windows/System32/WindowsPowerShell/v1.0:/c/Program Files/cmake/bin:/c/Program Files/doxygen/bin:$PATH"

# Node.js 搜索工具（替换卡死的 grep/rg/find/findstr）
export PATH="/d/doge-code/.tools:$PATH"

# 执行实际命令
exec "$@"
