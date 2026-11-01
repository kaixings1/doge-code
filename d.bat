@echo off

chcp 65001 >nul

del /q .bun-build* 2>nul
rd /s /q node_modules\.cache 2>nul

REM === Environment variables are provided by config files ===
REM ~\.doge\settings.json            -> "env" (user level, highest priority)
REM <project>\.claude\settings.json  -> "env" (project level, team shared)
REM Edit with: /config env.KEY=value  or edit the env field of the JSON.
REM Only DOGE_API_JSON stays here because it depends on %1.
REM
REM NOTE: CLAUDE_CODE_FEATURE_* through settings.json env is fully valid.
REM managedEnv.applyConfigEnvironmentVariables() applies env from every
REM source and is NOT limited by SAFE_ENV_VARS (that whitelist only applies
REM to the pre-trust applySafe* phase).
REM
REM IMPORTANT: keep this file pure ASCII with CRLF line endings.
REM cmd.exe decodes a batch file using the ANSI code page (GBK on zh-CN);
REM UTF-8 Chinese bytes can swallow the following newline, merging lines so
REM that REM comment lines get executed as commands.

REM Config lives in the user profile, NOT in the project tree.
REM "~" is NOT expanded by cmd.exe -- it is handed to the CLI literally and
REM expanded there by resolveApiJsonPath() (src/utils/apiJsonPath.ts), which maps
REM a leading ~ / ~\ / ~/ to the user's home directory. That helper deliberately
REM leaves ~user / ~+ / ~- untouched (path-injection guard), so use plain "~".
if "%1"=="" (
    set "DOGE_API_JSON=~\.dogekey\api.json"
) else (
    set "DOGE_API_JSON=~\.dogekey\%1.json"
)
if not exist "%DOGE_API_JSON%" (
    echo [d.bat] WARNING: config not found: %DOGE_API_JSON%
)

REM Clear any LOCAL_BRIDGE marker inherited from the parent shell.
REM Such a marker makes every plain CLI instance auto-start the mobile bridge
REM and fight over port 5680 (isMobileBridgeAvailable() returns true), so with
REM concurrent instances all but the first crash with EADDRINUSE.
REM Use mobile.bat for the mobile bridge (it sets CLAUDE_CODE_MOBILE_BRIDGE=1).
REM NOTE: d.bat must NOT set CLAUDE_CODE_MOBILE_BRIDGE. Setting it here made
REM every d.bat instance start the mobile bridge and fight over ports
REM 5680-5689; all but the first failed (error swallowed by bootstrap-entry's
REM .catch), which is why the mobile bridge appeared "missing" on later
REM instances. The mobile bridge is mobile.bat's job.
set CLAUDE_CODE_LOCAL_BRIDGE=
set CLAUDE_CODE_LOCAL_BRIDGE_URL=

REM === Feishu bridge (optional) ===
REM Credentials live in .claude\settings.local.json (template:
REM tools\feishu\settings.local.example.json) or ~\.doge\settings.json.
REM They are applied by init() before the REPL mounts, and keeping secrets
REM out of this file avoids committing them.
REM Set DOGE_FEISHU=1 in your shell to turn it on for one run without
REM editing any config file.
if defined DOGE_FEISHU (
    set FEISHU_BRIDGE=1
    echo [d.bat] Feishu bridge enabled for this run
)

REM === Tiered model router (optional) ===
REM /router executor is OFF unless explicitly enabled: unset means "never
REM downgrade". Enable for one run with:   set DOGE_ROUTER=1
REM Sanity-check first (logs the decision, keeps the model):
REM   set DOGE_ROUTER=1   +   set DOGE_ROUTER_DRY=1
REM Optional per-run overrides:
REM   set DOGE_ROUTER_CHEAP=<model>     (default: getSmallFastModel / Haiku)
REM   set DOGE_ROUTER_STANDARD=<model>  (default: getDefaultSonnetModel)
REM Rules live in src/utils/routerDowngrade.ts: one tier down max, never
REM upgrade, never in plan mode, never with images, never above 60k context,
REM never for unrecognized (custom/proxy) model ids.
REM
REM Always copy (and always blank when the source is off) so a parent shell
REM cannot silently leave downgrade enabled. Never use "if defined X set
REM Y=%X%" on one line: cmd expands %X% at parse time and assigns the OLD
REM (usually empty) value.
set CLAUDE_CODE_ROUTER_AUTO=%DOGE_ROUTER%
set CLAUDE_CODE_ROUTER_DRY_RUN=%DOGE_ROUTER_DRY%
set CLAUDE_CODE_ROUTER_DEBUG=%DOGE_ROUTER_DEBUG%
set CLAUDE_CODE_ROUTER_CHEAP_MODEL=%DOGE_ROUTER_CHEAP%
set CLAUDE_CODE_ROUTER_STANDARD_MODEL=%DOGE_ROUTER_STANDARD%
if not defined DOGE_ROUTER goto :router_off
echo [d.bat] Model router auto-downgrade ENABLED
if defined CLAUDE_CODE_ROUTER_DRY_RUN echo [d.bat]   dry-run: decisions logged, model unchanged
if defined CLAUDE_CODE_ROUTER_CHEAP_MODEL echo [d.bat]   cheap tier: %DOGE_ROUTER_CHEAP%
if defined CLAUDE_CODE_ROUTER_STANDARD_MODEL echo [d.bat]   standard tier: %DOGE_ROUTER_STANDARD%
goto :router_done
:router_off
REM Undefined after the copy-above means the source var was empty: blank it.
if not defined CLAUDE_CODE_ROUTER_AUTO set CLAUDE_CODE_ROUTER_AUTO=
:router_done

REM === Session-end sound: distinct wav so it is not confused with the 2-beep task-complete sound ===
REM default session-end sound is a single terminal beep, easily confused with task-complete (2 beeps).
REM switch back to beep:  set CLAUDE_CODE_SESSION_END_SOUND=beep
REM turn off:            set CLAUDE_CODE_SESSION_END_SOUND=none
REM custom mp3:          set CLAUDE_CODE_SESSION_END_SOUND=mp3:C:\path\to\sound.mp3
if not defined CLAUDE_CODE_SESSION_END_SOUND set CLAUDE_CODE_SESSION_END_SOUND=wav:C:\Windows\Media\tada.wav
REM === Local bridge server: start in background if 5678 is not serving ===
REM Readiness is decided by an actual HTTP /health request, NOT by netstat.
REM netstat lies in two ways here:
REM   1. a crashed/half-closed instance leaves the port in FIN_WAIT_1, which
REM      still matches ":5678" but accepts no connections -> a new
REM      server.listen() dies with EADDRINUSE while the poll keeps matching;
REM   2. ":5678" also matches ":56780" and remote endpoints.
REM curl.exe ships with Windows 10+ and is used below with -f (fail on 4xx/5xx).
set "BRIDGE_HEALTH=http://127.0.0.1:5678/health"

curl -s -f -m 2 -o nul "%BRIDGE_HEALTH%" >nul 2>&1
if not errorlevel 1 (
    echo [d.bat] Bridge server already running on port 5678
    goto :bridge_ready
)

echo [d.bat] Starting local bridge server on port 5678 ...
REM IMPORTANT: redirect ALL stdio to nul. The bridge shares this Windows
REM Terminal window/console with the foreground TUI; a single stray write
REM from it lands on Ink's alternate screen buffer and stays there until
REM the next full redraw (that is the "background output flashes onto the
REM UI" symptom). A new window via `start` inherits the same console
REM group, so silencing it is the only reliable fix.
start "doge-bridge" /MIN cmd /c "bun run D:\doge-code\scripts\bridge.ts >nul 2>&1"

REM Poll /health for up to 25s. The bridge retries bind() for a few seconds
REM after EADDRINUSE-style TIME_WAIT, so a single failed attempt is normal.
for /L %%i in (1,1,25) do (
    timeout /t 1 /nobreak >nul 2>&1
    curl -s -f -m 2 -o nul "%BRIDGE_HEALTH%" >nul 2>&1
    if not errorlevel 1 goto :bridge_ready
)
echo [d.bat] WARNING: bridge server not ready, local bridge unavailable
:bridge_ready
REM === feature gates ===
REM bun:bundle feature() is compile-time constant folding; env / --define
REM cannot change it, only --feature / --feature= works (verified:
REM no flag = false, with flag = true). bun run accepts both forms.
bun run ^
    --feature=TERMINAL_PANEL --feature=PROACTIVE ^
    --feature=KAIROS --feature=KAIROS_BRIEF --feature=KAIROS_CHANNELS --feature=BRIDGE_MODE ^
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
    --dangerously-skip-permissions %2 %3
