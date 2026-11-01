@echo off

chcp 65001 >nul

REM === Mobile bridge launcher ===
REM Single entry point: this file ONLY calls scripts\start-mobile-bridge.mjs.
REM
REM Why no bun run here anymore:
REM   This file used to call the script AND launch a second CLI via `bun run`.
REM   The script itself spawns a CLI when the port is free, so that produced
REM   TWO CLI processes fighting over the same port. The second one was forced
REM   to the next port (6000 -> 6001) while the tunnel/address still pointed at
REM   6000 -> the phone could never connect, and startup looked "stuck".
REM   The script now owns the whole launch (it runs bun with all --feature
REM   flags, see FEATURE_ARGS in scripts\start-mobile-bridge.mjs).
REM
REM IMPORTANT: keep this file pure ASCII with CRLF line endings.
REM cmd.exe decodes batch files using the ANSI code page (GBK on zh-CN);
REM UTF-8 Chinese bytes can swallow the following newline and merge lines,
REM causing REM comments to run as commands.
REM
REM Usage:
REM   mobile.bat              -> tunnel mode (public, works outdoors)
REM   mobile.bat --lan        -> LAN only (same WiFi)
REM   mobile.bat --usb        -> USB reverse forward
REM   mobile.bat --label fixCI -> set this session's label (multi-session)

set CLAUDE_CODE_MOBILE_BRIDGE=1
REM Starting port for the mobile bridge. Default (unset) is 6000.
REM MUST be outside the Windows reserved range: `netsh int ipv4 show
REM excludedportrange protocol=tcp` shows 5681-5880 reserved on this host
REM (Hyper-V / WSL grab blocks). Binding a reserved port fails with
REM WSAEACCES "access permission not allowed", which looks like "port busy"
REM and made the 5680-5689 scan fail on every port except 5680 itself.
REM 6000 is verified free. Phone opens http://<WLAN-IP>:6000
set CLAUDE_CODE_MOBILE_PORT=6000
REM Clear any LOCAL_BRIDGE marker inherited from the parent shell.
REM Such a marker makes every plain CLI instance auto-start the mobile bridge
REM and fight over port 6000 (isMobileBridgeAvailable() returns true), so with
REM concurrent instances all but the first crash with EADDRINUSE.
REM The mobile bridge is triggered ONLY by this file's MOBILE_BRIDGE flag.
set CLAUDE_CODE_LOCAL_BRIDGE=
set CLAUDE_CODE_LOCAL_BRIDGE_URL=

REM Config lives in the user profile, NOT in the project tree (same as d.bat).
REM "~" is NOT expanded by cmd.exe -- it is handed to the CLI literally and
REM expanded there by resolveApiJsonPath() (src/utils/apiJsonPath.ts), which maps
REM a leading ~ / ~\ / ~/ to the user's home directory. That helper deliberately
REM leaves ~user / ~+ / ~- untouched (path-injection guard), so use plain "~".
REM start-mobile-bridge.mjs spawns the CLI with `...process.env`, so the
REM value set here is inherited as-is.
REM
REM %1 is overloaded: a profile name AND forwarded to the launcher via %*
REM (--lan / --usb / --label <x> / --help). A leading "-" therefore means
REM "flag", and the default profile api.json is used -- otherwise --lan would
REM look for "--lan.json", warn, and load no config at all.
REM
REM The first-char test is deliberately NOT inside a parenthesised block:
REM cmd expands %VAR% when a whole block is parsed, so the test would compare
REM against the OLD (empty) value and always take the wrong branch.
set "DOGE_PROFILE="
set "DOGE_ARG1=%~1"
if defined DOGE_ARG1 call set "DOGE_FIRST=%%DOGE_ARG1:~0,1%%"
if not "x%DOGE_FIRST%"=="x-" set "DOGE_PROFILE=%DOGE_ARG1%"
if defined DOGE_PROFILE (
    set "DOGE_API_JSON=~\.dogekey\%DOGE_PROFILE%.json"
) else (
    set "DOGE_API_JSON=~\.dogekey\api.json"
)
if not exist "%DOGE_API_JSON%" (
    echo [mobile.bat] WARNING: config not found: %DOGE_API_JSON%
)
set "DOGE_ARG1="
set "DOGE_FIRST="
set "DOGE_PROFILE="

echo [mobile.bat] CLAUDE_CODE_MOBILE_BRIDGE=1
echo [mobile.bat] Launching via scripts\start-mobile-bridge.mjs (single entry).
echo [mobile.bat] Start port %CLAUDE_CODE_MOBILE_PORT%.
echo.

cd /d D:\doge-code
node scripts\start-mobile-bridge.mjs %*
