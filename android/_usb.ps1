Get-PnpDevice -Class USB -ErrorAction SilentlyContinue |
    Where-Object { $_.FriendlyName -match 'Android|ADB|Composite|Xiaomi|Google' } |
    Select-Object Status, FriendlyName | Format-Table -AutoSize | Out-String
Write-Output "--- 所有 Android/adb 相关 ---"
Get-PnpDevice -ErrorAction SilentlyContinue |
    Where-Object { $_.FriendlyName -match 'Android|ADB' } |
    Select-Object Status, Class, FriendlyName | Format-Table -AutoSize | Out-String
