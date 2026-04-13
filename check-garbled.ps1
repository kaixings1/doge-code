$src1Dir = "D:\doge-code\src1"

Write-Host "正在检查 src1 中的代码质量..."
Write-Host "=" * 80

# 1. 检查是否有异常字符（非ASCII、非中文、非常见符号）
$badFiles = @()
$goodFiles = @()
$totalFiles = 0

$allFiles = Get-ChildItem -Path $src1Dir -Recurse -Include *.ts,*.tsx

foreach ($f in $allFiles) {
    $totalFiles++
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    
    # 检查是否有替换字符 (U+FFFD) - 通常表示乱码
    $replacementChars = ([regex]::Matches($content, '\uFFFD')).Count
    
    # 检查是否有异常的控制字符
    $controlChars = ([regex]::Matches($content, '[\x00-\x08\x0B\x0C\x0E-\x1F]')).Count
    
    # 检查是否有大量连续问号（可能的乱码标志）
    $questionMarks = ([regex]::Matches($content, '\?\?\?')).Count
    
    if ($replacementChars -gt 0 -or $controlChars -gt 10 -or $questionMarks -gt 5) {
        $relativePath = $f.FullName -replace [regex]::Escape($src1Dir + "\"), ""
        $badFiles += "$relativePath (替换符: $replacementChars, 控制字符: $controlChars, 连续问号: $questionMarks)"
    } else {
        $goodFiles += $f.FullName
    }
    
    if ($totalFiles % 100 -eq 0) {
        Write-Host "已检查 $totalFiles 个文件..."
    }
}

Write-Host "`n【检查结果】"
Write-Host "-" * 80
Write-Host "总文件数: $totalFiles"
Write-Host "正常文件数: $($goodFiles.Count)"
Write-Host "可疑文件数: $($badFiles.Count)"

if ($badFiles.Count -gt 0) {
    Write-Host "`n【可疑文件（可能有乱码）]:"
    Write-Host "-" * 80
    foreach ($f in $badFiles) {
        Write-Host "  [!] $f"
    }
} else {
    Write-Host "`n✅ 没有发现明显乱码！"
}

# 2. 抽样检查几个文件的内容质量
Write-Host "`n【抽样检查文件内容】"
Write-Host "-" * 80

$sampleFiles = @(
    'bridge/bridgeMain.ts',
    'bootstrap/state.ts',
    'commands/mcp/xaaIdpCommand.ts',
    'components/PromptInput/useSwarmBanner.ts',
    'cli/update.ts'
)

foreach ($sf in $sampleFiles) {
    $path = Join-Path $src1Dir $sf
    if (Test-Path $path) {
        $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $chineseCount = ([regex]::Matches($content, '[\u4e00-\u9fff]')).Count
            $hasGarbled = if ($content -match '\uFFFD') { "有乱码" } else { "正常" }
            Write-Host "$sf"
            Write-Host "  中文字符: $chineseCount | 状态: $hasGarbled"
            
            # 显示一行中文内容作为示例
            $firstChineseLine = ($content -split "`n" | Where-Object { $_ -match '[\u4e00-\u9fff]' } | Select-Object -First 1)
            if ($firstChineseLine) {
                $trimmed = $firstChineseLine.Trim()
                if ($trimmed.Length -gt 80) { $trimmed = $trimmed.Substring(0, 80) + "..." }
                Write-Host "  示例: $trimmed"
            }
            Write-Host ""
        }
    }
}
