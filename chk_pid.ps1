Get-CimInstance Win32_Process -Filter "ProcessId = 45772" |
    Select-Object ProcessId, Name, CommandLine | Format-List
