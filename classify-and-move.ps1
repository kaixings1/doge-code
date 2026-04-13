$srcDir = "D:\doge-code\src"
$src1Dir = "D:\doge-code\src1"
$errorDir = "D:\doge-code\src1-error"

# 创建错误目录
if (-not (Test-Path $errorDir)) {
    New-Item -Path $errorDir -ItemType Directory -Force | Out-Null
}

Write-Host "=" * 80
Write-Host "开始分类 src1 文件"
Write-Host "目标: 将 src1 中汉化程度低的文件移到 src1-error"
Write-Host "=" * 80

# 获取所有 src1 文件
$allSrc1Files = Get-ChildItem -Path $src1Dir -Recurse -Include *.ts,*.tsx,*.js,*.jsx
$totalFiles = $allSrc1Files.Count
Write-Host "总文件数: $totalFiles"
Write-Host ""

$keptFiles = @()      # 保留在 src1（汉化 >= src）
$movedFiles = @()     # 移到 src1-error
$noChineseFiles = @() # 无中文，移到 src1-error

$processed = 0

foreach ($f in $allSrc1Files) {
    $processed++
    $relativePath = $f.FullName -replace [regex]::Escape($src1Dir + "\"), ""
    $srcPath = Join-Path $srcDir $relativePath
    
    $src1Cn = 0
    $srcCn = 0
    
    # 读取 src1 中文字符
    $src1Content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($src1Content) {
        $src1Cn = ([regex]::Matches($src1Content, '[\u4e00-\u9fff]')).Count
    }
    
    # 读取 src 中文字符（如果存在）
    if (Test-Path $srcPath) {
        $srcContent = Get-Content $srcPath -Raw -ErrorAction SilentlyContinue
        if ($srcContent) {
            $srcCn = ([regex]::Matches($srcContent, '[\u4e00-\u9fff]')).Count
        }
    }
    
    # 分类逻辑
    if ($src1Cn -eq 0 -and $srcCn -eq 0) {
        # 都没有中文，移到 error
        $noChineseFiles += $relativePath
        $destPath = Join-Path $errorDir $relativePath
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -Path $destDir -ItemType Directory -Force | Out-Null
        }
        Move-Item -Path $f.FullName -Destination $destPath -Force
    } elseif ($src1Cn -lt $srcCn) {
        # src1 汉化更少，移到 error
        $movedFiles += "$relativePath (src: $srcCn, src1: $src1Cn)"
        $destPath = Join-Path $errorDir $relativePath
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -Path $destDir -ItemType Directory -Force | Out-Null
        }
        Move-Item -Path $f.FullName -Destination $destPath -Force
    } else {
        # src1 汉化 >= src，保留
        $keptFiles += "$relativePath (src: $srcCn, src1: $src1Cn, 差: $($src1Cn - $srcCn))"
    }
    
    if ($processed % 200 -eq 0) {
        Write-Host "已处理 $processed / $totalFiles ..."
    }
}

# 输出报告
Write-Host "`n" + "=" * 80
Write-Host "分类完成！"
Write-Host "=" * 80

Write-Host "`n【保留在 src1 的文件】(汉化 >= src): $($keptFiles.Count) 个"
Write-Host "-" * 80
foreach ($f in $keptFiles | Sort-Object) {
    Write-Host "  [保留] $f"
}

Write-Host "`n【移到 src1-error 的文件】(汉化 < src 或无中文): $($movedFiles.Count + $noChineseFiles.Count) 个"
Write-Host "-" * 80
Write-Host "汉化较少: $($movedFiles.Count) 个"
Write-Host "无中文: $($noChineseFiles.Count) 个"

if ($movedFiles.Count -gt 0) {
    Write-Host "`n汉化较少的文件示例 (前 30 个):"
    $movedFiles | Select-Object -First 30 | ForEach-Object {
        Write-Host "  [移动] $_"
    }
}

if ($noChineseFiles.Count -gt 0) {
    Write-Host "`n无中文的文件示例 (前 20 个):"
    $noChineseFiles | Select-Object -First 20 | ForEach-Object {
        Write-Host "  [移动] $_"
    }
}

Write-Host "`n" + "=" * 80
Write-Host "总结:"
Write-Host "  保留在 src1: $($keptFiles.Count) 个文件"
Write-Host "  移到 src1-error: $($movedFiles.Count + $noChineseFiles.Count) 个文件"
Write-Host "=" * 80
