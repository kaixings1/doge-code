Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*'
} | Select-Object IPAddress, InterfaceAlias | Format-Table -Auto
