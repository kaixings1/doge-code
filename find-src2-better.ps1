$srcDir = "D:\doge-code\src"
$src2Dir = "D:\doge-code\src2"

# 先用外部 diff 获取差异文件列表
$diffReport = & where.exe diff 2>$null | Select-Object -First 1
$diffText = & "F:\bin\diff.exe" -rq $srcDir $src2Dir --exclude="*.map" --exclude="*.js.map" 2>$null

Write-Host "正在检查 src2 汉化更多的文件..."
Write-Host "=" * 80

$src2Better = @()
$srcBetter = @()
$count = 0

foreach ($line in $diffText) {
    if ($line -match "differ") {
        # 提取 src 文件路径
        if ($line -match "Files (.*?) and") {
            $srcPath = $Matches[1]
            $src2Path = $srcPath -replace [regex]::Escape($srcDir), $src2Dir
            
            # 只检查 .ts 和 .tsx 文件
            if ($srcPath -match "\.(ts|tsx)$") {
                $srcCn = 0
                $src2Cn = 0
                
                $srcContent = Get-Content $srcPath -Raw -ErrorAction SilentlyContinue
                if ($srcContent) {
                    $srcCn = ([regex]::Matches($srcContent, '[\u4e00-\u9fff]')).Count
                }
                
                $src2Content = Get-Content $src2Path -Raw -ErrorAction SilentlyContinue
                if ($src2Content) {
                    $src2Cn = ([regex]::Matches($src2Content, '[\u4e00-\u9fff]')).Count
                }
                
                $diff = $src2Cn - $srcCn
                
                if ($diff -gt 20) {
                    $relativePath = $srcPath -replace [regex]::Escape($srcDir + "\"), ""
                    $src2Better += "$relativePath`n       src: $srcCn, src2: $src2Cn, 差: +$diff"
                } elseif ($diff -lt -20) {
                    $relativePath = $srcPath -replace [regex]::Escape($srcDir + "\"), ""
                    $srcBetter += "$relativePath`n       src: $srcCn, src2: $src2Cn, 差: $diff"
                }
                
                $count++
                if ($count -ge 300) { break }
            }
        }
    }
}

Write-Host "`n【src2 汉化明显更多的文件】(差值 > 20):"
Write-Host "-" * 80
if ($src2Better.Count -gt 0) {
    foreach ($f in $src2Better) {
        Write-Host "  [+] $f"
        Write-Host ""
    }
} else {
    Write-Host "  (无)"
}

Write-Host "`n【src 汉化明显更多的文件】(差值 > 20):"
Write-Host "-" * 80
if ($srcBetter.Count -gt 0) {
    foreach ($f in $srcBetter) {
        Write-Host "  [-] $f"
        Write-Host ""
    }
} else {
    Write-Host "  (无)"
}

Write-Host "`n已检查文件数: $count"
