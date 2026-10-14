$devs = Get-PnpDevice -Class AndroidUsbDeviceClass -ErrorAction SilentlyContinue
$devs | Select-Object Status, FriendlyName, InstanceId | Format-List | Out-String | Write-Output

Write-Output "=== 尝试重新枚举（disable + enable）==="
foreach ($d in $devs) {
    if ($d.Status -ne "OK") {
        try {
            Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop
            Start-Sleep -Seconds 2
            Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop
            Write-Output ("REENUMERATED: " + $d.InstanceId)
        } catch {
            Write-Output ("FAIL on " + $d.InstanceId + ": " + $_.Exception.Message)
        }
    }
}
