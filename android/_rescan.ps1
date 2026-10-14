Write-Output "=== pnputil /scan-devices ==="
pnputil /scan-devices 2>&1 | Out-String | Write-Output

Write-Output "=== adb kill/start ==="
& "C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" kill-server 2>&1 | Out-String | Write-Output
Start-Sleep -Seconds 2
& "C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" start-server 2>&1 | Out-String | Write-Output
Start-Sleep -Seconds 3
& "C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" devices -l 2>&1 | Out-String | Write-Output
