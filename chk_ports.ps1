Get-NetTCPConnection -State Listen | Where-Object {
    $_.LocalPort -ge 5670 -and $_.LocalPort -le 6010
} | Select-Object LocalPort, OwningProcess | Sort-Object LocalPort | Format-Table -Auto
