$files = @(
    'components/App.tsx',
    'commands/install.tsx',
    'commands/login/login.tsx',
    'commands/mcp/mcp.tsx',
    'commands/status/status.tsx',
    'tools/FileWriteTool/FileWriteTool.ts',
    'tools/BashTool/BashTool.ts',
    'utils/fileRead.ts',
    'utils/settings/constants.ts',
    'constants/prompts.ts'
)

Write-Host "文件对比 (中文字符数):"
Write-Host "=" * 60

foreach ($f in $files) {
    $srcPath = "D:\doge-code\src\$f"
    $src2Path = "D:\doge-code\src2\$f"
    
    $srcCn = 0
    $src2Cn = 0
    
    if (Test-Path $srcPath) {
        $srcContent = Get-Content $srcPath -Raw -ErrorAction SilentlyContinue
        if ($srcContent) {
            $srcCn = ([regex]::Matches($srcContent, '[\u4e00-\u9fff]')).Count
        }
    }
    
    if (Test-Path $src2Path) {
        $src2Content = Get-Content $src2Path -Raw -ErrorAction SilentlyContinue
        if ($src2Content) {
            $src2Cn = ([regex]::Matches($src2Content, '[\u4e00-\u9fff]')).Count
        }
    }
    
    $diff = $srcCn - $src2Cn
    $winner = if ($diff -gt 0) { "src+" } elseif ($diff -lt 0) { "src2+" } else { "=" }
    
    Write-Host "$f"
    Write-Host "  src: $srcCn | src2: $src2Cn | 差: $diff ($winner)"
    Write-Host ""
}
