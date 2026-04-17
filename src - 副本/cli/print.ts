// biome-ignore-all assist/source/organizeImports: 仅 ANT 的导入标记不得重新排序
import { feature } from 'bun:bundle'
import { readFile, stat } from 'fs/promises'
import { dirname } from 'path'
import {
  downloadUserSettings,
  redownloadUserSettings,
} from 'src/services/settingsSync/index.js'
import { waitForRemoteManagedSettingsToLoad } from 'src/services/remoteManagedSettings/index.js'
import { StructuredIO } from 'src/cli/structuredIO.js'
import { RemoteIO } from 'src/cli/remoteIO.js'
import {
  type Command,
  formatDescriptionWithSource,
  getCommandName,
} from 'src/commands.js'
import { createStreamlinedTransformer } from 'src/utils/streamlinedTransform.js'
import { installStreamJsonStdoutGuard } from 'src/utils/streamJsonStdoutGuard.js'
import type { ToolPermissionContext } from 'src/Tool.js'
import type { ThinkingConfig } from 'src/utils/thinking.js'
import { assembleToolPool, filterToolsByDenyRules } from 'src/tools.js'
import uniqBy from 'lodash-es/uniqBy.js'
import { uniq } from 'src/utils/array.js'
import { mergeAndFilterTools } from 'src/utils/toolPool.js'
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { logForDebugging } from 'src/utils/debug.js'
import {
  logForDiagnosticsNoPII,
  withDiagnosticsTiming,
} from 'src/utils/diagLogs.js'
import { toolMatchesName, type Tool, type Tools } from 'src/Tool.js'
import {
  type AgentDefinition,
  isBuiltInAgent,
  parseAgentsFromJson,
} from 'src/tools/AgentTool/loadAgentsDir.js'
import type { Message, NormalizedUserMessage } from 'src/types/message.js'
import type { QueuedCommand } from 'src/types/textInputTypes.js'
import {
  dequeue,
  dequeueAllMatching,
  enqueue,
  hasCommandsInQueue,
  peek,
  subscribeToCommandQueue,
  getCommandsByMaxPriority,
} from 'src/utils/messageQueueManager.js'
import { notifyCommandLifecycle } from 'src/utils/commandLifecycle.js'
import {
  getSessionState,
  notifySessionStateChanged,
  notifySessionMetadataChanged,
  setPermissionModeChangedListener,
  type RequiresActionDetails,
  type SessionExternalMetadata,
} from 'src/utils/sessionState.js'
import { externalMetadataToAppState } from 'src/state/onChangeAppState.js'
import { getInMemoryErrors, logError, logMCPDebug } from 'src/utils/log.js'
import {
  writeToStdout,
  registerProcessOutputErrorHandlers,
} from 'src/utils/process.js'
import type { Stream } from 'src/utils/stream.js'
import { EMPTY_USAGE } from 'src/services/api/logging.js'
import {
  loadConversationForResume,
  type TurnInterruptionState,
} from 'src/utils/conversationRecovery.js'
import type {
  MCPServerConnection,
  McpSdkServerConfig,
  ScopedMcpServerConfig,
} from 'src/services/mcp/types.js'
import {
  ChannelMessageNotificationSchema,
  gateChannelServer,
  wrapChannelMessage,
  findChannelEntry,
} from 'src/services/mcp/channelNotification.js'
import {
  isChannelAllowlisted,
  isChannelsEnabled,
} from 'src/services/mcp/channelAllowlist.js'
import { parsePluginIdentifier } from 'src/utils/plugins/pluginIdentifier.js'
import { validateUuid } from 'src/utils/uuid.js'
import { fromArray } from 'src/utils/generators.js'
import { ask } from 'src/QueryEngine.js'
import type { PermissionPromptTool } from 'src/utils/queryHelpers.js'
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
} from 'src/utils/fileStateCache.js'
import { expandPath } from 'src/utils/path.js'
import { extractReadFilesFromMessages } from 'src/utils/queryHelpers.js'
import { registerHookEventHandler } from 'src/utils/hooks/hookEvents.js'
import { executeFilePersistence } from 'src/utils/filePersistence/filePersistence.js'
import { finalizePendingAsyncHooks } from 'src/utils/hooks/AsyncHookRegistry.js'
import {
  gracefulShutdown,
  gracefulShutdownSync,
  isShuttingDown,
} from 'src/utils/gracefulShutdown.js'
import { registerCleanup } from 'src/utils/cleanupRegistry.js'
import { createIdleTimeoutManager } from 'src/utils/idleTimeout.js'
import type {
  SDKStatus,
  ModelInfo,
  SDKMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
  PermissionResult,
  McpServerConfigForProcessTransport,
  McpServerStatus,
  RewindFilesResult,
} from 'src/entrypoints/agentSdkTypes.js'
import type {
  StdoutMessage,
  SDKControlInitializeRequest,
  SDKControlInitializeResponse,
  SDKControlRequest,
  SDKControlResponse,
  SDKControlMcpSetServersResponse,
  SDKControlReloadPluginsResponse,
} from 'src/entrypoints/sdk/controlTypes.js'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionMode as InternalPermissionMode } from 'src/types/permissions.js'
import { cwd } from 'process'
import { getCwd } from 'src/utils/cwd.js'
import omit from 'lodash-es/omit.js'
import reject from 'lodash-es/reject.js'
import { isPolicyAllowed } from 'src/services/policyLimits/index.js'
import type { ReplBridgeHandle } from 'src/bridge/replBridge.js'
import { getRemoteSessionUrl } from 'src/constants/product.js'
import { buildBridgeConnectUrl } from 'src/bridge/bridgeStatusUtil.js'
import { extractInboundMessageFields } from 'src/bridge/inboundMessages.js'
import { resolveAndPrepend } from 'src/bridge/inboundAttachments.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { safeParseJSON } from 'src/utils/json.js'
import {
  outputSchema as permissionToolOutputSchema,
  permissionPromptToolResultToPermissionDecision,
} from 'src/utils/permissions/PermissionPromptToolResultSchema.js'
import { createAbortController } from 'src/utils/abortController.js'
import { createCombinedAbortSignal } from 'src/utils/combinedAbortSignal.js'
import { generateSessionTitle } from 'src/utils/sessionTitle.js'
import { buildSideQuestionFallbackParams } from 'src/utils/queryContext.js'
import { runSideQuestion } from 'src/utils/sideQuestion.js'
import {
  processSessionStartHooks,
  processSetupHooks,
  takeInitialUserMessage,
} from 'src/utils/sessionStart.js'
import {
  DEFAULT_OUTPUT_STYLE_NAME,
  getAllOutputStyles,
} from 'src/constants/outputStyles.js'
import { TEAMMATE_MESSAGE_TAG, TICK_TAG } from 'src/constants/xml.js'
import {
  getSettings_DEPRECATED,
  getSettingsWithSources,
} from 'src/utils/settings/settings.js'
import { settingsChangeDetector } from 'src/utils/settings/changeDetector.js'
import { applySettingsChange } from 'src/utils/settings/applySettingsChange.js'
import {
  isFastModeAvailable,
  isFastModeEnabled,
  isFastModeSupportedByModel,
  getFastModeState,
} from 'src/utils/fastMode.js'
import {
  isAutoModeGateEnabled,
  getAutoModeUnavailableNotification,
  getAutoModeUnavailableReason,
  isBypassPermissionsModeDisabled,
  transitionPermissionMode,
} from 'src/utils/permissions/permissionSetup.js'
import {
  tryGenerateSuggestion,
  logSuggestionOutcome,
  logSuggestionSuppressed,
  type PromptVariant,
} from 'src/services/PromptSuggestion/promptSuggestion.js'
import { getLastCacheSafeParams } from 'src/utils/forkedAgent.js'
import { getAccountInformation } from 'src/utils/auth.js'
import { OAuthService } from 'src/services/oauth/index.js'
import { installOAuthTokens } from 'src/cli/handlers/auth.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import type { HookCallbackMatcher } from 'src/types/hooks.js'
import { AwsAuthStatusManager } from 'src/utils/awsAuthStatusManager.js'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import {
  registerHookCallbacks,
  setInitJsonSchema,
  getInitJsonSchema,
  setSdkAgentProgressSummariesEnabled,
} from 'src/bootstrap/state.js'
import { createSyntheticOutputTool } from 'src/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { parseSessionIdentifier } from 'src/utils/sessionUrl.js'
import {
  hydrateRemoteSession,
  hydrateFromCCRv2InternalEvents,
  resetSessionFilePointer,
  doesMessageExistInSession,
  findUnresolvedToolUse,
  recordAttributionSnapshot,
  saveAgentSetting,
  saveMode,
  saveAiGeneratedTitle,
  restoreSessionMetadata,
} from 'src/utils/sessionStorage.js'
import { incrementPromptCount } from 'src/utils/commitAttribution.js'
import {
  setupSdkMcpClients,
  connectToServer,
  clearServerCache,
  fetchToolsForClient,
  areMcpConfigsEqual,
  reconnectMcpServerImpl,
} from 'src/services/mcp/client.js'
import {
  filterMcpServersByPolicy,
  getMcpConfigByName,
  isMcpServerDisabled,
  setMcpServerEnabled,
} from 'src/services/mcp/config.js'
import {
  performMCPOAuthFlow,
  revokeServerTokens,
} from 'src/services/mcp/auth.js'
import {
  runElicitationHooks,
  runElicitationResultHooks,
} from 'src/services/mcp/elicitationHandler.js'
import { executeNotificationHooks } from 'src/utils/hooks.js'
import {
  ElicitRequestSchema,
  ElicitationCompleteNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { getMcpPrefix } from 'src/services/mcp/mcpStringUtils.js'
import {
  commandBelongsToServer,
  filterToolsByServer,
} from 'src/services/mcp/utils.js'
import { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'
import { getAllMcpConfigs } from 'src/services/mcp/config.js'
import {
  isQualifiedForGrove,
  checkGroveForNonInteractive,
} from 'src/services/api/grove.js'
import {
  toInternalMessages,
  toSDKRateLimitInfo,
} from 'src/utils/messages/mappers.js'
import { createModelSwitchBreadcrumbs } from 'src/utils/messages.js'
import { collectContextData } from 'src/commands/context/context-noninteractive.js'
import { LOCAL_COMMAND_STDOUT_TAG } from 'src/constants/xml.js'
import {
  statusListeners,
  type ClaudeAILimits,
} from 'src/services/claudeAiLimits.js'
import {
  getDefaultMainLoopModel,
  getMainLoopModel,
  modelDisplayString,
  parseUserSpecifiedModel,
} from 'src/utils/model/model.js'
import { getModelOptions } from 'src/utils/model/modelOptions.js'
import {
  modelSupportsEffort,
  modelSupportsMaxEffort,
  EFFORT_LEVELS,
  resolveAppliedEffort,
} from 'src/utils/effort.js'
import { modelSupportsAdaptiveThinking } from 'src/utils/thinking.js'
import { modelSupportsAutoMode } from 'src/utils/betas.js'
import { ensureModelStringsInitialized } from 'src/utils/model/modelStrings.js'
import {
  getSessionId,
  setMainLoopModelOverride,
  setMainThreadAgentType,
  switchSession,
  isSessionPersistenceDisabled,
  getIsRemoteMode,
  getFlagSettingsInline,
  setFlagSettingsInline,
  getMainThreadAgentType,
  getAllowedChannels,
  setAllowedChannels,
  type ChannelEntry,
} from 'src/bootstrap/state.js'
import { runWithWorkload, WORKLOAD_CRON } from 'src/utils/workloadContext.js'
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { AppState } from 'src/state/AppStateStore.js'
import {
  fileHistoryRewind,
  fileHistoryCanRestore,
  fileHistoryEnabled,
  fileHistoryGetDiffStats,
} from 'src/utils/fileHistory.js'
import {
  restoreAgentFromSession,
  restoreSessionStateFromLog,
} from 'src/utils/sessionRestore.js'
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js'
import {
  headlessProfilerStartTurn,
  headlessProfilerCheckpoint,
  logHeadlessProfilerTurn,
} from 'src/utils/headlessProfiler.js'
import {
  startQueryProfile,
  logQueryProfileReport,
} from 'src/utils/queryProfiler.js'

	



import { asSessionId } from 'src/types/ids.js'
import { jsonStringify } from '../utils/slowOperations.js'
import { skillChangeDetector } from '../utils/skills/skillChangeDetector.js'
import { getCommands, clearCommandsCache } from '../commands.js'
import {
  isBareMode,
  isEnvTruthy,
  isEnvDefinedFalsy,
} from '../utils/envUtils.js'
import { installPluginsForHeadless } from '../utils/plugins/headlessPluginInstall.js'
import { refreshActivePlugins } from '../utils/plugins/refresh.js'
import { loadAllPluginsCacheOnly } from '../utils/plugins/pluginLoader.js'
import {
  isTeamLead,
  hasActiveInProcessTeammates,
  hasWorkingInProcessTeammates,
  waitForTeammatesToBecomeIdle,
} from '../utils/teammate.js'
import {
  readUnreadMessages,
  markMessagesAsRead,
  isShutdownApproved,
} from '../utils/teammateMailbox.js'
import { removeTeammateFromTeamFile } from '../utils/swarm/teamHelpers.js'
import { unassignTeammateTasks } from '../utils/tasks.js'
import { getRunningTasks } from '../utils/task/framework.js'
import { isBackgroundTask } from '../tasks/types.js'
import { stopTask } from '../tasks/stopTask.js'
import { drainSdkEvents } from '../utils/sdkEventQueue.js'
import { initializeGrowthBook } from '../services/analytics/growthbook.js'
import { errorMessage, toError } from '../utils/errors.js'
import { sleep } from '../utils/sleep.js'
import { isExtractModeActive } from '../memdir/paths.js'

// 死代码消除：条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js'))
  : null
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('../proactive/index.js') as typeof import('../proactive/index.js'))
    : null
const cronSchedulerModule = feature('AGENT_TRIGGERS')
  ? (require('../utils/cronScheduler.js') as typeof import('../utils/cronScheduler.js'))
  : null
const cronJitterConfigModule = feature('AGENT_TRIGGERS')
  ? (require('../utils/cronJitterConfig.js') as typeof import('../utils/cronJitterConfig.js'))
  : null
const cronGate = feature('AGENT_TRIGGERS')
  ? (require('../tools/ScheduleCronTool/prompt.js') as typeof import('../tools/ScheduleCronTool/prompt.js'))
  : null
const extractMemoriesModule = feature('EXTRACT_MEMORIES')
  ? (require('../services/extractMemories/extractMemories.js') as typeof import('../services/extractMemories/extractMemories.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

const SHUTDOWN_TEAM_PROMPT = `<system-reminder>
你正在以非交互模式运行，在你的团队关闭之前无法向用户返回响应。

你必须在准备最终响应之前关闭你的团队：
1. 使用 requestShutdown 要求每个团队成员优雅地关闭
2. 等待关闭批准
3. 使用清理操作清理团队
4. 只有这样才向用户提供最终响应

在团队完全关闭之前，用户无法收到你的响应。
</system-reminder>

关闭你的团队并为用户准备最终响应。`

// 跟踪当前会话运行期间收到的消息 UUID
const MAX_RECEIVED_UUIDS = 10_000
const receivedMessageUuids = new Set<UUID>()
const receivedMessageUuidsOrder: UUID[] = []

function trackReceivedMessageUuid(uuid: UUID): boolean {
  if (receivedMessageUuids.has(uuid)) {
    return false // 重复
  }
  receivedMessageUuids.add(uuid)
  receivedMessageUuidsOrder.push(uuid)
  // 容量满时驱逐最旧的条目
  if (receivedMessageUuidsOrder.length > MAX_RECEIVED_UUIDS) {
    const toEvict = receivedMessageUuidsOrder.splice(
      0,
      receivedMessageUuidsOrder.length - MAX_RECEIVED_UUIDS,
    )
    for (const old of toEvict) {
      receivedMessageUuids.delete(old)
    }
  }
  return true // 新的 UUID
}

type PromptValue = string | ContentBlockParam[]

function toBlocks(v: PromptValue): ContentBlockParam[] {
  return typeof v === 'string' ? [{ type: 'text', text: v }] : v
}

/**
 * 将多个排队命令中的提示值合并为一个。
 * 字符串用换行符连接；如果任一值是块数组，则所有值都被标准化为块并进行拼接。
 */
export function joinPromptValues(values: PromptValue[]): PromptValue {
  if (values.length === 1) return values[0]!
  if (values.every(v => typeof v === 'string')) {
    return values.join('\n')
  }
  return values.flatMap(toBlocks)
}

/**
 * 判断 `next` 是否可以与 `head` 合并到同一个 ask() 调用中。
 * 仅当命令模式为 'prompt'、工作负载标签匹配（以便正确归属合并后的轮次）、
 * 且 isMeta 标志匹配时（防止主动轮询与用户提示合并，从而在合并命令传播时丢失隐藏标记）。
 */
export function canBatchWith(
  head: QueuedCommand,
  next: QueuedCommand | undefined,
): boolean {
  return (
    next !== undefined &&
    next.mode === 'prompt' &&
    next.workload === head.workload &&
    next.isMeta === head.isMeta
  )
}

export async function runHeadless(
  inputPrompt: string | AsyncIterable<string>,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
  commands: Command[],
  tools: Tools,
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  agents: AgentDefinition[],
  options: {
    continue: boolean | undefined
    resume: string | boolean | undefined
    resumeSessionAt: string | undefined
    verbose: boolean | undefined
    outputFormat: string | undefined
    jsonSchema: Record<string, unknown> | undefined
    permissionPromptToolName: string | undefined
    allowedTools: string[] | undefined
    thinkingConfig: ThinkingConfig | undefined
    maxTurns: number | undefined
    maxBudgetUsd: number | undefined
    taskBudget: { total: number } | undefined
    systemPrompt: string | undefined
    appendSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined
    fallbackModel: string | undefined
    teleport: string | true | null | undefined
    sdkUrl: string | undefined
    replayUserMessages: boolean | undefined
    includePartialMessages: boolean | undefined
    forkSession: boolean | undefined
    rewindFiles: string | undefined
    enableAuthStatus: boolean | undefined
    agent: string | undefined
    workload: string | undefined
    setupTrigger?: 'init' | 'maintenance' | undefined
    sessionStartHooksPromise?: ReturnType<typeof processSessionStartHooks>
    setSDKStatus?: (status: SDKStatus) => void
  },
): Promise<void> {
  if (
    process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER)
  ) {
    process.stderr.write(
      `\n启动时间: ${Math.round(process.uptime() * 1000)}ms\n`,
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  }

  // 立即触发用户设置下载，使其与下面的 MCP/工具设置重叠。
  // 受管设置已在 main.tsx 的 preAction 中开始；这为用户设置提供了类似的提前启动。
  // 缓存的 promise 在 installPluginsAndApplyMcpInBackground 读取 enabledPlugins 之前被加入。
  if (
    feature('DOWNLOAD_USER_SETTINGS') &&
    (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) || getIsRemoteMode())
  ) {
    void downloadUserSettings()
  }

  // 在无头模式下没有 React 树，因此 useSettingsChange 钩子永远不会运行。
  // 直接订阅，以便设置更改（包括受管设置/策略更新）能够完全应用。
  settingsChangeDetector.subscribe(source => {
    applySettingsChange(source, setAppState)

    // 在无头模式下，还需同步设置中的非规范化 fastMode 字段。
    // TUI 通过 UI 管理 fastMode，因此它会跳过此操作。
    if (isFastModeEnabled()) {
      setAppState(prev => {
        const s = prev.settings as Record<string, unknown>
        const fastMode = s.fastMode === true && !s.fastModePerSessionOptIn
        return { ...prev, fastMode }
      })
    }
  })

  // 主动激活现已在 main.tsx 中的 getTools() 之前处理，
  // 以便 SleepTool 通过 isEnabled() 过滤。此回退覆盖了
  // CLAUDE_CODE_PROACTIVE 已设置但 main.tsx 的检查未触发的情况
  //（例如，环境变量在 argv 解析后由 SDK 传输注入）。
  if (
    (feature('PROACTIVE') || feature('KAIROS')) &&
    proactiveModule &&
    !proactiveModule.isProactiveActive() &&
    isEnvTruthy(process.env.CLAUDE_CODE_PROACTIVE)
  ) {
    proactiveModule.activateProactive('command')
  }

  // 定期强制进行完整 GC 以控制内存使用
  if (typeof Bun !== 'undefined') {
    const gcTimer = setInterval(Bun.gc, 1000)
    gcTimer.unref()
  }

  // 为第一个轮次启动无头分析器
  headlessProfilerStartTurn()
  headlessProfilerCheckpoint('runHeadless_entry')

  // 检查非交互式消费者订阅者的 Grove 要求
  if (await isQualifiedForGrove()) {
    await checkGroveForNonInteractive()
  }
  headlessProfilerCheckpoint('after_grove_check')

  // 初始化 GrowthBook，以便功能标志在无头模式下生效。
  // 没有此步骤，磁盘缓存为空，所有标志都会回退到默认值。
  void initializeGrowthBook()

  if (options.resumeSessionAt && !options.resume) {
    process.stderr.write(`错误：--resume-session-at 需要配合 --resume 使用\n`)
    gracefulShutdownSync(1)
    return
  }

  if (options.rewindFiles && !options.resume) {
    process.stderr.write(`错误：--rewind-files 需要配合 --resume 使用\n`)
    gracefulShutdownSync(1)
    return
  }

  if (options.rewindFiles && inputPrompt) {
    process.stderr.write(
      `错误：--rewind-files 是独立操作，不能与 prompt 一起使用\n`,
    )
    gracefulShutdownSync(1)
    return
  }

  const structuredIO = getStructuredIO(inputPrompt, options)

  // 当为 SDK 客户端输出 NDJSON 时，任何对 stdout 的意外写入（调试打印、依赖的 console.log、库横幅）
  // 都会破坏客户端的逐行 JSON 解析器。安装一个守卫，将非 JSON 行重定向到 stderr，以保持流清洁。
  // 必须在第一次 structuredIO.write 之前运行。
  if (options.outputFormat === 'stream-json') {
    installStreamJsonStdoutGuard()
  }

  // #34044：如果用户显式设置 sandbox.enabled=true 但缺少依赖项，
  // isSandboxingEnabled() 会静默返回 false。在此处显示原因，以便用户知道其安全配置未被强制执行。
  const sandboxUnavailableReason = SandboxManager.getSandboxUnavailableReason()
  if (sandboxUnavailableReason) {
    if (SandboxManager.isSandboxRequired()) {
      process.stderr.write(
        `\n错误：需要沙盒但不可用：${sandboxUnavailableReason}\n` +
          `  sandbox.failIfUnavailable 已设置——在没有正常工作的沙盒的情况下拒绝启动。\n\n`,
      )
      gracefulShutdownSync(1)
      return
    }
    process.stderr.write(
      `\n⚠ 沙盒已禁用：${sandboxUnavailableReason}\n` +
        `  命令将在没有沙盒的情况下运行。网络和文件系统限制将不会强制执行。\n\n`,
    )
  } else if (SandboxManager.isSandboxingEnabled()) {
    // 使用一个回调初始化沙盒，该回调通过 can_use_tool control_request 协议将网络权限请求转发给 SDK 主机。
    // 这必须在创建 structuredIO 之后进行，以便我们可以发送请求。
    try {
      await SandboxManager.initialize(structuredIO.createSandboxAskCallback())
    } catch (err) {
      process.stderr.write(`\n❌ 沙盒错误：${errorMessage(err)}\n`)
      gracefulShutdownSync(1, 'other')
      return
    }
  }

  if (options.outputFormat === 'stream-json' && options.verbose) {
    registerHookEventHandler(event => {
      const message: StdoutMessage = (() => {
        switch (event.type) {
          case 'started':
            return {
              type: 'system' as const,
              subtype: 'hook_started' as const,
              hook_id: event.hookId,
              hook_name: event.hookName,
              hook_event: event.hookEvent,
              uuid: randomUUID(),
              session_id: getSessionId(),
            }
          case 'progress':
            return {
              type: 'system' as const,
              subtype: 'hook_progress' as const,
              hook_id: event.hookId,
              hook_name: event.hookName,
              hook_event: event.hookEvent,
              stdout: event.stdout,
              stderr: event.stderr,
              output: event.output,
              uuid: randomUUID(),
              session_id: getSessionId(),
            }
          case 'response':
            return {
              type: 'system' as const,
              subtype: 'hook_response' as const,
              hook_id: event.hookId,
              hook_name: event.hookName,
              hook_event: event.hookEvent,
              output: event.output,
              stdout: event.stdout,
              stderr: event.stderr,
              exit_code: event.exitCode,
              outcome: event.outcome,
              uuid: randomUUID(),
              session_id: getSessionId(),
            }
        }
      })()
      void structuredIO.write(message)
    })
  }

  if (options.setupTrigger) {
    await processSetupHooks(options.setupTrigger)
  }

  headlessProfilerCheckpoint('before_loadInitialMessages')
  const appState = getAppState()
  const {
    messages: initialMessages,
    turnInterruptionState,
    agentSetting: resumedAgentSetting,
  } = await loadInitialMessages(setAppState, {
    continue: options.continue,
    teleport: options.teleport,
    resume: options.resume,
    resumeSessionAt: options.resumeSessionAt,
    forkSession: options.forkSession,
    outputFormat: options.outputFormat,
    sessionStartHooksPromise: options.sessionStartHooksPromise,
    restoredWorkerState: structuredIO.restoredWorkerState,
  })

  // SessionStart 钩子可以发出 initialUserMessage —— 对于 stdin 为空且 additionalContext 单独存在（仅附件，不算轮次）的无头编排器会话，
  // 这是第一个用户轮次。钩子 promise 在 loadInitialMessages 内部被等待，因此当我们到达这里时，模块级别的挂起值已被设置。
  const hookInitialUserMessage = takeInitialUserMessage()
  if (hookInitialUserMessage) {
    structuredIO.prependUserMessage(hookInitialUserMessage)
  }

  // 从恢复的会话中恢复代理设置（如果未被当前的 --agent 标志或基于设置的代理覆盖，后者已在 main.tsx 中设置了 mainThreadAgentType）
  if (!options.agent && !getMainThreadAgentType() && resumedAgentSetting) {
    const { agentDefinition: restoredAgent } = restoreAgentFromSession(
      resumedAgentSetting,
      undefined,
      { activeAgents: agents, allAgents: agents },
    )
    if (restoredAgent) {
      setAppState(prev => ({ ...prev, agent: restoredAgent.agentType }))
      // 为非内置代理应用代理的系统提示（镜像 main.tsx 的初始 --agent 路径）
      if (!options.systemPrompt && !isBuiltInAgent(restoredAgent)) {
        const agentSystemPrompt = restoredAgent.getSystemPrompt()
        if (agentSystemPrompt) {
          options.systemPrompt = agentSystemPrompt
        }
      }
      // 重新持久化代理设置，以便将来的恢复操作能维持该代理
      saveAgentSetting(restoredAgent.agentType)
    }
  }

  // gracefulShutdownSync 安排异步关闭并设置 process.exitCode。
  // 如果 loadInitialMessages 的错误路径触发了它，请提前退出以避免在进程结束时进行不必要的工作。
  if (initialMessages.length === 0 && process.exitCode !== undefined) {
    return
  }

  // 处理 --rewind-files：恢复文件系统并立即退出
  if (options.rewindFiles) {
    // 文件历史快照仅为用户消息创建，因此我们要求目标必须是用户消息
    const targetMessage = initialMessages.find(
      m => m.uuid === options.rewindFiles,
    )

    if (!targetMessage || targetMessage.type !== 'user') {
      process.stderr.write(
        `错误：--rewind-files 需要用户消息 UUID，但 ${options.rewindFiles} 不是此会话中的用户消息\n`,
      )
      gracefulShutdownSync(1)
      return
    }

    const currentAppState = getAppState()
    const result = await handleRewindFiles(
      options.rewindFiles as UUID,
      currentAppState,
      setAppState,
      false,
    )
    if (!result.canRewind) {
      process.stderr.write(`错误：${result.error || '未知错误'}\n`)
      gracefulShutdownSync(1)
      return
    }

    // 回滚完成 - 成功退出
    process.stdout.write(
      `文件已回滚到消息 ${options.rewindFiles} 时的状态\n`,
    )
    gracefulShutdownSync(0)
    return
  }

  // 检查是否需要输入提示 - 如果我们使用有效的会话 ID/JSONL 文件恢复或使用 SDK URL，则跳过
  const hasValidResumeSessionId =
    typeof options.resume === 'string' &&
    (Boolean(validateUuid(options.resume)) || options.resume.endsWith('.jsonl'))
  const isUsingSdkUrl = Boolean(options.sdkUrl)

  if (!inputPrompt && !hasValidResumeSessionId && !isUsingSdkUrl) {
    process.stderr.write(
      `错误：使用 --print 时，必须通过 stdin 或 prompt 参数提供输入\n`,
    )
    gracefulShutdownSync(1)
    return
  }

  if (options.outputFormat === 'stream-json' && !options.verbose) {
    process.stderr.write(
      '错误：使用 --print 时，--output-format=stream-json 需要配合 --verbose 使用\n',
    )
    gracefulShutdownSync(1)
    return
  }

  // 过滤掉拒绝列表中的 MCP 工具
  const allowedMcpTools = filterToolsByDenyRules(
    appState.mcp.tools,
    appState.toolPermissionContext,
  )
  let filteredTools = [...tools, ...allowedMcpTools]

  // 使用 SDK URL 时，始终使用 stdio 权限提示以委托给 SDK
  const effectivePermissionPromptToolName = options.sdkUrl
    ? 'stdio'
    : options.permissionPromptToolName

  // 显示权限提示时的回调
  const onPermissionPrompt = (details: RequiresActionDetails) => {
    if (feature('COMMIT_ATTRIBUTION')) {
      setAppState(prev => ({
        ...prev,
        attribution: {
          ...prev.attribution,
          permissionPromptCount: prev.attribution.permissionPromptCount + 1,
        },
      }))
    }
    notifySessionStateChanged('requires_action', details)
  }

  const canUseTool = getCanUseToolFn(
    effectivePermissionPromptToolName,
    structuredIO,
    () => getAppState().mcp.tools,
    onPermissionPrompt,
  )
  if (options.permissionPromptToolName) {
    // 从可用工具列表中移除权限提示工具。
    filteredTools = filteredTools.filter(
      tool => !toolMatchesName(tool, options.permissionPromptToolName!),
    )
  }

  // 安装错误处理程序以优雅地处理管道破裂（例如，当父进程死亡时）
  registerProcessOutputErrorHandlers()

  headlessProfilerCheckpoint('after_loadInitialMessages')

  // 在生成模型选项之前确保模型字符串已初始化。
  // 对于 Bedrock 用户，这会等待配置文件获取以获取正确的区域字符串。
  await ensureModelStringsInitialized()
  headlessProfilerCheckpoint('after_modelStrings')

  // UDS 收件箱存储注册被推迟到 `run` 定义之后，
  // 这样我们就可以将 `run` 作为 onEnqueue 回调传递（见下文）。

  // 只有 `json` + `verbose` 需要完整的数组（下面的 jsonStringify(messages)）。
  // 对于 stream-json（SDK/CCR）和默认文本输出，仅读取最后一条消息以获取退出代码/最终结果。
  // 避免在整个会话期间在内存中累积每条消息。
  const needsFullArray = options.outputFormat === 'json' && options.verbose
  const messages: SDKMessage[] = []
  let lastMessage: SDKMessage | undefined
  // 精简模式：当使用 stream-json 且 CLAUDE_CODE_STREAMLINED_OUTPUT=true 时转换消息
  // 构建标志在外部构建中将其排除；环境变量是 ant 构建的运行时启用项
  const transformToStreamlined =
    feature('STREAMLINED_OUTPUT') &&
    isEnvTruthy(process.env.CLAUDE_CODE_STREAMLINED_OUTPUT) &&
    options.outputFormat === 'stream-json'
      ? createStreamlinedTransformer()
      : null

  headlessProfilerCheckpoint('before_runHeadlessStreaming')
  for await (const message of runHeadlessStreaming(
    structuredIO,
    appState.mcp.clients,
    [...commands, ...appState.mcp.commands],
    filteredTools,
    initialMessages,
    canUseTool,
    sdkMcpConfigs,
    getAppState,
    setAppState,
    agents,
    options,
    turnInterruptionState,
  )) {
    if (transformToStreamlined) {
      // 精简模式：转换消息并立即流式输出
      const transformed = transformToStreamlined(message)
      if (transformed) {
        await structuredIO.write(transformed)
      }
    } else if (options.outputFormat === 'stream-json' && options.verbose) {
      await structuredIO.write(message)
    }
    // 在非流式模式下不应收到控制消息或流事件。
    // 同时过滤掉精简类型，因为它们仅由转换器生成。
    // SDK 专用的系统事件被排除，以便 lastMessage 停留在结果上
    // （session_state_changed(idle) 和 finally 块中结果之后的任何延迟任务通知）。
    if (
      message.type !== 'control_response' &&
      message.type !== 'control_request' &&
      message.type !== 'control_cancel_request' &&
      !(
        message.type === 'system' &&
        (message.subtype === 'session_state_changed' ||
          message.subtype === 'task_notification' ||
          message.subtype === 'task_started' ||
          message.subtype === 'task_progress' ||
          message.subtype === 'post_turn_summary')
      ) &&
      message.type !== 'stream_event' &&
      message.type !== 'keep_alive' &&
      message.type !== 'streamlined_text' &&
      message.type !== 'streamlined_tool_use_summary' &&
      message.type !== 'prompt_suggestion'
    ) {
      if (needsFullArray) {
        messages.push(message)
      }
      lastMessage = message
    }
  }

  switch (options.outputFormat) {
    case 'json':
      if (!lastMessage || lastMessage.type !== 'result') {
        throw new Error('未返回任何消息')
      }
      if (options.verbose) {
        writeToStdout(jsonStringify(messages) + '\n')
        break
      }
      writeToStdout(jsonStringify(lastMessage) + '\n')
      break
    case 'stream-json':
      // 已在上面记录
      break
    default:
      if (!lastMessage || lastMessage.type !== 'result') {
        throw new Error('未返回任何消息')
      }
      switch (lastMessage.subtype) {
        case 'success':
          writeToStdout(
            lastMessage.result.endsWith('\n')
              ? lastMessage.result
              : lastMessage.result + '\n',
          )
          break
        case 'error_during_execution':
          writeToStdout(`执行错误`)
          break
        case 'error_max_turns':
          writeToStdout(`错误：已达到最大轮数 (${options.maxTurns})`)
          break
        case 'error_max_budget_usd':
          writeToStdout(`错误：已超出美元预算 (${options.maxBudgetUsd})`)
          break
        case 'error_max_structured_output_retries':
          writeToStdout(
            `错误：在最大重试次数后仍无法提供有效的结构化输出`,
          )
      }
  }

  // 记录最终轮次的无头延迟指标
  logHeadlessProfilerTurn()

  // 在关闭之前排空所有进行中的内存提取。响应已在上面刷新，因此这不会增加用户感知的延迟——
  // 它只是延迟了进程退出，以便 gracefulShutdownSync 的 5 秒故障安全机制不会在分叉代理飞行途中将其杀死。
  // 由 isExtractModeActive 控制，因此 tengu_slate_thimble 标志控制端到端的非交互式提取。
  if (feature('EXTRACT_MEMORIES') && isExtractModeActive()) {
    await extractMemoriesModule!.drainPendingExtraction()
  }

  gracefulShutdownSync(
    lastMessage?.type === 'result' && lastMessage?.is_error ? 1 : 0,
  )
}

function runHeadlessStreaming(
  structuredIO: StructuredIO,
  mcpClients: MCPServerConnection[],
  commands: Command[],
  tools: Tools,
  initialMessages: Message[],
  canUseTool: CanUseToolFn,
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
  agents: AgentDefinition[],
  options: {
    verbose: boolean | undefined
    jsonSchema: Record<string, unknown> | undefined
    permissionPromptToolName: string | undefined
    allowedTools: string[] | undefined
    thinkingConfig: ThinkingConfig | undefined
    maxTurns: number | undefined
    maxBudgetUsd: number | undefined
    taskBudget: { total: number } | undefined
    systemPrompt: string | undefined
    appendSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined
    fallbackModel: string | undefined
    replayUserMessages?: boolean | undefined
    includePartialMessages?: boolean | undefined
    enableAuthStatus?: boolean | undefined
    agent?: string | undefined
    setSDKStatus?: (status: SDKStatus) => void
    promptSuggestions?: boolean | undefined
    workload?: string | undefined
  },
  turnInterruptionState?: TurnInterruptionState,
): AsyncIterable<StdoutMessage> {
  let running = false
  let runPhase:
    | 'draining_commands'
    | 'waiting_for_agents'
    | 'finally_flush'
    | 'finally_post_flush'
    | undefined
  let inputClosed = false
  let shutdownPromptInjected = false
  let heldBackResult: StdoutMessage | null = null
  let abortController: AbortController | undefined
  // 与 sendRequest() 入队相同的队列——所有内容共享一个 FIFO。
  const output = structuredIO.outbound

  // -p 模式下的 Ctrl+C：中止进行中的查询，然后优雅关闭。
  // gracefulShutdown 持久化会话状态并刷新分析数据，并带有故障安全计时器，如果清理挂起则强制退出。
  const sigintHandler = () => {
    logForDiagnosticsNoPII('info', 'shutdown_signal', { signal: 'SIGINT' })
    if (abortController && !abortController.signal.aborted) {
      abortController.abort()
    }
    void gracefulShutdown(0)
  }
  process.on('SIGINT', sigintHandler)

  // 在 SIGTERM 时转储 run() 的状态，以便卡住的会话的健康检查可以在不读取转录的情况下识别出 do/while(waitingForAgents) 轮询。
  registerCleanup(async () => {
    const bg: Record<string, number> = {}
    for (const t of getRunningTasks(getAppState())) {
      if (isBackgroundTask(t)) bg[t.type] = (bg[t.type] ?? 0) + 1
    }
    logForDiagnosticsNoPII('info', 'run_state_at_shutdown', {
      run_active: running,
      run_phase: runPhase,
      worker_status: getSessionState(),
      internal_events_pending: structuredIO.internalEventsPending,
      bg_tasks: bg,
    })
  })

  // 将中央 onChangeAppState 模式差异钩子连接到 SDK 输出流。
  // 每当任何代码路径修改 toolPermissionContext.mode 时，都会触发此操作——
  // Shift+Tab、ExitPlanMode 对话框、/plan 斜杠命令、回滚、bridge set_permission_mode、查询循环、stop_task——
  // 而不是之前通过定制包装器处理的两个路径。
  // 包装器的内容完全冗余（它在此处入队并调用 notifySessionMetadataChanged，现在 onChangeAppState 已涵盖这两者）；
  // 保留它会导致状态消息重复发送。
  setPermissionModeChangedListener(newMode => {
    // 仅为 SDK 暴露的模式发出事件。
    if (
      newMode === 'default' ||
      newMode === 'acceptEdits' ||
      newMode === 'bypassPermissions' ||
      newMode === 'plan' ||
      newMode === (feature('TRANSCRIPT_CLASSIFIER') && 'auto') ||
      newMode === 'dontAsk'
    ) {
      output.enqueue({
        type: 'system',
        subtype: 'status',
        status: null,
        permissionMode: newMode as PermissionMode,
        uuid: randomUUID(),
        session_id: getSessionId(),
      })
    }
  })

  // 提示建议跟踪（推送模型）
  const suggestionState: {
    abortController: AbortController | null
    inflightPromise: Promise<void> | null
    lastEmitted: {
      text: string
      emittedAt: number
      promptId: PromptVariant
      generationRequestId: string | null
    } | null
    pendingSuggestion: {
      type: 'prompt_suggestion'
      suggestion: string
      uuid: UUID
      session_id: string
    } | null
    pendingLastEmittedEntry: {
      text: string
      promptId: PromptVariant
      generationRequestId: string | null
    } | null
  } = {
    abortController: null,
    inflightPromise: null,
    lastEmitted: null,
    pendingSuggestion: null,
    pendingLastEmittedEntry: null,
  }

  // 如果启用，设置 AWS 认证状态监听器
  let unsubscribeAuthStatus: (() => void) | undefined
  if (options.enableAuthStatus) {
    const authStatusManager = AwsAuthStatusManager.getInstance()
    unsubscribeAuthStatus = authStatusManager.subscribe(status => {
      output.enqueue({
        type: 'auth_status',
        isAuthenticating: status.isAuthenticating,
        output: status.output,
        error: status.error,
        uuid: randomUUID(),
        session_id: getSessionId(),
      })
    })
  }

  // 设置速率限制状态监听器，为所有状态更改发出 SDKRateLimitEvent。
  // 为所有状态（包括 'allowed'）发出事件，确保消费者可以在速率限制重置时清除警告。
  // 上游的 emitStatusChange 已通过 isEqual 进行去重。
  const rateLimitListener = (limits: ClaudeAILimits) => {
    const rateLimitInfo = toSDKRateLimitInfo(limits)
    if (rateLimitInfo) {
      output.enqueue({
        type: 'rate_limit_event',
        rate_limit_info: rateLimitInfo,
        uuid: randomUUID(),
        session_id: getSessionId(),
      })
    }
  }
  statusListeners.add(rateLimitListener)

  // 用于内部跟踪的消息，由 ask() 直接修改。这些消息包括 Assistant、User、Attachment 和 Progress 消息。
  // TODO：清理此代码，避免传递可变数组。
  const mutableMessages: Message[] = initialMessages

  // 从转录中播种 readFileState 缓存（模型看到的内容，带有消息时间戳），
  // 以便 getChangedFiles 可以检测外部编辑。
  // 此缓存实例必须在 ask() 调用之间持续存在，因为编辑工具依赖于此作为全局状态。
  let readFileState = extractReadFilesFromMessages(
    initialMessages,
    cwd(),
    READ_FILE_STATE_CACHE_SIZE,
  )

  // 客户端提供的 readFileState 种子（通过 seed_read_state 控制请求）。
  // stdin IIFE 与 ask() 并发运行——如果直接写入 readFileState，
  // 在轮次中途到达的种子会在 ask() 的克隆-替换周期（QueryEngine.ts 的 finally 块）中丢失。
  // 相反，种子落在这里，合并到 getReadFileCache 的视图中（readFileState 优先：种子填补空白），
  // 并在 setReadFileCache 中重新应用然后被清除。一次性：每个种子恰好存活一个克隆-替换周期，
  // 然后像其他所有内容一样成为常规的 readFileState 条目，受 compact 的清除影响。
  const pendingSeeds = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  )

  // 重启时自动恢复中断的轮次，以便 Claude Code 从上次中断处继续，无需 SDK 重新发送提示。
  const resumeInterruptedTurnEnv =
    process.env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN
  if (
    turnInterruptionState &&
    turnInterruptionState.kind !== 'none' &&
    resumeInterruptedTurnEnv
  ) {
    logForDebugging(
      `[print.ts] 自动恢复中断的轮次 (类型: ${turnInterruptionState.kind})`,
    )

    // 移除中断的消息及其哨兵，然后重新入队，以便模型只看到一次。
    // 对于轮次中途的中断，反序列化层通过附加一个合成的“从上次中断处继续”消息将其转换为 interrupted_prompt。
    removeInterruptedMessage(mutableMessages, turnInterruptionState.message)
    enqueue({
      mode: 'prompt',
      value: turnInterruptionState.message.message.content,
      uuid: randomUUID(),
    })
  }

  const modelOptions = getModelOptions()
  const modelInfos = modelOptions.map(option => {
    const modelId = option.value === null ? 'default' : option.value
    const resolvedModel =
      modelId === 'default'
        ? getDefaultMainLoopModel()
        : parseUserSpecifiedModel(modelId)
    const hasEffort = modelSupportsEffort(resolvedModel)
    const hasAdaptiveThinking = modelSupportsAdaptiveThinking(resolvedModel)
    const hasFastMode = isFastModeSupportedByModel(option.value)
    const hasAutoMode = modelSupportsAutoMode(resolvedModel)
    return {
      value: modelId,
      displayName: option.label,
      description: option.description,
      ...(hasEffort && {
        supportsEffort: true,
        supportedEffortLevels: modelSupportsMaxEffort(resolvedModel)
          ? [...EFFORT_LEVELS]
          : EFFORT_LEVELS.filter(l => l !== 'max'),
      }),
      ...(hasAdaptiveThinking && { supportsAdaptiveThinking: true }),
      ...(hasFastMode && { supportsFastMode: true }),
      ...(hasAutoMode && { supportsAutoMode: true }),
    }
  })
  let activeUserSpecifiedModel = options.userSpecifiedModel

  function injectModelSwitchBreadcrumbs(
    modelArg: string,
    resolvedModel: string,
  ): void {
    const breadcrumbs = createModelSwitchBreadcrumbs(
      modelArg,
      modelDisplayString(resolvedModel),
    )
    mutableMessages.push(...breadcrumbs)
    for (const crumb of breadcrumbs) {
      if (
        typeof crumb.message.content === 'string' &&
        crumb.message.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`)
      ) {
        output.enqueue({
          type: 'user',
          message: crumb.message,
          session_id: getSessionId(),
          parent_tool_use_id: null,
          uuid: crumb.uuid,
          timestamp: crumb.timestamp,
          isReplay: true,
        } satisfies SDKUserMessageReplay)
      }
    }
  }

  // 缓存 SDK MCP 客户端以避免每次运行时重新连接
  let sdkClients: MCPServerConnection[] = []
  let sdkTools: Tools = []

  // 跟踪哪些 MCP 客户端已注册启发式处理程序
  const elicitationRegistered = new Set<string>()

  /**
   * 在尚未注册的已连接 MCP 客户端上注册启发式请求/完成处理程序。
   * SDK MCP 服务器被排除，因为它们通过 SdkControlClientTransport 路由。
   * 钩子首先运行（匹配 REPL 行为）；如果没有钩子响应，请求将通过控制协议转发给 SDK 消费者。
   */
  function registerElicitationHandlers(clients: MCPServerConnection[]): void {
    for (const connection of clients) {
      if (
        connection.type !== 'connected' ||
        elicitationRegistered.has(connection.name)
      ) {
        continue
      }
      // 跳过 SDK MCP 服务器 —— 启发式流程通过 SdkControlClientTransport 进行
      if (connection.config.type === 'sdk') {
        continue
      }
      const serverName = connection.name

      // 包装在 try/catch 中，因为如果客户端在创建时未声明启发式能力，setRequestHandler 会抛出错误。
      try {
        connection.client.setRequestHandler(
          ElicitRequestSchema,
          async (request, extra) => {
            logMCPDebug(
              serverName,
              `在打印模式下收到征求请求: ${jsonStringify(request)}`,
            )

            const mode = request.params.mode === 'url' ? 'url' : 'form'

            logEvent('tengu_mcp_elicitation_shown', {
              mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })

            // 首先运行启发式钩子 —— 它们可以通过编程方式提供响应
            const hookResponse = await runElicitationHooks(
              serverName,
              request.params,
              extra.signal,
            )
            if (hookResponse) {
              logMCPDebug(
                serverName,
                `征求通过钩子解决: ${jsonStringify(hookResponse)}`,
              )
              logEvent('tengu_mcp_elicitation_response', {
                mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                action:
                  hookResponse.action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              })
              return hookResponse
            }

            // 通过控制协议委托给 SDK 消费者
            const url =
              'url' in request.params
                ? (request.params.url as string)
                : undefined
            const requestedSchema =
              'requestedSchema' in request.params
                ? (request.params.requestedSchema as
                    | Record<string, unknown>
                    | undefined)
                : undefined

            const elicitationId =
              'elicitationId' in request.params
                ? (request.params.elicitationId as string | undefined)
                : undefined

            const rawResult = await structuredIO.handleElicitation(
              serverName,
              request.params.message,
              requestedSchema,
              extra.signal,
              mode,
              url,
              elicitationId,
            )

            const result = await runElicitationResultHooks(
              serverName,
              rawResult,
              extra.signal,
              mode,
              elicitationId,
            )

            logEvent('tengu_mcp_elicitation_response', {
              mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              action:
                result.action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
            return result
          },
        )

        // 向 SDK 消费者提供完成通知（URL 模式）
        connection.client.setNotificationHandler(
          ElicitationCompleteNotificationSchema,
          notification => {
            const { elicitationId } = notification.params
            logMCPDebug(
              serverName,
              `征求完成通知: ${elicitationId}`,
            )
            void executeNotificationHooks({
              message: `MCP 服务器 "${serverName}" 已确认触发请求 ${elicitationId} 完成`,
              notificationType: 'elicitation_complete',
            })
            output.enqueue({
              type: 'system',
              subtype: 'elicitation_complete',
              mcp_server_name: serverName,
              elicitation_id: elicitationId,
              uuid: randomUUID(),
              session_id: getSessionId(),
            })
          },
        )

        elicitationRegistered.add(serverName)
      } catch {
        // setRequestHandler 在客户端创建时未声明启发式能力时会抛出错误 —— 静默跳过
      }
    }
  }

  async function updateSdkMcp() {
    // 检查 SDK MCP 服务器是否需要更新（添加或移除了新服务器）
    const currentServerNames = new Set(Object.keys(sdkMcpConfigs))
    const connectedServerNames = new Set(sdkClients.map(c => c.name))

    // 检查是否存在任何差异（添加或移除）
    const hasNewServers = Array.from(currentServerNames).some(
      name => !connectedServerNames.has(name),
    )
    const hasRemovedServers = Array.from(connectedServerNames).some(
      name => !currentServerNames.has(name),
    )
    // 检查是否有任何 SDK 客户端处于待处理状态并需要升级
    const hasPendingSdkClients = sdkClients.some(c => c.type === 'pending')
    // 检查是否有任何 SDK 客户端握手失败并需要重试。
    // 没有这个检查，处于 'failed' 状态的客户端（例如 WS 重连竞争中的握手超时）会永远失败
    // —— 它的名称满足 connectedServerNames 差异，但它贡献零个工具。
    const hasFailedSdkClients = sdkClients.some(c => c.type === 'failed')

    const haveServersChanged =
      hasNewServers ||
      hasRemovedServers ||
      hasPendingSdkClients ||
      hasFailedSdkClients

    if (haveServersChanged) {
      // 清理已移除的服务器
      for (const client of sdkClients) {
        if (!currentServerNames.has(client.name)) {
          if (client.type === 'connected') {
            await client.cleanup()
          }
        }
      }

      // 使用当前配置重新初始化所有 SDK MCP 服务器
      const sdkSetup = await setupSdkMcpClients(
        sdkMcpConfigs,
        (serverName, message) =>
          structuredIO.sendMcpMessage(serverName, message),
      )
      sdkClients = sdkSetup.clients
      sdkTools = sdkSetup.tools

      // 将 SDK MCP 工具存储在 appState 中，以便子代理可以通过 assembleToolPool 访问它们。
      // 仅工具存储在这里 —— SDK 客户端已在查询循环（allMcpClients）和 mcp_status 处理程序中单独合并。
      // 同时使用旧的（connectedServerNames）和新的（currentServerNames）名称，以便在服务器添加或移除时删除陈旧的 SDK 工具。
      const allSdkNames = uniq([...connectedServerNames, ...currentServerNames])
      setAppState(prev => ({
        ...prev,
        mcp: {
          ...prev.mcp,
          tools: [
            ...prev.mcp.tools.filter(
              t =>
                !allSdkNames.some(name =>
                  t.name.startsWith(getMcpPrefix(name)),
                ),
            ),
            ...sdkTools,
          ],
        },
      }))

      // 如有必要，设置特殊的内部 VSCode MCP 服务器。
      setupVscodeSdkMcp(sdkClients)
    }
  }

  void updateSdkMcp()

  // 动态添加的 MCP 服务器状态（通过 mcp_set_servers 控制消息）
  // 这些独立于 SDK MCP 服务器，并支持所有传输类型
  let dynamicMcpState: DynamicMcpState = {
    clients: [],
    tools: [],
    configs: {},
  }

  // ask() 和 get_context_usage 控制请求的共享工具组装。
  // 闭包捕获可变的 sdkTools/dynamicMcpState 绑定，以便两个调用点都能看到后续连接的服务器。
  const buildAllTools = (appState: AppState): Tools => {
    const assembledTools = assembleToolPool(
      appState.toolPermissionContext,
      appState.mcp.tools,
    )
    let allTools = uniqBy(
      mergeAndFilterTools(
        [...tools, ...sdkTools, ...dynamicMcpState.tools],
        assembledTools,
        appState.toolPermissionContext.mode,
      ),
      'name',
    )
    if (options.permissionPromptToolName) {
      allTools = allTools.filter(
        tool => !toolMatchesName(tool, options.permissionPromptToolName!),
      )
    }
    const initJsonSchema = getInitJsonSchema()
    if (initJsonSchema && !options.jsonSchema) {
      const syntheticOutputResult = createSyntheticOutputTool(initJsonSchema)
      if ('tool' in syntheticOutputResult) {
        allTools = [...allTools, syntheticOutputResult.tool]
      }
    }
    return allTools
  }

  // 远程控制（SDK 控制消息）的桥接句柄。
  // 镜像 REPL 的 useReplBridge 钩子：当启用 `remote_control` 时创建句柄，禁用时销毁。
  let bridgeHandle: ReplBridgeHandle | null = null
  // 指向 mutableMessages 的游标 —— 跟踪我们已经转发到的位置。
  // 与 useReplBridge 的 lastWrittenIndexRef 相同的基于索引的差异。
  let bridgeLastForwardedIndex = 0

  // 将新消息从 mutableMessages 转发到桥接。
  // 在每个轮次期间（以便 claude.ai 看到进度并在权限等待期间保持活跃）以及轮次之后增量调用。
  //
  // writeMessages 有自己的基于 UUID 的去重（initialMessageUUIDs、recentPostedUUIDs）
  // —— 这里的索引游标是一个预过滤器，以避免在每次调用时对已发送的消息进行 O(n) 重新扫描。
  function forwardMessagesToBridge(): void {
    if (!bridgeHandle) return
    // 防止 mutableMessages 缩小（压缩会截断它）。
    const startIndex = Math.min(
      bridgeLastForwardedIndex,
      mutableMessages.length,
    )
    const newMessages = mutableMessages
      .slice(startIndex)
      .filter(m => m.type === 'user' || m.type === 'assistant')
    bridgeLastForwardedIndex = mutableMessages.length
    if (newMessages.length > 0) {
      bridgeHandle.writeMessages(newMessages)
    }
  }

  // 应用 MCP 服务器更改的辅助函数 —— 由 mcp_set_servers 控制消息和后台插件安装使用。
  // 注意：需要嵌套函数 —— 会修改闭包状态（sdkMcpConfigs、sdkClients 等）
  let mcpChangesPromise: Promise<{
    response: SDKControlMcpSetServersResponse
    sdkServersChanged: boolean
  }> = Promise.resolve({
    response: {
      added: [] as string[],
      removed: [] as string[],
      errors: {} as Record<string, string>,
    },
    sdkServersChanged: false,
  })

  function applyMcpServerChanges(
    servers: Record<string, McpServerConfigForProcessTransport>,
  ): Promise<{
    response: SDKControlMcpSetServersResponse
    sdkServersChanged: boolean
  }> {
    // 序列化调用以防止并发调用者之间的竞态条件（后台插件安装和 mcp_set_servers 控制消息）
    const doWork = async (): Promise<{
      response: SDKControlMcpSetServersResponse
      sdkServersChanged: boolean
    }> => {
      const oldSdkClientNames = new Set(sdkClients.map(c => c.name))

      const result = await handleMcpSetServers(
        servers,
        { configs: sdkMcpConfigs, clients: sdkClients, tools: sdkTools },
        dynamicMcpState,
        setAppState,
      )

      // 更新 SDK 状态（需要修改 sdkMcpConfigs，因为它是共享的）
      for (const key of Object.keys(sdkMcpConfigs)) {
        delete sdkMcpConfigs[key]
      }
      Object.assign(sdkMcpConfigs, result.newSdkState.configs)
      sdkClients = result.newSdkState.clients
      sdkTools = result.newSdkState.tools
      dynamicMcpState = result.newDynamicState

      // 保持 appState.mcp.tools 同步，以便子代理可以看到 SDK MCP 工具。
      // 同时使用新旧 SDK 客户端名称以删除陈旧的工具。
      if (result.sdkServersChanged) {
        const newSdkClientNames = new Set(sdkClients.map(c => c.name))
        const allSdkNames = uniq([...oldSdkClientNames, ...newSdkClientNames])
        setAppState(prev => ({
          ...prev,
          mcp: {
            ...prev.mcp,
            tools: [
              ...prev.mcp.tools.filter(
                t =>
                  !allSdkNames.some(name =>
                    t.name.startsWith(getMcpPrefix(name)),
                  ),
              ),
              ...sdkTools,
            ],
          },
        }))
      }

      return {
        response: result.response,
        sdkServersChanged: result.sdkServersChanged,
      }
    }

    mcpChangesPromise = mcpChangesPromise.then(doWork, doWork)
    return mcpChangesPromise
  }

  // 为控制响应构建 McpServerStatus[]。由 mcp_status 和 reload_plugins 处理程序共享。
  // 读取闭包状态：sdkClients、dynamicMcpState。
  function buildMcpServerStatuses(): McpServerStatus[] {
    const currentAppState = getAppState()
    const currentMcpClients = currentAppState.mcp.clients
    const allMcpTools = uniqBy(
      [...currentAppState.mcp.tools, ...dynamicMcpState.tools],
      'name',
    )
    const existingNames = new Set([
      ...currentMcpClients.map(c => c.name),
      ...sdkClients.map(c => c.name),
    ])
    return [
      ...currentMcpClients,
      ...sdkClients,
      ...dynamicMcpState.clients.filter(c => !existingNames.has(c.name)),
    ].map(connection => {
      let config
      if (
        connection.config.type === 'sse' ||
        connection.config.type === 'http'
      ) {
        config = {
          type: connection.config.type,
          url: connection.config.url,
          headers: connection.config.headers,
          oauth: connection.config.oauth,
        }
      } else if (connection.config.type === 'claudeai-proxy') {
        config = {
          type: 'claudeai-proxy' as const,
          url: connection.config.url,
          id: connection.config.id,
        }
      } else if (
        connection.config.type === 'stdio' ||
        connection.config.type === undefined
      ) {
        config = {
          type: 'stdio' as const,
          command: connection.config.command,
          args: connection.config.args,
        }
      }
      const serverTools =
        connection.type === 'connected'
          ? filterToolsByServer(allMcpTools, connection.name).map(tool => ({
              name: tool.mcpInfo?.toolName ?? tool.name,
              annotations: {
                readOnly: tool.isReadOnly({}) || undefined,
                destructive: tool.isDestructive?.({}) || undefined,
                openWorld: tool.isOpenWorld?.({}) || undefined,
              },
            }))
          : undefined
      // 带允许列表预过滤的能力透传。IDE 读取 experimental['claude/channel']
      // 来决定是否显示启用通道的提示 —— 仅当 channel_enable 实际会通过允许列表时才回显。
      // 不是安全边界（处理程序重新运行完整门控）；只是避免出现无效按钮。
      let capabilities: { experimental?: Record<string, unknown> } | undefined
      if (
        (feature('KAIROS') || feature('KAIROS_CHANNELS')) &&
        connection.type === 'connected' &&
        connection.capabilities.experimental
      ) {
        const exp = { ...connection.capabilities.experimental }
        if (
          exp['claude/channel'] &&
          (!isChannelsEnabled() ||
            !isChannelAllowlisted(connection.config.pluginSource))
        ) {
          delete exp['claude/channel']
        }
        if (Object.keys(exp).length > 0) {
          capabilities = { experimental: exp }
        }
      }
      return {
        name: connection.name,
        status: connection.type,
        serverInfo:
          connection.type === 'connected' ? connection.serverInfo : undefined,
        error: connection.type === 'failed' ? connection.error : undefined,
        config,
        scope: connection.config.scope,
        tools: serverTools,
        capabilities,
      }
    })
  }

  // 注意：需要嵌套函数 —— 需要闭包访问 applyMcpServerChanges 和 updateSdkMcp
  async function installPluginsAndApplyMcpInBackground(): Promise<void> {
    try {
      // 用户设置（在 runHeadless 入口触发）和受管设置（在 main.tsx preAction 中触发）的连接点。
      // downloadUserSettings() 缓存其 promise，因此这里等待的是同一个进行中的请求。
      await Promise.all([
        feature('DOWNLOAD_USER_SETTINGS') &&
        (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) || getIsRemoteMode())
          ? withDiagnosticsTiming('headless_user_settings_download', () =>
              downloadUserSettings(),
            )
          : Promise.resolve(),
        withDiagnosticsTiming('headless_managed_settings_wait', () =>
          waitForRemoteManagedSettingsToLoad(),
        ),
      ])

      const pluginsInstalled = await installPluginsForHeadless()

      if (pluginsInstalled) {
        await applyPluginMcpDiff()
      }
    } catch (error) {
      logError(error)
    }
  }

  // 所有无头用户的后台插件安装
  // 从 extraKnownMarketplaces 和缺失的已启用插件安装市场
  // CLAUDE_CODE_SYNC_PLUGIN_INSTALL=true：在第一次查询之前在 run() 中解析，
  // 以便保证插件在第一次 ask() 时可用。
  let pluginInstallPromise: Promise<void> | null = null
  // --bare / SIMPLE：跳过插件安装。脚本化调用不会在会话中途添加插件；
  // 下次交互式运行时会进行协调。
  if (!isBareMode()) {
    if (isEnvTruthy(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL)) {
      pluginInstallPromise = installPluginsAndApplyMcpInBackground()
    } else {
      void installPluginsAndApplyMcpInBackground()
    }
  }

  // 空闲超时管理
  const idleTimeout = createIdleTimeoutManager(() => !running)

  // 用于热重载的可变命令和代理
  let currentCommands = commands
  let currentAgents = agents

  // 清除所有与插件相关的缓存，重新加载命令/代理/钩子。
  // 在 CLAUDE_CODE_SYNC_PLUGIN_INSTALL 完成后（第一次查询之前）
  // 以及非同步后台安装完成后调用。
  // refreshActivePlugins 调用 clearAllCaches()，这是必需的，
  // 因为 loadAllPlugins() 可能在 main.tsx 启动期间、受管设置获取之前运行。
  // 如果不清除，getCommands() 将从陈旧的插件列表中重建。
  async function refreshPluginState(): Promise<void> {
    // refreshActivePlugins 处理完整的缓存清理（clearAllCaches），
    // 重新加载所有插件组件加载器，写入 AppState.plugins + AppState.agentDefinitions，
    // 注册钩子，并增加 mcp.pluginReconnectKey。
    const { agentDefinitions: freshAgentDefs } =
      await refreshActivePlugins(setAppState)

    // 无头特定：currentCommands/currentAgents 是由查询循环捕获的本地可变引用
    //（REPL 改用 AppState）。getCommands 是新鲜的，因为 refreshActivePlugins 清除了其缓存。
    currentCommands = await getCommands(cwd())

    // 保留 SDK 提供的代理（--agents CLI 标志或 SDK initialize control_request）
    // —— 两者都通过 parseAgentsFromJson 注入，source='flagSettings'。
    // loadMarkdownFilesForSubdir 从不分配此来源，因此它清晰地识别出“注入的，非磁盘加载的”。
    //
    // 之前的过滤器使用了负集差异（!freshAgentTypes.has(a)），
    // 这也会匹配存在于中毒的初始 currentAgents 中但在应用受管设置后被正确排除的插件代理
    // —— 导致策略阻止的代理泄露到 init 消息中。
    // 参见 gh-23085：在 Commander 定义时的 isBridgeEnabled() 在 setEligibility(true) 运行之前毒化了设置缓存。
    const sdkAgents = currentAgents.filter(a => a.source === 'flagSettings')
    currentAgents = [...freshAgentDefs.allAgents, ...sdkAgents]
  }

  // 在插件状态更改后重新比较 MCP 配置。过滤为进程传输支持的类型，
  // 并携带 SDK 模式服务器，以便 applyMcpServerChanges 的差异不会关闭它们的传输。
  // 嵌套：需要闭包访问 sdkMcpConfigs、applyMcpServerChanges、updateSdkMcp。
  async function applyPluginMcpDiff(): Promise<void> {
    const { servers: newConfigs } = await getAllMcpConfigs()
    const supportedConfigs: Record<string, McpServerConfigForProcessTransport> =
      {}
    for (const [name, config] of Object.entries(newConfigs)) {
      const type = config.type
      if (
        type === undefined ||
        type === 'stdio' ||
        type === 'sse' ||
        type === 'http' ||
        type === 'sdk'
      ) {
        supportedConfigs[name] = config
      }
    }
    for (const [name, config] of Object.entries(sdkMcpConfigs)) {
      if (config.type === 'sdk' && !(name in supportedConfigs)) {
        supportedConfigs[name] = config
      }
    }
    const { response, sdkServersChanged } =
      await applyMcpServerChanges(supportedConfigs)
    if (sdkServersChanged) {
      void updateSdkMcp()
    }
    logForDebugging(
      `无头 MCP 刷新: 已添加=${response.added.length}, 已移除=${response.removed.length}`,
    )
  }

  // 订阅技能更改以进行热重载
  const unsubscribeSkillChanges = skillChangeDetector.subscribe(() => {
    clearCommandsCache()
    void getCommands(cwd()).then(newCommands => {
      currentCommands = newCommands
    })
  })

  // 主动模式：安排一次轮询以保持模型自主循环。
  // setTimeout(0) 让出事件循环，以便在轮询触发之前处理挂起的 stdin 消息（中断、用户消息）。
  const scheduleProactiveTick =
    feature('PROACTIVE') || feature('KAIROS')
      ? () => {
          setTimeout(() => {
            if (
              !proactiveModule?.isProactiveActive() ||
              proactiveModule.isProactivePaused() ||
              inputClosed
            ) {
              return
            }
            const tickContent = `<${TICK_TAG}>${new Date().toLocaleTimeString()}</${TICK_TAG}>`
            enqueue({
              mode: 'prompt' as const,
              value: tickContent,
              uuid: randomUUID(),
              priority: 'later',
              isMeta: true,
            })
            void run()
          }, 0)
        }
      : undefined

  // 当接收到 'now' 优先级消息时中止当前操作。
  subscribeToCommandQueue(() => {
    if (abortController && getCommandsByMaxPriority('now').length > 0) {
      abortController.abort('interrupt')
    }
  })

  const run = async () => {
    if (running) {
      return
    }

    running = true
    runPhase = undefined
    notifySessionStateChanged('running')
    idleTimeout.stop()

    headlessProfilerCheckpoint('run_entry')
    // TODO(custom-tool-refactor)：应该像浏览器一样移到 init 消息中。

    await updateSdkMcp()
    headlessProfilerCheckpoint('after_updateSdkMcp')

    // 解析延迟的插件安装（CLAUDE_CODE_SYNC_PLUGIN_INSTALL）。
    // 该 promise 被急切地启动，以便安装与其他初始化重叠。
    // 在这里等待可确保插件在第一次 ask() 之前可用。
    // 如果设置了 CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS，则与该截止时间竞争，
    // 并在超时时无插件继续（记录错误）。
    if (pluginInstallPromise) {
      const timeoutMs = parseInt(
        process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS || '',
        10,
      )
      if (timeoutMs > 0) {
        const timeout = sleep(timeoutMs).then(() => 'timeout' as const)
        const result = await Promise.race([pluginInstallPromise, timeout])
        if (result === 'timeout') {
          logError(
            new Error(
              `CLAUDE_CODE_SYNC_PLUGIN_INSTALL: 插件安装在 ${timeoutMs}ms 后超时`,
            ),
          )
          logEvent('tengu_sync_plugin_install_timeout', {
            timeout_ms: timeoutMs,
          })
        }
      } else {
        await pluginInstallPromise
      }
      pluginInstallPromise = null

      // 现在插件已安装，刷新命令、代理和钩子
      await refreshPluginState()

      // 初始安装完成后，为插件钩子设置热重载。
      // 在同步安装模式下，setup.ts 会跳过此步骤以避免与安装竞争。
      const { setupPluginHookHotReload } = await import(
        '../utils/plugins/loadPluginHooks.js'
      )
      setupPluginHookHotReload()
    }

    // 仅主线程命令（agentId===undefined）—— 子代理通知由 query.ts 中的子代理轮次中途门控排空。
    // 在 try 块外定义，以便在 run() 底部的 finally 后队列重新检查中可访问。
    const isMainThread = (cmd: QueuedCommand) => cmd.agentId === undefined

    try {
      let command: QueuedCommand | undefined
      let waitingForAgents = false

      // 将命令处理提取到一个命名函数中，以使用 do-while 模式。
      // 排空队列，将连续的提示模式命令批量合并到一个 ask() 调用中，
      // 这样在长轮次期间排队等待的消息会合并成一个后续轮次，而不是 N 个单独的轮次。
      const drainCommandQueue = async () => {
        while ((command = dequeue(isMainThread))) {
          if (
            command.mode !== 'prompt' &&
            command.mode !== 'orphaned-permission' &&
            command.mode !== 'task-notification'
          ) {
            throw new Error(
              '流式模式下仅支持提示命令',
            )
          }

          // 非提示命令（task-notification、orphaned-permission）携带副作用或 orphanedPermission 状态，
          // 因此它们单独处理。提示命令贪婪地收集具有匹配工作负载的跟随者。
          const batch: QueuedCommand[] = [command]
          if (command.mode === 'prompt') {
            while (canBatchWith(command, peek(isMainThread))) {
              batch.push(dequeue(isMainThread)!)
            }
            if (batch.length > 1) {
              command = {
                ...command,
                value: joinPromptValues(batch.map(c => c.value)),
                uuid: batch.findLast(c => c.uuid)?.uuid ?? command.uuid,
              }
            }
          }
          const batchUuids = batch.map(c => c.uuid).filter(u => u !== undefined)

          // QueryEngine 将通过其 messagesToAck 路径为 command.uuid（批次中的最后一个 uuid）发出重放。
          // 在此处为其余 uuid 发出重放，以便跟踪每个 uuid 交付情况的消费者（clank 的 asyncMessages 页脚、CCR）
          // 能够看到他们发送的每条消息的确认，而不仅仅是合并后幸存的那条。
          if (options.replayUserMessages && batch.length > 1) {
            for (const c of batch) {
              if (c.uuid && c.uuid !== command.uuid) {
                output.enqueue({
                  type: 'user',
                  message: { role: 'user', content: c.value },
                  session_id: getSessionId(),
                  parent_tool_use_id: null,
                  uuid: c.uuid,
                  isReplay: true,
                } satisfies SDKUserMessageReplay)
              }
            }
          }

          // 合并所有 MCP 客户端。appState.mcp 由 main.tsx 为每个服务器增量填充（镜像 useManageMCPConnections）。
          // 每次命令都读取最新的，意味着后续连接的服务器在下一次轮次时可见。
          // registerElicitationHandlers 是幂等的（跟踪集合）。
          const appState = getAppState()
          const allMcpClients = [
            ...appState.mcp.clients,
            ...sdkClients,
            ...dynamicMcpState.clients,
          ]
          registerElicitationHandlers(allMcpClients)
          // 为在构造时通过 --channels 或在会话中通过 enableChannel() 允许列表的服务器注册通道处理程序。
          // 像 registerElicitationHandlers 一样在每个轮次运行 —— 对每个客户端是幂等的（setNotificationHandler 会替换，而不是堆叠），
          // 并且对于非允许列表的服务器不执行任何操作（一次功能标志检查）。
          for (const client of allMcpClients) {
            reregisterChannelHandlerAfterReconnect(client)
          }

          const allTools = buildAllTools(appState)

          for (const uuid of batchUuids) {
            notifyCommandLifecycle(uuid, 'started')
          }

          // 当后台代理完成时，任务通知到达。
          // 为 SDK 消费者发出 SDK 系统事件，然后继续执行 ask()，以便模型看到代理结果并可以对其采取行动。
          // 这与 TUI 行为匹配，在 TUI 中，无论是否处于协调器模式，useQueueProcessor 始终将通知提供给模型。
          if (command.mode === 'task-notification') {
            const notificationText =
              typeof command.value === 'string' ? command.value : ''
            // 解析 XML 格式的通知
            const taskIdMatch = notificationText.match(
              /<task-id>([^<]+)<\/task-id>/,
            )
            const toolUseIdMatch = notificationText.match(
              /<tool-use-id>([^<]+)<\/tool-use-id>/,
            )
            const outputFileMatch = notificationText.match(
              /<output-file>([^<]+)<\/output-file>/,
            )
            const statusMatch = notificationText.match(
              /<status>([^<]+)<\/status>/,
            )
            const summaryMatch = notificationText.match(
              /<summary>([^<]+)<\/summary>/,
            )

            const isValidStatus = (
              s: string | undefined,
            ): s is 'completed' | 'failed' | 'stopped' | 'killed' =>
              s === 'completed' ||
              s === 'failed' ||
              s === 'stopped' ||
              s === 'killed'
            const rawStatus = statusMatch?.[1]
            const status = isValidStatus(rawStatus)
              ? rawStatus === 'killed'
                ? 'stopped'
                : rawStatus
              : 'completed'

            const usageMatch = notificationText.match(
              /<usage>([\s\S]*?)<\/usage>/,
            )
            const usageContent = usageMatch?.[1] ?? ''
            const totalTokensMatch = usageContent.match(
              /<total_tokens>(\d+)<\/total_tokens>/,
            )
            const toolUsesMatch = usageContent.match(
              /<tool_uses>(\d+)<\/tool_uses>/,
            )
            const durationMsMatch = usageContent.match(
              /<duration_ms>(\d+)<\/duration_ms>/,
            )

            // 仅当存在 <status> 标签时才发出 task_notification SDK 事件 ——
            // 这意味着这是一个终端通知（completed/failed/stopped）。
            // 来自 enqueueStreamEvent 的流事件不携带 <status>（它们是进度 ping）；
            // 在此处发出它们会默认为 'completed'，并为 SDK 消费者错误地关闭任务。
            // 终端书签现在直接通过 emitTaskTerminatedSdk 发出，因此跳过无状态事件是安全的。
            if (statusMatch) {
              output.enqueue({
                type: 'system',
                subtype: 'task_notification',
                task_id: taskIdMatch?.[1] ?? '',
                tool_use_id: toolUseIdMatch?.[1],
                status,
                output_file: outputFileMatch?.[1] ?? '',
                summary: summaryMatch?.[1] ?? '',
                usage:
                  totalTokensMatch && toolUsesMatch
                    ? {
                        total_tokens: parseInt(totalTokensMatch[1]!, 10),
                        tool_uses: parseInt(toolUsesMatch[1]!, 10),
                        duration_ms: durationMsMatch
                          ? parseInt(durationMsMatch[1]!, 10)
                          : 0,
                      }
                    : undefined,
                session_id: getSessionId(),
                uuid: randomUUID(),
              })
            }
            // 无 continue —— 继续执行 ask()，以便模型处理结果
          }

          const input = command.value

          if (structuredIO instanceof RemoteIO && command.mode === 'prompt') {
            logEvent('tengu_bridge_message_received', {
              is_repl: false,
            })
          }

          // 中止任何进行中的建议生成并跟踪接受情况
          suggestionState.abortController?.abort()
          suggestionState.abortController = null
          suggestionState.pendingSuggestion = null
          suggestionState.pendingLastEmittedEntry = null
          if (suggestionState.lastEmitted) {
            if (command.mode === 'prompt') {
              // SDK 用户消息入队的是 ContentBlockParam[]，而不是普通字符串
              const inputText =
                typeof input === 'string'
                  ? input
                  : (
                      input.find(b => b.type === 'text') as
                        | { type: 'text'; text: string }
                        | undefined
                    )?.text
              if (typeof inputText === 'string') {
                logSuggestionOutcome(
                  suggestionState.lastEmitted.text,
                  inputText,
                  suggestionState.lastEmitted.emittedAt,
                  suggestionState.lastEmitted.promptId,
                  suggestionState.lastEmitted.generationRequestId,
                )
              }
              suggestionState.lastEmitted = null
            }
          }

          abortController = createAbortController()
          const turnStartTime = feature('FILE_PERSISTENCE')
            ? Date.now()
            : undefined

          headlessProfilerCheckpoint('before_ask')
          startQueryProfile()
          // 每次迭代的 ALS 上下文，以便在 ask() 内部生成的后台代理在其分离的 await 中继承工作负载。
          // 进程内 cron 标记 cmd.workload；SDK 的 --workload 标志是 options.workload。
          // const-capture：TS 在闭包内丢失了 `while ((command = dequeue()))` 的缩小。
          const cmd = command
          await runWithWorkload(cmd.workload ?? options.workload, async () => {
            for await (const message of ask({
              commands: uniqBy(
                [...currentCommands, ...appState.mcp.commands],
                'name',
              ),
              prompt: input,
              promptUuid: cmd.uuid,
              isMeta: cmd.isMeta,
              cwd: cwd(),
              tools: allTools,
              verbose: options.verbose,
              mcpClients: allMcpClients,
              thinkingConfig: options.thinkingConfig,
              maxTurns: options.maxTurns,
              maxBudgetUsd: options.maxBudgetUsd,
              taskBudget: options.taskBudget,
              canUseTool,
              userSpecifiedModel: activeUserSpecifiedModel,
              fallbackModel: options.fallbackModel,
              jsonSchema: getInitJsonSchema() ?? options.jsonSchema,
              mutableMessages,
              getReadFileCache: () =>
                pendingSeeds.size === 0
                  ? readFileState
                  : mergeFileStateCaches(readFileState, pendingSeeds),
              setReadFileCache: cache => {
                readFileState = cache
                for (const [path, seed] of pendingSeeds.entries()) {
                  const existing = readFileState.get(path)
                  if (!existing || seed.timestamp > existing.timestamp) {
                    readFileState.set(path, seed)
                  }
                }
                pendingSeeds.clear()
              },
              customSystemPrompt: options.systemPrompt,
              appendSystemPrompt: options.appendSystemPrompt,
              getAppState,
              setAppState,
              abortController,
              replayUserMessages: options.replayUserMessages,
              includePartialMessages: options.includePartialMessages,
              handleElicitation: (serverName, params, elicitSignal) =>
                structuredIO.handleElicitation(
                  serverName,
                  params.message,
                  undefined,
                  elicitSignal,
                  params.mode,
                  params.url,
                  'elicitationId' in params ? params.elicitationId : undefined,
                ),
              agents: currentAgents,
              orphanedPermission: cmd.orphanedPermission,
              setSDKStatus: status => {
                output.enqueue({
                  type: 'system',
                  subtype: 'status',
                  status,
                  session_id: getSessionId(),
                  uuid: randomUUID(),
                })
              },
            })) {
              // 在轮次期间（中途）将消息转发到桥接，以便 claude.ai 看到进度，
              // 并且连接在等待权限请求时保持活跃。
              forwardMessagesToBridge()

              if (message.type === 'result') {
                // 刷新挂起的 SDK 事件，以便它们先于结果出现在流中。
                for (const event of drainSdkEvents()) {
                  output.enqueue(event)
                }

                // 暂缓：当后台代理仍在运行时，不发出结果
                const currentState = getAppState()
                if (
                  getRunningTasks(currentState).some(
                    t =>
                      (t.type === 'local_agent' ||
                        t.type === 'local_workflow') &&
                      isBackgroundTask(t),
                  )
                ) {
                  heldBackResult = message
                } else {
                  heldBackResult = null
                  output.enqueue(message)
                }
              } else {
                // 刷新 SDK 事件（task_started、task_progress），
                // 以便后台代理进度实时流式传输，而不是等到结果时才批量发送。
                for (const event of drainSdkEvents()) {
                  output.enqueue(event)
                }
                output.enqueue(message)
              }
            }
          }) // runWithWorkload 结束

          for (const uuid of batchUuids) {
            notifyCommandLifecycle(uuid, 'completed')
          }

          // 在每个轮次后将消息转发到桥接
          forwardMessagesToBridge()
          bridgeHandle?.sendResult()

          if (feature('FILE_PERSISTENCE') && turnStartTime !== undefined) {
            void executeFilePersistence(
              turnStartTime,
              abortController.signal,
              result => {
                output.enqueue({
                  type: 'system' as const,
                  subtype: 'files_persisted' as const,
                  files: result.files,
                  failed: result.failed,
                  processed_at: new Date().toISOString(),
                  uuid: randomUUID(),
                  session_id: getSessionId(),
                })
              },
            )
          }

          // 为 SDK 消费者生成并发出提示建议
          if (
            options.promptSuggestions &&
            !isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)
          ) {
            // TS 在 while 循环体内将 suggestionState 缩小为 never；通过 unknown 强制转换以重置缩小。
            const state = suggestionState as unknown as typeof suggestionState
            state.abortController?.abort()
            const localAbort = new AbortController()
            suggestionState.abortController = localAbort

            const cacheSafeParams = getLastCacheSafeParams()
            if (!cacheSafeParams) {
              logSuggestionSuppressed(
                'sdk_no_params',
                undefined,
                undefined,
                'sdk',
              )
            } else {
              // 使用 ref 对象，以便 IIFE 的 finally 可以将其与其自身的 promise 进行比较，
              // 而无需自引用（这会干扰 TypeScript 的流分析）。
              const ref: { promise: Promise<void> | null } = { promise: null }
              ref.promise = (async () => {
                try {
                  const result = await tryGenerateSuggestion(
                    localAbort,
                    mutableMessages,
                    getAppState,
                    cacheSafeParams,
                    'sdk',
                  )
                  if (!result || localAbort.signal.aborted) return
                  const suggestionMsg = {
                    type: 'prompt_suggestion' as const,
                    suggestion: result.suggestion,
                    uuid: randomUUID(),
                    session_id: getSessionId(),
                  }
                  const lastEmittedEntry = {
                    text: result.suggestion,
                    emittedAt: Date.now(),
                    promptId: result.promptId,
                    generationRequestId: result.generationRequestId,
                  }
                  // 如果结果因后台代理而被暂缓，则延迟发送建议，
                  // 以便 prompt_suggestion 始终在结果之后到达。
                  // 仅当建议实际交付给消费者时才设置 lastEmitted；
                  // 如果在新命令先到达，延迟的建议可能在交付前被丢弃。
                  if (heldBackResult) {
                    suggestionState.pendingSuggestion = suggestionMsg
                    suggestionState.pendingLastEmittedEntry = {
                      text: lastEmittedEntry.text,
                      promptId: lastEmittedEntry.promptId,
                      generationRequestId: lastEmittedEntry.generationRequestId,
                    }
                  } else {
                    suggestionState.lastEmitted = lastEmittedEntry
                    output.enqueue(suggestionMsg)
                  }
                } catch (error) {
                  if (
                    error instanceof Error &&
                    (error.name === 'AbortError' ||
                      error.name === 'APIUserAbortError')
                  ) {
                    logSuggestionSuppressed(
                      'aborted',
                      undefined,
                      undefined,
                      'sdk',
                    )
                    return
                  }
                  logError(toError(error))
                } finally {
                  if (suggestionState.inflightPromise === ref.promise) {
                    suggestionState.inflightPromise = null
                  }
                }
              })()
              suggestionState.inflightPromise = ref.promise
            }
          }

          // 记录此轮次的无头分析器指标并开始下一个轮次
          logHeadlessProfilerTurn()
          logQueryProfileReport()
          headlessProfilerStartTurn()
        }
      }

      // 使用 do-while 循环排空命令，然后等待仍在运行的后台代理。
      // 当代理完成时，它们的通知被入队，循环重新排空。
      do {
        // 在命令队列之前排空 SDK 事件（task_started、task_progress），
        // 以便进度事件先于 task_notification 出现在流中。
        for (const event of drainSdkEvents()) {
          output.enqueue(event)
        }

        runPhase = 'draining_commands'
        await drainCommandQueue()

        // 在退出前检查运行中的后台任务。
        // 排除 in_process_teammate —— 队友设计上是长期存在的
        //（状态为 'running' 贯穿其整个生命周期，由关闭协议清理，而不是通过转换为 'completed'）。
        // 在此等待它们会导致无限循环（gh-30008）。
        // 同样的排除在 useBackgroundTaskNavigation.ts:55 中已存在，原因相同；
        // 上面的 L1839 已经更窄（type === 'local_agent'），因此不会触及此情况。
        waitingForAgents = false
        {
          const state = getAppState()
          const hasRunningBg = getRunningTasks(state).some(
            t => isBackgroundTask(t) && t.type !== 'in_process_teammate',
          )
          const hasMainThreadQueued = peek(isMainThread) !== undefined
          if (hasRunningBg || hasMainThreadQueued) {
            waitingForAgents = true
            if (!hasMainThreadQueued) {
              runPhase = 'waiting_for_agents'
              // 尚无准备好的命令，等待任务完成
              await sleep(100)
            }
            // 循环返回以排空任何新入队的命令
          }
        }
      } while (waitingForAgents)

      if (heldBackResult) {
        output.enqueue(heldBackResult)
        heldBackResult = null
        if (suggestionState.pendingSuggestion) {
          output.enqueue(suggestionState.pendingSuggestion)
          // 现在建议已实际交付，记录它以进行接受跟踪
          if (suggestionState.pendingLastEmittedEntry) {
            suggestionState.lastEmitted = {
              ...suggestionState.pendingLastEmittedEntry,
              emittedAt: Date.now(),
            }
            suggestionState.pendingLastEmittedEntry = null
          }
          suggestionState.pendingSuggestion = null
        }
      }
    } catch (error) {
      // 在关闭之前发出错误结果消息
      // 直接写入 structuredIO 以确保立即交付
      try {
        await structuredIO.write({
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: true,
          num_turns: 0,
          stop_reason: null,
          session_id: getSessionId(),
          total_cost_usd: 0,
          usage: EMPTY_USAGE,
          modelUsage: {},
          permission_denials: [],
          uuid: randomUUID(),
          errors: [
            errorMessage(error),
            ...getInMemoryErrors().map(_ => _.error),
          ],
        })
      } catch {
        // 如果无法发出错误结果，仍继续关闭
      }
      suggestionState.abortController?.abort()
      gracefulShutdownSync(1)
      return
    } finally {
      runPhase = 'finally_flush'
      // 在进入空闲之前刷新挂起的内部事件
      await structuredIO.flushInternalEvents()
      runPhase = 'finally_post_flush'
      if (!isShuttingDown()) {
        notifySessionStateChanged('idle')
        // 排空，以便 idle session_state_changed SDK 事件（以及后台代理销毁期间发出的任何终端 task_notification 书签）
        // 在我们阻塞等待下一个命令之前到达输出流。
        // 上面的 do-while 排空仅在 waitingForAgents 时运行；
        // 一旦我们到达这里，下一个排空将在下一个 run() 的顶部进行，如果输入空闲则不会到来。
        for (const event of drainSdkEvents()) {
          output.enqueue(event)
        }
      }
      running = false
      // 当我们完成处理并等待输入时启动空闲计时器
      idleTimeout.start()
    }

    // 主动轮询：如果主动模式处于活动状态且队列为空，则注入一次轮询
    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule?.isProactiveActive() &&
      !proactiveModule.isProactivePaused()
    ) {
      if (peek(isMainThread) === undefined && !inputClosed) {
        scheduleProactiveTick!()
        return
      }
    }

    // 释放互斥锁后重新检查队列。在上面的最后一个 dequeue() 返回 undefined 和
    // `running = false` 之间，可能有一条消息到达（并调用了 run()）。
    // 在这种情况下，调用者看到 `running === true` 并立即返回，导致消息滞留在队列中无人处理。
    if (peek(isMainThread) !== undefined) {
      void run()
      return
    }

    // 检查未读的队友消息并处理它们
    // 这镜像了交互式 REPL 模式中 useInboxPoller 的行为
    // 一直轮询直到没有更多消息（队友可能仍在工作）
    {
      const currentAppState = getAppState()
      const teamContext = currentAppState.teamContext

      if (teamContext && isTeamLead(teamContext)) {
        const agentName = 'team-lead'

        // 在队友活跃时轮询消息
        // 这是必需的，因为队友可能在我们等待时发送消息
        // 一直轮询直到团队关闭
        const POLL_INTERVAL_MS = 500

        while (true) {
          // 检查队友是否仍然活跃
          const refreshedState = getAppState()
          const hasActiveTeammates =
            hasActiveInProcessTeammates(refreshedState) ||
            (refreshedState.teamContext &&
              Object.keys(refreshedState.teamContext.teammates).length > 0)

          if (!hasActiveTeammates) {
            logForDebugging(
              '[print.ts] 没有更多活跃队友，停止轮询',
            )
            break
          }

          const unread = await readUnreadMessages(
            agentName,
            refreshedState.teamContext?.teamName,
          )

          if (unread.length > 0) {
            logForDebugging(
              `[print.ts] 队长找到 ${unread.length} 条未读消息`,
            )

            // 立即标记为已读以避免重复处理
            await markMessagesAsRead(
              agentName,
              refreshedState.teamContext?.teamName,
            )

            // 处理 shutdown_approved 消息 - 从团队文件中移除队友
            // 这镜像了 useInboxPoller 在交互模式下的行为（第 546-606 行）
            const teamName = refreshedState.teamContext?.teamName
            for (const m of unread) {
              const shutdownApproval = isShutdownApproved(m.text)
              if (shutdownApproval && teamName) {
                const teammateToRemove = shutdownApproval.from
                logForDebugging(
                  `[print.ts] 正在处理来自 ${teammateToRemove} 的 shutdown_approved`,
                )

                // 按名称查找队友 ID
                const teammateId = refreshedState.teamContext?.teammates
                  ? Object.entries(refreshedState.teamContext.teammates).find(
                      ([, t]) => t.name === teammateToRemove,
                    )?.[0]
                  : undefined

                if (teammateId) {
                  // 从团队文件中移除
                  removeTeammateFromTeamFile(teamName, {
                    agentId: teammateId,
                    name: teammateToRemove,
                  })
                  logForDebugging(
                    `[print.ts] 已将 ${teammateToRemove} 从团队文件中移除`,
                  )

                  // 取消分配该队友拥有的任务
                  await unassignTeammateTasks(
                    teamName,
                    teammateId,
                    teammateToRemove,
                    'shutdown',
                  )

                  // 从 AppState 的 teamContext 中移除
                  setAppState(prev => {
                    if (!prev.teamContext?.teammates) return prev
                    if (!(teammateId in prev.teamContext.teammates)) return prev
                    const { [teammateId]: _, ...remainingTeammates } =
                      prev.teamContext.teammates
                    return {
                      ...prev,
                      teamContext: {
                        ...prev.teamContext,
                        teammates: remainingTeammates,
                      },
                    }
                  })
                }
              }
            }

            // 格式化消息，与 useInboxPoller 相同
            const formatted = unread
              .map(
                (m: { from: string; text: string; color?: string }) =>
                  `<${TEAMMATE_MESSAGE_TAG} teammate_id="${m.from}"${m.color ? ` color="${m.color}"` : ''}>\n${m.text}\n</${TEAMMATE_MESSAGE_TAG}>`,
              )
              .join('\n\n')

            // 入队并处理
            enqueue({
              mode: 'prompt',
              value: formatted,
              uuid: randomUUID(),
            })
            void run()
            return // run() 在处理后会回到这里
          }

          // 没有消息 - 检查是否需要提示关闭
          // 如果输入已关闭且队友活跃，则注入一次关闭提示
          if (inputClosed && !shutdownPromptInjected) {
            shutdownPromptInjected = true
            logForDebugging(
              '[print.ts] 输入已关闭且有活跃队友，注入关闭提示',
            )
            enqueue({
              mode: 'prompt',
              value: SHUTDOWN_TEAM_PROMPT,
              uuid: randomUUID(),
            })
            void run()
            return // run() 在处理后会回到这里
          }

          // 等待并再次检查
          await sleep(POLL_INTERVAL_MS)
        }
      }
    }

    if (inputClosed) {
      // 检查需要关闭的活动 Swarm
      const hasActiveSwarm = await (async () => {
        // 等待任何工作中的进程内团队成员完成
        const currentAppState = getAppState()
        if (hasWorkingInProcessTeammates(currentAppState)) {
          await waitForTeammatesToBecomeIdle(setAppState, currentAppState)
        }

        // 在可能的等待后重新获取状态
        const refreshedAppState = getAppState()
        const refreshedTeamContext = refreshedAppState.teamContext
        const hasTeamMembersNotCleanedUp =
          refreshedTeamContext &&
          Object.keys(refreshedTeamContext.teammates).length > 0

        return (
          hasTeamMembersNotCleanedUp ||
          hasActiveInProcessTeammates(refreshedAppState)
        )
      })()

      if (hasActiveSwarm) {
        // 团队成员空闲或基于窗格 - 注入提示以关闭团队
        enqueue({
          mode: 'prompt',
          value: SHUTDOWN_TEAM_PROMPT,
          uuid: randomUUID(),
        })
        void run()
      } else {
        // 在关闭输出流之前等待任何进行中的推送建议。
        if (suggestionState.inflightPromise) {
          await Promise.race([suggestionState.inflightPromise, sleep(5000)])
        }
        suggestionState.abortController?.abort()
        suggestionState.abortController = null
        await finalizePendingAsyncHooks()
        unsubscribeSkillChanges()
        unsubscribeAuthStatus?.()
        statusListeners.delete(rateLimitListener)
        output.done()
      }
    }
  }

  // 设置 UDS 收件箱回调，以便在无头模式下通过 UDS 套接字到达消息时启动查询循环。
  if (feature('UDS_INBOX')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { setOnEnqueue } = require('../utils/udsMessaging.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    setOnEnqueue(() => {
      if (!inputClosed) {
        void run()
      }
    })
  }

  // Cron 调度器：在 SDK/-p 模式下运行 scheduled_tasks.json 任务。
  // 镜像 REPL 的 useScheduledTasks 钩子。触发的提示入队并直接启动 run() ——
  // 与 REPL 不同，这里没有在空闲时排空入队内容的队列订阅者。
  // run() 互斥锁使这在活动轮次期间安全：调用会无操作，并且 run() 末尾的 post-run 重新检查会拾取入队的命令。
  let cronScheduler: import('../utils/cronScheduler.js').CronScheduler | null =
    null
  if (
    feature('AGENT_TRIGGERS') &&
    cronSchedulerModule &&
    cronGate?.isKairosCronEnabled()
  ) {
    cronScheduler = cronSchedulerModule.createCronScheduler({
      onFire: prompt => {
        if (inputClosed) return
        enqueue({
          mode: 'prompt',
          value: prompt,
          uuid: randomUUID(),
          priority: 'later',
          // 系统生成 —— 匹配 useScheduledTasks.ts 的 REPL 等效项。
          // 没有这个，messages.ts 的 metaProp 评估为 {} → 当 cron 在 -p 模式下的轮次中途触发时，提示会泄露到可见转录中。
          isMeta: true,
          // 线程化到计费头属性块中的 cc_workload=，以便 API 可以以较低的 QoS 服务 cron 请求。
          // drainCommandQueue 在每次迭代时读取此值，并将其提升到 ask() 调用的引导状态中。
          workload: WORKLOAD_CRON,
        })
        void run()
      },
      isLoading: () => running || inputClosed,
      getJitterConfig: cronJitterConfigModule?.getCronJitterConfig,
      isKilled: () => !cronGate?.isKairosCronEnabled(),
    })
    cronScheduler.start()
  }

  const sendControlResponseSuccess = function (
    message: SDKControlRequest,
    response?: Record<string, unknown>,
  ) {
    output.enqueue({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: message.request_id,
        response: response,
      },
    })
  }

  const sendControlResponseError = function (
    message: SDKControlRequest,
    errorMessage: string,
  ) {
    output.enqueue({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: message.request_id,
        error: errorMessage,
      },
    })
  }

  // 通过查找转录中未解决的工具调用来处理意外的权限响应，并执行它
  const handledOrphanedToolUseIds = new Set<string>()
  structuredIO.setUnexpectedResponseCallback(async message => {
    await handleOrphanedPermissionResponse({
      message,
      setAppState,
      handledToolUseIds: handledOrphanedToolUseIds,
      onEnqueued: () => {
        // 会话的第一条消息可能是孤立的权限检查而不是用户提示，因此启动循环。
        void run()
      },
    })
  })

  // 跟踪每个服务器的活跃 OAuth 流程，以便在针对同一服务器的新 mcp_authenticate 请求到达时中止之前的流程。
  const activeOAuthFlows = new Map<string, AbortController>()
  // 为活跃的 OAuth 流程跟踪手动回调 URL 提交函数。
  // 当 localhost 无法访问时（例如，基于浏览器的 IDE）使用。
  const oauthCallbackSubmitters = new Map<
    string,
    (callbackUrl: string) => void
  >()
  // 跟踪实际调用了手动回调的服务器（以便自动重连路径知道跳过 —— 扩展程序将处理重连）。
  const oauthManualCallbackUsed = new Set<string>()
  // 跟踪仅认证的 OAuth promise，以便 mcp_oauth_callback_url 可以等待令牌交换完成。
  // 重连由扩展程序通过 handleAuthDone → mcp_reconnect 单独处理。
  const oauthAuthPromises = new Map<string, Promise<void>>()

  // 进行中的 Anthropic OAuth 流程（claude_authenticate）。单槽：第二个 authenticate 请求会清理第一个。
  // 服务持有 PKCE 验证器 + localhost 监听器；promise 在 installOAuthTokens 后完成 —— 解析后，
  // 进程内的记忆化令牌缓存已清除，下一次 API 调用将获取新的凭据。
  let claudeOAuth: {
    service: OAuthService
    flow: Promise<void>
  } | null = null

  // 这本质上是生成一个并行的异步任务——我们有两个并行运行的任务：
  // 一个从 stdin 读取并添加到队列以进行处理，另一个从队列读取、处理并返回生成结果。
  // 当输入流完成且队列中的最后一次生成完成时，进程结束。
  void (async () => {
    let initialized = false
    logForDiagnosticsNoPII('info', 'cli_message_loop_started')
    for await (const message of structuredIO.structuredInput) {
      // 非用户事件被内联处理（不入队）。在同一次 tick 中从 started 到 completed 不携带信息，因此仅触发 completed。
      // control_response 由 StructuredIO.processLine 报告（它也会看到从未在此处产生的孤立响应）。
      const eventId = 'uuid' in message ? message.uuid : undefined
      if (
        eventId &&
        message.type !== 'user' &&
        message.type !== 'control_response'
      ) {
        notifyCommandLifecycle(eventId, 'completed')
      }

      if (message.type === 'control_request') {
        if (message.request.subtype === 'interrupt') {
          // 跟踪逃逸以进行归因（仅 ant 功能）
          if (feature('COMMIT_ATTRIBUTION')) {
            setAppState(prev => ({
              ...prev,
              attribution: {
                ...prev.attribution,
                escapeCount: prev.attribution.escapeCount + 1,
              },
            }))
          }
          if (abortController) {
            abortController.abort()
          }
          suggestionState.abortController?.abort()
          suggestionState.abortController = null
          suggestionState.lastEmitted = null
          suggestionState.pendingSuggestion = null
          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'end_session') {
          logForDebugging(
            `[print.ts] 收到 end_session，原因=${message.request.reason ?? '未指定'}`,
          )
          if (abortController) {
            abortController.abort()
          }
          suggestionState.abortController?.abort()
          suggestionState.abortController = null
          suggestionState.lastEmitted = null
          suggestionState.pendingSuggestion = null
          sendControlResponseSuccess(message)
          break // 退出 for-await → 进入下面的 inputClosed=true 排空逻辑
        } else if (message.request.subtype === 'initialize') {
          // 来自 initialize 消息的 SDK MCP 服务器名称
          // 由浏览器和 ProcessTransport 会话填充
          if (
            message.request.sdkMcpServers &&
            message.request.sdkMcpServers.length > 0
          ) {
            for (const serverName of message.request.sdkMcpServers) {
              // 为 SDK MCP 服务器创建占位符配置
              // 实际的服务器连接由 SDK Query 类管理
              sdkMcpConfigs[serverName] = {
                type: 'sdk',
                name: serverName,
              }
            }
          }

          await handleInitializeRequest(
            message.request,
            message.request_id,
            initialized,
            output,
            commands,
            modelInfos,
            structuredIO,
            !!options.enableAuthStatus,
            options,
            agents,
            getAppState,
          )

          // 当 SDK 消费者选择加入时，在 AppState 中启用提示建议。
          // shouldEnablePromptSuggestion() 对非交互式会话返回 false，
          // 但 SDK 消费者明确请求了建议。
          if (message.request.promptSuggestions) {
            setAppState(prev => {
              if (prev.promptSuggestionEnabled) return prev
              return { ...prev, promptSuggestionEnabled: true }
            })
          }

          if (
            message.request.agentProgressSummaries &&
            getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_prism', true)
          ) {
            setSdkAgentProgressSummariesEnabled(true)
          }

          initialized = true

          // 如果自动恢复逻辑预先入队了一个命令，现在在 initialize 设置了 systemPrompt、agents、hooks 等之后将其排空。
          if (hasCommandsInQueue()) {
            void run()
          }
        } else if (message.request.subtype === 'set_permission_mode') {
          const m = message.request // 供 TypeScript 使用（TODO：使用只读类型以避免此操作）
          setAppState(prev => ({
            ...prev,
            toolPermissionContext: handleSetPermissionMode(
              m,
              message.request_id,
              prev.toolPermissionContext,
              output,
            ),
            isUltraplanMode: m.ultraplan ?? prev.isUltraplanMode,
          }))
          // handleSetPermissionMode 发送 control_response；
          // 之前跟随的 notifySessionMetadataChanged 现在由 onChangeAppState 触发（使用外部化的模式名称）。
        } else if (message.request.subtype === 'set_model') {
          const requestedModel = message.request.model ?? 'default'
          const model =
            requestedModel === 'default'
              ? getDefaultMainLoopModel()
              : requestedModel
          activeUserSpecifiedModel = model
          setMainLoopModelOverride(model)
          notifySessionMetadataChanged({ model })
          injectModelSwitchBreadcrumbs(requestedModel, model)

          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'set_max_thinking_tokens') {
          if (message.request.max_thinking_tokens === null) {
            options.thinkingConfig = undefined
          } else if (message.request.max_thinking_tokens === 0) {
            options.thinkingConfig = { type: 'disabled' }
          } else {
            options.thinkingConfig = {
              type: 'enabled',
              budgetTokens: message.request.max_thinking_tokens,
            }
          }
          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'mcp_status') {
          sendControlResponseSuccess(message, {
            mcpServers: buildMcpServerStatuses(),
          })
        } else if (message.request.subtype === 'get_context_usage') {
          try {
            const appState = getAppState()
            const data = await collectContextData({
              messages: mutableMessages,
              getAppState,
              options: {
                mainLoopModel: getMainLoopModel(),
                tools: buildAllTools(appState),
                agentDefinitions: appState.agentDefinitions,
                customSystemPrompt: options.systemPrompt,
                appendSystemPrompt: options.appendSystemPrompt,
              },
            })
            sendControlResponseSuccess(message, { ...data })
          } catch (error) {
            sendControlResponseError(message, errorMessage(error))
          }
        } else if (message.request.subtype === 'mcp_message') {
          // 处理来自 SDK 服务器的 MCP 通知
          const mcpRequest = message.request
          const sdkClient = sdkClients.find(
            client => client.name === mcpRequest.server_name,
          )
          // 检查客户端是否存在 —— 动态添加的 SDK 服务器可能在 updateSdkMcp() 运行之前只有带有 null client 的占位符客户端
          if (
            sdkClient &&
            sdkClient.type === 'connected' &&
            sdkClient.client?.transport?.onmessage
          ) {
            sdkClient.client.transport.onmessage(mcpRequest.message)
          }
          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'rewind_files') {
          const appState = getAppState()
          const result = await handleRewindFiles(
            message.request.user_message_id as UUID,
            appState,
            setAppState,
            message.request.dry_run ?? false,
          )
          if (result.canRewind || message.request.dry_run) {
            sendControlResponseSuccess(message, result)
          } else {
            sendControlResponseError(
              message,
              result.error ?? '意外错误',
            )
          }
        } else if (message.request.subtype === 'cancel_async_message') {
          const targetUuid = message.request.message_uuid
          const removed = dequeueAllMatching(cmd => cmd.uuid === targetUuid)
          sendControlResponseSuccess(message, {
            cancelled: removed.length > 0,
          })
        } else if (message.request.subtype === 'seed_read_state') {
          // 客户端观察到的读取后来从上下文中移除（例如通过 snip），因此基于转录的播种遗漏了它。
          // 排入 pendingSeeds；在下一个克隆-替换边界应用。
          try {
            // expandPath：所有其他 readFileState 写入者都进行标准化（~、相对路径、会话 cwd vs 进程 cwd）。
            // FileEditTool 通过 expandPath 的键进行查找 —— 原样的客户端路径会错过。
            const normalizedPath = expandPath(message.request.path)
            // 在读取内容之前检查磁盘 mtime。如果文件在客户端观察后发生了变化，
            // readFile 会返回 C_current，但我们会将其与客户端的 M_observed 一起存储
            // —— getChangedFiles 随后看到 磁盘 > cache.timestamp，重新读取，比较 C_current 与 C_current = 空，不发出附件，
            // 并且模型永远不会被告知 C_observed → C_current 的变化。跳过种子会使编辑失败“文件尚未读取” → 强制进行新的读取。
            // Math.floor 匹配 FileReadTool 和 getFileModificationTime。
            const diskMtime = Math.floor((await stat(normalizedPath)).mtimeMs)
            if (diskMtime <= message.request.mtime) {
              const raw = await readFile(normalizedPath, 'utf-8')
              // 去除 BOM + 将 CRLF 标准化为 LF，以匹配 readFileInRange 和 readFileSyncWithMetadata。
              // FileEditTool 的内容比较回退（针对 Windows 上无内容更改但 mtime 变更的情况）
              // 与 LF 标准化的磁盘读取进行比较。
              const content = (
                raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
              ).replaceAll('\r\n', '\n')
              pendingSeeds.set(normalizedPath, {
                content,
                timestamp: diskMtime,
                offset: undefined,
                limit: undefined,
              })
            }
          } catch {
            // ENOENT 等 —— 跳过播种但仍视为成功
          }
          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'mcp_set_servers') {
          const { response, sdkServersChanged } = await applyMcpServerChanges(
            message.request.servers,
          )
          sendControlResponseSuccess(message, response)

          // 在响应之后连接 SDK 服务器以避免死锁
          if (sdkServersChanged) {
            void updateSdkMcp()
          }
        } else if (message.request.subtype === 'reload_plugins') {
          try {
            if (
              feature('DOWNLOAD_USER_SETTINGS') &&
              (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) || getIsRemoteMode())
            ) {
              // 重新拉取用户设置，以便从用户本地 CLI 推送的 enabledPlugins 在缓存清理之前生效。
              const applied = await redownloadUserSettings()
              if (applied) {
                settingsChangeDetector.notifyChange('userSettings')
              }
            }

            const r = await refreshActivePlugins(setAppState)

            const sdkAgents = currentAgents.filter(
              a => a.source === 'flagSettings',
            )
            currentAgents = [...r.agentDefinitions.allAgents, ...sdkAgents]

            // 重载成功 —— 尽力收集响应数据，以便读取失败不会掩盖成功的状态更改。
            // 使用 allSettled，这样一次失败不会丢弃其他结果。
            let plugins: SDKControlReloadPluginsResponse['plugins'] = []
            const [cmdsR, mcpR, pluginsR] = await Promise.allSettled([
              getCommands(cwd()),
              applyPluginMcpDiff(),
              loadAllPluginsCacheOnly(),
            ])
            if (cmdsR.status === 'fulfilled') {
              currentCommands = cmdsR.value
            } else {
              logError(cmdsR.reason)
            }
            if (mcpR.status === 'rejected') {
              logError(mcpR.reason)
            }
            if (pluginsR.status === 'fulfilled') {
              plugins = pluginsR.value.enabled.map(p => ({
                name: p.name,
                path: p.path,
                source: p.source,
              }))
            } else {
              logError(pluginsR.reason)
            }

            sendControlResponseSuccess(message, {
              commands: currentCommands
                .filter(cmd => cmd.userInvocable !== false)
                .map(cmd => ({
                  name: getCommandName(cmd),
                  description: formatDescriptionWithSource(cmd),
                  argumentHint: cmd.argumentHint || '',
                })),
              agents: currentAgents.map(a => ({
                name: a.agentType,
                description: a.whenToUse,
                model: a.model === 'inherit' ? undefined : a.model,
              })),
              plugins,
              mcpServers: buildMcpServerStatuses(),
              error_count: r.error_count,
            } satisfies SDKControlReloadPluginsResponse)
          } catch (error) {
            sendControlResponseError(message, errorMessage(error))
          }
        } else if (message.request.subtype === 'mcp_reconnect') {
          const currentAppState = getAppState()
          const { serverName } = message.request
          elicitationRegistered.delete(serverName)
          // 配置存在性检查必须覆盖与下面操作相同的来源。
          // SDK 注入的服务器（query({mcpServers:{...}})）和动态添加的服务器在此处缺失，
          // 因此 toggleMcpServer/reconnect 返回“找不到服务器”，即使断开/重连操作本可以成功（gh-31339 / CC-314）。
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            sdkClients.find(c => c.name === serverName)?.config ??
            dynamicMcpState.clients.find(c => c.name === serverName)?.config ??
            currentAppState.mcp.clients.find(c => c.name === serverName)
              ?.config ??
            null
          if (!config) {
            sendControlResponseError(message, `找不到服务器: ${serverName}`)
          } else {
            const result = await reconnectMcpServerImpl(serverName, config)
            // 使用新的客户端、工具、命令和资源更新 appState.mcp
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName ? result.client : c,
                ),
                tools: [
                  ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                  ...result.tools,
                ],
                commands: [
                  ...reject(prev.mcp.commands, c =>
                    commandBelongsToServer(c, serverName),
                  ),
                  ...result.commands,
                ],
                resources:
                  result.resources && result.resources.length > 0
                    ? { ...prev.mcp.resources, [serverName]: result.resources }
                    : omit(prev.mcp.resources, serverName),
              },
            }))
            // 同时更新 dynamicMcpState，以便 run() 在下一个轮次中获取新工具（run() 读取 dynamicMcpState，而不是 appState）
            dynamicMcpState = {
              ...dynamicMcpState,
              clients: [
                ...dynamicMcpState.clients.filter(c => c.name !== serverName),
                result.client,
              ],
              tools: [
                ...dynamicMcpState.tools.filter(
                  t => !t.name?.startsWith(prefix),
                ),
                ...result.tools,
              ],
            }
            if (result.client.type === 'connected') {
              registerElicitationHandlers([result.client])
              reregisterChannelHandlerAfterReconnect(result.client)
              sendControlResponseSuccess(message)
            } else {
              const errorMessage =
                result.client.type === 'failed'
                  ? (result.client.error ?? '连接失败')
                  : `服务器状态: ${result.client.type}`
              sendControlResponseError(message, errorMessage)
            }
          }
        } else if (message.request.subtype === 'mcp_toggle') {
          const currentAppState = getAppState()
          const { serverName, enabled } = message.request
          elicitationRegistered.delete(serverName)
          // 门控必须匹配下面的客户端查找分布（包括 sdkClients 和 dynamicMcpState.clients）。
          // 与上面 mcp_reconnect 的修复相同（gh-31339 / CC-314）。
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            sdkClients.find(c => c.name === serverName)?.config ??
            dynamicMcpState.clients.find(c => c.name === serverName)?.config ??
            currentAppState.mcp.clients.find(c => c.name === serverName)
              ?.config ??
            null

          if (!config) {
            sendControlResponseError(message, `找不到服务器: ${serverName}`)
          } else if (!enabled) {
            // 禁用：持久化 + 断开连接（匹配 TUI toggleMcpServer 行为）
            setMcpServerEnabled(serverName, false)
            const client = [
              ...mcpClients,
              ...sdkClients,
              ...dynamicMcpState.clients,
              ...currentAppState.mcp.clients,
            ].find(c => c.name === serverName)
            if (client && client.type === 'connected') {
              await clearServerCache(serverName, config)
            }
            // 更新 appState.mcp 以反映禁用状态并移除工具/命令/资源
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName
                    ? { name: serverName, type: 'disabled' as const, config }
                    : c,
                ),
                tools: reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                commands: reject(prev.mcp.commands, c =>
                  commandBelongsToServer(c, serverName),
                ),
                resources: omit(prev.mcp.resources, serverName),
              },
            }))
            sendControlResponseSuccess(message)
          } else {
            // 启用：持久化 + 重连
            setMcpServerEnabled(serverName, true)
            const result = await reconnectMcpServerImpl(serverName, config)
            // 使用新的客户端、工具、命令和资源更新 appState.mcp
            // 这确保 LLM 在启用服务器后能看到更新的工具
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName ? result.client : c,
                ),
                tools: [
                  ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                  ...result.tools,
                ],
                commands: [
                  ...reject(prev.mcp.commands, c =>
                    commandBelongsToServer(c, serverName),
                  ),
                  ...result.commands,
                ],
                resources:
                  result.resources && result.resources.length > 0
                    ? { ...prev.mcp.resources, [serverName]: result.resources }
                    : omit(prev.mcp.resources, serverName),
              },
            }))
            if (result.client.type === 'connected') {
              registerElicitationHandlers([result.client])
              reregisterChannelHandlerAfterReconnect(result.client)
              sendControlResponseSuccess(message)
            } else {
              const errorMessage =
                result.client.type === 'failed'
                  ? (result.client.error ?? '连接失败')
                  : `服务器状态: ${result.client.type}`
              sendControlResponseError(message, errorMessage)
            }
          }
        } else if (message.request.subtype === 'channel_enable') {
          const currentAppState = getAppState()
          handleChannelEnable(
            message.request_id,
            message.request.serverName,
            // 池分布匹配 mcp_status —— 所有三个客户端来源。
            [
              ...currentAppState.mcp.clients,
              ...sdkClients,
              ...dynamicMcpState.clients,
            ],
            output,
          )
        } else if (message.request.subtype === 'mcp_authenticate') {
          const { serverName } = message.request
          const currentAppState = getAppState()
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            currentAppState.mcp.clients.find(c => c.name === serverName)
              ?.config ??
            null
          if (!config) {
            sendControlResponseError(message, `找不到服务器: ${serverName}`)
          } else if (config.type !== 'sse' && config.type !== 'http') {
            sendControlResponseError(
              message,
              `服务器类型 "${config.type}" 不支持 OAuth 认证`,
            )
          } else {
            try {
              // 中止该服务器之前任何进行中的 OAuth 流程
              activeOAuthFlows.get(serverName)?.abort()
              const controller = new AbortController()
              activeOAuthFlows.set(serverName, controller)

              // 从回调中捕获认证 URL
              let resolveAuthUrl: (url: string) => void
              const authUrlPromise = new Promise<string>(resolve => {
                resolveAuthUrl = resolve
              })

              // 在后台启动 OAuth 流程
              const oauthPromise = performMCPOAuthFlow(
                serverName,
                config,
                url => resolveAuthUrl!(url),
                controller.signal,
                {
                  skipBrowserOpen: true,
                  onWaitingForCallback: submit => {
                    oauthCallbackSubmitters.set(serverName, submit)
                  },
                },
              )

              // 等待认证 URL（或者流程完成而不需要重定向）
              const authUrl = await Promise.race([
                authUrlPromise,
                oauthPromise.then(() => null as string | null),
              ])

              if (authUrl) {
                sendControlResponseSuccess(message, {
                  authUrl,
                  requiresUserAction: true,
                })
              } else {
                sendControlResponseSuccess(message, {
                  requiresUserAction: false,
                })
              }

              // 为 mcp_oauth_callback_url 处理程序存储仅认证的 promise。
              // 不要吞掉错误 —— 回调处理程序需要检测认证失败并向调用者报告。
              oauthAuthPromises.set(serverName, oauthPromise)

              // 处理后台上完成 —— 认证后重连。
              // 当使用手动回调时，跳过此处的重连；扩展程序的 handleAuthDone → mcp_reconnect 会处理它
              //（它还会更新 dynamicMcpState 以进行工具注册）。
              const fullFlowPromise = oauthPromise
                .then(async () => {
                  // 如果在 OAuth 流程期间服务器被禁用，则不重连
                  if (isMcpServerDisabled(serverName)) {
                    return
                  }
                  // 如果使用了手动回调路径，则跳过重连 ——
                  // handleAuthDone 将通过 mcp_reconnect 执行（它会更新 dynamicMcpState 以进行工具注册）。
                  if (oauthManualCallbackUsed.has(serverName)) {
                    return
                  }
                  // 认证成功后重连服务器
                  const result = await reconnectMcpServerImpl(
                    serverName,
                    config,
                  )
                  const prefix = getMcpPrefix(serverName)
                  setAppState(prev => ({
                    ...prev,
                    mcp: {
                      ...prev.mcp,
                      clients: prev.mcp.clients.map(c =>
                        c.name === serverName ? result.client : c,
                      ),
                      tools: [
                        ...reject(prev.mcp.tools, t =>
                          t.name?.startsWith(prefix),
                        ),
                        ...result.tools,
                      ],
                      commands: [
                        ...reject(prev.mcp.commands, c =>
                          commandBelongsToServer(c, serverName),
                        ),
                        ...result.commands,
                      ],
                      resources:
                        result.resources && result.resources.length > 0
                          ? {
                              ...prev.mcp.resources,
                              [serverName]: result.resources,
                            }
                          : omit(prev.mcp.resources, serverName),
                    },
                  }))
                  // 同时更新 dynamicMcpState，以便 run() 在下一个轮次中获取新工具（run() 读取 dynamicMcpState，而不是 appState）
                  dynamicMcpState = {
                    ...dynamicMcpState,
                    clients: [
                      ...dynamicMcpState.clients.filter(
                        c => c.name !== serverName,
                      ),
                      result.client,
                    ],
                    tools: [
                      ...dynamicMcpState.tools.filter(
                        t => !t.name?.startsWith(prefix),
                      ),
                      ...result.tools,
                    ],
                  }
                })
                .catch(error => {
                  logForDebugging(
                    `MCP OAuth 对 ${serverName} 失败: ${error}`,
                    { level: 'error' },
                  )
                })
                .finally(() => {
                  // 仅当这仍是活跃流程时才清理
                  if (activeOAuthFlows.get(serverName) === controller) {
                    activeOAuthFlows.delete(serverName)
                    oauthCallbackSubmitters.delete(serverName)
                    oauthManualCallbackUsed.delete(serverName)
                    oauthAuthPromises.delete(serverName)
                  }
                })
              void fullFlowPromise
            } catch (error) {
              sendControlResponseError(message, errorMessage(error))
            }
          }
        } else if (message.request.subtype === 'mcp_oauth_callback_url') {
          const { serverName, callbackUrl } = message.request
          const submit = oauthCallbackSubmitters.get(serverName)
          if (submit) {
            // 在提交前验证回调 URL。auth.ts 中的提交回调会静默忽略缺少 code 参数的 URL，
            // 这将使认证 promise 处于未解决状态，并阻塞控制消息循环直到超时。
            let hasCodeOrError = false
            try {
              const parsed = new URL(callbackUrl)
              hasCodeOrError =
                parsed.searchParams.has('code') ||
                parsed.searchParams.has('error')
            } catch {
              // 无效的 URL
            }
            if (!hasCodeOrError) {
              sendControlResponseError(
                message,
                '无效的回调 URL：缺少授权码。请粘贴包含 code 参数的完整重定向 URL。',
              )
            } else {
              oauthManualCallbackUsed.add(serverName)
              submit(callbackUrl)
              // 在响应之前等待认证（令牌交换）完成。
              // 重连由扩展程序通过 handleAuthDone → mcp_reconnect 处理（它会更新 dynamicMcpState 以进行工具注册）。
              const authPromise = oauthAuthPromises.get(serverName)
              if (authPromise) {
                try {
                  await authPromise
                  sendControlResponseSuccess(message)
                } catch (error) {
                  sendControlResponseError(
                    message,
                    error instanceof Error
                      ? error.message
                      : 'OAuth 认证失败',
                  )
                }
              } else {
                sendControlResponseSuccess(message)
              }
            }
          } else {
            sendControlResponseError(
              message,
              `OAuth 认证流程未激活：${serverName}`,
            )
          }
        } else if (message.request.subtype === 'claude_authenticate') {
          // 通过控制通道进行 Anthropic OAuth。SDK 客户端拥有用户的浏览器（我们在 -p 模式下是无头的）；
          // 我们交回两个 URL 并等待。自动 URL → localhost 监听器捕获重定向（如果浏览器在此主机上）；
          // 手动 URL → 成功页面显示 "code#state" 供 claude_oauth_callback 使用。
          const { loginWithClaudeAi } = message.request

          // 清理任何先前的流程。cleanup() 关闭 localhost 监听器并清空手动解析器。
          // 先前的 `flow` promise 保持挂起（AuthCodeListener.close() 不会拒绝），
          // 但其对象图在服务器句柄释放后变得不可达并被 GC 回收 —— 没有文件描述符或端口被占用。
          claudeOAuth?.service.cleanup()

          logEvent('tengu_oauth_flow_start', {
            loginWithClaudeAi: loginWithClaudeAi ?? true,
          })

          const service = new OAuthService()
          let urlResolver!: (urls: {
            manualUrl: string
            automaticUrl: string
          }) => void
          const urlPromise = new Promise<{
            manualUrl: string
            automaticUrl: string
          }>(resolve => {
            urlResolver = resolve
          })

          const flow = service
            .startOAuthFlow(
              async (manualUrl, automaticUrl) => {
                // 当设置 skipBrowserOpen 时，automaticUrl 始终有定义；
                // 该签名仅对现有的单参数调用者是可选的。
                urlResolver({ manualUrl, automaticUrl: automaticUrl! })
              },
              {
                loginWithClaudeAi: loginWithClaudeAi ?? true,
                skipBrowserOpen: true,
              },
            )
            .then(async tokens => {
              // installOAuthTokens：performLogout（清除陈旧状态）→ 存储配置文件 →
              // saveOAuthTokensIfNeeded → clearOAuthTokenCache → clearAuthRelatedCaches。
              // 在此解析后，此进程中的记忆化 getClaudeAIOAuthTokens 已失效；
              // 下一次 API 调用将重新读取钥匙串/文件并正常工作。无需重生。
              await installOAuthTokens(tokens)
              logEvent('tengu_oauth_success', {
                loginWithClaudeAi: loginWithClaudeAi ?? true,
              })
            })
            .finally(() => {
              service.cleanup()
              if (claudeOAuth?.service === service) {
                claudeOAuth = null
              }
            })

          claudeOAuth = { service, flow }

          // 在等待之前附加拒绝处理程序，以便同步的 startOAuthFlow 失败不会表现为未处理的拒绝。
          // 对于手动路径，claude_oauth_callback 处理程序会重新等待 flow，并将实际错误呈现给客户端。
          void flow.catch(err =>
            logForDebugging(`claude_authenticate 流程已结束：${err}`, {
              level: 'info',
            }),
          )

          try {
            // 与 flow 竞争：如果 startOAuthFlow 在调用 authURLHandler 之前拒绝
            //（例如 AuthCodeListener.start() 因 EACCES 或 fd 耗尽而失败），
            // urlPromise 将永远挂起并阻塞 stdin 循环。flow 先解析在实践中是不可达的（它挂起在我们正在等待的相同 URL 上）。
            const { manualUrl, automaticUrl } = await Promise.race([
              urlPromise,
              flow.then(() => {
                throw new Error(
                  'OAuth 流程完成但未生成认证 URL',
                )
              }),
            ])
            sendControlResponseSuccess(message, {
              manualUrl,
              automaticUrl,
            })
          } catch (error) {
            sendControlResponseError(message, errorMessage(error))
          }
        } else if (
          message.request.subtype === 'claude_oauth_callback' ||
          message.request.subtype === 'claude_oauth_wait_for_completion'
        ) {
          if (!claudeOAuth) {
            sendControlResponseError(
              message,
              '无活跃的 claude_authenticate 流程',
            )
          } else {
            // 注入手动代码同步 —— 必须在 stdin 消息顺序中，以便后续的 claude_authenticate 在注入此代码之前不替换服务。
            if (message.request.subtype === 'claude_oauth_callback') {
              claudeOAuth.service.handleManualAuthCodeInput({
                authorizationCode: message.request.authorizationCode,
                state: message.request.state,
              })
            }
            // 分离等待 —— stdin 读取器是串行的，在此阻塞会导致 claude_oauth_wait_for_completion 死锁：
            // flow 可能只能通过未来 stdin 上的 claude_oauth_callback 来解决，而在我们停车时无法读取。
            // 捕获绑定；claudeOAuth 在 flow 自身的 .finally 中被置空。
            const { flow } = claudeOAuth
            void flow.then(
              () => {
                const accountInfo = getAccountInformation()
                sendControlResponseSuccess(message, {
                  account: {
                    email: accountInfo?.email,
                    organization: accountInfo?.organization,
                    subscriptionType: accountInfo?.subscription,
                    tokenSource: accountInfo?.tokenSource,
                    apiKeySource: accountInfo?.apiKeySource,
                    apiProvider: getAPIProvider(),
                  },
                })
              },
              (error: unknown) =>
                sendControlResponseError(message, errorMessage(error)),
            )
          }
        } else if (message.request.subtype === 'mcp_clear_auth') {
          const { serverName } = message.request
          const currentAppState = getAppState()
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            currentAppState.mcp.clients.find(c => c.name === serverName)
              ?.config ??
            null
          if (!config) {
            sendControlResponseError(message, `找不到服务器: ${serverName}`)
          } else if (config.type !== 'sse' && config.type !== 'http') {
            sendControlResponseError(
              message,
              `无法清除服务器类型 "${config.type}" 的认证信息`,
            )
          } else {
            await revokeServerTokens(serverName, config)
            const result = await reconnectMcpServerImpl(serverName, config)
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName ? result.client : c,
                ),
                tools: [
                  ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                  ...result.tools,
                ],
                commands: [
                  ...reject(prev.mcp.commands, c =>
                    commandBelongsToServer(c, serverName),
                  ),
                  ...result.commands,
                ],
                resources:
                  result.resources && result.resources.length > 0
                    ? {
                        ...prev.mcp.resources,
                        [serverName]: result.resources,
                      }
                    : omit(prev.mcp.resources, serverName),
              },
            }))
            sendControlResponseSuccess(message, {})
          }
        } else if (message.request.subtype === 'apply_flag_settings') {
          // 在应用之前对当前模型进行快照 —— 我们需要检测模型切换，以便注入面包屑并通知监听器。
          const prevModel = getMainLoopModel()

          // 将提供的设置合并到内存中的标志设置中
          const existing = getFlagSettingsInline() ?? {}
          const incoming = message.request.settings
          // 浅合并顶级键；getSettingsForSource 通过 mergeWith 处理与基于文件的标志设置的深度合并。
          // JSON 序列化会丢弃 `undefined`，因此调用者使用 `null` 来表示“清除此键”。
          // 将 null 转换为删除，以便 SettingsSchema().safeParse() 不会拒绝整个对象
          //（z.string().optional() 接受 string | undefined，不接受 null）。
          const merged = { ...existing, ...incoming }
          for (const key of Object.keys(merged)) {
            if (merged[key as keyof typeof merged] === null) {
              delete merged[key as keyof typeof merged]
            }
          }
          setFlagSettingsInline(merged)
          // 通过 notifyChange 路由，以便 fanOut() 在监听器运行之前重置设置缓存。
          // 位于 :392 的订阅者会为我们调用 applySettingsChange。
          // 在 #20625 之前，这是直接调用 applySettingsChange()，它依赖于其自身的内部重置 ——
          // 现在重置集中在 fanOut 中，直接调用会读取陈旧的缓存设置并静默丢弃更新。
          // 额外好处：通过 notifyChange 也会告知其他订阅者（loadPluginHooks、sandbox-adapter）有关更改，
          // 而之前的直接调用跳过了这一点。
          settingsChangeDetector.notifyChange('flagSettings')

          // 如果传入的设置包含模型更改，则更新覆盖，以便 getMainLoopModel() 反映它。
          // 覆盖在 getUserSpecifiedModelSetting() 中的设置级联中具有更高优先级，
          // 因此如果没有此更新，getMainLoopModel() 将返回陈旧的覆盖，模型更改将被静默忽略
          //（与 :2811 处的 set_model 匹配）。
          if ('model' in incoming) {
            if (incoming.model != null) {
              setMainLoopModelOverride(String(incoming.model))
            } else {
              setMainLoopModelOverride(undefined)
            }
          }

          // 如果模型发生了变化，注入面包屑以便模型看到对话中途的切换，并通知元数据监听器（CCR）。
          const newModel = getMainLoopModel()
          if (newModel !== prevModel) {
            activeUserSpecifiedModel = newModel
            const modelArg = incoming.model ? String(incoming.model) : 'default'
            notifySessionMetadataChanged({ model: newModel })
            injectModelSwitchBreadcrumbs(modelArg, newModel)
          }

          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'get_settings') {
          const currentAppState = getAppState()
          const model = getMainLoopModel()
          // modelSupportsEffort 门控匹配 claude.ts —— applied.effort 必须镜像实际发送到 API 的内容，而不仅仅是配置的内容。
          const effort = modelSupportsEffort(model)
            ? resolveAppliedEffort(model, currentAppState.effortValue)
            : undefined
          sendControlResponseSuccess(message, {
            ...getSettingsWithSources(),
            applied: {
              model,
              // 数字 effort（仅 ant）→ null；SDK 模式仅支持字符串级别。
              effort: typeof effort === 'string' ? effort : null,
            },
          })
        } else if (message.request.subtype === 'stop_task') {
          const { task_id: taskId } = message.request
          try {
            await stopTask(taskId, {
              getAppState,
              setAppState,
            })
            sendControlResponseSuccess(message, {})
          } catch (error) {
            sendControlResponseError(message, errorMessage(error))
          }
        } else if (message.request.subtype === 'generate_session_title') {
          // 即发即弃，这样 Haiku 调用不会阻塞 stdin 循环
          //（否则会在 API 往返期间延迟后续用户消息/中断的处理）。
          const { description, persist } = message.request
          // 仅当尚未中止时才重用实时控制器（例如通过 interrupt()）；
          // 已中止的信号会导致 queryHaiku 立即抛出 APIUserAbortError → {title: null}。
          const titleSignal = (
            abortController && !abortController.signal.aborted
              ? abortController
              : createAbortController()
          ).signal
          void (async () => {
            try {
              const title = await generateSessionTitle(description, titleSignal)
              if (title && persist) {
                try {
                  saveAiGeneratedTitle(getSessionId() as UUID, title)
                } catch (e) {
                  logError(e)
                }
              }
              sendControlResponseSuccess(message, { title })
            } catch (e) {
              // 实践中不可达 —— generateSessionTitle 包装了其自身主体并返回 null，
              // saveAiGeneratedTitle 在上面已包装。传播（而不是吞掉），
              // 以便意外失败对 SDK 调用者可见（hostComms.ts 捕获并记录）。
              sendControlResponseError(message, errorMessage(e))
            }
          })()
        } else if (message.request.subtype === 'side_question') {
          // 与上面的 generate_session_title 相同的即发即弃模式 ——
          // 分叉代理的 API 往返不能阻塞 stdin 循环。
          //
          // stopHooks 捕获的快照（针对 querySource === 'sdk'）保存了
          // 在最后一个主线程轮次中发送的确切 systemPrompt/userContext/systemContext/messages。
          // 重用它们可提供逐字节相同的前缀 → 提示缓存命中。
          //
          // 回退（在第一个轮次完成之前恢复 —— 尚无快照）：
          // 从头重建。buildSideQuestionFallbackParams 镜像了 QueryEngine.ts:ask() 的系统提示组装
          //（包括 --system-prompt / --append-system-prompt），因此重建的前缀在常见情况下是匹配的。
          // 对于协调器模式或内存机制额外内容，可能仍会错过缓存 —— 可以接受，
          // 替代方案是边问题完全失败。
          const { question } = message.request
          void (async () => {
            try {
              const saved = getLastCacheSafeParams()
              const cacheSafeParams = saved
                ? {
                    ...saved,
                    // 如果上一个轮次被中断，快照保存的是一个已经中止的控制器；
                    // createChildAbortController 在 createSubagentContext 中会传播它，
                    // 分叉将在发送请求前死亡。控制器不是缓存键的一部分 —— 换成新的控制器是安全的。
                    // 与上面的 generate_session_title 相同的保护措施。
                    toolUseContext: {
                      ...saved.toolUseContext,
                      abortController: createAbortController(),
                    },
                  }
                : await buildSideQuestionFallbackParams({
                    tools: buildAllTools(getAppState()),
                    commands: currentCommands,
                    mcpClients: [
                      ...getAppState().mcp.clients,
                      ...sdkClients,
                      ...dynamicMcpState.clients,
                    ],
                    messages: mutableMessages,
                    readFileState,
                    getAppState,
                    setAppState,
                    customSystemPrompt: options.systemPrompt,
                    appendSystemPrompt: options.appendSystemPrompt,
                    thinkingConfig: options.thinkingConfig,
                    agents: currentAgents,
                  })
              const result = await runSideQuestion({
                question,
                cacheSafeParams,
              })
              sendControlResponseSuccess(message, { response: result.response })
            } catch (e) {
              sendControlResponseError(message, errorMessage(e))
            }
          })()
        } else if (
          (feature('PROACTIVE') || feature('KAIROS')) &&
          (message.request as { subtype: string }).subtype === 'set_proactive'
        ) {
          const req = message.request as unknown as {
            subtype: string
            enabled: boolean
          }
          if (req.enabled) {
            if (!proactiveModule!.isProactiveActive()) {
              proactiveModule!.activateProactive('command')
              scheduleProactiveTick!()
            }
          } else {
            proactiveModule!.deactivateProactive()
          }
          sendControlResponseSuccess(message)
        } else if (message.request.subtype === 'remote_control') {
          if (message.request.enabled) {
            if (bridgeHandle) {
              // 已连接
              sendControlResponseSuccess(message, {
                session_url: getRemoteSessionUrl(
                  bridgeHandle.bridgeSessionId,
                  bridgeHandle.sessionIngressUrl,
                ),
                connect_url: buildBridgeConnectUrl(
                  bridgeHandle.environmentId,
                  bridgeHandle.sessionIngressUrl,
                ),
                environment_id: bridgeHandle.environmentId,
              })
            } else {
              // initReplBridge 在返回 null 之前通过 onStateChange('failed', detail) 显示门控失败原因。
              // 捕获它，以便控制响应错误是可操作的（例如“/login”、“被您的组织策略禁用”），
              // 而不是通用的“初始化失败”。
              let bridgeFailureDetail: string | undefined
              try {
                const { initReplBridge } = await import(
                  'src/bridge/initReplBridge.js'
                )
                const handle = await initReplBridge({
                  onInboundMessage(msg) {
                    const fields = extractInboundMessageFields(msg)
                    if (!fields) return
                    const { content, uuid } = fields
                    enqueue({
                      value: content,
                      mode: 'prompt' as const,
                      uuid,
                      skipSlashCommands: true,
                    })
                    void run()
                  },
                  onPermissionResponse(response) {
                    // 将桥接权限响应转发到 stdin 处理循环，
                    // 以便它们解析来自 SDK 消费者的挂起权限请求。
                    structuredIO.injectControlResponse(response)
                  },
                  onInterrupt() {
                    abortController?.abort()
                  },
                  onSetModel(model) {
                    const resolved =
                      model === 'default' ? getDefaultMainLoopModel() : model
                    activeUserSpecifiedModel = resolved
                    setMainLoopModelOverride(resolved)
                  },
                  onSetMaxThinkingTokens(maxTokens) {
                    if (maxTokens === null) {
                      options.thinkingConfig = undefined
                    } else if (maxTokens === 0) {
                      options.thinkingConfig = { type: 'disabled' }
                    } else {
                      options.thinkingConfig = {
                        type: 'enabled',
                        budgetTokens: maxTokens,
                      }
                    }
                  },
                  onStateChange(state, detail) {
                    if (state === 'failed') {
                      bridgeFailureDetail = detail
                    }
                    logForDebugging(
                      `[bridge:sdk] 状态变更: ${state}${detail ? ` — ${detail}` : ''}`,
                    )
                    output.enqueue({
                      type: 'system' as StdoutMessage['type'],
                      subtype: 'bridge_state' as string,
                      state,
                      detail,
                      uuid: randomUUID(),
                      session_id: getSessionId(),
                    } as StdoutMessage)
                  },
                  initialMessages:
                    mutableMessages.length > 0 ? mutableMessages : undefined,
                })
                if (!handle) {
                  sendControlResponseError(
                    message,
                    bridgeFailureDetail ??
                      '远程控制初始化失败',
                  )
                } else {
                  bridgeHandle = handle
                  bridgeLastForwardedIndex = mutableMessages.length
                  // 将权限请求转发到桥接
                  structuredIO.setOnControlRequestSent(request => {
                    handle.sendControlRequest(request)
                  })
                  // 当 SDK 消费者首先解析 can_use_tool 请求时，取消陈旧的桥接权限提示。
                  structuredIO.setOnControlRequestResolved(requestId => {
                    handle.sendControlCancelRequest(requestId)
                  })
                  sendControlResponseSuccess(message, {
                    session_url: getRemoteSessionUrl(
                      handle.bridgeSessionId,
                      handle.sessionIngressUrl,
                    ),
                    connect_url: buildBridgeConnectUrl(
                      handle.environmentId,
                      handle.sessionIngressUrl,
                    ),
                    environment_id: handle.environmentId,
                  })
                }
              } catch (err) {
                sendControlResponseError(message, errorMessage(err))
              }
            }
          } else {
            // 禁用
            if (bridgeHandle) {
              structuredIO.setOnControlRequestSent(undefined)
              structuredIO.setOnControlRequestResolved(undefined)
              await bridgeHandle.teardown()
              bridgeHandle = null
            }
            sendControlResponseSuccess(message)
          }
        } else {
          // 未知的控制请求子类型 —— 发送错误响应，以免调用者永远等待一个不会到来的回复。
          sendControlResponseError(
            message,
            `不支持的控制请求子类型: ${(message.request as { subtype: string }).subtype}`,
          )
        }
        continue
      } else if (message.type === 'control_response') {
        // 当启用重放模式时，重放 control_response 消息
        if (options.replayUserMessages) {
          output.enqueue(message)
        }
        continue
      } else if (message.type === 'keep_alive') {
        // 静默忽略保活消息
        continue
      } else if (message.type === 'update_environment_variables') {
        // 在 structuredIO.ts 中处理，但 TypeScript 需要类型守卫
        continue
      } else if (message.type === 'assistant' || message.type === 'system') {
        // 来自桥接的历史重放：注入到 mutableMessages 中作为对话上下文，以便模型看到之前的轮次。
        const internalMsgs = toInternalMessages([message])
        mutableMessages.push(...internalMsgs)
        // 回显助手消息，以便 CCR 显示它们
        if (message.type === 'assistant' && options.replayUserMessages) {
          output.enqueue(message)
        }
        continue
      }
      // 在处理了上面的 control、keep-alive、env-var、assistant 和 system 消息后，应该只剩下用户消息。
      if (message.type !== 'user') {
        continue
      }

      // 第一条提示消息隐式初始化（如果尚未完成）。
      initialized = true

      // 检查重复的用户消息 —— 如果已处理则跳过
      if (message.uuid) {
        const sessionId = getSessionId() as UUID
        const existsInSession = await doesMessageExistInSession(
          sessionId,
          message.uuid,
        )

        // 同时检查历史重复（来自文件）和运行时重复（此会话）
        if (existsInSession || receivedMessageUuids.has(message.uuid)) {
          logForDebugging(`跳过重复的用户消息: ${message.uuid}`)
          // 如果启用了重放模式，为重复消息发送确认
          if (options.replayUserMessages) {
            logForDebugging(
              `为重复的用户消息发送确认: ${message.uuid}`,
            )
            output.enqueue({
              type: 'user',
              message: message.message,
              session_id: sessionId,
              parent_tool_use_id: null,
              uuid: message.uuid,
              timestamp: message.timestamp,
              isReplay: true,
            } as SDKUserMessageReplay)
          }
          // 历史重复 = 转录中已有此轮次的输出，因此它已运行但其生命周期从未关闭（在确认之前中断）。
          // 运行时重复不需要此操作 —— 原始入队路径会关闭它们。
          if (existsInSession) {
            notifyCommandLifecycle(message.uuid, 'completed')
          }
          // 不要为执行而入队重复消息
          continue
        }

        // 跟踪此 UUID 以防止运行时重复
        trackReceivedMessageUuid(message.uuid)
      }

      enqueue({
        mode: 'prompt' as const,
        // file_attachments 通过 protobuf 包罗万象字段从 Web 编辑器传递。
        // 当不存在 'file_attachments' 键时，相同引用不执行任何操作。
        value: await resolveAndPrepend(message, message.message.content),
        uuid: message.uuid,
        priority: message.priority,
      })
      // 增加提示计数以进行归因跟踪并保存快照
      // 快照持久化 promptCount，使其在压缩后依然存在
      if (feature('COMMIT_ATTRIBUTION')) {
        setAppState(prev => ({
          ...prev,
          attribution: incrementPromptCount(prev.attribution, snapshot => {
            void recordAttributionSnapshot(snapshot).catch(error => {
              logForDebugging(`归属: 保存快照失败: ${error}`)
            })
          }),
        }))
      }
      void run()
    }
    inputClosed = true
    cronScheduler?.stop()
    if (!running) {
      // 如果有推送建议正在进行，在关闭输出流之前等待它发出（5 秒安全超时以防止挂起）。
      if (suggestionState.inflightPromise) {
        await Promise.race([suggestionState.inflightPromise, sleep(5000)])
      }
      suggestionState.abortController?.abort()
      suggestionState.abortController = null
      await finalizePendingAsyncHooks()
      unsubscribeSkillChanges()
      unsubscribeAuthStatus?.()
      statusListeners.delete(rateLimitListener)
      output.done()
    }
  })()

  return output
}

/**
 * 创建一个包含自定义权限提示工具的 CanUseToolFn。
 * 此函数将 permissionPromptTool 转换为可在 ask.tsx 中使用的 CanUseToolFn
 */
export function createCanUseToolWithPermissionPrompt(
  permissionPromptTool: PermissionPromptTool,
): CanUseToolFn {
  const canUseTool: CanUseToolFn = async (
    tool,
    input,
    toolUseContext,
    assistantMessage,
    toolUseId,
    forceDecision,
  ) => {
    const mainPermissionResult =
      forceDecision ??
      (await hasPermissionsToUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseId,
      ))

    // 如果工具被允许或拒绝，返回结果
    if (
      mainPermissionResult.behavior === 'allow' ||
      mainPermissionResult.behavior === 'deny'
    ) {
      return mainPermissionResult
    }

    // 将权限提示工具与中止信号进行竞争。
    //
    // 为什么需要这样做：权限提示工具可能会无限期阻塞以等待用户输入（例如，通过 stdin 或 UI 对话框）。
    // 如果用户触发中断（Ctrl+C），即使工具被阻塞，我们也需要检测到它。
    // 没有这个竞争，中止检查只会在工具完成后运行，但如果工具在等待永远不会到来的输入，它可能永远不会完成。
    //
    // 第二个检查（combinedSignal.aborted）处理了 Promise.race 解决后、我们到达此检查前中止触发的竞态条件。
    const { signal: combinedSignal, cleanup: cleanupAbortListener } =
      createCombinedAbortSignal(toolUseContext.abortController.signal)

    // 在开始竞争之前检查是否已经中止
    if (combinedSignal.aborted) {
      cleanupAbortListener()
      return {
        behavior: 'deny',
        message: '权限提示已中止。',
        decisionReason: {
          type: 'permissionPromptTool' as const,
          permissionPromptToolName: tool.name,
          toolResult: undefined,
        },
      }
    }

    const abortPromise = new Promise<'aborted'>(resolve => {
      combinedSignal.addEventListener('abort', () => resolve('aborted'), {
        once: true,
      })
    })

    const toolCallPromise = permissionPromptTool.call(
      {
        tool_name: tool.name,
        input,
        tool_use_id: toolUseId,
      },
      toolUseContext,
      canUseTool,
      assistantMessage,
    )

    const raceResult = await Promise.race([toolCallPromise, abortPromise])
    cleanupAbortListener()

    if (raceResult === 'aborted' || combinedSignal.aborted) {
      return {
        behavior: 'deny',
        message: '权限提示已中止。',
        decisionReason: {
          type: 'permissionPromptTool' as const,
          permissionPromptToolName: tool.name,
          toolResult: undefined,
        },
      }
    }

    // TypeScript 缩小：经过中止检查后，raceResult 必须是 ToolResult
    const result = raceResult as Awaited<typeof toolCallPromise>

    const permissionToolResultBlockParam =
      permissionPromptTool.mapToolResultToToolResultBlockParam(result.data, '1')
    if (
      !permissionToolResultBlockParam.content ||
      !Array.isArray(permissionToolResultBlockParam.content) ||
      !permissionToolResultBlockParam.content[0] ||
      permissionToolResultBlockParam.content[0].type !== 'text' ||
      typeof permissionToolResultBlockParam.content[0].text !== 'string'
    ) {
      throw new Error(
        '权限提示工具返回了无效的结果。期望一个带有 type="text" 和字符串文本值的单个文本块参数。',
      )
    }
    return permissionPromptToolResultToPermissionDecision(
      permissionPromptToolOutputSchema().parse(
        safeParseJSON(permissionToolResultBlockParam.content[0].text),
      ),
      permissionPromptTool,
      input,
      toolUseContext,
    )
  }
  return canUseTool
}

// 供测试导出 — 回归测试：此处在构建时曾因 getMcpTools() 为空而崩溃（在按服务器连接填充 appState 之前）。
export function getCanUseToolFn(
  permissionPromptToolName: string | undefined,
  structuredIO: StructuredIO,
  getMcpTools: () => Tool[],
  onPermissionPrompt?: (details: RequiresActionDetails) => void,
): CanUseToolFn {
  if (permissionPromptToolName === 'stdio') {
    return structuredIO.createCanUseTool(onPermissionPrompt)
  }
  if (!permissionPromptToolName) {
    return async (
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseId,
      forceDecision,
    ) =>
      forceDecision ??
      (await hasPermissionsToUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseId,
      ))
  }
  // 延迟查找：在打印模式下 MCP 连接是按服务器增量进行的，因此工具在初始化时可能尚未出现在 appState 中。
  // 在第一次调用（第一次权限提示）时解析，此时连接已有足够时间完成。
  let resolved: CanUseToolFn | null = null
  return async (
    tool,
    input,
    toolUseContext,
    assistantMessage,
    toolUseId,
    forceDecision,
  ) => {
    if (!resolved) {
      const mcpTools = getMcpTools()
      const permissionPromptTool = mcpTools.find(t =>
        toolMatchesName(t, permissionPromptToolName),
      ) as PermissionPromptTool | undefined
      if (!permissionPromptTool) {
        const error = `错误：找不到 MCP 工具 ${permissionPromptToolName}（通过 --permission-prompt-tool 传递）。可用的 MCP 工具：${mcpTools.map(t => t.name).join(', ') || '无'}`
        process.stderr.write(`${error}\n`)
        gracefulShutdownSync(1)
        throw new Error(error)
      }
      if (!permissionPromptTool.inputJSONSchema) {
        const error = `错误：工具 ${permissionPromptToolName}（通过 --permission-prompt-tool 传递）必须是 MCP 工具`
        process.stderr.write(`${error}\n`)
        gracefulShutdownSync(1)
        throw new Error(error)
      }
      resolved = createCanUseToolWithPermissionPrompt(permissionPromptTool)
    }
    return resolved(
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseId,
      forceDecision,
    )
  }
}

async function handleInitializeRequest(
  request: SDKControlInitializeRequest,
  requestId: string,
  initialized: boolean,
  output: Stream<StdoutMessage>,
  commands: Command[],
  modelInfos: ModelInfo[],
  structuredIO: StructuredIO,
  enableAuthStatus: boolean,
  options: {
    systemPrompt: string | undefined
    appendSystemPrompt: string | undefined
    agent?: string | undefined
    userSpecifiedModel?: string | undefined
    [key: string]: unknown
  },
  agents: AgentDefinition[],
  getAppState: () => AppState,
): Promise<void> {
  if (initialized) {
    output.enqueue({
      type: 'control_response',
      response: {
        subtype: 'error',
        error: '已初始化',
        request_id: requestId,
        pending_permission_requests:
          structuredIO.getPendingPermissionRequests(),
      },
    })
    return
  }

  // 从标准输入应用 systemPrompt/appendSystemPrompt 以避免 ARG_MAX 限制
  if (request.systemPrompt !== undefined) {
    options.systemPrompt = request.systemPrompt
  }
  if (request.appendSystemPrompt !== undefined) {
    options.appendSystemPrompt = request.appendSystemPrompt
  }
  if (request.promptSuggestions !== undefined) {
    options.promptSuggestions = request.promptSuggestions
  }

  // 从标准输入合并 agents 以避免 ARG_MAX 限制
  if (request.agents) {
    const stdinAgents = parseAgentsFromJson(request.agents, 'flagSettings')
    agents.push(...stdinAgents)
  }

  // 在合并 SDK agents 后重新评估主线程 agent
  // 这允许 --agent 引用通过 SDK 定义的 agents
  if (options.agent) {
    // 如果 main.tsx 已经找到此 agent（文件系统定义的），它已经应用了
    // systemPrompt/model/initialPrompt。跳过以避免重复应用。
    const alreadyResolved = getMainThreadAgentType() === options.agent
    const mainThreadAgent = agents.find(a => a.agentType === options.agent)
    if (mainThreadAgent && !alreadyResolved) {
      // 在 bootstrap 状态中更新主线程 agent 类型
      setMainThreadAgentType(mainThreadAgent.agentType)

      // 如果用户未指定自定义 systemPrompt 则应用 agent 的 systemPrompt
      // SDK agents 总是自定义 agent（非内置），因此 getSystemPrompt() 无需参数
      if (!options.systemPrompt && !isBuiltInAgent(mainThreadAgent)) {
        const agentSystemPrompt = mainThreadAgent.getSystemPrompt()
        if (agentSystemPrompt) {
          options.systemPrompt = agentSystemPrompt
        }
      }

      // 如果用户未指定模型且 agent 拥有模型，则应用 agent 的模型
      if (
        !options.userSpecifiedModel &&
        mainThreadAgent.model &&
        mainThreadAgent.model !== 'inherit'
      ) {
        const agentModel = parseUserSpecifiedModel(mainThreadAgent.model)
        setMainLoopModelOverride(agentModel)
      }

      // SDK 定义的 agents 通过 init 到达，因此 main.tsx 的查找会遗漏它们。
      if (mainThreadAgent.initialPrompt) {
        structuredIO.prependUserMessage(mainThreadAgent.initialPrompt)
      }
    } else if (mainThreadAgent?.initialPrompt) {
      // 文件系统定义的 agent（已由 main.tsx 解析）。当 inputPrompt 是字符串时
      // main.tsx 会处理 initialPrompt，但当 inputPrompt 是 AsyncIterable
      // （SDK stream-json）时，它无法拼接 — 此处回退到 prependUserMessage。
      structuredIO.prependUserMessage(mainThreadAgent.initialPrompt)
    }
  }

  const settings = getSettings_DEPRECATED()
  const outputStyle = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME
  const availableOutputStyles = await getAllOutputStyles(getCwd())

  // 获取账户信息
  const accountInfo = getAccountInformation()
  if (request.hooks) {
    const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {}
    for (const [event, matchers] of Object.entries(request.hooks)) {
      hooks[event as HookEvent] = matchers.map(matcher => {
        const callbacks = matcher.hookCallbackIds.map(callbackId => {
          return structuredIO.createHookCallback(callbackId, matcher.timeout)
        })
        return {
          matcher: matcher.matcher,
          hooks: callbacks,
        }
      })
    }
    registerHookCallbacks(hooks)
  }
  if (request.jsonSchema) {
    setInitJsonSchema(request.jsonSchema)
  }
  const initResponse: SDKControlInitializeResponse = {
    commands: commands
      .filter(cmd => cmd.userInvocable !== false)
      .map(cmd => ({
        name: getCommandName(cmd),
        description: formatDescriptionWithSource(cmd),
        argumentHint: cmd.argumentHint || '',
      })),
    agents: agents.map(agent => ({
      name: agent.agentType,
      description: agent.whenToUse,
      // 'inherit' 是内部哨兵值；为公共 API 标准化为 undefined
      model: agent.model === 'inherit' ? undefined : agent.model,
    })),
    output_style: outputStyle,
    available_output_styles: Object.keys(availableOutputStyles),
    models: modelInfos,
    account: {
      email: accountInfo?.email,
      organization: accountInfo?.organization,
      subscriptionType: accountInfo?.subscription,
      tokenSource: accountInfo?.tokenSource,
      apiKeySource: accountInfo?.apiKeySource,
      // getAccountInformation() 在第三方提供商下返回 undefined，因此其他字段均不存在。
      // apiProvider 用于区分“未登录”（第一方 + tokenSource:none）与“第三方，登录不适用”。
      apiProvider: getAPIProvider(),
    },
    pid: process.pid,
  }

  if (isFastModeEnabled() && isFastModeAvailable()) {
    const appState = getAppState()
    initResponse.fast_mode_state = getFastModeState(
      options.userSpecifiedModel ?? null,
      appState.fastMode,
    )
  }

  output.enqueue({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: initResponse,
    },
  })

  // 在发送 initialize 消息后，检查认证状态。
  // 它会监听状态变化，但我们也要发送初始状态。
  if (enableAuthStatus) {
    const authStatusManager = AwsAuthStatusManager.getInstance()
    const status = authStatusManager.getStatus()
    if (status) {
      output.enqueue({
        type: 'auth_status',
        isAuthenticating: status.isAuthenticating,
        output: status.output,
        error: status.error,
        uuid: randomUUID(),
        session_id: getSessionId(),
      })
    }
  }
}

async function handleRewindFiles(
  userMessageId: UUID,
  appState: AppState,
  setAppState: (updater: (prev: AppState) => AppState) => void,
  dryRun: boolean,
): Promise<RewindFilesResult> {
  if (!fileHistoryEnabled()) {
    return { canRewind: false, error: '文件回退功能未启用。' }
  }
  if (!fileHistoryCanRestore(appState.fileHistory, userMessageId)) {
    return {
      canRewind: false,
      error: '未找到该消息的文件检查点。',
    }
  }

  if (dryRun) {
    const diffStats = await fileHistoryGetDiffStats(
      appState.fileHistory,
      userMessageId,
    )
    return {
      canRewind: true,
      filesChanged: diffStats?.filesChanged,
      insertions: diffStats?.insertions,
      deletions: diffStats?.deletions,
    }
  }

  try {
    await fileHistoryRewind(
      updater =>
        setAppState(prev => ({
          ...prev,
          fileHistory: updater(prev.fileHistory),
        })),
      userMessageId,
    )
  } catch (error) {
    return {
      canRewind: false,
      error: `回退失败: ${errorMessage(error)}`,
    }
  }

  return { canRewind: true }
}

function handleSetPermissionMode(
  request: { mode: InternalPermissionMode },
  requestId: string,
  toolPermissionContext: ToolPermissionContext,
  output: Stream<StdoutMessage>,
): ToolPermissionContext {
  // 检查是否尝试切换到 bypassPermissions 模式
  if (request.mode === 'bypassPermissions') {
    if (isBypassPermissionsModeDisabled()) {
      output.enqueue({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: requestId,
          error:
            '无法将权限模式设置为 bypassPermissions，因为设置或配置已禁用该模式',
        },
      })
      return toolPermissionContext
    }
    if (!toolPermissionContext.isBypassPermissionsModeAvailable) {
      output.enqueue({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: requestId,
          error:
            '无法将权限模式设置为 bypassPermissions，因为会话启动时未使用 --dangerously-skip-permissions',
        },
      })
      return toolPermissionContext
    }
  }

  // 检查是否尝试在未通过分类器门禁的情况下切换到自动模式
  if (
    feature('TRANSCRIPT_CLASSIFIER') &&
    request.mode === 'auto' &&
    !isAutoModeGateEnabled()
  ) {
    const reason = getAutoModeUnavailableReason()
    output.enqueue({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error: reason
          ? `无法将权限模式设置为自动模式：${getAutoModeUnavailableNotification(reason)}`
          : '无法将权限模式设置为自动模式',
      },
    })
    return toolPermissionContext
  }

  // 允许模式切换
  output.enqueue({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: {
        mode: request.mode,
      },
    },
  })

  return {
    ...transitionPermissionMode(
      toolPermissionContext.mode,
      request.mode,
      toolPermissionContext,
    ),
    mode: request.mode,
  }
}

/**
 * IDE 触发的频道启用。从连接的 pluginSource 派生 ChannelEntry（IDE 无法伪造 kind/marketplace — 我们只接受服务器名称），
 * 将其追加到会话 allowedChannels，并运行完整的门禁检查。门禁失败时回滚追加。成功时注册一个通知处理器，
 * 以 priority:'next' 将频道消息入队 — drainCommandQueue 在轮次之间拾取它们。
 *
 * 特意不注册 claude/channel/permission 处理器，该处理器由 useManageMCPConnections 为交互模式设置。
 * 该处理器在 handleInteractivePermission 内部解析待处理的对话框 — 但 print.ts 从不调用 handleInteractivePermission。
 * 当 SDK 权限落地为 'ask' 时，它通过 stdio 传递给消费者的 canUseTool 回调；CLI 侧没有可供远程 "yes tbxkq" 解析的对话框。
 * 如果 IDE 需要频道转发的工具审批，那是 IDE 侧根据其自身的待处理映射表进行的处理。
 * （同时由 tengu_harbor_permissions 单独门禁 — 在交互模式下也尚未发布。）
 */
function handleChannelEnable(
  requestId: string,
  serverName: string,
  connectionPool: readonly MCPServerConnection[],
  output: Stream<StdoutMessage>,
): void {
  const respondError = (error: string) =>
    output.enqueue({
      type: 'control_response',
      response: { subtype: 'error', request_id: requestId, error },
    })

  if (!(feature('KAIROS') || feature('KAIROS_CHANNELS'))) {
    return respondError('此构建中不提供频道功能')
  }

  // 只有 'connected' 类型的客户端拥有 .capabilities 和 .client 用于注册处理器。
  // 调用点处的连接池展开与 mcp_status 匹配。
  const connection = connectionPool.find(
    c => c.name === serverName && c.type === 'connected',
  )
  if (!connection || connection.type !== 'connected') {
    return respondError(`服务器 ${serverName} 未连接`)
  }

  const pluginSource = connection.config.pluginSource
  const parsed = pluginSource ? parsePluginIdentifier(pluginSource) : undefined
  if (!parsed?.marketplace) {
    // 没有 pluginSource 或缺少 @ 前缀的来源 — 永远无法通过基于 {plugin, marketplace} 键的允许列表。
    // 使用与门禁相同的原因短路。
    return respondError(
      `服务器 ${serverName} 不是来自插件; channel_enable 需要市场插件`,
    )
  }

  const entry: ChannelEntry = {
    kind: 'plugin',
    name: parsed.name,
    marketplace: parsed.marketplace,
  }
  // 幂等性：重复启用时不重复追加。
  const prior = getAllowedChannels()
  const already = prior.some(
    e =>
      e.kind === 'plugin' &&
      e.name === entry.name &&
      e.marketplace === entry.marketplace,
  )
  if (!already) setAllowedChannels([...prior, entry])

  const gate = gateChannelServer(
    serverName,
    connection.capabilities,
    pluginSource,
  )
  if (gate.action === 'skip') {
    // 回滚 — 仅移除我们追加的条目。
    if (!already) setAllowedChannels(prior)
    return respondError(gate.reason)
  }

  const pluginId =
    `${entry.name}@${entry.marketplace}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  logMCPDebug(serverName, '频道通知已注册')
  logEvent('tengu_mcp_channel_enable', { plugin: pluginId })

  // 入队形状与 useManageMCPConnections 中的交互注册块相同。
  // drainCommandQueue 在轮次之间处理它 — 频道消息以优先级 'next' 入队，
  // 并在它们到达后的下一个轮次中被模型看到。
  connection.client.setNotificationHandler(
    ChannelMessageNotificationSchema(),
    async notification => {
      const { content, meta } = notification.params
      logMCPDebug(
        serverName,
        `notifications/claude/channel: ${content.slice(0, 80)}`,
      )
      logEvent('tengu_mcp_channel_message', {
        content_length: content.length,
        meta_key_count: Object.keys(meta ?? {}).length,
        entry_kind:
          'plugin' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_dev: false,
        plugin: pluginId,
      })
      enqueue({
        mode: 'prompt',
        value: wrapChannelMessage(serverName, content, meta),
        priority: 'next',
        isMeta: true,
        origin: { kind: 'channel', server: serverName },
        skipSlashCommands: true,
      })
    },
  )

  output.enqueue({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: undefined,
    },
  })
}

/**
 * 在 mcp_reconnect / mcp_toggle 创建新客户端后重新注册频道通知处理器。
 * handleChannelEnable 将处理器绑定到旧的客户端对象；allowedChannels 在重连后仍然存在，
 * 但处理器绑定不会。如果不这样做，重连后频道消息会静默丢失，而 IDE 仍认为频道是活动的。
 *
 * 镜像交互式 CLI 中 useManageMCPConnections 的 onConnectionAttempt，
 * 它在每个新连接上重新进行门禁检查。与 registerElicitationHandlers 在同一调用点配对。
 *
 * 如果服务器从未被频道启用，则无操作：gateChannelServer 在内部调用 findChannelEntry，
 * 对于未列出的服务器返回 skip/session，因此重连一个非频道 MCP 服务器只会消耗一次 feature-flag 检查。
 */
function reregisterChannelHandlerAfterReconnect(
  connection: MCPServerConnection,
): void {
  if (!(feature('KAIROS') || feature('KAIROS_CHANNELS'))) return
  if (connection.type !== 'connected') return

  const gate = gateChannelServer(
    connection.name,
    connection.capabilities,
    connection.config.pluginSource,
  )
  if (gate.action !== 'register') return

  const entry = findChannelEntry(connection.name, getAllowedChannels())
  const pluginId =
    entry?.kind === 'plugin'
      ? (`${entry.name}@${entry.marketplace}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
      : undefined

  logMCPDebug(
    connection.name,
    '频道通知在重新连接后重新注册',
  )
  connection.client.setNotificationHandler(
    ChannelMessageNotificationSchema(),
    async notification => {
      const { content, meta } = notification.params
      logMCPDebug(
        connection.name,
        `notifications/claude/channel: ${content.slice(0, 80)}`,
      )
      logEvent('tengu_mcp_channel_message', {
        content_length: content.length,
        meta_key_count: Object.keys(meta ?? {}).length,
        entry_kind:
          entry?.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_dev: entry?.dev ?? false,
        plugin: pluginId,
      })
      enqueue({
        mode: 'prompt',
        value: wrapChannelMessage(connection.name, content, meta),
        priority: 'next',
        isMeta: true,
        origin: { kind: 'channel', server: connection.name },
        skipSlashCommands: true,
      })
    },
  )
}

/**
 * 根据 outputFormat 以正确格式发出错误消息。
 * 使用 stream-json 时写入 JSON 到 stdout；否则写入纯文本到 stderr。
 */
function emitLoadError(
  message: string,
  outputFormat: string | undefined,
): void {
  if (outputFormat === 'stream-json') {
    const errorResult = {
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      stop_reason: null,
      session_id: getSessionId(),
      total_cost_usd: 0,
      usage: EMPTY_USAGE,
      modelUsage: {},
      permission_denials: [],
      uuid: randomUUID(),
      errors: [message],
    }
    process.stdout.write(jsonStringify(errorResult) + '\n')
  } else {
    process.stderr.write(message + '\n')
  }
}

/**
 * 从消息数组中移除被中断的用户消息及其合成助手哨兵。
 * 在网关触发的重启期间用于清理消息历史，然后重新入队被中断的提示。
 *
 * @internal 为测试导出
 */
export function removeInterruptedMessage(
  messages: Message[],
  interruptedUserMessage: NormalizedUserMessage,
): void {
  const idx = messages.findIndex(m => m.uuid === interruptedUserMessage.uuid)
  if (idx !== -1) {
    // 移除用户消息及其紧随的哨兵消息。
    // splice 在 idx 是最后一个元素时也能安全处理。
    messages.splice(idx, 2)
  }
}

type LoadInitialMessagesResult = {
  messages: Message[]
  turnInterruptionState?: TurnInterruptionState
  agentSetting?: string
}

async function loadInitialMessages(
  setAppState: (f: (prev: AppState) => AppState) => void,
  options: {
    continue: boolean | undefined
    teleport: string | true | null | undefined
    resume: string | boolean | undefined
    resumeSessionAt: string | undefined
    forkSession: boolean | undefined
    outputFormat: string | undefined
    sessionStartHooksPromise?: ReturnType<typeof processSessionStartHooks>
    restoredWorkerState: Promise<SessionExternalMetadata | null>
  },
): Promise<LoadInitialMessagesResult> {
  const persistSession = !isSessionPersistenceDisabled()
  // 在打印模式下处理 continue
  if (options.continue) {
    try {
      logEvent('tengu_continue_print', {})

      const result = await loadConversationForResume(
        undefined /* sessionId */,
        undefined /* file path */,
      )
      if (result) {
        // 将协调员模式匹配到恢复会话的模式
        if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
          const warning = coordinatorModeModule.matchSessionMode(result.mode)
          if (warning) {
            process.stderr.write(warning + '\n')
            // 刷新 agent 定义以反映模式切换
            const {
              getAgentDefinitionsWithOverrides,
              getActiveAgentsFromList,
            } =
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              require('../tools/AgentTool/loadAgentsDir.js') as typeof import('../tools/AgentTool/loadAgentsDir.js')
            getAgentDefinitionsWithOverrides.cache.clear?.()
            const freshAgentDefs = await getAgentDefinitionsWithOverrides(
              getCwd(),
            )

            setAppState(prev => ({
              ...prev,
              agentDefinitions: {
                ...freshAgentDefs,
                allAgents: freshAgentDefs.allAgents,
                activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
              },
            }))
          }
        }

        // 重用恢复会话的 ID
        if (!options.forkSession) {
          if (result.sessionId) {
            switchSession(
              asSessionId(result.sessionId),
              result.fullPath ? dirname(result.fullPath) : null,
            )
            if (persistSession) {
              await resetSessionFilePointer()
            }
          }
        }
        restoreSessionStateFromLog(result, setAppState)

        // 恢复会话元数据，以便在退出时通过 reAppendSessionMetadata 重新追加
        restoreSessionMetadata(
          options.forkSession
            ? { ...result, worktreeSession: undefined }
            : result,
        )

        // 为恢复的会话写入模式条目
        if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
          saveMode(
            coordinatorModeModule.isCoordinatorMode()
              ? 'coordinator'
              : 'normal',
          )
        }

        return {
          messages: result.messages,
          turnInterruptionState: result.turnInterruptionState,
          agentSetting: result.agentSetting,
        }
      }
    } catch (error) {
      logError(error)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  // 在打印模式下处理 teleport
  if (options.teleport) {
    try {
      if (!isPolicyAllowed('allow_remote_sessions')) {
        throw new Error(
          '您组织的策略已禁用远程会话。',
        )
      }

      logEvent('tengu_teleport_print', {})

      if (typeof options.teleport !== 'string') {
        throw new Error('未提供 teleport 的会话 ID')
      }

      const {
        checkOutTeleportedSessionBranch,
        processMessagesForTeleportResume,
        teleportResumeCodeSession,
        validateGitState,
      } = await import('src/utils/teleport.js')
      await validateGitState()
      const teleportResult = await teleportResumeCodeSession(options.teleport)
      const { branchError } = await checkOutTeleportedSessionBranch(
        teleportResult.branch,
      )
      return {
        messages: processMessagesForTeleportResume(
          teleportResult.log,
          branchError,
        ),
      }
    } catch (error) {
      logError(error)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  // 在打印模式下处理 resume（接受会话 ID 或 URL）
  // URL 仅 [ANT-ONLY]
  if (options.resume) {
    try {
      logEvent('tengu_resume_print', {})

      // 在打印模式下 - 我们需要有效的会话 ID、JSONL 文件或 URL
      const parsedSessionId = parseSessionIdentifier(
        typeof options.resume === 'string' ? options.resume : '',
      )
      if (!parsedSessionId) {
        let errorMessage =
          '错误：使用 --print 时，--resume 需要提供有效的会话 ID。用法：claude -p --resume <session-id>'
        if (typeof options.resume === 'string') {
          errorMessage += `。会话 ID 必须是 UUID 格式（例如：550e8400-e29b-41d4-a716-446655440000）。提供的值 "${options.resume}" 不是有效的 UUID`
        }
        emitLoadError(errorMessage, options.outputFormat)
        gracefulShutdownSync(1)
        return { messages: [] }
      }

      // 在加载前从远程水合本地转录
      if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
        // 等待恢复与水合同步，以便 SSE 追赶在恢复状态上着陆，而不是在全新的默认状态上。
        const [, metadata] = await Promise.all([
          hydrateFromCCRv2InternalEvents(parsedSessionId.sessionId),
          options.restoredWorkerState,
        ])
        if (metadata) {
          setAppState(externalMetadataToAppState(metadata))
          if (typeof metadata.model === 'string') {
            setMainLoopModelOverride(metadata.model)
          }
        }
      } else if (
        parsedSessionId.isUrl &&
        parsedSessionId.ingressUrl &&
        isEnvTruthy(process.env.ENABLE_SESSION_PERSISTENCE)
      ) {
        // v1：从会话入口获取会话日志
        await hydrateRemoteSession(
          parsedSessionId.sessionId,
          parsedSessionId.ingressUrl,
        )
      }

      // 使用指定的会话 ID 加载对话
      const result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )

      // hydrateFromCCRv2InternalEvents 为空会话写入空转录文件（零事件的 writeFile(sessionFile, '')），
      // 因此 loadConversationForResume 返回 {messages: []} 而非 null。
      // 将空内容视为 null，以便 SessionStart 仍能触发。
      if (!result || result.messages.length === 0) {
        // 对于基于 URL 或 CCR v2 的恢复，以空会话开始（已被水合但为空）
        if (
          parsedSessionId.isUrl ||
          isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)
        ) {
          // 执行 SessionStart hooks 以启动，因为我们正在开始一个新会话
          return {
            messages: await (options.sessionStartHooksPromise ??
              processSessionStartHooks('startup')),
          }
        } else {
          emitLoadError(
            `会话未找到，会话 ID: ${parsedSessionId.sessionId}`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }
      }

      // 处理 resumeSessionAt 功能
      if (options.resumeSessionAt) {
        const index = result.messages.findIndex(
          m => m.uuid === options.resumeSessionAt,
        )
        if (index < 0) {
          emitLoadError(
            `未找到消息，消息 ID: ${options.resumeSessionAt}`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }

        result.messages = index >= 0 ? result.messages.slice(0, index + 1) : []
      }

      // 将协调员模式匹配到恢复会话的模式
      if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
        const warning = coordinatorModeModule.matchSessionMode(result.mode)
        if (warning) {
          process.stderr.write(warning + '\n')
          // 刷新 agent 定义以反映模式切换
          const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList } =
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require('../tools/AgentTool/loadAgentsDir.js') as typeof import('../tools/AgentTool/loadAgentsDir.js')
          getAgentDefinitionsWithOverrides.cache.clear?.()
          const freshAgentDefs = await getAgentDefinitionsWithOverrides(
            getCwd(),
          )

          setAppState(prev => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
            },
          }))
        }
      }

      // 重用恢复会话的 ID
      if (!options.forkSession && result.sessionId) {
        switchSession(
          asSessionId(result.sessionId),
          result.fullPath ? dirname(result.fullPath) : null,
        )
        if (persistSession) {
          await resetSessionFilePointer()
        }
      }
      restoreSessionStateFromLog(result, setAppState)

      // 恢复会话元数据，以便在退出时通过 reAppendSessionMetadata 重新追加
      restoreSessionMetadata(
        options.forkSession
          ? { ...result, worktreeSession: undefined }
          : result,
      )

      // 为恢复的会话写入模式条目
      if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
        saveMode(
          coordinatorModeModule.isCoordinatorMode() ? 'coordinator' : 'normal',
        )
      }

      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
      }
    } catch (error) {
      logError(error)
      const errorMessage =
        error instanceof Error
          ? `恢复会话失败: ${error.message}`
          : '在 --print 模式下恢复会话失败'
      emitLoadError(errorMessage, options.outputFormat)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  // 加入在 main.tsx 中启动的 SessionStart hooks promise（如果未启动则重新运行，
  // 例如 --continue 且无先前会话时会落到此处，因为 main.tsx 在 continue 时进行了守卫）
  return {
    messages: await (options.sessionStartHooksPromise ??
      processSessionStartHooks('startup')),
  }
}

function getStructuredIO(
  inputPrompt: string | AsyncIterable<string>,
  options: {
    sdkUrl: string | undefined
    replayUserMessages?: boolean
  },
): StructuredIO {
  let inputStream: AsyncIterable<string>
  if (typeof inputPrompt === 'string') {
    if (inputPrompt.trim() !== '') {
      // 规范化为流式输入。
      inputStream = fromArray([
        jsonStringify({
          type: 'user',
          session_id: '',
          message: {
            role: 'user',
            content: inputPrompt,
          },
          parent_tool_use_id: null,
        } satisfies SDKUserMessage),
      ])
    } else {
      // 空字符串 - 创建空流
      inputStream = fromArray([])
    }
  } else {
    inputStream = inputPrompt
  }

  // 如果提供了 sdkUrl 则使用 RemoteIO，否则使用常规 StructuredIO
  return options.sdkUrl
    ? new RemoteIO(options.sdkUrl, inputStream, options.replayUserMessages)
    : new StructuredIO(inputStream, options.replayUserMessages)
}

/**
 * 通过查找转录中未解析的工具调用来处理意外的权限响应，并将其入队执行。
 *
 * 如果权限被入队则返回 true，否则返回 false。
 */
export async function handleOrphanedPermissionResponse({
  message,
  setAppState,
  onEnqueued,
  handledToolUseIds,
}: {
  message: SDKControlResponse
  setAppState: (f: (prev: AppState) => AppState) => void
  onEnqueued?: () => void
  handledToolUseIds: Set<string>
}): Promise<boolean> {
  if (
    message.response.subtype === 'success' &&
    message.response.response?.toolUseID &&
    typeof message.response.response.toolUseID === 'string'
  ) {
    const permissionResult = message.response.response as PermissionResult
    const { toolUseID } = permissionResult
    if (!toolUseID) {
      return false
    }

    logForDebugging(
      `handleOrphanedPermissionResponse: 收到孤立的 control_response，工具使用 ID=${toolUseID}，请求 ID=${message.response.request_id}`,
    )

    // 防止重新处理相同的孤立 tool_use。若无此防护，重复的 control_response 投递
    // （例如来自 WebSocket 重连）会导致同一工具被执行多次，在消息数组中产生重复的
    // tool_use ID 以及来自 API 的 400 错误。一旦损坏，每次重试都会累积更多重复。
    if (handledToolUseIds.has(toolUseID)) {
      logForDebugging(
        `handleOrphanedPermissionResponse: 跳过重复的孤立权限，工具使用 ID=${toolUseID}（已处理）`,
      )
      return false
    }

    const assistantMessage = await findUnresolvedToolUse(toolUseID)
    if (!assistantMessage) {
      logForDebugging(
        `handleOrphanedPermissionResponse: 未找到未解析的工具使用，工具使用 ID=${toolUseID}（已在转录中解析）`,
      )
      return false
    }

    handledToolUseIds.add(toolUseID)
    logForDebugging(
      `handleOrphanedPermissionResponse: 入队孤立权限，工具使用 ID=${toolUseID}，消息 ID=${assistantMessage.message.id}`,
    )
    enqueue({
      mode: 'orphaned-permission' as const,
      value: [],
      orphanedPermission: {
        permissionResult,
        assistantMessage,
      },
    })

    onEnqueued?.()
    return true
  }
  return false
}

export type DynamicMcpState = {
  clients: MCPServerConnection[]
  tools: Tools
  configs: Record<string, ScopedMcpServerConfig>
}

/**
 * 将进程传输配置转换为作用域配置。
 * 类型在结构上兼容，我们只需添加作用域。
 */
function toScopedConfig(
  config: McpServerConfigForProcessTransport,
): ScopedMcpServerConfig {
  // McpServerConfigForProcessTransport 是 McpServerConfig 的子集
  // （它排除了 IDE 特定类型，如 sse-ide 和 ws-ide）
  // 添加作用域使其成为有效的 ScopedMcpServerConfig
  return { ...config, scope: 'dynamic' } as ScopedMcpServerConfig
}

/**
 * 在 SDK 进程中运行的 SDK MCP 服务器的状态。
 */
export type SdkMcpState = {
  configs: Record<string, McpSdkServerConfig>
  clients: MCPServerConnection[]
  tools: Tools
}

/**
 * handleMcpSetServers 的结果 - 包含新状态和响应数据。
 */
export type McpSetServersResult = {
  response: SDKControlMcpSetServersResponse
  newSdkState: SdkMcpState
  newDynamicState: DynamicMcpState
  sdkServersChanged: boolean
}

/**
 * 通过处理 SDK 和基于进程的服务器来处理 mcp_set_servers 请求。
 * SDK 服务器在 SDK 进程中运行；基于进程的服务器由 CLI 生成。
 *
 * 应用企业 allowedMcpServers/deniedMcpServers 策略 — 与 --mcp-config 相同的过滤器
 * （参见 main.tsx 中的 filterMcpServersByPolicy 调用）。若无此检查，SDK V2 Query.setMcpServers()
 * 将成为第二个策略绕过向量。被阻止的服务器会在 response.errors 中报告，以便 SDK 消费者了解原因。
 */
export async function handleMcpSetServers(
  servers: Record<string, McpServerConfigForProcessTransport>,
  sdkState: SdkMcpState,
  dynamicState: DynamicMcpState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<McpSetServersResult> {
  // 对基于进程的服务器（stdio/http/sse）强制实施企业 MCP 策略。
  // 镜像 main.tsx 中的 --mcp-config 过滤器 — 两个用户控制的注入路径必须具有相同的门禁。
  // type:'sdk' 服务器豁免（由 SDK 管理，CLI 从不为其生成/连接 — 参见 filterMcpServersByPolicy jsdoc）。
  // 被阻止的服务器进入 response.errors，以便 SDK 调用者看到原因。
  const { allowed: allowedServers, blocked } = filterMcpServersByPolicy(servers)
  const policyErrors: Record<string, string> = {}
  for (const name of blocked) {
    policyErrors[name] =
      '被企业策略阻止 (allowedMcpServers/deniedMcpServers)'
  }

  // 将 SDK 服务器与基于进程的服务器分开
  const sdkServers: Record<string, McpSdkServerConfig> = {}
  const processServers: Record<string, McpServerConfigForProcessTransport> = {}

  for (const [name, config] of Object.entries(allowedServers)) {
    if (config.type === 'sdk') {
      sdkServers[name] = config
    } else {
      processServers[name] = config
    }
  }

  // 处理 SDK 服务器
  const currentSdkNames = new Set(Object.keys(sdkState.configs))
  const newSdkNames = new Set(Object.keys(sdkServers))
  const sdkAdded: string[] = []
  const sdkRemoved: string[] = []

  const newSdkConfigs = { ...sdkState.configs }
  let newSdkClients = [...sdkState.clients]
  let newSdkTools = [...sdkState.tools]

  // 移除不再需要的 SDK 服务器
  for (const name of currentSdkNames) {
    if (!newSdkNames.has(name)) {
      const client = newSdkClients.find(c => c.name === name)
      if (client && client.type === 'connected') {
        await client.cleanup()
      }
      newSdkClients = newSdkClients.filter(c => c.name !== name)
      const prefix = `mcp__${name}__`
      newSdkTools = newSdkTools.filter(t => !t.name.startsWith(prefix))
      delete newSdkConfigs[name]
      sdkRemoved.push(name)
    }
  }

  // 将新的 SDK 服务器添加为 pending 状态 - 它们将在下一次查询时
  // 由 updateSdkMcp() 升级为 connected 状态
  for (const [name, config] of Object.entries(sdkServers)) {
    if (!currentSdkNames.has(name)) {
      newSdkConfigs[name] = config
      const pendingClient: MCPServerConnection = {
        type: 'pending',
        name,
        config: { ...config, scope: 'dynamic' as const },
      }
      newSdkClients = [...newSdkClients, pendingClient]
      sdkAdded.push(name)
    }
  }

  // 处理基于进程的服务器
  const processResult = await reconcileMcpServers(
    processServers,
    dynamicState,
    setAppState,
  )

  return {
    response: {
      added: [...sdkAdded, ...processResult.response.added],
      removed: [...sdkRemoved, ...processResult.response.removed],
      errors: { ...policyErrors, ...processResult.response.errors },
    },
    newSdkState: {
      configs: newSdkConfigs,
      clients: newSdkClients,
      tools: newSdkTools,
    },
    newDynamicState: processResult.newState,
    sdkServersChanged: sdkAdded.length > 0 || sdkRemoved.length > 0,
  }
}

/**
 * 将当前的一组动态 MCP 服务器与新的期望状态进行协调。
 * 处理添加、移除和配置更改。
 */
export async function reconcileMcpServers(
  desiredConfigs: Record<string, McpServerConfigForProcessTransport>,
  currentState: DynamicMcpState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<{
  response: SDKControlMcpSetServersResponse
  newState: DynamicMcpState
}> {
  const currentNames = new Set(Object.keys(currentState.configs))
  const desiredNames = new Set(Object.keys(desiredConfigs))

  const toRemove = [...currentNames].filter(n => !desiredNames.has(n))
  const toAdd = [...desiredNames].filter(n => !currentNames.has(n))

  // 检查配置更改（相同名称，不同配置）
  const toCheck = [...currentNames].filter(n => desiredNames.has(n))
  const toReplace = toCheck.filter(name => {
    const currentConfig = currentState.configs[name]
    const desiredConfigRaw = desiredConfigs[name]
    if (!currentConfig || !desiredConfigRaw) return true
    const desiredConfig = toScopedConfig(desiredConfigRaw)
    return !areMcpConfigsEqual(currentConfig, desiredConfig)
  })

  const removed: string[] = []
  const added: string[] = []
  const errors: Record<string, string> = {}

  let newClients = [...currentState.clients]
  let newTools = [...currentState.tools]

  // 移除旧服务器（包括被替换的）
  for (const name of [...toRemove, ...toReplace]) {
    const client = newClients.find(c => c.name === name)
    const config = currentState.configs[name]
    if (client && config) {
      if (client.type === 'connected') {
        try {
          await client.cleanup()
        } catch (e) {
          logError(e)
        }
      }
      // 清除记忆化缓存
      await clearServerCache(name, config)
    }

    // 移除此服务器的工具
    const prefix = `mcp__${name}__`
    newTools = newTools.filter(t => !t.name.startsWith(prefix))

    // 从客户端列表中移除
    newClients = newClients.filter(c => c.name !== name)

    // 跟踪移除（仅针对实际移除的，而非被替换的）
    if (toRemove.includes(name)) {
      removed.push(name)
    }
  }

  // 添加新服务器（包括替换）
  for (const name of [...toAdd, ...toReplace]) {
    const config = desiredConfigs[name]
    if (!config) continue
    const scopedConfig = toScopedConfig(config)

    // SDK 服务器由 SDK 进程管理，不由 CLI 管理。
    // 仅跟踪它们，不尝试连接。
    if (config.type === 'sdk') {
      added.push(name)
      continue
    }

    try {
      const client = await connectToServer(name, scopedConfig)
      newClients.push(client)

      if (client.type === 'connected') {
        const serverTools = await fetchToolsForClient(client)
        newTools.push(...serverTools)
      } else if (client.type === 'failed') {
        errors[name] = client.error || '连接失败'
      }

      added.push(name)
    } catch (e) {
      const err = toError(e)
      errors[name] = err.message
      logError(err)
    }
  }

  // 构建新配置
  const newConfigs: Record<string, ScopedMcpServerConfig> = {}
  for (const name of desiredNames) {
    const config = desiredConfigs[name]
    if (config) {
      newConfigs[name] = toScopedConfig(config)
    }
  }

  const newState: DynamicMcpState = {
    clients: newClients,
    tools: newTools,
    configs: newConfigs,
  }

  // 使用新工具更新 AppState
  setAppState(prev => {
    // 获取所有动态服务器名称（当前 + 新的）
    const allDynamicServerNames = new Set([
      ...Object.keys(currentState.configs),
      ...Object.keys(newConfigs),
    ])

    // 移除旧的动态工具
    const nonDynamicTools = prev.mcp.tools.filter(t => {
      for (const serverName of allDynamicServerNames) {
        if (t.name.startsWith(`mcp__${serverName}__`)) {
          return false
        }
      }
      return true
    })

    // 移除旧的动态客户端
    const nonDynamicClients = prev.mcp.clients.filter(c => {
      return !allDynamicServerNames.has(c.name)
    })

    return {
      ...prev,
      mcp: {
        ...prev.mcp,
        tools: [...nonDynamicTools, ...newTools],
        clients: [...nonDynamicClients, ...newClients],
      },
    }
  })

  return {
    response: { added, removed, errors },
    newState,
  }
}






 