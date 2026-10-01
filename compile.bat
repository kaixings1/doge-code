@echo off
chcp 65001 >nul

REM ============================================================================
REM  doge-code build script
REM
REM  NOTE: keep this file pure ASCII with CRLF line endings.
REM  cmd.exe decodes a batch file using the ANSI code page (GBK on zh-CN);
REM  UTF-8 Chinese bytes can swallow the following newline, merging lines so
REM  that REM comment lines get executed as commands. Also, cmd.exe does NOT
REM  treat '#' as a comment character (unlike sh) - it tries to run it.
REM
REM  Environment: this script sets no CLAUDE_CODE_* / FEATURE variables.
REM  All runtime env vars come from config files:
REM    ~/.doge/settings.json        -> "env" (user level)
REM    <project>/.claude/settings.json -> "env" (project level)
REM    Change via: /config env.KEY=value  or edit the JSON.
REM
REM  feature gate: feature('X') comes from bun:bundle and is replaced by a
REM  boolean literal at build time (DCE). It cannot be changed at runtime --
REM  env vars and --define are both ineffective. The only correct switch is
REM  the CLI `--feature X` (equivalent to Bun.build's features array).
REM  Historically `--define X=true` was used here, which does nothing for
REM  feature() and froze all compile-time gates to false.
REM ============================================================================

rm -f .bun-build*
rm -rf node_modules/.cache

rm -rf .doge\build
rm -rf dist
rm -rf out
rm -rf build

rm -f package-lock.json yarn.lock

REM === Clean up stale .js artifacts that shadow .ts sources (must run BEFORE bun build) ===
PowerShell -Command "Remove-Item -Path 'src/__tests__/unit/openaiCompatStream.test.js','src/bootstrap-entry.js','src/bridge/bridgeMain.js','src/bridge/initReplBridge.js','src/cli/print.js','src/commands/issue/index.js','src/commands/loader.js','src/entrypoints/init.js','src/index.js','src/ink/log-update.js','src/ink/render-node-to-output.js','src/tools/CtxInspectTool/CtxInspectTool.js','src/tools/ListPeersTool/ListPeersTool.js','src/tools/PushNotificationTool/PushNotificationTool.js','src/tools/SendUserFileTool/SendUserFileTool.js','src/tools/SubscribePRTool/SubscribePRTool.js','src/tools/TerminalCaptureTool/TerminalCaptureTool.js','src/tools/WebBrowserTool/WebBrowserTool.js','src/tools.js','src/engine/messageLoop.js' -ErrorAction SilentlyContinue"
echo [*] Stale .js artifacts cleaned
rm -f src/screens/REPL.js

call bun run scripts/embed-status-line.ts

REM === Build with --feature (correct feature() gate mechanism) ===
REM NOTE: WORKFLOW_SCRIPTS is NOT enabled, and --external ink is NOT used.
REM   WORKFLOW_SCRIPTS pulls ink/build/reconciler.js (which has top-level await)
REM   into the graph, and bun --compile fails at static analysis.
REM   Adding --external ink avoids that, but the resulting exe then looks for
REM   the ink package on disk at runtime. This script copies the exe to f:\bin\,
REM   which has no node_modules -- verified the exe then dies with
REM   "Cannot find package 'ink'". Both are unacceptable, so the feature stays off.
call bun build ^
    --feature PROACTIVE --feature KAIROS --feature KAIROS_BRIEF --feature KAIROS_CHANNELS --feature BRIDGE_MODE --feature DAEMON ^
    --feature VOICE_MODE --feature HISTORY_SNIP --feature CCR_REMOTE_SETUP --feature EXPERIMENTAL_SKILL_SEARCH --feature KAIROS_GITHUB_WEBHOOKS --feature ULTRAPLAN ^
    --feature TORCH --feature FORK_SUBAGENT --feature MCP_SKILLS --feature AGENT_TRIGGERS ^
    --feature CCR_AUTO_CONNECT --feature CCR_MIRROR --feature CACHED_MICROCOMPACT --feature CONNECTOR_TEXT --feature TRANSCRIPT_CLASSIFIER --feature BASH_CLASSIFIER ^
    --feature COORDINATOR_MODE --feature EXTRACT_MEMORIES --feature DOWNLOAD_USER_SETTINGS --feature COMMIT_ATTRIBUTION --feature STREAMLINED_OUTPUT --feature NATIVE_CLIENT_ATTESTATION ^
    --feature TOKEN_BUDGET --feature TEMPLATES --feature CHICAGO_MCP --feature BG_SESSIONS --feature BYOC_ENVIRONMENT_RUNNER --feature SELF_HOSTED_RUNNER ^
    --feature REACTIVE_COMPACT --feature CONTEXT_COLLAPSE --feature PROMPT_CACHE_BREAK_DETECTION --feature VERIFICATION_AGENT --feature AGENT_MEMORY_SNAPSHOT --feature BREAK_CACHE_COMMAND ^
    --feature NEW_INIT --feature MEMORY_SHAPE_TELEMETRY --feature TEAMMEM --feature DIRECT_CONNECT --feature LODESTONE --feature SSH_REMOTE ^
    --feature UPLOAD_USER_SETTINGS --feature HARD_FAIL --feature ABLATION_BASELINE --feature DUMP_SYSTEM_PROMPT --feature WEB_BROWSER_TOOL --feature QUICK_SEARCH ^
    --feature TERMINAL_PANEL --feature MESSAGE_ACTIONS --feature FILE_PERSISTENCE ^
    ./src/bootstrap-entry.ts --compile --outfile ./doge ^
    --external playwright --external playwright-core

if errorlevel 1 (
    echo [!] BUILD FAILED
    pause
    exit /b 1
)
echo [*] Build succeeded: doge.exe

copy .\doge.exe f:\bin\doge.exe

REM === Clean up build artifacts from src/ to prevent .js shadowing .ts ===
PowerShell -Command "Get-ChildItem -Path 'src/commands/clear' -Filter '*.js' -ErrorAction SilentlyContinue | Remove-Item -Force"
PowerShell -Command "Get-ChildItem -Path 'src/commands/logout' -Filter '*.js' -ErrorAction SilentlyContinue | Remove-Item -Force"
PowerShell -Command "Get-ChildItem -Path 'src/generated' -Filter '*.js' -ErrorAction SilentlyContinue | Remove-Item -Force"
PowerShell -Command "Get-ChildItem -Path 'src/tools/REPLTool' -Filter '*.js' -ErrorAction SilentlyContinue | Remove-Item -Force"
PowerShell -Command "Get-ChildItem -Path 'src/tools/VerifyPlanExecutionTool' -Filter '*.js' -ErrorAction SilentlyContinue | Remove-Item -Force"
PowerShell -Command "Get-ChildItem -Path 'src' -Recurse -Filter '*.js.map' -ErrorAction SilentlyContinue | Remove-Item -Force"
echo [*] Build artifacts cleaned from src/

PowerShell -Command "Get-ChildItem -Path 'src' -Recurse -Filter '*.js' -ErrorAction SilentlyContinue | Remove-Item -Force"
echo [*] All src .js artifacts cleaned

pause
