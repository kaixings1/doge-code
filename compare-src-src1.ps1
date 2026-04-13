$srcDir = "D:\doge-code\src"
$src1Dir = "D:\doge-code\src1"

Write-Host "正在对比 src 和 src1 的汉化程度..."
Write-Host "=" * 80

$diffText = & "F:\bin\diff.exe" -rq $srcDir $src1Dir --exclude="*.map" --exclude="*.js.map" 2>$null

$src1Better = @()
$srcBetter = @()
$count = 0
$srcTotalCn = 0
$src1TotalCn = 0

foreach ($line in $diffText) {
    if ($line -match "differ") {
        if ($line -match "Files (.*?) and") {
            $srcPath = $Matches[1]
            $src1Path = $srcPath -replace [regex]::Escape($srcDir), $src1Dir
            
            if ($srcPath -match "\.(ts|tsx)$") {
                $srcCn = 0
                $src1Cn = 0
                
                $srcContent = Get-Content $srcPath -Raw -ErrorAction SilentlyContinue
                if ($srcContent) {
                    $srcCn = ([regex]::Matches($srcContent, '[\u4e00-\u9fff]')).Count
                    $srcTotalCn += $srcCn
                }
                
                $src1Content = Get-Content $src1Path -Raw -ErrorAction SilentlyContinue
                if ($src1Content) {
                    $src1Cn = ([regex]::Matches($src1Content, '[\u4e00-\u9fff]')).Count
                    $src1TotalCn += $src1Cn
                }
                
                $diff = $src1Cn - $srcCn
                
                if ($diff -gt 20) {
                    $relativePath = $srcPath -replace [regex]::Escape($srcDir + "\"), ""
                    $src1Better += "$relativePath`n       src: $srcCn, src1: $src1Cn, 差: +$diff"
                } elseif ($diff -lt -20) {
                    $relativePath = $srcPath -replace [regex]::Escape($srcDir + "\"), ""
                    $srcBetter += "$relativePath`n       src: $srcCn, src1: $src1Cn, 差: $diff"
                }
                
                $count++
                if ($count -ge 500) { break }
            }
        }
    }
}

# 统计总中文字符
Write-Host "正在统计总中文字符数..."
$allSrcFiles = Get-ChildItem -Path $srcDir -Recurse -Include *.ts,*.tsx
$allSrc1Files = Get-ChildItem -Path $src1Dir -Recurse -Include *.ts,*.tsx

foreach ($f in $allSrcFiles) {
    $c = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($c) { $srcTotalCn += ([regex]::Matches($c, '[\u4e00-\u9fff]')).Count }
}

foreach ($f in $allSrc1Files) {
    $c = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($c) { $src1TotalCn += ([regex]::Matches($c, '[\u4e00-\u9fff]')).Count }
}

Write-Host "`n【总体统计】"
Write-Host "-" * 80
Write-Host "src  总中文字符: $srcTotalCn"
Write-Host "src1 总中文字符: $src1TotalCn"
Write-Host "差值: $($src1TotalCn - $srcTotalCn)"

Write-Host "`n【src1 汉化明显更多的文件】(差值 > 20):"
Write-Host "-" * 80
if ($src1Better.Count -gt 0) {
    foreach ($f in $src1Better) {
        Write-Host "  [+] $f"
        Write-Host ""
    }
} else {
    Write-Host "  (无)"
}

Write-Host "`n【src 汉化明显更多的文件】(差值 > 20):"
Write-Host "-" * 80
if ($srcBetter.Count -gt 0) {
    $showCount = [Math]::Min($srcBetter.Count, 50)
    for ($i = 0; $i -lt $showCount; $i++) {
        Write-Host "  [-] $($srcBetter[$i])"
        Write-Host ""
    }
    if ($srcBetter.Count -gt 50) {
        Write-Host "  ... 还有 $($srcBetter.Count - 50) 个文件"
    }
} else {
    Write-Host "  (无)"
}

Write-Host "`n已检查差异文件数: $count"
