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

if "%1"=="" (
    set DOGE_API_JSON=.doge\api.json
) else (
    set DOGE_API_JSON=.doge\%1.json
)

echo [mobile.bat] CLAUDE_CODE_MOBILE_BRIDGE=1
echo [mobile.bat] Launching via scripts\start-mobile-bridge.mjs (single entry).
echo [mobile.bat] Start port %CLAUDE_CODE_MOBILE_PORT%.
echo.

cd /d D:\doge-code
node scripts\start-mobile-bridge.mjs %*
