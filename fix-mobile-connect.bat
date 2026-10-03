@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM ============================================================================
REM  fix-mobile-connect.bat
REM
REM  Auto-fix the phone-cannot-connect-to-doge-code issue.
REM
REM  Diagnosis, verified:
REM    d.bat      does NOT set CLAUDE_CODE_MOBILE_BRIDGE -> port 5680 stays down
REM               by design: prevents multiple instances fighting over 5680
REM    mobile.bat sets CLAUDE_CODE_MOBILE_BRIDGE=1        -> real bridge starts
REM    With only 5678 listening, the phone sees its own message echoed back
REM    and never gets an AI reply.
REM
REM  This script does three things:
REM    1. Add inbound firewall rule for 5680 - needs admin, auto UAC elevate
REM    2. Check whether 5680 is listening; if not, tell user to run mobile.bat
REM    3. List LAN IPs the phone should use - virtual adapters excluded
REM
REM  IMPORTANT: keep this file PURE ASCII with CRLF line endings.
REM  cmd.exe decodes batch files using the ANSI code page, GBK on zh-CN;
REM  UTF-8 bytes swallow the following newline and merge lines, so comment
REM  lines get executed as commands. No non-ASCII in this file.
REM ============================================================================

REM --- Phase 1: require admin, self-elevate via UAC if needed ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [fix] Administrator rights are required to add the firewall rule.
    echo [fix] Requesting elevation. Click YES on the UAC prompt.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [fix] Elevation failed or was declined.
        echo [fix] Right-click this file and choose Run as administrator.
        pause
    )
    exit /b
)

echo ============================================================
echo  doge-code mobile connection fix
echo ============================================================
echo.

REM --- Phase 2: add firewall rule, idempotent ---
set RULE_NAME=doge-mobile-bridge-5680
set RULE_EXISTS=no
for /f "delims=" %%R in ('powershell -NoProfile -Command "if (Get-NetFirewallRule -DisplayName '%RULE_NAME%' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }"') do set RULE_EXISTS=%%R

if "!RULE_EXISTS!"=="yes" (
    echo [1/3] Firewall rule already exists, skipping.
) else (
    echo [1/3] Adding inbound firewall rule for port 5680...
    powershell -NoProfile -Command "New-NetFirewallRule -DisplayName '%RULE_NAME%' -Direction Inbound -Protocol TCP -LocalPort 5680 -Action Allow -Profile Any -Description 'Allow phone access to doge-code mobile bridge' | Out-Null"
    if !errorlevel! equ 0 (
        echo       Rule created.
    ) else (
        echo       FAILED. Make sure you are running as administrator.
    )
)

REM --- Phase 3: check whether 5680 is listening ---
echo.
echo [2/3] Checking whether port 5680 is listening...
REM NOTE: use PowerShell instead of netstat+findstr. The colon inside
REM findstr quoted pattern breaks cmd for/f parsing. PowerShell avoids it.
REM Keep comments free of quotes and parens: cmd parses them even in REM
REM lines, which silently corrupts the enclosing block structure.
set LISTENING=0
for /f "delims=" %%L in ('powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5680 -State Listen -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }"') do set LISTENING=%%L

if "!LISTENING!"=="yes" (
    echo       Port 5680 is listening. Mobile bridge is ready.
) else (
    echo       Port 5680 is NOT listening - mobile bridge not started yet.
    echo.
    echo       Why: d.bat does not start the mobile bridge - by design.
    echo       Fix: run mobile.bat, then type /mobile-connect inside the CLI.
)

REM --- Phase 4: list LAN IPs the phone should use ---
echo.
echo [3/3] LAN IPs the phone should use (virtual adapters excluded):
echo.
powershell -NoProfile -Command ^
  "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $a=$_.IPAddress; $n=$_.InterfaceAlias; $virtual = $n -match 'VMware|Hyper-V|vEthernet|Loopback|Default Switch'; if ($virtual) { Write-Host ('    [SKIP] ' + $a + '  (' + $n + ' - virtual, phone cannot route)') -ForegroundColor DarkGray } else { Write-Host ('    [USE ] http://' + $a + ':5680  (' + $n + ')') -ForegroundColor Green } }"

echo.
echo ============================================================
echo  NEXT STEPS
echo ============================================================
echo.
echo   1. Close all running doge windows (avoid port conflicts)
echo   2. Double-click mobile.bat
echo   3. Inside the CLI run:  /mobile-connect
echo   4. Connect the phone to the SAME WiFi, open the [USE ] URL above
echo.
echo   DO NOT use 192.168.243.x / 192.168.12.x / 172.22.x.x
echo   Those are VMware / Hyper-V virtual adapters; the phone will hang.
echo   The correct one is usually the WLAN adapter address.
echo.
pause
endlocal
