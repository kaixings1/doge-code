param(
    [string]$ConfigFile,
    [string]$BaseURL,
    [string]$ApiKey,
    [string]$Model
)

# 读取或创建配置
if (Test-Path $ConfigFile) {
    $config = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    $config = [PSCustomObject]@{}
}

# 创建自定义 API 端点配置
$customApiEndpoint = [PSCustomObject]@{
    provider    = "openai"
    baseURL     = $BaseURL
    apiKey      = $ApiKey
    model       = $Model
    savedModels = @($Model)
}

# 添加或更新配置
$config | Add-Member -NotePropertyName "customApiEndpoint" -NotePropertyValue $customApiEndpoint -Force

# 保存配置
$config | ConvertTo-Json -Depth 10 | Set-Content $ConfigFile -Encoding UTF8 -NoNewline

Write-Host "[配置] 已保存到：$ConfigFile"
