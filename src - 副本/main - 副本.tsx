// 这些副作用必须在所有其他导入之前运行：
// 1. profileCheckpoint 在重载开始之前标记入口
// 2. startMdmRawRead 启动 MDM 子进程 (plutil/reg query) 以便它们与剩余约 135ms 的导入并行运行
// 3. startKeychainPrefetch 同时启动 macOS keychain 读取 (OAuth + 旧版 API key) — isRemoteManagedSettingsEligible() 否则通过 sync spawn 顺序读取它们
//    (~65ms 在每个 macOS 启动时)
import { profileCheckpoint, profileReport } from './utils/startupProfiler.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
profileCheckpoint('main_tsx_entry');
import { startMdmRawRead } from './utils/settings/mdm/rawRead.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
startMdmRawRead();
import { ensureKeychainPrefetchCompleted, startKeychainPrefetch } from './utils/secureStorage/keychainPrefetch.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
startKeychainPrefetch();
import { feature } from 'bun:bundle';
import { Command as CommanderCommand, InvalidArgumentError, Option } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import mapValues from 'lodash-es/mapValues.js';
import pickBy from 'lodash-es/pickBy.js';
import uniqBy from 'lodash-es/uniqBy.js';
import React from 'react';
import { getOauthConfig } from './constants/oauth.js';
import { getRemoteSessionUrl } from './constants/product.js';
import { getSystemContext, getUserContext } from './context.js';
import { init, initializeTelemetryAfterTrust } from './entrypoints/init.js';
import { addToHistory } from './history.js';
import type { Root } from './ink.js';
import { launchRepl } from './replLauncher.js';
import { hasGrowthBookEnvOverride, initializeGrowthBook, refreshGrowthBookAfterAuthChange } from './services/analytics/growthbook.js';
import { fetchBootstrapData } from './services/api/bootstrap.js';
import { type DownloadResult, downloadSessionFiles, type FilesApiConfig, parseFileSpecs } from './services/api/filesApi.js';
import { prefetchPassesEligibility } from './services/api/referral.js';
import { prefetchOfficialMcpUrls } from './services/mcp/officialRegistry.js';
import type { McpSdkServerConfig, McpServerConfig, ScopedMcpServerConfig } from './services/mcp/types.js';
import { isPolicyAllowed, loadPolicyLimits, refreshPolicyLimits, waitForPolicyLimitsToLoad } from './services/policyLimits/index.js';
import { loadRemoteManagedSettings, refreshRemoteManagedSettings } from './services/remoteManagedSettings/index.js';
import type { ToolInputJSONSchema } from './Tool.js';
import { createSyntheticOutputTool, isSyntheticOutputToolEnabled } from './tools/SyntheticOutputTool/SyntheticOutputTool.js';
import { getTools } from './tools.js';
import { canUserConfigureAdvisor, getInitialAdvisorSetting, isAdvisorEnabled, isValidAdvisorModel, modelSupportsAdvisor } from './utils/advisor.js';
import { isAgentSwarmsEnabled } from './utils/agentSwarmsEnabled.js';
import { count, uniq } from './utils/array.js';
import { installAsciicastRecorder } from './utils/asciicast.js';
import { getSubscriptionType, isClaudeAISubscriber, prefetchAwsCredentialsAndBedRockInfoIfSafe, prefetchGcpCredentialsIfSafe, validateForceLoginOrg } from './utils/auth.js';
import { checkHasTrustDialogAccepted, getGlobalConfig, getRemoteControlAtStartup, isAutoUpdaterDisabled, saveGlobalConfig } from './utils/config.js';
import { seedEarlyInput, stopCapturingEarlyInput } from './utils/earlyInput.js';
import { getInitialEffortSetting, parseEffortValue } from './utils/effort.js';
import { getInitialFastModeSetting, isFastModeEnabled, prefetchFastModeStatus, resolveFastModeStatusFromCache } from './utils/fastMode.js';
import { applyConfigEnvironmentVariables } from './utils/managedEnv.js';
import { createSystemMessage, createUserMessage } from './utils/messages.js';
import { getPlatform } from './utils/platform.js';
import { getBaseRenderOptions } from './utils/renderOptions.js';
import { getSessionIngressAuthToken } from './utils/sessionIngressAuth.js';
import { settingsChangeDetector } from './utils/settings/changeDetector.js';
import { skillChangeDetector } from './utils/skills/skillChangeDetector.js';
import { jsonParse, writeFileSync_DEPRECATED } from './utils/slowOperations.js';
import { computeInitialTeamContext } from './utils/swarm/reconnection.js';
import { initializeWarningHandler } from './utils/warningHandler.js';
import { isWorktreeModeEnabled } from './utils/worktreeModeEnabled.js';

// 惰性导入以避免循环依赖：teammate.ts -> AppState.tsx -> ... -> main.tsx
/* eslint-disable @typescript-eslint/no-require-imports */
const getTeammateUtils = () => require('./utils/teammate.js') as typeof import('./utils/teammate.js');
const getTeammatePromptAddendum = () => require('./utils/swarm/teammatePromptAddendum.js') as typeof import('./utils/swarm/teammatePromptAddendum.js');
const getTeammateModeSnapshot = () => require('./utils/swarm/backends/teammateModeSnapshot.js') as typeof import('./utils/swarm/backends/teammateModeSnapshot.js');
/* eslint-enable @typescript-eslint/no-require-imports */
// Dead code elimination: conditional import for COORDINATOR_MODE
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE') ? require('./coordinator/coordinatorMode.js') as typeof import('./coordinator/coordinatorMode.js') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
// Dead code elimination: conditional import for KAIROS (assistant mode)
/* eslint-disable @typescript-eslint/no-require-imports */
const assistantModule = feature('KAIROS') ? require('./assistant/index.js') as typeof import('./assistant/index.js') : null;
const kairosGate = feature('KAIROS') ? require('./assistant/gate.js') as typeof import('./assistant/gate.js') : null;
import { relative, resolve } from 'path';
import { isAnalyticsDisabled } from 'src/services/analytics/config.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from 'src/services/analytics/index.js';
import { initializeAnalyticsGates } from 'src/services/analytics/sink.js';
import { getOriginalCwd, setAdditionalDirectoriesForClaudeMd, setIsRemoteMode, setMainLoopModelOverride, setMainThreadAgentType, setTeleportedSessionInfo } from './bootstrap/state.js';
import { filterCommandsForRemoteMode, getCommands } from './commands.js';
import type { StatsStore } from './context/stats.js';
import { launchAssistantInstallWizard, launchAssistantSessionChooser, launchInvalidSettingsDialog, launchResumeChooser, launchSnapshotUpdateDialog, launchTeleportRepoMismatchDialog, launchTeleportResumeWrapper } from './dialogLaunchers.js';
import { SHOW_CURSOR } from './ink/termio/dec.js';
import { exitWithError, exitWithMessage, getRenderContext, renderAndRun, showSetupScreens } from './interactiveHelpers.js';
import { initBuiltinPlugins } from './plugins/bundled/index.js';
/* eslint-enable @typescript-eslint/no-require-imports */
import { checkQuotaStatus } from './services/claudeAiLimits.js';
import { getMcpToolsCommandsAndResources, prefetchAllMcpResources } from './services/mcp/client.js';
import { VALID_INSTALLABLE_SCOPES, VALID_UPDATE_SCOPES } from './services/plugins/pluginCliCommands.js';
import { initBundledSkills } from './skills/bundled/index.js';
import type { AgentColorName } from './tools/AgentTool/agentColorManager.js';
import { getActiveAgentsFromList, getAgentDefinitionsWithOverrides, isBuiltInAgent, isCustomAgent, parseAgentsFromJson } from './tools/AgentTool/loadAgentsDir.js';
import type { LogOption } from './types/logs.js';
import type { Message as MessageType } from './types/message.js';
import { assertMinVersion } from './utils/autoUpdater.js';
import { CLAUDE_IN_CHROME_SKILL_HINT, CLAUDE_IN_CHROME_SKILL_HINT_WITH_WEBBROWSER } from './utils/claudeInChrome/prompt.js';
import { setupClaudeInChrome, shouldAutoEnableClaudeInChrome, shouldEnableClaudeInChrome } from './utils/claudeInChrome/setup.js';
import { getContextWindowForModel } from './utils/context.js';
import { loadConversationForResume } from './utils/conversationRecovery.js';
import { buildDeepLinkBanner } from './utils/deepLink/banner.js';
import { hasNodeOption, isBareMode, isEnvTruthy, isInProtectedNamespace } from './utils/envUtils.js';
import { refreshExampleCommands } from './utils/exampleCommands.js';
import type { FpsMetrics } from './utils/fpsTracker.js';
import { getWorktreePaths } from './utils/getWorktreePaths.js';
import { findGitRoot, getBranch, getIsGit, getWorktreeCount } from './utils/git.js';
import { getGhAuthStatus } from './utils/github/ghAuthStatus.js';
import { safeParseJSON } from './utils/json.js';
import { logError } from './utils/log.js';
import { getModelDeprecationWarning } from './utils/model/deprecation.js';
import { getDefaultMainLoopModel, getUserSpecifiedModelSetting, normalizeModelStringForAPI, parseUserSpecifiedModel } from './utils/model/model.js';
import { ensureModelStringsInitialized } from './utils/model/modelStrings.js';
import { PERMISSION_MODES } from './utils/permissions/PermissionMode.js';
import { checkAndDisableBypassPermissions, getAutoModeEnabledStateIfCached, initializeToolPermissionContext, initialPermissionModeFromCLI, isDefaultPermissionModeAuto, parseToolListFromCLI, removeDangerousPermissions, stripDangerousPermissionsForAutoMode, verifyAutoModeGateAccess } from './utils/permissions/permissionSetup.js';
import { cleanupOrphanedPluginVersionsInBackground } from './utils/plugins/cacheUtils.js';
import { initializeVersionedPlugins } from './utils/plugins/installedPluginsManager.js';
import { getManagedPluginNames } from './utils/plugins/managedPlugins.js';
import { getGlobExclusionsForPluginCache } from './utils/plugins/orphanedPluginFilter.js';
import { getPluginSeedDirs } from './utils/plugins/pluginDirectories.js';
import { countFilesRoundedRg } from './utils/ripgrep.js';
import { processSessionStartHooks, processSetupHooks } from './utils/sessionStart.js';
import { cacheSessionTitle, getSessionIdFromLog, loadTranscriptFromFile, saveAgentSetting, saveMode, searchSessionsByCustomTitle, sessionIdExists } from './utils/sessionStorage.js';
import { ensureMdmSettingsLoaded } from './utils/settings/mdm/settings.js';
import { getInitialSettings, getManagedSettingsKeysForLogging, getSettingsForSource, getSettingsWithErrors } from './utils/settings/settings.js';
import { resetSettingsCache } from './utils/settings/settingsCache.js';
import type { ValidationError } from './utils/settings/validation.js';
import { DEFAULT_TASKS_MODE_TASK_LIST_ID, TASK_STATUSES } from './utils/tasks.js';
import { logPluginLoadErrors, logPluginsEnabledForSession } from './utils/telemetry/pluginTelemetry.js';
import { logSkillsLoaded } from './utils/telemetry/skillLoadedEvent.js';
import { generateTempFilePath } from './utils/tempfile.js';
import { validateUuid } from './utils/uuid.js';
// Plugin startup checks are now handled non-blockingly in REPL.tsx

import { registerMcpAddCommand } from 'src/commands/mcp/addCommand.js';
import { registerMcpXaaIdpCommand } from 'src/commands/mcp/xaaIdpCommand.js';
import { logPermissionContextForAnts } from 'src/services/internalLogging.js';
import { fetchClaudeAIMcpConfigsIfEligible } from 'src/services/mcp/claudeai.js';
import { clearServerCache } from 'src/services/mcp/client.js';
import { areMcpConfigsAllowedWithEnterpriseMcpConfig, dedupClaudeAiMcpServers, doesEnterpriseMcpConfigExist, filterMcpServersByPolicy, getClaudeCodeMcpConfigs, getMcpServerSignature, parseMcpConfig, parseMcpConfigFromFilePath } from 'src/services/mcp/config.js';
import { excludeCommandsByServer, excludeResourcesByServer } from 'src/services/mcp/utils.js';
import { isXaaEnabled } from 'src/services/mcp/xaaIdpLogin.js';
import { getRelevantTips } from 'src/services/tips/tipRegistry.js';
import { logContextMetrics } from 'src/utils/api.js';
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME, isClaudeInChromeMCPServer } from 'src/utils/claudeInChrome/common.js';
import { registerCleanup } from 'src/utils/cleanupRegistry.js';
import { eagerParseCliFlag } from 'src/utils/cliArgs.js';
import { createEmptyAttributionState } from 'src/utils/commitAttribution.js';
import { countConcurrentSessions, registerSession, updateSessionName } from 'src/utils/concurrentSessions.js';
import { getCwd } from 'src/utils/cwd.js';
import { logForDebugging, setHasFormattedOutput } from 'src/utils/debug.js';
import { errorMessage, getErrnoCode, isENOENT, TeleportOperationError, toError } from 'src/utils/errors.js';
import { getFsImplementation, safeResolvePath } from 'src/utils/fsOperations.js';
import { gracefulShutdown, gracefulShutdownSync } from 'src/utils/gracefulShutdown.js';
import { setAllHookEventsEnabled } from 'src/utils/hooks/hookEvents.js';
import { refreshModelCapabilities } from 'src/utils/model/modelCapabilities.js';
import { peekForStdinData, writeToStderr } from 'src/utils/process.js';
import { setCwd } from 'src/utils/Shell.js';
import { type ProcessedResume, processResumedConversation } from 'src/utils/sessionRestore.js';
import { parseSettingSourcesFlag } from 'src/utils/settings/constants.js';
import { plural } from 'src/utils/stringUtils.js';
import { type ChannelEntry, getInitialMainLoopModel, getIsNonInteractiveSession, getSdkBetas, getSessionId, getUserMsgOptIn, setAllowedChannels, setAllowedSettingSources, setChromeFlagOverride, setClientType, setCwdState, setDirectConnectServerUrl, setFlagSettingsPath, setInitialMainLoopModel, setInlinePlugins, setIsInteractive, setKairosActive, setOriginalCwd, setQuestionPreviewFormat, setSdkBetas, setSessionBypassPermissionsMode, setSessionPersistenceDisabled, setSessionSource, setUserMsgOptIn, switchSession } from './bootstrap/state.js';

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER') ? require('./utils/permissions/autoModeState.js') as typeof import('./utils/permissions/autoModeState.js') : null;

// TeleportRepoMismatchDialog, TeleportResumeWrapper 动态导入在调用点
import { migrateAutoUpdatesToSettings } from './migrations/migrateAutoUpdatesToSettings.js';
import { migrateBypassPermissionsAcceptedToSettings } from './migrations/migrateBypassPermissionsAcceptedToSettings.js';
import { migrateEnableAllProjectMcpServersToSettings } from './migrations/migrateEnableAllProjectMcpServersToSettings.js';
import { migrateFennecToOpus } from './migrations/migrateFennecToOpus.js';
import { migrateLegacyOpusToCurrent } from './migrations/migrateLegacyOpusToCurrent.js';
import { migrateOpusToOpus1m } from './migrations/migrateOpusToOpus1m.js';
import { migrateReplBridgeEnabledToRemoteControlAtStartup } from './migrations/migrateReplBridgeEnabledToRemoteControlAtStartup.js';
import { migrateSonnet1mToSonnet45 } from './migrations/migrateSonnet1mToSonnet45.js';
import { migrateSonnet45ToSonnet46 } from './migrations/migrateSonnet45ToSonnet46.js';
import { resetAutoModeOptInForDefaultOffer } from './migrations/resetAutoModeOptInForDefaultOffer.js';
import { resetProToOpusDefault } from './migrations/resetProToOpusDefault.js';
import { createRemoteSessionConfig } from './remote/RemoteSessionManager.js';
/* eslint-enable @typescript-eslint/no-require-imports */
// teleportWithProgress 动态导入在调用点
import { createDirectConnectSession, DirectConnectError } from './server/createDirectConnectSession.js';
import { initializeLspServerManager } from './services/lsp/manager.js';
import { shouldEnablePromptSuggestion } from './services/PromptSuggestion/promptSuggestion.js';
import { type AppState, getDefaultAppState, IDLE_SPECULATION_STATE } from './state/AppStateStore.js';
import { onChangeAppState } from './state/onChangeAppState.js';
import { createStore } from './state/store.js';
import { asSessionId } from './types/ids.js';
import { filterAllowedSdkBetas } from './utils/betas.js';
import { isInBundledMode, isRunningWithBun } from './utils/bundledMode.js';
import { logForDiagnosticsNoPII } from './utils/diagLogs.js';
import { filterExistingPaths, getKnownPathsForRepo } from './utils/githubRepoPathMapping.js';
import { clearPluginCache, loadAllPluginsCacheOnly } from './utils/plugins/pluginLoader.js';
import { migrateChangelogFromConfig } from './utils/releaseNotes.js';
import { SandboxManager } from './utils/sandbox/sandbox-adapter.js';
import { fetchSession, prepareApiRequest } from './utils/teleport/api.js';
import { checkOutTeleportedSessionBranch, processMessagesForTeleportResume, teleportToRemoteWithErrorHandling, validateGitState, validateSessionRepository } from './utils/teleport.js';
import { shouldEnableThinkingByDefault, type ThinkingConfig } from './utils/thinking.js';
import { initUser, resetUserCache } from './utils/user.js';
import { getTmuxInstallInstructions, isTmuxAvailable, parsePRReference } from './utils/worktree.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
profileCheckpoint('main_tsx_imports_loaded');

/**
 * 记录管理设置键到 Statsig 进行分析。
 * 这是在 init() 完成后调用，以确保设置已加载
 * 并且在模型解析之前应用环境变量。
 */
function logManagedSettings(): void {
  try {
    const policySettings = getSettingsForSource('policySettings');
    if (policySettings) {
      const allKeys = getManagedSettingsKeysForLogging(policySettings);
      logEvent('tengu_managed_settings_loaded', {
        keyCount: allKeys.length,
        keys: allKeys.join(',') as unknown as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      });
    }
  } catch {
    // 静默忽略错误 - 这只是用于分析
  }
}

// 检查是否在调试/检查模式中运行
function isBeingDebugged() {
  const isBun = isRunningWithBun();

  // 检查 process arguments 中是否有 inspect flags（包括所有变体）
  const hasInspectArg = process.execArgv.some(arg => {
    if (isBun) {
      // Note: Bun 有一个问题，单文件可执行程序中的应用参数
      // from process.argv 泄漏到 process.execArgv（类似于 https://github.com/oven-sh/bun/issues/11673）
      // This breaks use of --debug mode if we omit this branch
      // We're fine to skip that check, because Bun doesn't support Node.js legacy --debug or --debug-brk flags
      return /--inspect(-brk)?/.test(arg);
    } else {
      // In Node.js, check for both --inspect and legacy --debug flags
      return /--inspect(-brk)?|--debug(-brk)?/.test(arg);
    }
  });

  // Check if NODE_OPTIONS contains inspect flags
  const hasInspectEnv = process.env.NODE_OPTIONS && /--inspect(-brk)?|--debug(-brk)?/.test(process.env.NODE_OPTIONS);

  // Check if inspector is available and active (indicates debugging)
  try {
    // Dynamic import would be better but is async - use global object instead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inspector = (global as any).require('inspector');
    const hasInspectorUrl = !!inspector.url();
    return hasInspectorUrl || hasInspectArg || hasInspectEnv;
  } catch {
    // Ignore error and fall back to argument detection
    return hasInspectArg || hasInspectEnv;
  }
}

// Exit if we detect node debugging or inspection
if ("external" !== 'ant' && isBeingDebugged()) {
  // Use process.exit directly here since we're in the top-level code before imports
  // and gracefulShutdown is not yet available
  // eslint-disable-next-line custom-rules/no-top-level-side-effects
  process.exit(1);
}

/**
 * Per-session skill/plugin telemetry. Called from both the interactive path
 * and the headless -p path (before runHeadless) — both go through
 * main.tsx but branch before the interactive startup path, so it needs two
 * call sites here rather than one here + one in QueryEngine.
 */
function logSessionTelemetry(): void {
  const model = parseUserSpecifiedModel(getInitialMainLoopModel() ?? getDefaultMainLoopModel());
  void logSkillsLoaded(getCwd(), getContextWindowForModel(model, getSdkBetas()));
  void loadAllPluginsCacheOnly().then(({
    enabled,
    errors
  }) => {
    const managedNames = getManagedPluginNames();
    logPluginsEnabledForSession(enabled, managedNames, getPluginSeedDirs());
    logPluginLoadErrors(errors, managedNames);
  }).catch(err => logError(err));
}
function getCertEnvVarTelemetry(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (process.env.NODE_EXTRA_CA_CERTS) {
    result.has_node_extra_ca_certs = true;
  }
  if (process.env.CLAUDE_CODE_CLIENT_CERT) {
    result.has_client_cert = true;
  }
  if (hasNodeOption('--use-system-ca')) {
    result.has_use_system_ca = true;
  }
  if (hasNodeOption('--use-openssl-ca')) {
    result.has_openssl_ca = true;
  }
  return result;
}
async function logStartupTelemetry(): Promise<void> {
  if (isAnalyticsDisabled()) return;
  const [isGit, worktreeCount, ghAuthStatus] = await Promise.all([getIsGit(), getWorktreeCount(), getGhAuthStatus()]);
  logEvent('tengu_startup_telemetry', {
    is_git: isGit,
    worktree_count: worktreeCount,
    gh_auth_status: ghAuthStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    sandbox_enabled: SandboxManager.isSandboxingEnabled(),
    are_unsandboxed_commands_allowed: SandboxManager.areUnsandboxedCommandsAllowed(),
    is_auto_bash_allowed_if_sandbox_enabled: SandboxManager.isAutoAllowBashIfSandboxedEnabled(),
    auto_updater_disabled: isAutoUpdaterDisabled(),
    prefers_reduced_motion: getInitialSettings().prefersReducedMotion ?? false,
    ...getCertEnvVarTelemetry()
  });
}

// @[MODEL LAUNCH]: Consider any migrations you may need for model strings. See migrateSonnet1mToSonnet45.ts for an example.
// Bump this when adding a new sync migration so existing users re-run the set.
const CURRENT_MIGRATION_VERSION = 11;
function runMigrations(): void {
  if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) {
    migrateAutoUpdatesToSettings();
    migrateBypassPermissionsAcceptedToSettings();
    migrateEnableAllProjectMcpServersToSettings();
    resetProToOpusDefault();
    migrateSonnet1mToSonnet45();
    migrateLegacyOpusToCurrent();
    migrateSonnet45ToSonnet46();
    migrateOpusToOpus1m();
    migrateReplBridgeEnabledToRemoteControlAtStartup();
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      resetAutoModeOptInForDefaultOffer();
    }
    if ("external" === 'ant') {
      migrateFennecToOpus();
    }
    saveGlobalConfig(prev => prev.migrationVersion === CURRENT_MIGRATION_VERSION ? prev : {
      ...prev,
      migrationVersion: CURRENT_MIGRATION_VERSION
    });
  }
  // Async migration - fire and forget since it's non-blocking
  migrateChangelogFromConfig().catch(() => {
    // Silently ignore migration errors - will retry on next startup
  });
}

/**
 * Prefetch system context (including git status) only when it's safe to do so.
 * Git commands can execute arbitrary code via hooks and config (e.g., core.fsmonitor,
 * diff.external), so we must only run them after trust is established or in
 * non-interactive mode where trust is implicit.
 */
function prefetchSystemContextIfSafe(): void {
  const isNonInteractiveSession = getIsNonInteractiveSession();

  // In non-interactive mode (--print), trust dialog is skipped and
  // execution is considered trusted (as documented in help text)
  if (isNonInteractiveSession) {
    logForDiagnosticsNoPII('info', 'prefetch_system_context_non_interactive');
    void getSystemContext();
    return;
  }

  // In interactive mode, only prefetch if trust has already been established
  const hasTrust = checkHasTrustDialogAccepted();
  if (hasTrust) {
    logForDiagnosticsNoPII('info', 'prefetch_system_context_has_trust');
    void getSystemContext();
  } else {
    logForDiagnosticsNoPII('info', 'prefetch_system_context_skipped_no_trust');
  }
  // Otherwise, don't prefetch - wait for trust to be established first
}

/**
 * Start background prefetches and housekeeping that are NOT needed before first render.
 * These are deferred from setup() to reduce event loop contention and child process
 * spawning during the critical startup path.
 * Call this after the REPL has been rendered.
 */
export function startDeferredPrefetches(): void {
  // This function runs after first render, so it doesn't block the initial paint.
  // However, the spawned processes and async work still contend for CPU and event
  // loop time, which skews startup benchmarks (CPU profiles, time-to-first-render
  // measurements). Skip all of it when we're only measuring startup performance.
  if (isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER) ||
  // --bare: skip ALL pre...
