import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Attributes, Meter, MetricOptions } from '@opentelemetry/api'
import type { logs } from '@opentelemetry/api-logs'
import type { LoggerProvider } from '@opentelemetry/sdk-logs'
import type { MeterProvider } from '@opentelemetry/sdk-metrics'
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { realpathSync } from 'fs'
import sumBy from 'lodash-es/sumBy.js'
import { cwd } from 'process'
import type { HookEvent, ModelUsage } from '../entrypoints/agentSdkTypes.js'
import type { AgentColorName } from '../tools/AgentTool/agentColorManager.js'
import type { HookCallbackMatcher } from '../types/hooks.js'
// Indirection for browser-sdk build (package.json "browser" field swaps
// crypto.ts for crypto.browser.ts). Pure leaf re-export of node:crypto —
// zero circular-dep risk. Path-alias import bypasses bootstrap-isolation
// (rule only checks ./ and / prefixes); explicit disable documents intent.
// eslint-disable-next-line custom-rules/bootstrap-isolation
import { randomUUID } from '../utils/crypto.js'
import type { ModelSetting } from '../utils/model/model.js'
import type { ModelStrings } from '../utils/model/modelStrings.js'
import type { SettingSource } from '../utils/settings/constants.js'
import { resetSettingsCache } from '../utils/settings/settingsCache.js'
import type { PluginHookMatcher } from '../utils/settings/types.js'
import { createSignal } from '../utils/signal.js'

// Union type for registered hooks - can be SDK callbacks or native plugin hooks
type RegisteredHookMatcher = HookCallbackMatcher | PluginHookMatcher

import type { SessionId } from '../types/ids.js'

// DO NOT ADD MORE STATE HERE - BE JUDICIOUS WITH GLOBAL STATE

// dev: true on entries that came via --dangerously-load-development-channels.
// The allowlist gate checks this per-entry (not the session-wide
// hasDevChannels bit) so passing both flags doesn't let the dev dialog's
// acceptance leak allowlist-bypass to the --channels entries.
export type ChannelEntry =
  | { kind: 'plugin'; name: string; marketplace: string; dev?: boolean }
  | { kind: 'server'; name: string; dev?: boolean }

export type AttributedCounter = {
  add(value: number, additionalAttributes?: Attributes): void
}

type State = {
  originalCwd: string
  // Stable project root - set once at startup (including by --worktree flag),
  // never updated by mid-session EnterWorktreeTool.
  // Use for project identity (history, skills, sessions) not file operations.
  projectRoot: string
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  turnHookDurationMs: number
  turnToolDurationMs: number
  turnClassifierDurationMs: number
  turnToolCount: number
  turnHookCount: number
  turnClassifierCount: number
  startTime: number
  lastInteractionTime: number
  totalLinesAdded: number
  totalLinesRemoved: number
  hasUnknownModelCost: boolean
  cwd: string
  modelUsage: { [modelName: string]: ModelUsage }
  mainLoopModelOverride: ModelSetting | undefined
  initialMainLoopModel: ModelSetting
  modelStrings: ModelStrings | null
  isInteractive: boolean
  kairosActive: boolean
  // When true, ensureToolResultPairing throws on mismatch instead of
  // repairing with synthetic placeholders. HFI opts in at startup so
  // trajectories fail fast rather than conditioning the model on fake
  // tool_results.
  strictToolResultPairing: boolean
  sdkAgentProgressSummariesEnabled: boolean
  userMsgOptIn: boolean
  clientType: string
  sessionSource: string | undefined
  questionPreviewFormat: 'markdown' | 'html' | undefined
  flagSettingsPath: string | undefined
  flagSettingsInline: Record<string, unknown> | null
  allowedSettingSources: SettingSource[]
  sessionIngressToken: string | null | undefined
  oauthTokenFromFd: string | null | undefined
  apiKeyFromFd: string | null | undefined
  // Telemetry state
  meter: Meter | null
  sessionCounter: AttributedCounter | null
  locCounter: AttributedCounter | null
  prCounter: AttributedCounter | null
  commitCounter: AttributedCounter | null
  costCounter: AttributedCounter | null
  tokenCounter: AttributedCounter | null
  codeEditToolDecisionCounter: AttributedCounter | null
  activeTimeCounter: AttributedCounter | null
  statsStore: { observe(name: string, value: number): void } | null
  sessionId: SessionId
  // Parent session ID for tracking session lineage (e.g., plan mode -> implementation)
  parentSessionId: SessionId | undefined
  // Logger state
  loggerProvider: LoggerProvider | null
  eventLogger: ReturnType<typeof logs.getLogger> | null
  // Meter provider state
  meterProvider: MeterProvider | null
  // Tracer provider state
  tracerProvider: BasicTracerProvider | null
  // Agent color state
  agentColorMap: Map<string, AgentColorName>
  agentColorIndex: number
  // Last API request for bug reports
  lastAPIRequest: Omit<BetaMessageStreamParams, 'messages'> | null
  // Messages from the last API request (ant-only; reference, not clone).
  // Captures the exact post-compaction, CLAUDE.md-injected message set sent
  // to the API so /share's serialized_conversation.json reflects reality.
  lastAPIRequestMessages: BetaMessageStreamParams['messages'] | null
  // Last auto-mode classifier request(s) for /share transcript
  lastClassifierRequests: unknown[] | null
  // CLAUDE.md content cached by context.ts for the auto-mode classifier.
  // Breaks the yoloClassifier → claudemd → filesystem → permissions cycle.
  cachedClaudeMdContent: string | null
  // In-memory error log for recent errors
  inMemoryErrorLog: Array<{ error: string; timestamp: string }>
  // Session-only plugins from --plugin-dir flag
  inlinePlugins: Array<string>
  // Explicit --chrome / --no-chrome flag value (undefined = not set on CLI)
  chromeFlagOverride: boolean | undefined
  // Use cowork_plugins directory instead of plugins (--cowork flag or env var)
  useCoworkPlugins: boolean
  // Session-only bypass permissions mode flag (not persisted)
  sessionBypassPermissionsMode: boolean
  // Session-only flag gating the .claude/scheduled_tasks.json watcher
  // (useScheduledTasks). Set by cronScheduler.start() when the JSON has
  // entries, or by CronCreateTool. Not persisted.
  scheduledTasksEnabled: boolean
  // Session-only cron tasks created via CronCreate with durable: false.
  // Fire on schedule like file-backed tasks but are never written to
  // .claude/scheduled_tasks.json — they die with the process. Typed via
  // SessionCronTask below (not importing from cronTasks.ts keeps
  // bootstrap a leaf of the import DAG).
  sessionCronTasks: SessionCronTask[]
  // Teams created this session via TeamCreate. cleanupSessionTeams()
  // removes these on gracefulShutdown so subagent-created teams don't
  // persist on disk forever (gh-32730). TeamDelete removes entries to
  // avoid double-cleanup. Lives here (not teamHelpers.ts) so
  // resetStateForTests() clears it between tests.
  sessionCreatedTeams: Set<string>
  // Session-only trust flag for home directory (not persisted to disk)
  // When running from home dir, trust dialog is shown but not saved to disk.
  // This flag allows features requiring trust to work during the session.
  sessionTrustAccepted: boolean
  // Session-only flag to disable session persistence to disk
  sessionPersistenceDisabled: boolean
  // Track if user has exited plan mode in this session (for re-entry guidance)
  hasExitedPlanMode: boolean
  // Track if we need to show the plan mode exit attachment (one-time notification)
  needsPlanModeExitAttachment: boolean
  // Track if we need to show the auto mode exit attachment (one-time notification)
  needsAutoModeExitAttachment: boolean
  // Track if LSP plugin recommendation has been shown this session (only show once)
  lspRecommendationShownThisSession: boolean
  // SDK init event state - jsonSchema for structured output
  initJsonSchema: Record<string, unknown> | null
  // Registered hooks - SDK callbacks and plugin native hooks
  registeredHooks: Partial<Record<HookEvent, RegisteredHookMatcher[]>> | null
  // Cache for plan slugs: sessionId -> wordSlug
  planSlugCache: Map<string, string>
  // Track teleported session for reliability logging
  teleportedSessionInfo: {
    isTeleported: boolean
    hasLoggedFirstMessage: boolean
    sessionId: string | null
  } | null
  // Track invoked skills for preservation across compaction
  // Keys are composite: `${agentId ?? ''}:${skillName}` to prevent cross-agent overwrites
  invokedSkills: Map<
    string,
    {
      skillName: string
      skillPath: string
      content: string
      invokedAt: number
      agentId: string | null
    }
  >
  // Track slow operations for dev bar display (ant-only)
  slowOperations: Array<{
    operation: string
    durationMs: number
    timestamp: number
  }>
  // SDK-provided betas (e.g., context-1m-2025-08-07)
  sdkBetas: string[] | undefined
  // Main thread agent type (from --agent flag or settings)
  mainThreadAgentType: string | undefined
  // Remote mode (--remote flag)
  isRemoteMode: boolean
  // Direct connect server URL (for display in header)
  directConnectServerUrl: string | undefined
  // System prompt section cache state
  systemPromptSectionCache: Map<string, string | null>
  // Last date emitted to the model (for detecting midnight date changes)
  lastEmittedDate: string | null
  // Additional directories from --add-dir flag (for CLAUDE.md loading)
  additionalDirectoriesForClaudeMd: string[]
  // Channel server allowlist from --channels flag (servers whose channel
  // notifications should register this session). Parsed once in main.tsx —
  // the tag decides trust model: 'plugin' → marketplace verification +
  // allowlist, 'server' → allowlist always fails (schema is plugin-only).
  // Either kind needs entry.dev to bypass allowlist.
  allowedChannels: ChannelEntry[]
  // True if any entry in allowedChannels came from
  // --dangerously-load-development-channels (so ChannelsNotice can name the
  // right flag in policy-blocked messages)
  hasDevChannels: boolean
  // Dir containing the session's `.jsonl`; null = derive from originalCwd.
  sessionProjectDir: string | null
  // Cached prompt cache 1h TTL allowlist from GrowthBook (session-stable)
  promptCache1hAllowlist: string[] | null
  // Cached 1h TTL user eligibility (session-stable). Latched on first
  // evaluation so mid-session overage flips don't change the cache_control
  // TTL, which would bust the server-side prompt cache.
  promptCache1hEligible: boolean | null
  // Sticky-on latch for AFK_MODE_BETA_HEADER. Once auto mode is first
  // activated, keep sending the header for the rest of the session so
  // Shift+Tab toggles don't bust the ~50-70K token prompt cache.
  afkModeHeaderLatched: boolean | null
  // Sticky-on latch for FAST_MODE_BETA_HEADER. Once fast mode is first
  // enabled, keep sending the header so cooldown enter/exit doesn't
  // double-bust the prompt cache. The `speed` body param stays dynamic.
  fastModeHeaderLatched: boolean | null
  // Sticky-on latch for the cache-editing beta header. Once cached
  // microcompact is first enabled, keep sending the header so mid-session
  // GrowthBook/settings toggles don't bust the prompt cache.
  cacheEditingHeaderLatched: boolean | null
  // Sticky-on latch for clearing thinking from prior tool loops. Triggered
  // when >1h since last API call (confirmed cache miss — no cache-hit
  // benefit to keeping thinking). Once latched, stays on so the newly-warmed
  // thinking-cleared cache isn't busted by flipping back to keep:'all'.
  thinkingClearLatched: boolean | null
  // Current prompt ID (UUID) correlating a user prompt with subsequent OTel events
  promptId: string | null
  // Last API requestId for the main conversation chain (not subagents).
  // Updated after each successful API response for main-session queries.
  // Read at shutdown to send cache eviction hints to inference.
  lastMainRequestId: string | undefined
  // Timestamp (Date.now()) of the last successful API call completion.
// 用于计算 tengu_api_success 中的 timeSinceLastApiCallMs，以便将缓存未命中与空闲时间相关联（缓存 TTL 约为5分钟）。
lastApiCompletionTimestamp: number | null  
// 设置为 true 后压缩完成（自动或手动 /compact）。由 logAPISuccess 使用，标记压缩后的首次 API 调用，以便区分压缩引起的缓存未命中与 TTL 过期。
pendingPostCompaction: boolean  
}

// 同样在这里 - 在修改前请仔细思考三次
function getInitialState(): State {  
  // 解析 cwd 中的符号链接，以匹配 shell.ts 中 setCwd 的行为
  // 这确保了路径在会话存储中的处理方式与 shell 命令一致
  let resolvedCwd = ''  
  if (  
    typeof process !== 'undefined' &&  
    typeof process.cwd === 'function' &&  
    typeof realpathSync === 'function'  
  ) {  
    const rawCwd = cwd()  
    try {  
      resolvedCwd = realpathSync(rawCwd).normalize('NFC')  
    } catch {  
      // 文件提供者在 CloudStorage 挂载时出现 EPERM 错误（逐路径组件进行 lstat）。
      resolvedCwd = rawCwd.normalize('NFC')  
    }  
  }  
  const state: State = {  
    originalCwd: resolvedCwd,  
    projectRoot: resolvedCwd,  
    totalCostUSD: 0,  
    totalAPIDuration: 0,  
    totalAPIDurationWithoutRetries: 0,  
    totalToolDuration: 0,  
    turnHookDurationMs: 0,  
    turnToolDurationMs: 0,  
    turnClassifierDurationMs: 0,  
    turnToolCount: 0,  
    turnHookCount: 0,  
    turnClassifierCount: 0,  
    startTime: Date.now(),  
    lastInteractionTime: Date.now(),  
    totalLinesAdded: 0,  
    totalLinesRemoved: 0,  
    hasUnknownModelCost: false,  
    cwd: resolvedCwd,  
    modelUsage: {},  
    mainLoopModelOverride: undefined,  
    initialMainLoopModel: null,  
    modelStrings: null,  
    isInteractive: false,  
    kairosActive: false,  
    strictToolResultPairing: false,  
    sdkAgentProgressSummariesEnabled: false,  
    userMsgOptIn: false,  
    clientType: 'cli',  
    sessionSource: undefined,  
    questionPreviewFormat: undefined,  
    sessionIngressToken: undefined,  
    oauthTokenFromFd: undefined,  
    apiKeyFromFd: undefined,  
    flagSettingsPath: undefined,  
    flagSettingsInline: null,  
    allowedSettingSources: [  
      'userSettings',  
      'projectSettings',  
      'localSettings',  
      'flagSettings',  
      'policySettings',  
    ],  
    // 遥测状态
    meter: null,  
    sessionCounter: null,  
    locCounter: null,  
    prCounter: null,  
    commitCounter: null,  
    costCounter: null,  
    tokenCounter: null,  
    codeEditToolDecisionCounter: null,  
    activeTimeCounter: null,  
    statsStore: null,  
    sessionId: randomUUID() as SessionId,  
    parentSessionId: undefined,  
    // 日志记录器状态
    loggerProvider: null,  
    eventLogger: null,  
    // 计量器提供者状态
    meterProvider: null,  
    tracerProvider: null,  
    // 代理颜色状态
    agentColorMap: new Map(),  
    agentColorIndex: 0,  
    // 最后一次 API 请求时间（用于错误报告）
    lastAPIRequest: null,  
    lastAPIRequestMessages: null,  
    // 最后一次自动模式分类器请求（用于 /share 转录）
    lastClassifierRequests: null,  
    cachedClaudeMdContent: null,  
    // 会话内错误日志（记录最近的错误）
    inMemoryErrorLog: [],  
    // 会话专用插件（来自 --plugin-dir 标志）
    inlinePlugins: [],  
    // 明确设置的 Chrome 标志覆盖值（undefined 表示未在命令行中设置）
    chromeFlagOverride: undefined,  
    // 使用 cowork_plugins 目录而不是 plugins
    useCoworkPlugins: false,  
    // 会话专用的权限绕过模式标志（不持久化）
    sessionBypassPermissionsMode: false,  
    // 已禁用的计划任务，直到通过标志或对话启用
    scheduledTasksEnabled: false,  
    // 会话创建的团队集合
    sessionCreatedTeams: new Set(),  
    // 会话专用的信任标志（不保存到磁盘）
    sessionTrustAccepted: false,  
    // 禁用会话持久化到磁盘的标志
    sessionPersistenceDisabled: false,  
    // 跟踪用户是否在本次会话中退出了计划模式
    hasExitedPlanMode: false,  
    // 是否需要显示计划模式退出附加信息
    needsPlanModeExitAttachment: false,  
  }  

  return state  
}    // Track if we need to show the auto mode exit attachment
    needsAutoModeExitAttachment: false,
    // Track if LSP plugin recommendation has been shown this session
    lspRecommendationShownThisSession: false,
    // SDK init event state
    initJsonSchema: null,
    registeredHooks: null,
    // Cache for plan slugs
    planSlugCache: new Map(),
    // Track teleported session for reliability logging
    teleportedSessionInfo: null,
    // Track invoked skills for preservation across compaction
    invokedSkills: new Map(),
    // Track slow operations for dev bar display
    slowOperations: [],
    // SDK-provided betas
    sdkBetas: undefined,
    // Main thread agent type
    mainThreadAgentType: undefined,
    // Remote mode
    isRemoteMode: false,
    ...(process.env.USER_TYPE === 'ant'
      ? {
          replBridgeActive: false,
        }
      : {}),
    // Direct connect server URL
    directConnectServerUrl: undefined,
    // System prompt section cache state
    systemPromptSectionCache: new Map(),
    // Last date emitted to the model
    lastEmittedDate: null,
    // Additional directories from --add-dir flag (for CLAUDE.md loading)
    additionalDirectoriesForClaudeMd: [],
    // Channel server allowlist from --channels flag
    allowedChannels: [],
    hasDevChannels: false,
    // Session project dir (null = derive from originalCwd)
    sessionProjectDir: null,
    // Prompt cache 1h allowlist (null = not yet fetched from GrowthBook)
    promptCache1hAllowlist: null,
    // Prompt cache 1h eligibility (null = not yet evaluated)
    promptCache1hEligible: null,
    // Beta header latches (null = not yet triggered)
    afkModeHeaderLatched: null,
    fastModeHeaderLatched: null,
    cacheEditingHeaderLatched: null,
    thinkingClearLatched: null,
    // Current prompt ID
    promptId: null,
    lastMainRequestId: undefined,
    lastApiCompletionTimestamp: null,
    pendingPostCompaction: false,
  }

  return state
}

// AND ESPECIALLY HERE
const STATE: State = getInitialState()

export function getSessionId(): SessionId {
  return STATE.sessionId
}

export function regenerateSessionId(
  options: { setCurrentAsParent?: boolean } = {},
): SessionId {
  if (options.setCurrentAsParent) {
    STATE.parentSessionId = STATE.sessionId
  }
  // Drop the outgoing session's plan-slug entry so the Map doesn't
  // accumulate stale keys. Callers that need to carry the slug across
  // (REPL.tsx clearContext) read it before calling clearConversation.
  STATE.planSlugCache.delete(STATE.sessionId)
  // Regenerated sessions live in the current project: reset projectDir to
  // null so getTranscriptPath() derives from originalCwd.
  STATE.sessionId = randomUUID() as SessionId
  STATE.sessionProjectDir = null
  return STATE.sessionId
}

export function getParentSessionId(): SessionId | undefined {
  return STATE.parentSessionId
}

/**
 * Atomically switch the active session. `sessionId` and `sessionProjectDir`
 * always change together — there is no separate setter for either, so they
 * cannot drift out of sync (CC-34).
 *
 * @param projectDir — directory containing `<sessionId>.jsonl`. Omit (or
 *   pass `null`) for sessions in the current project — the path will derive
 *   from originalCwd at read time. Pass `dirname(transcriptPath)` when the
 *   session lives in a different project directory (git worktrees,
 *   cross-project resume). Every call resets the project dir; it never
 *   carries over from the previous session.
 */
export function switchSession(
  sessionId: SessionId,
  projectDir: string | null = null,
): void {
  // Drop the outgoing session's plan-slug entry so the Map stays bounded
  // across repeated /resume. Only the current session's slug is ever read
  // (plans.ts getPlanSlug defaults to getSessionId()).
  STATE.planSlugCache.delete(STATE.sessionId)
  STATE.sessionId = sessionId
  STATE.sessionProjectDir = projectDir
  sessionSwitched.emit(sessionId)
}

const sessionSwitched = createSignal<[id: SessionId]>()

/**
 * Register a callback that fires when switchSession changes the active
/**
 * sessionId. bootstrap无法直接导入监听器（DAG叶子节点），因此
 * 调用者自行注册。concurrentSessions.ts 使用此方法来保持 PID 文件中的
 * sessionId 与 --resume 同步。
 */
export const onSessionSwitch = sessionSwitched.subscribe

/**
 * 当前会话的转录所在项目目录，如果该会话是在当前项目中创建的（常见情况 —— 来自 originalCwd），
 * 则为 null。参见 `switchSession()`。
 */
export function getSessionProjectDir(): string | null {
  return STATE.sessionProjectDir
}

export function getOriginalCwd(): string {
  return STATE.originalCwd
}

/**
 * 获取稳定的项目根目录。
 * 与 getOriginalCwd() 不同，此方法不会在会话中途被 EnterWorktreeTool 更新，
 * 因此当进入临时工作目录时，技能/历史记录保持稳定（不会漂移）。
 * 它会在启动时由 --worktree 设置，因为该工作目录是会话的项目。
 * 适用于需要项目标识符（如历史记录、技能、会话）而非文件操作的场景。
 */
export function getProjectRoot(): string {
  return STATE.projectRoot
}

export function setOriginalCwd(cwd: string): void {
  STATE.originalCwd = cwd.normalize('NFC')
}

/**
 * 仅用于 --worktree 启动标志。会话中途的 EnterWorktreeTool 不应调用此方法，
 * —— 技能/历史记录应保持锚定在会话启动的位置。
 */
export function setProjectRoot(cwd: string): void {
  STATE.projectRoot = cwd.normalize('NFC')
}

export function getCwdState(): string {
  return STATE.cwd
}

export function setCwdState(cwd: string): void {
  STATE.cwd = cwd.normalize('NFC')
}

export function getDirectConnectServerUrl(): string | undefined {
  return STATE.directConnectServerUrl
}

export function setDirectConnectServerUrl(url: string): void {
  STATE.directConnectServerUrl = url
}

export function addToTotalDurationState(
  duration: number,
  durationWithoutRetries: number,
): void {
  STATE.totalAPIDuration += duration
  STATE.totalAPIDurationWithoutRetries += durationWithoutRetries
}

export function resetTotalDurationStateAndCost_FOR_TESTS_ONLY(): void {
  STATE.totalAPIDuration = 0
  STATE.totalAPIDurationWithoutRetries = 0
  STATE.totalCostUSD = 0
}

export function addToTotalCostState(
  cost: number,
  modelUsage: ModelUsage,
  model: string,
): void {
  STATE.modelUsage[model] = modelUsage
  STATE.totalCostUSD += cost
}

export function getTotalCostUSD(): number {
  return STATE.totalCostUSD
}

export function getTotalAPIDuration(): number {
  return STATE.totalAPIDuration
}

export function getTotalDuration(): number {
  return Date.now() - STATE.startTime
}

export function getTotalAPIDurationWithoutRetries(): number {
  return STATE.totalAPIDurationWithoutNotRies
}

export function getTotalToolDuration(): number {
  return STATE.totalToolDuration
}

export function addToToolDuration(duration: number): void {
  STATE.totalToolDuration += duration
  STATE.turnToolDurationMs += duration
  STATE.turnToolCount++
}

export function getTurnHookDurationMs(): number {
  return STATE.turnHookDurationMs
}

export function addToTurnHookDuration(duration: number): void {
  STATE.turnHookDurationMs += duration
  STATE.turnHookCount++
}

export function resetTurnHookDuration(): void {
  STATE.turnHookDurationMs = 0
  STATE.turnHookCount = 0
}

export function getTurnHookCount(): number {
  return STATE.turnHookCount
}

export function getTurnToolDurationMs(): number {
  return STATE.turnToolDurationMs
}

export function resetTurnToolDuration(): void {
  STATE.turnToolDurationMs = 0
  STATE.turnToolCount = 0
}

export function getTurnToolCount(): number {
  return STATE.turnToolCount
}

export function getTurnClassifierDurationMs(): number {
  return STATE.turnClassifierDurationMs
}

export function addToTurnClassifierDuration(duration: number): void {
  STATE.turnClassifierDurationMs += duration
  STATE.turnClassifierCount++
}

export function resetTurnClassifierDuration(): void {
  STATE.turnClassifierDurationMs = 0
  STATE.turnClassifierCount = 0
}

export function getTurnClassifierCount(): number {
  return STATE.turnClassifierCount
}导出函数获取统计存储(): {
  注册观察者(name: string, value: number): void
} | null {
  返回 STATE.statsStore
}

导出函数设置统计存储(
  存储: { 注册观察者(name: string, value: number): void } | null,
): void {
  STATE.statsStore = 存储
}

/**
 * 标记发生了一次交互。
 *
 * 默认情况下，实际的 Date.now() 调用会被延迟到下一个 Ink 渲染帧（通过刷新交互时间()实现），这样可以避免在每次按键时都调用 Date.now()。
 *
 * 当从 React useEffect 回调或其他在 Ink 渲染周期之后运行的代码中调用时，传递 `即时 = true`。如果不传递，则时间戳会保持过时状态直到下一次渲染，如果用户处于空闲状态（例如等待权限对话框输入），则可能永远不会发生渲染。
 */
让交互时间需要刷新 = false

导出函数刷新上次交互时间(即时?: boolean): void {
  如果 (即时) {
    内部刷新交互时间()
  } 否则 {
    交互时间需要刷新 = true
  }
}

/**
 * 如果自上一次刷新以来有记录到交互，则现在更新时间戳。
 * 在每次 Ink 渲染周期之前被调用，以便将多个按键操作合并为单个 Date.now() 调用。
 */
导出函数刷新交互时间(): void {
  如果 (交互时间需要刷新) {
    内部刷新交互时间()
  }
}

函数内部刷新交互时间(): void {
  STATE.lastInteractionTime = 当前时间
  交互时间需要刷新 = false
}

导出函数增加总行数(添加: number, 移除: number): void {
  STATE.totalLinesAdded += 添加
  STATE.totalLinesRemoved += 移除
}

导出函数获取总添加行数(): number {
  返回 STATE.totalLinesAdded
}

导出函数获取总移除行数(): number {
  返回 STATE.totalLinesRemoved
}

导出函数获取总输入令牌数(): number {
  返回 对每个模型使用情况求和( 'inputTokens' )
}

导出函数获取总输出令牌数(): number {
  返回 对每个模型使用情况求和( 'outputTokens' )
}

导出函数获取总缓存读取输入令牌数(): number {
  返回 对每个模型使用情况求和( 'cacheReadInputTokens' )
}

导出函数获取总缓存创建输入令牌数(): number {
  返回 对每个模型使用情况求和( 'cacheCreationInputTokens' )
}

导出函数获取总网页搜索请求次数(): number {
  返回 对每个模型使用情况求和( 'webSearchRequests' )
}

让输出令牌在回合开始时 = 0
让当前回合令牌预算: number | null = 空值
导出函数获取回合输出令牌数(): number {
  返回 获取总输出令牌数() - 输出令牌在回合开始时
}
导出函数获取当前回合令牌预算(): number | null {
  返回 当前回合令牌预算
}
让预算延续计数 = 0
导出函数快照回合输出令牌数(预算: number | null): void {
  输出令牌在回合开始时 = 获取总输出令牌数()
  当前回合令牌预算 = 预算
  预算延续计数 = 0
}
导出函数获取预算延续次数(): number {
  返回 预算延续计数
}
导出函数增加预算延续计数(): void {
  预算延续计数++
}

导出函数设置未知模型成本标志(): void {
  STATE.hasUnknownModelCost = 真
}

导出函数检查是否有未知模型成本(): boolean {
  返回 STATE.hasUnknownModelCost
}

导出函数获取上次主要请求ID(): string | 不确定值 {
  返回 STATE.lastMainRequestId
}

导出函数设置上次主要请求ID(请求ID: string): void {
  STATE.lastMainRequestId = 请求ID
}

导出函数获取上次API完成时间戳(): number | 不确定值 {
  返回 STATE.lastApiCompletionTimestamp
}

导出函数设置上次API完成时间戳(时间戳: number): void {
  STATE.lastApiCompletionTimestamp = 时间戳
}

/**
 * 标记发生了一次压缩操作。下一次 API 成功事件将包含 isPostCompaction=true，然后该标志会自动重置。
 */
导出函数标记后压缩(): void {
  STATE.pendingPostCompaction = 真
}

/**
 * 消耗后压缩标志。在一次压缩之后返回真，然后直到下一次压缩之前返回假。
 */const was = STATE.pendingPostCompaction
STATE.pendingPostCompaction = false
return was
}

export function getLastInteractionTime(): number {
  return STATE.lastInteractionTime
}

// 滚动拖拽暂停 — 背景间隔在执行工作前检查此标志
// 以便不与滚动帧竞争事件循环。由 ScrollBox 的 scrollBy/scrollTo 设置，
// 在最后一次滚动事件后清除 SCROLL_DRAIN_IDLE_MS。模块作用域（不在 STATE 中）—
// 临时热路径标志，无需测试重置，因为防抖定时器会自动清除。
let scrollDraining = false
let scrollDrainTimer: ReturnType<typeof setTimeout> | undefined
const SCROLL_DRAIN_IDLE_MS = 150

export function markScrollActivity(): void {
  scrollDraining = true
  if (scrollDrainTimer) clearTimeout(scrollDraining)
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false
    scrollDrainTimer = undefined
  }, SCROLL_DRAIN_IDLE_MS)
  scrollDrainTimer.unref?.()
}

export function getIsScrollDraining(): boolean {
  return scrollDraining
}

// bootstrap-isolation 禁止从 src/utils/ 导入 sleep()
// eslint-disable-next-line no-restricted-syntax
export async function waitForScrollIdle(): Promise<void> {
  while (scrollDraining) {
    await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.())
  }
}

export function getModelUsage(): { [modelName: string]: ModelUsage } {
  return STATE.modelUsage
}

export function getUsageForModel(model: string): ModelUsage | undefined {
  return STATE.modelUsage[model]
}

export function getMainLoopModelOverride(): ModelSetting | undefined {
  return STATE.mainLoopModelOverride
}

export function setMainLoopModelOverride(
  model: ModelSetting | undefined,
): void {
  STATE.mainLoopModelOverride = model
}

export function setInitialMainLoopModel(model: ModelSetting): void {
  STATE.initialMainLoopModel = model
}

export function getSdkBetas(): string[] | undefined {
  return STATE.sdkBetas
}

export function setSdkBetas(betas: string[] | undefined): void {
  STATE.sdkBetas = betas
}

export function resetCostState(): void {
  STATE.totalCostUSD = 0
  STATE.totalAPIDuration = 0
  STATE.totalAPIDurationWithoutRetries = 0
  STATE.totalToolDuration = 0
  STATE.startTime = Date.now()
  STATE.totalLinesAdded = 0
  STATE.totalLinesRemoved = 0
  STATE.hasUnknownModelCost = false
  STATE.modelUsage = {}
  STATE.promptId = null
}

/**
 * Sets cost state values for session restore.
 * Called by restoreCostStateForSession in cost-tracker.ts.
 */
export function setCostStateForRestore({
  totalCostUSD,
  totalAPIDuration,
  totalAPIDurationWithoutRetries,
  totalToolDuration,
  totalLinesAdded,
  totalLinesRemoved,
  lastDuration,
  modelUsage,
}: {
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  lastDuration: number | undefined
  modelUsage: { [modelName: string]: ModelUsage } | undefined
}): void {
  STATE.totalCostUSD = totalCostUSD
  STATE.totalAPIDuration = totalAPIDuration
  STATE.totalAPIDurationWithoutRetries = totalAPIDurationWithoutRetries
  STATE.totalToolDuration = totalToolDuration
  STATE.totalLinesAdded = totalLinesAdded
  STATE.totalLinesRemoved = totalLinesRemoved

  // 重新建立每个模型的使用分解情况  if (modelUsage) {
    STATE.modelUsage = modelUsage
  }

  // Adjust startTime to make wall duration accumulate
  if (lastDuration) {
    STATE.startTime = Date.now() - lastDuration
  }
}

// Only used in tests
export function resetStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetStateForTests 只能在测试中调用')
  }
  Object.entries(getInitialState()).forEach(([key, value]) => {
    STATE[key as keyof State] = value as never
  })
  outputTokensAtTurnStart = 0
  currentTurnTokenBudget = null
  budgetContinuationCount = 0
  sessionSwitched.clear()
}

// You shouldn't use this directly. See src/utils/model/modelStrings.ts::getModelStrings()
export function getModelStrings(): ModelStrings | null {
  return STATE.modelStrings
}

// You shouldn't use this directly. See src/utils/model/modelStrings.ts
export function setModelStrings(modelStrings: ModelStrings): void {
  STATE.modelStrings = modelStrings
}

// Test utility function to reset model strings for re-initialization.
// Separate from setModelStrings because we only want to accept 'null' in tests.
export function resetModelStringsForTestingOnly() {
  STATE.modelStrings = null
}

export function setMeter(
  meter: Meter,
  createCounter: (name: string, options: MetricOptions) => AttributedCounter,
): void {
  STATE.meter = meter

  // Initialize all counters using the provided factory
  STATE.sessionCounter = createCounter('claude_code.session.count', {
    description: 'CLI 会话启动次数',
  })
  STATE.locCounter = createCounter('claude_code.lines_of_code.count', {
    description:
      "修改的代码行数，'type' 属性表示新增或删除",
  })
  STATE.prCounter = createCounter('claude_code.pull_request.count', {
    description: '创建的拉取请求数',
  })
  STATE.commitCounter = createCounter('claude_code.commit.count', {
    description: '创建的 Git 提交数',
  })
  STATE.costCounter = createCounter('claude_code.cost.usage', {
    description: 'Claude Code 会话成本',
    unit: 'USD',
  })
  STATE.tokenCounter = createCounter('claude_code.token.usage', {
    description: '使用的 Token 数',
    unit: 'tokens',
  })
  STATE.codeEditToolDecisionCounter = createCounter(
    'claude_code.code_edit_tool.decision',
    {
      description:
        'Count of code editing tool permission decisions (accept/reject) for Edit, Write, and NotebookEdit tools',
    },
  )
  STATE.activeTimeCounter = createCounter('claude_code.active_time.total', {
    description: '总活跃时间（秒）',
    unit: 's',
  })
}

export function getMeter(): Meter | null {
  return STATE.meter
}

export function getSessionCounter(): AttributedCounter | null {
  return STATE.sessionCounter
}

export function getLocCounter(): AttributedCounter | null {
  return STATE.locCounter
}

export function getPrCounter(): AttributedCounter | null {
  return STATE.prCounter
}

export function getCommitCounter(): AttributedCounter | null {
  return STATE.commitCounter
}

export function getCostCounter(): AttributedCounter | null {
  return STATE.costCounter
}

export function getTokenCounter(): AttributedCounter | null {
  return STATE.tokenCounter
}

export function getCodeEditToolDecisionCounter(): AttributedCounter | null {
  return STATE.codeEditToolDecisionCounter
}

export function getActiveTimeCounter(): AttributedCounter | null {
  return STATE.activeTimeCounter
}

export function getLoggerProvider(): LoggerProvider | null {
  return STATE.loggerProvider
}

export function setLoggerProvider(provider: LoggerProvider | null): void {
  STATE.loggerProvider = provider
}

export function getEventLogger(): ReturnType<typeof logs.getLogger> | null {
  return STATE.eventLogger
}

export function setEventLogger(
  logger: ReturnType<typeof logs.getLogger> | null,
): void {
  STATE.eventLogger = logger
}

export function getMeterProvider(): MeterProvider | null {
  return STATE.meterProvider
}

export function setMeterProvider(provider: MeterProvider | null): void {
  STATE.meterProvider = provider
}
export function getTracerProvider(): BasicTracerProvider | null {
  return STATE.tracerProvider
}
export function setTracerProvider(provider: BasicTracerProvider | null): void {
  STATE.tracerProvider = provider
}

export function getIsNonInteractiveSession(): boolean {
  return !STATE.isInteractive
}

export function getIsInteractive(): boolean {
  return STATE.isInteractive
}

export function setIsInteractive(value: boolean): void {
  STATE.isInteractive = value
}

export function getClientType(): string {
  return STATE.clientType
}

export function setClientType(type: string): void {
  STATE.clientType = type
}

export function getSdkAgentProgressSummariesEnabled(): boolean {
  return STATE.sdkAgentProgressSummariesEnabled
}

export function setSdkAgentProgressSummariesEnabled(value: boolean): void {
  STATE.sdkAgentProgressSummariesEnabled = value
}

export function getKairosActive(): boolean {
  return STATE.kairosActive
}

export function setKairosActive(value: boolean): void {
  STATE.kairosActive = value
}

export function getStrictToolResultPairing(): boolean {
  return STATE.strictToolResultPairing
}

export function setStrictToolResultPairing(value: boolean): void {
  STATE.strictToolResultPairing = value
}

// 字段名 'userMsgOptIn' 避免了被排除的字符串子串 ('BriefTool', 'SendUserMessage' — 不区分大小写). 所有调用者都在 feature() 守卫内部，因此这些访问器不需要自己的（与 getKairosActive 相匹配）。

export function getUserMsgOptIn(): boolean {
  return STATE.userMsgOptIn
}

export function setUserMsgOptIn(value: boolean): void {
  STATE.userMsgOptIn = value
}

export function getSessionSource(): string | undefined {
  return STATE.sessionSource
}

export function setSessionSource(source: string): void {
  STATE.sessionSource = source
}

export function getQuestionPreviewFormat(): 'markdown' | 'html' | undefined {
  return STATE.questionPreviewFormat
}

export function setQuestionPreviewFormat(format: 'markdown' | 'html'): void {
  STATE.questionPreviewFormat = format
}

export function getAgentColorMap(): Map<string, AgentColorName> {
  return STATE.agentColorMap
}

export function getFlagSettingsPath(): string | undefined {
  return STATE.flagSettingsPath
}

export function setFlagSettingsPath(path: string | undefined): void {
  STATE.flagSettingsPath = path
}

export function getFlagSettingsInline(): Record<string, unknown> | null {
  return STATE.flagSettingsInline
}

export function setFlagSettingsInline(
  settings: Record<string, unknown> | null,
): void {
  STATE.flagSettingsInline = settings
}

export function getSessionIngressToken(): string | null | undefined {
  return STATE.sessionIngressToken
}

export function setSessionIngressToken(token: string | null): void {
  STATE.sessionIngressToken = token
}

export function getOauthTokenFromFd(): string | null | undefined {
  return STATE.oauthTokenFromFd
}

export function setOauthTokenFromFd(token: string | null): void {
  STATE.oauthTokenFromFd = token
}

export function getApiKeyFromFd(): string | null | undefined {
  return STATE.apiKeyFromFd
}

export function setApiKeyFromFd(key: string | null): void {
  STATE.apiKeyFromFd = key
}

export function setLastAPIRequest(
  params: Omit<BetaMessageStreamParams, 'messages'> | null,
): void {
  STATE.lastAPIRequest = params
}

export function getLastAPIRequest(): Omit<
  BetaMessageStreamParams,
  'messages'
> | null {
  return STATE.lastAPIRequest
}

export function setLastAPIRequestMessages(
  messages: BetaMessageStreamParams['messages'] | null,
): void {
  STATE.lastAPIRequestMessages = messages
}

export function getLastAPIRequestMessages():
  | BetaMessageStreamParams['messages']
  | null {
  return STATE.lastAPIRequestMessages
}

export function setLastClassifierRequests(requests: unknown[] | null): void {
  STATE.lastClassifierRequests = requests
}

export function getLastClassifierRequests(): unknown[] | null {
  return STATE.lastClassifierRequests
}

export function setCachedClaudeMdContent(content: string | null): void {
  STATE.cachedClaudeMdContent = content
}

export function getCachedClaudeMdContent(): string | null {返回缓存的Claude Markdown内容。

export function addToInMemoryErrorLog(errorInfo: {
  错误信息: string
  时间戳: string
}): void {
  const MAX_IN_MEMORY_ERRORS = 100 // 最大内存错误数量
  if (STATE.inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    STATE.inMemoryErrorLog.shift() // 移除最旧的错误
  }
  STATE.inMemoryErrorLog.push(errorInfo)
}

export function getAllowedSettingSources(): SettingSource[] {
  return STATE.allowedSettingSources
}

export function setAllowedSettingSources(sources: SettingSource[]): void {
  STATE.allowedSettingSources = sources
}

export function preferThirdPartyAuthentication(): boolean {
  // IDE扩展应因认证原因被视为第一方
  return getIsNonInteractiveSession() && STATE.clientType !== 'claude-vscode'
}

export function setInlinePlugins(plugins: Array<string>): void {
  STATE.inlinePlugins = plugins
}

export function getInlinePlugins(): Array<string> {
  return STATE.inlinePlugins
}

export function setChromeFlagOverride(value: boolean | undefined): void {
  STATE.chromeFlagOverride = value
}

export function getChromeFlagOverride(): boolean | undefined {
  return STATE.chromeFlagOverride
}

export function setUseCoworkPlugins(value: boolean): void {
  STATE.useCoworkPlugins = value
  resetSettingsCache()
}

export function getUseCoworkPlugins(): boolean {
  return STATE.useCoworkPlugins
}

export function setSessionBypassPermissionsMode(enabled: boolean): void {
  STATE.sessionBypassPermissionsMode = enabled
}

export function getSessionBypassPermissionsMode(): boolean {
  return STATE.sessionBypassPermissionsMode
}

export function setScheduledTasksEnabled(enabled: boolean): void {
  STATE.scheduledTasksEnabled = enabled
}

export function getScheduledTasksEnabled(): boolean {
  return STATE.scheduledTasksEnabled
}

export type SessionCronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
  /**
   * 当设置为true时，任务由进程内同事（非团队负责人）创建。
   * 调度器将任务发送到该同事的pendingUserMessages队列，
   * 而非主REPL命令队列。会话专用 — 永不写入磁盘。
   */
  agentId?: string
}

export function getSessionCronTasks(): SessionCronTask[] {
  return STATE.sessionCronTasks
}

export function addSessionCronTask(task: SessionCronTask): void {
  STATE.sessionCronTasks.push(task)
}

/**
 * 返回实际删除的任务数量。调用者使用此返回值来跳过
 * 后续工作（例如读取磁盘上的任务），当所有任务ID
 * 都在此处被处理完毕时。
 */
export function removeSessionCronTasks(ids: readonly string[]): number {
  if (ids.length === 0) return 0
  const idSet = new Set(ids)
  const remaining = STATE.sessionCronTasks.filter(t => !idSet.has(t.id))
  const removed = STATE.sessionCronTasks.length - remaining.length
  if (removed === 0) return 0
  STATE.sessionCronTasks = remaining
  return removed
}

export function setSessionTrustAccepted(accepted: boolean): void {
  STATE.sessionTrustAccepted = accepted
}

export function getSessionTrustAccepted(): boolean {
  return STATE.sessionTrustAccepted
}

export function setSessionPersistenceDisabled(disabled: boolean): void {
  STATE.sessionPersistenceDisabled = disabled
}

export function isSessionPersistenceDisabled(): boolean {
  return STATE.sessionPersistenceDisabled
}

export function hasExitedPlanModeInSession(): boolean {
  return STATE.hasExitedPlanMode
}

export function setHasExitedPlanMode(value: boolean): void {
  STATE.hasExitedPlanMode = value
}

export function needsPlanModeExitAttachment(): boolean {
  return STATE.needsPlanModeExitAttachment
}

export function setNeedsPlanModeExitAttachment(value: boolean): void {
  STATE.needsPlanModeExitAttachment = value
}

export function handlePlanModeTransition(
  fromMode: string,
  toMode: string,
): void {
  // 如果切换到计划模式，清除任何待处理的退出附加任务
  // 这可以防止在用户快速切换时同时发送plan_mode和plan_mode_exit
  if (toMode === 'plan' && fromMode !== 'plan') {STATE.needsPlanModeExitAttachment = false
  }

  // 如果切换出计划模式，则触发plan_mode_exit附加功能
  if (fromMode === 'plan' && toMode !== 'plan') {
    STATE.needsPlanModeExitAttachment = true
  }
}

export function needsAutoModeExitAttachment(): boolean {
  return STATE.needsAutoModeExitAttachment
}

export function setNeedsAutoModeExitAttachment(value: boolean): void {
  STATE.needsAutoModeExitAttachment = value
}

export function handleAutoModeTransition(
  fromMode: string,
  toMode: string,
): void {
  // Auto↔plan模式切换由prepareContextForPlanMode（如果选择保持自动模式，即使进入计划模式也会保持）和ExitPlanMode（恢复模式）处理
  // 跳过两个方向，因此此函数仅处理直接的自动模式切换
  if (
    (fromMode === 'auto' && toMode === 'plan') ||
    (fromMode === 'plan' && toMode === 'auto')
  ) {
    return
  }
  const fromIsAuto = fromMode === 'auto'
  const toIsAuto = toMode === 'auto'

  // 如果切换到自动模式，清除任何待处理的退出附加功能
  // 这样可以防止在用户快速切换时同时发送auto_mode和auto_mode_exit
  if (toIsAuto && !fromIsAuto) {
    STATE.needsAutoModeExitAttachment = false
  }

  // 如果从自动模式切换出去，则触发auto_mode_exit附加功能
  if (fromIsAuto && !toIsAuto) {
    STATE.needsAutoModeExitAttachment = true
  }
}

// LSP插件推荐会话跟踪
export function hasShownLspRecommendationThisSession(): boolean {
  return STATE.lspRecommendationShownThisSession
}

export function setLspRecommendationShownThisSession(value: boolean): void {
  STATE.lspRecommendationShownThisSession = value
}

// SDK初始化JSON模式状态
export function setInitJsonSchema(schema: Record<string, unknown>): void {
  STATE.initJsonSchema = schema
}

export function getInitJsonSchema(): Record<string, unknown> | null {
  return STATE.initJsonSchema
}

export function registerHookCallbacks(
  hooks: Partial<Record<HookEvent, RegisteredHookMatcher[]>>,
): void {
  if (!STATE.registeredHooks) {
    STATE.registeredHooks = {}
  }

  // `registerHookCallbacks` 可能被多次调用，所以我们需要合并（而不是覆盖）
  for (const [event, matchers] of Object.entries(hooks)) {
    const eventKey = event as HookEvent
    if (!STATE.registeredHooks[eventKey]) {
      STATE.registeredHooks[eventKey] = []
    }
    STATE.registeredHooks[eventKey]!.push(...matchers)
  }
}

export function getRegisteredHooks(): Partial<
  Record<HookEvent, RegisteredHookMatcher[]>
> | null {
  return STATE.registeredHooks
}

export function clearRegisteredHooks(): void {
  STATE.registeredHooks = null
}

export function clearRegisteredPluginHooks(): void {
  if (!STATE.registeredHooks) {
    return
  }

  const filtered: Partial<Record<HookEvent, RegisteredHookMatcher[]>> = {}
  for (const [event, matchers] of Object.entries(STATE.registeredHooks)) {
    // 仅保留回调钩（那些没有pluginRoot的）
    const callbackHooks = matchers.filter(m => !('pluginRoot' in m))
    if (callbackHooks.length > 0) {
      filtered[event as HookEvent] = callbackHooks
    }
  }

  STATE.registeredHooks = Object.keys(filtered).length > 0 ? filtered : null
}

export function resetSdkInitState(): void {
  STATE.initJsonSchema = null
  STATE.registeredHooks = null
}

export function getPlanSlugCache(): Map<string, string> {
  return STATE.planSlugCache
}

export function getSessionCreatedTeams(): Set<string> {
  return STATE.sessionCreatedTeams
}

// Teleported会话跟踪，用于可靠性日志记录
export function setTeleportedSessionInfo(info: {
  sessionId: string | null
}): void {
  STATE.teleportedSessionInfo = {
    isTeleported: true,
    hasLoggedFirstMessage: false,
    sessionId: info.sessionId,
  }
}

export function getTeleportedSessionInfo(): {
  isTeleported: boolean
  hasLoggedFirstMessage: boolean
  sessionId: string | null
} | null {
  return STATE.teleportedSessionInfo
}

export function markFirstTeleportMessageLogged(): void {
  if (STATE.teleportedSessionInfo) {STATE.teleportedSessionInfo.hasLoggedFirstMessage = true
  }
}

// 跨压缩过程的技能调用跟踪以确保持久性保存
export type InvokedSkillInfo = {
  skillName: string
  skillPath: string
  content: string
  invokedAt: number
  agentId: string | null
}

export function addInvokedSkill(
  skillName: string,
  skillPath: string,
  content: string,
  agentId: string | null = null,
): void {
  const key = `${agentId ?? ''}:${skillName}`
  STATE.invokedSkills.set(key, {
    skillName,
    skillPath,
    content,
    invokedAt: Date.now(),
    agentId,
  })
}

export function getInvokedSkills(): Map<string, InvokedSkillInfo> {
  return STATE.invokedSkills
}

export function getInvokedSkillsForAgent(
  agentId: string | undefined | null,
): Map<string, InvokedSkillInfo> {
  const normalizedId = agentId ?? null
  const filtered = new Map<string, InvokedSkillInfo>()
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === normalizedId) {
      filtered.set(key, skill)
    }
  }
  return filtered
}

export function clearInvokedSkills(
  preservedAgentIds?: ReadonlySet<string>,
): void {
  if (!preservedAgentIds || preservedAgentIds.size === 0) {
    STATE.invokedSkills.clear()
    return
  }
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === null || !preservedAgentIds.has(skill.agentId)) {
      STATE.invokedSkills.delete(key)
    }
  }
}

export function clearInvokedSkillsForAgent(agentId: string): void {
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === agentId) {
      STATE.invokedSkills.delete(key)
    }
  }
}

// 开发者工具中的慢操作跟踪，用于性能监控
const MAX_SLOW_OPERATIONS = 10
const SLOW_OPERATION_TTL_MS = 10000

export function addSlowOperation(operation: string, durationMs: number): void {
  if (process.env.USER_TYPE !== 'ant') return
  // 跳过编辑器会话的跟踪（用户在$EDITOR中编辑提示文件）
  // 这些操作故意设计为较慢，因为用户正在撰写文本
  if (operation.includes('exec') && operation.includes('claude-prompt-')) {
    return
  }
  const now = Date.now()
  // 移除过期的操作记录
  STATE.slowOperations = STATE.slowOperations.filter(
    op => now - op.timestamp < SLOW_OPERATION_TTL_MS,
  )
  // 添加新的操作记录
  STATE.slowOperations.push({ operation, durationMs, timestamp: now })
  // 只保留最近的慢操作记录
  if (STATE.slowOperations.length > MAX_SLOW_OPERATIONS) {
    STATE.slowOperations = STATE.slowOperations.slice(-MAX_SLOW_OPERATIONS)
  }
}

const EMPTY_SLOW_OPERATIONS: ReadonlyArray<{
  operation: string
  durationMs: number
  timestamp: number
}> = []

export function getSlowOperations(): ReadonlyArray<{
  operation: string
  durationMs: number
  timestamp: number
}> {
  // 最常见情况：未跟踪任何操作。返回一个稳定的引用，以便调用者的setState()可以通过Object.is进行智能检查，避免在操作记录未变化时频繁重渲染（提高性能）
  if (STATE.slowOperations.length === 0) {
    return EMPTY_SLOW_OPERATIONS
  }
  const now = Date.now()
  // 当操作记录仍然有效时，直接返回已有引用，避免每次轮询都创建新数组导致不必要的渲染
  if (
    STATE.slowOperations.some(op => now - op.timestamp >= SLOW_OPERATION_TTL_MS)
  ) {
    STATE.slowOperations = STATE.slowOperations.filter(
      op => now - op.timestamp < SLOW_OPERATION_TTL_MS,
    )
    if (STATE.slowOperations.length === 0) {
      return EMPTY_SLOW_OPERATIONS
    }
  }
  // 安全地直接返回：addSlowOperation()在添加操作前会重新赋值STATE.slowOperations，因此React状态中的数组永远不会被直接修改（避免闭包问题）
  return STATE.slowOperations
}

export function getMainThreadAgentType(): string | undefined {
  return STATE.mainThreadAgentType
}

export function setMainThreadAgentType(agentType: string | undefined): void {
  STATE.mainThreadAgentType = agentType
}

export function getIsRemoteMode(): boolean {
  return STATE.isRemoteMode
}

export function setIsRemoteMode(value: boolean): void {
  STATE.isRemoteMode = value
}

// 系统提示部分访问器

请注意，我仅翻译了代码中的英文注释和字符串字面量，保持了所有代码结构、变量名、函数名和导入路径不变。export function getSystemPromptSectionCache(): Map<string, string | null> {
  return STATE.systemPromptSectionCache
}

export function setSystemPromptSectionCacheEntry(
  name: string,
  value: string | null,
): void {
  STATE.systemPromptSectionCache.set(name, value)
}

export function clearSystemPromptSectionState(): void {
  STATE.systemPromptSectionCache.clear()
}

// 最后发出日期访问器（用于检测午夜日期变更）

export function getLastEmittedDate(): string | null {
  return STATE.lastEmittedDate
}

export function setLastEmittedDate(date: string | null): void {
  STATE.lastEmittedDate = date
}

export function getAdditionalDirectoriesForClaudeMd(): string[] {
  return STATE.additionalDirectoriesForClaudeMd
}

export function setAdditionalDirectoriesForClaudeMd(
  directories: string[],
): void {
  STATE.additionalDirectoriesForClaudeMd = directories
}

export function getAllowedChannels(): ChannelEntry[] {
  return STATE.allowedChannels
}

export function setAllowedChannels(entries: ChannelEntry[]): void {
  STATE.allowedChannels = entries
}

export function getHasDevChannels(): boolean {
  return STATE.hasDevChannels
}

export function setHasDevChannels(value: boolean): void {
  STATE.hasDevChannels = value
}

export function getPromptCache1hAllowlist(): string[] | null {
  return STATE.promptCache1hAllowlist
}

export function setPromptCache1hAllowlist(allowlist: string[] | null): void {
  STATE.promptCache1hAllowlist = allowlist
}

export function getPromptCache1hEligible(): boolean | null {
  return STATE.promptCache1hEligible
}

export function setPromptCache1hEligible(eligible: boolean | null): void {
  STATE.promptCache1hEligible = eligible
}

export function getAfkModeHeaderLatched(): boolean | null {
  return STATE.afkModeHeaderLatched
}

export function setAfkModeHeaderLatched(v: boolean): void {
  STATE.afkModeHeaderLatched = v
}

export function getFastModeHeaderLatched(): boolean | null {
  return STATE.fastModeHeaderLatched
}

export function setFastModeHeaderLatched(v: boolean): void {
  STATE.fastModeHeaderLatched = v
}

export function getCacheEditingHeaderLatched(): boolean | null {
  return STATE.cacheEditingHeaderLatched
}

export function setCacheEditingHeaderLatched(v: boolean): void {
  STATE.cacheEditingHeaderLatched = v
}

export function getThinkingClearLatched(): boolean | null {
  return STATE.thinkingClearLatched
}

export function setThinkingClearLatched(v: boolean): void {
  STATE.thinkingClearLatched = v
}

/**
 * 将Beta头部锁定重置为null。在/clear和/compact命令下调用，以便新对话获得新的头部评估。
 */
export function clearBetaHeaderLatches(): void {
  STATE.afkModeHeaderLatched = null
  STATE.fastModeHeaderLatched = null
  STATE.cacheEditingHeaderLatched = null
  STATE.thinkingClearLatched = null
}

export function getPromptId(): string | null {
  return STATE.promptId
}

export function setPromptId(id: string | null): void {
  STATE.promptId = id
}