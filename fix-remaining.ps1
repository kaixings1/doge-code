# 批量修复 src1 中的导入路径
# 将所有从工具子目录到 constants 的错误导入修复为本地导入

$files = @(
    "tools\AgentTool\built-in\exploreAgent.ts",
    "tools\AgentTool\built-in\planAgent.ts",
    "tools\AgentTool\built-in\verificationAgent.ts",
    "tools\AgentTool\built-in\claudeCodeGuideAgent.ts"
)

foreach ($file in $files) {
    $fullPath = "D:\doge-code\src1\$file"
    if (Test-Path $fullPath) {
        $content = Get-Content $fullPath -Raw -Encoding UTF8
        # 替换 ../../../constants 或 ../../constants 为 ./constants 或 ../constants
        $content = $content -replace "from\s+'[\.\./]*constants'", "from './constants'"
        $content = $content -replace "from\s+'[\.\./]*types'", "from './types'"
        Set-Content $fullPath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "Fixed: $file"
    }
}

Write-Host "Done!"
