@echo off

chcp 65001 >nul

REM === Mobile bridge launcher ===
REM Starts the REAL mobile bridge (mobileBridge.ts, port 5680) instead of
REM the local bridge skeleton (scripts\bridge.ts, port 5678).
REM
REM Why this file exists:
REM   scripts\bridge.ts is a standalone protocol skeleton. Its `case 'message'`
REM   only broadcasts back to the sender, so a browser talking to port 5678
REM   will see its own message echoed and nothing else -- no AI reply ever.
REM   The real mobile bridge lives in src\bridge\mobileBridge.ts (port 5680),
REM   started either by /mobile-connect inside the CLI, or automatically by
REM   bootstrap-entry.ts when CLAUDE_CODE_MOBILE_BRIDGE=1.
REM
REM IMPORTANT: keep this file pure ASCII with CRLF line endings.
REM cmd.exe decodes batch files using the ANSI code page (GBK on zh-CN);
REM UTF-8 Chinese bytes can swallow the following newline and merge lines,
REM causing REM comments to run as commands.
REM
REM Usage:
REM   mobile.bat            -> en starts the CLI with mobile bridge enabled
REM   then type in the CLI: /mobile-connect
REM   open the printed URL/QR on your phone (same WiFi), port 5680

set CLAUDE_CODE_MOBILE_BRIDGE=1

if "%1"=="" (
    set DOGE_API_JSON=.doge\api.json
) else (
    set DOGE_API_JSON=.doge\%1.json
)

echo [mobile.bat] CLAUDE_CODE_MOBILE_BRIDGE=1
echo [mobile.bat] After the CLI starts, run: /mobile-connect
echo [mobile.bat] Then open the printed URL on your phone (port 5680).
echo.

bun run ^
    --feature=TERMINAL_PANEL --feature=PROACTIVE --feature=KAIROS ^
    --feature=KAIROS_BRIEF --feature=KAIROS_CHANNELS --feature=BRIDGE_MODE ^
    --feature=DAEMON --feature=VOICE_MODE --feature=HISTORY_SNIP ^
    --feature=CCR_REMOTE_SETUP --feature=EXPERIMENTAL_SKILL_SEARCH ^
    --feature=KAIROS_GITHUB_WEBHOOKS --feature=ULTRAPLAN --feature=TORCH ^
    --feature=FORK_SUBAGENT --feature=WORKFLOW_SCRIPTS --feature=MCP_SKILLS ^
    --feature=AGENT_TRIGGERS --feature=CCR_AUTO_CONNECT --feature=CCR_MIRROR ^
    --feature=CACHED_MICROCOMPACT --feature=CONNECTOR_TEXT ^
    --feature=TRANSCRIPT_CLASSIFIER --feature=BASH_CLASSIFIER ^
    --feature=COORDINATOR_MODE --feature=EXTRACT_MEMORIES ^
    --feature=DOWNLOAD_USER_SETTINGS --feature=COMMIT_ATTRIBUTION ^
    --feature=STREAMLINED_OUTPUT --feature=NATIVE_CLIENT_ATTESTATION ^
    --feature=TOKEN_BUDGET --feature=TEMPLATES --feature=CHICAGO_MCP ^
    --feature=BG_SESSIONS --feature=BYOC_ENVIRONMENT_RUNNER ^
    --feature=SELF_HOSTED_RUNNER --feature=REACTIVE_COMPACT ^
    --feature=CONTEXT_COLLAPSE --feature=PROMPT_CACHE_BREAK_DETECTION ^
    --feature=VERIFICATION_AGENT --feature=AGENT_MEMORY_SNAPSHOT ^
    --feature=BREAK_CACHE_COMMAND --feature=NEW_INIT ^
    --feature=MEMORY_SHAPE_TELEMETRY --feature=TEAMMEM ^
    --feature=DIRECT_CONNECT --feature=LODESTONE --feature=SSH_REMOTE ^
    --feature=UPLOAD_USER_SETTINGS --feature=HARD_FAIL --feature=ABLATION_BASELINE ^
    --feature=DUMP_SYSTEM_PROMPT --feature=WEB_BROWSER_TOOL --feature=QUICK_SEARCH ^
    --feature=MESSAGE_ACTIONS --feature=FILE_PERSISTENCE ^
    "D:\doge-code\src\bootstrap-entry.ts" ^
    --dangerously-skip-permissions --verbose %2 %3 --debug-file ./debug-mobile.txt
