$src1Dir = "D:\doge-code\src1"

Write-Host "检查 src1 中的中文乱码情况..."
Write-Host "=" * 80

# 抽样读取几个文件，检查中文是否正常
$sampleFiles = @(
    'bridge/bridgeMain.ts',
    'bootstrap/state.ts',
    'commands/mcp/xaaIdpCommand.ts',
    'components/PromptInput/useSwarmBanner.ts',
    'components/LogoV2/WelcomeV2.tsx',
    'commands/install.tsx'
)

$mojibakeCount = 0
$normalCount = 0

foreach ($sf in $sampleFiles) {
    $path = Join-Path $src1Dir $sf
    
    # 方法1：直接读取，检查常见乱码模式
    $raw = [System.IO.File]::ReadAllText($path)
    
    # 常见乱码特征：包含"閫""娴""绠""鈥"等字符
    $hasMojibake = $raw -match '[閫娴绠鈀鈥閿欒鐨勫瓧绗]'
    
    # 提取包含中文的行
    $chineseLines = ($raw -split "`n" | Where-Object { $_ -match '[\u4e00-\u9fff]' } | Select-Object -First 3)
    
    Write-Host "`n文件: $sf"
    Write-Host "-" * 70
    
    if ($hasMojibake) {
        Write-Host "  [!] 检测到乱码特征"
        $mojibakeCount++
    } else {
        Write-Host "  [OK] 正常"
        $normalCount++
    }
    
    # 显示前几行中文内容
    if ($chineseLines) {
        foreach ($line in $chineseLines) {
            $trimmed = $line.Trim()
            if ($trimmed.Length -gt 100) { $trimmed = $trimmed.Substring(0, 100) + "..." }
            Write-Host "    $trimmed"
        }
    }
}

Write-Host "`n" + "=" * 80
Write-Host "总计: 正常 $normalCount / 乱码 $mojibakeCount / 共 $($sampleFiles.Count) 个文件"
