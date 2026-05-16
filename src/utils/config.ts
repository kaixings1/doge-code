import { feature } from 'bun:bundle'
import { randomBytes } from 'crypto'
import { unwatchFile, watchFile } from 'fs'
import memoize from 'lodash-es/memoize.js'
import pickBy from 'lodash-es/pickBy.js'
import { basename, dirname, join, resolve } from 'path'
import { getOriginalCwd, getSessionTrustAccepted } from '../bootstrap/state.js'
import { getAutoMemEntrypoint } from '../memdir/paths.js'
import { logEvent } from '../services/analytics/index.js'
import type { McpServerConfig } from '../services/mcp/types.js'
import type {
  BillingType,
  ReferralEligibilityResponse,
} from '../services/oauth/types.js'
import { getCwd } from '../utils/cwd.js'
import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'
import { logForDiagnosticsNoPII } from './diagLogs.js'
import { getGlobalClaudeFile } from './env.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js'
import { ConfigParseError, getErrnoCode } from './errors.js'
import { writeFileSyncAndFlush_DEPRECATED } from './file.js'
import { getFsImplementation } from './fsOperations.js'
import { findCanonicalGitRoot } from './git.js'
import { safeParseJSON } from './json.js'
import { stripBOM } from './jsonRead.js'
import * as lockfile from './lockfile.js'
import { logError } from './log.js'
import type { MemoryType } from './memory/types.js'
import { normalizePathForConfigKey } from './path.js'
import { getEssentialTrafficOnlyReason } from './privacyLevel.js'
import { getManagedFilePath } from './settings/managedPath.js'
import type { ThemeSetting } from './theme.js'

 
const teamMemPaths = feature('TEAMMEM')
  ? (require('../memdir/teamMemPaths.js') as typeof import('../memdir/teamMemPaths.js'))
  : null
const ccrAutoConnect = feature('CCR_AUTO_CONNECT')
  ? (require('../bridge/bridgeEnabled.js') as typeof import('../bridge/bridgeEnabled.js'))
  : null

 
import type { ImageDimensions } from './imageResizer.js'
import type { ModelOption } from './model/modelOptions.js'
import { jsonParse, jsonStringify } from './slowOperations.js'

// 重入防护：防止配置文件损坏时发生 getConfig → logEvent → getGlobalConfig → getConfig
// 无限递归。logEvent 的采样检查从全局配置中读取 GrowthBook 特性，这又会调用 getConfig。
let insideGetConfig = false

// 图片坐标映射的尺寸信息（仅在图片被调整大小时设置）
export type PastedContent = {
  id: number // 顺序数字 ID
  type: 'text' | 'image'
  content: string
  mediaType?: string // 例如 'image/png', 'image/jpeg'
  filename?: string // 图片在附件槽中的显示名称
  dimensions?: ImageDimensions
  sourcePath?: string // 拖拽到终端的图片的原始文件路径
}

export interface SerializedStructuredHistoryEntry {
  display: string
  pastedContents?: Record<number, PastedContent>
  pastedText?: string
}
export interface HistoryEntry {
  display: string
  pastedContents: Record<number, PastedContent>
}

export type ReleaseChannel = 'stable' | 'latest'

export type ProjectConfig = {
  allowedTools: string[]
  mcpContextUris: string[]
  mcpServers?: Record<string, McpServerConfig>
  lastAPIDuration?: number
  lastAPIDurationWithoutRetries?: number
  lastToolDuration?: number
  lastCost?: number
  lastDuration?: number
  lastLinesAdded?: number
  lastLinesRemoved?: number
  lastTotalInputTokens?: number
  lastTotalOutputTokens?: number
  lastTotalCacheCreationInputTokens?: number
  lastTotalCacheReadInputTokens?: number
  lastTotalWebSearchRequests?: number
  lastFpsAverage?: number
  lastFpsLow1Pct?: number
  lastSessionId?: string
  lastModelUsage?: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheReadInputTokens: number
      cacheCreationInputTokens: number
      webSearchRequests: number
      costUSD: number
    }
  >
  lastSessionMetrics?: Record<string, number>
  exampleFiles?: string[]
  exampleFilesGeneratedAt?: number

  // 信任对话框设置
  hasTrustDialogAccepted?: boolean

  hasCompletedProjectOnboarding?: boolean
  projectOnboardingSeenCount: number
  hasClaudeMdExternalIncludesApproved?: boolean
  hasClaudeMdExternalIncludesWarningShown?: boolean
  // MCP 服务器审批字段 - 已迁移到设置但保留向后兼容性
  enabledMcpjsonServers?: string[]
  disabledMcpjsonServers?: string[]
  enableAllProjectMcpServers?: boolean
  // 禁用的 MCP 服务器列表（所有作用域）- 用于启用/禁用切换
  disabledMcpServers?: string[]
  // 默认为禁用的内置 MCP 服务器的选择加入列表
  enabledMcpServers?: string[]
  // Worktree 会话管理
  activeWorktreeSession?: {
    originalCwd: string
    worktreePath: string
    worktreeName: string
    originalBranch?: string
    sessionId: string
    hookBased?: boolean
  }
  /** `claude remote-control` 多会话的生成模式。由首次运行对话框或 `w` 切换设置。 */
  remoteControlSpawnMode?: 'same-dir' | 'worktree'
}

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  allowedTools: [],
  mcpContextUris: [],
  mcpServers: {},
  enabledMcpjsonServers: [],
  disabledMcpjsonServers: [],
  hasTrustDialogAccepted: false,
  projectOnboardingSeenCount: 0,
  hasClaudeMdExternalIncludesApproved: false,
  hasClaudeMdExternalIncludesWarningShown: false,
}

export type InstallMethod = 'local' | 'native' | 'global' | 'unknown'

export {
  EDITOR_MODES,
  NOTIFICATION_CHANNELS,
} from './configConstants.js'

import type { EDITOR_MODES, NOTIFICATION_CHANNELS } from './configConstants.js'

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export type AccountInfo = {
  accountUuid: string
  emailAddress: string
  organizationUuid?: string
  organizationName?: string | null // added 4/23/2025, not populated for existing users
  organizationRole?: string | null
  workspaceRole?: string | null
  // 由 /api/oauth/profile 填充
  displayName?: string
  hasExtraUsageEnabled?: boolean
  billingType?: BillingType | null
  accountCreatedAt?: string
  subscriptionCreatedAt?: string
}

// TODO: 为向后兼容保留 'emacs' —— 几个版本后移除
export type EditorMode = 'emacs' | (typeof EDITOR_MODES)[number]

export type DiffTool = 'terminal' | 'auto'

export type OutputStyle = string

export type GlobalConfig = {
  customApiEndpoint?: {
    provider?: 'anthropic' | 'openai'
    baseURL?: string
    apiKey?: string
    model?: string
    savedModels?: string[]
  }
  /**
   * @deprecated Use settings.apiKeyHelper instead.
   */
  apiKeyHelper?: string
  projects?: Record<string, ProjectConfig>
  numStartups: number
  installMethod?: InstallMethod
  autoUpdates?: boolean
  // 区分基于保护机制的禁用与用户偏好
  autoUpdatesProtectedForNative?: boolean
  // 上次显示 Doctor 时的会话计数
  doctorShownAtSession?: number
  userID?: string
  theme: ThemeSetting
  hasCompletedOnboarding?: boolean
  // 追踪重置入门的最后版本，与 MIN_VERSION_REQUIRING_ONBOARDING_RESET 配合使用
  lastOnboardingVersion?: string
  // 追踪已查看发布说明的最后版本，用于管理发布说明
  lastReleaseNotesSeen?: string
  // 上次获取更新日志的时间戳（内容存储在 ~/.claude/cache/changelog.md）
  changelogLastFetched?: number
  // @deprecated - 已迁移至 ~/.claude/cache/changelog.md。保留以支持迁移。
  cachedChangelog?: string
  mcpServers?: Record<string, McpServerConfig>
  // 至少成功连接过一次的 claude.ai MCP 连接器。
  // 用于控制"连接器不可用"/"需要认证"的启动通知：
  // 用户实际使用过的连接器在出问题时值得提醒，
  // 但组织配置的连接器从一开始就处于"需要认证"状态，
  // 说明用户已明确忽略，不应再打扰。
  claudeAiMcpEverConnected?: string[]
  preferredNotifChannel: NotificationChannel
  /**
   * @deprecated. 请改用 Notification 钩子 (docs/hooks.md)。
   */
  customNotifyCommand?: string
  verbose: boolean
  customApiKeyResponses?: {
    approved?: string[]
    rejected?: string[]
  }
  primaryApiKey?: string // 用户未设置环境变量时使用的主 API 密钥，通过 oauth 设置（TODO: 重命名）
  hasAcknowledgedCostThreshold?: boolean
  hasSeenUndercoverAutoNotice?: boolean // ant-only：是否已显示一次性自动隐匿说明
  hasSeenUltraplanTerms?: boolean // ant-only：是否已在 ultraplan 启动对话框中显示一次性 CCR 条款通知
  hasResetAutoModeOptInForDefaultOffer?: boolean // ant-only：一次性迁移防护，重新提示已流失的 auto-mode 用户
  oauthAccount?: AccountInfo
  iterm2KeyBindingInstalled?: boolean // 旧字段 —— 为向后兼容保留
  editorMode?: EditorMode
  bypassPermissionsModeAccepted?: boolean
  hasUsedBackslashReturn?: boolean
  autoCompactEnabled: boolean // 控制是否启用自动压缩
  showTurnDuration: boolean // 控制是否显示轮次耗时消息（例如"已耗时 1m 6s"）
  /**
   * @deprecated 请改用 settings.env。
   */
  env: { [key: string]: string } // 为 CLI 设置的环境变量
  hasSeenTasksHint?: boolean // 用户是否已看到任务提示
  hasUsedStash?: boolean // 用户是否已使用暂存功能 (Ctrl+S)
  hasUsedBackgroundTask?: boolean // 用户是否已将任务放入后台 (Ctrl+B)
  queuedCommandUpHintCount?: number // 用户看到队列命令提示的次数计数器
  diffTool?: DiffTool // 用于显示差异的工具（terminal 或 vscode）

  // 终端设置状态追踪
  iterm2SetupInProgress?: boolean
  iterm2BackupPath?: string // iTerm2 偏好设置备份文件路径
  appleTerminalBackupPath?: string // Terminal.app 偏好设置备份文件路径
  appleTerminalSetupInProgress?: boolean // Terminal.app 设置是否正在进行中

  // 快捷键绑定设置追踪
  shiftEnterKeyBindingInstalled?: boolean // 是否已安装 Shift+Enter 快捷键绑定（适用于 iTerm2 或 VSCode）
  optionAsMetaKeyInstalled?: boolean // 是否已安装 Option 作为 Meta 键（适用于 Terminal.app）

  // IDE 配置
  autoConnectIde?: boolean // 启动时是否自动连接 IDE（当仅有一个有效的 IDE 时）
  autoInstallIdeExtension?: boolean // 从 IDE 内运行时是否自动安装 IDE 扩展

  // IDE 对话框
  hasIdeOnboardingBeenShown?: Record<string, boolean> // 终端名称到 IDE 入门是否已显示的映射
  ideHintShownCount?: number // /ide 命令提示已显示次数
  hasIdeAutoConnectDialogBeenShown?: boolean // 自动连接 IDE 对话框是否已显示

  tipsHistory: {
    [tipId: string]: number // Key is tipId, value is the numStartups when tip was last shown
  }

  // /buddy companion soul — bones regenerated from userId on read. See src/buddy/.
  companion?: import('../buddy/types.js').StoredCompanion
  companionMuted?: boolean

  // 反馈调查追踪
  feedbackSurveyState?: {
    lastShownTime?: number
  }

  // 对话记录分享提示追踪（"不再询问"）
  transcriptShareDismissed?: boolean

  // 记忆使用追踪
  memoryUsageCount: number // 用户添加记忆的次数

  // Sonnet-1M 配置
  hasShownS1MWelcomeV2?: Record<string, boolean> // 每个组织的 Sonnet-1M v2 欢迎消息是否已显示
  // 每个组织的 Sonnet-1M 订阅者访问缓存 —— 键为组织 ID
  // hasAccess 表示 "hasAccessAsDefault"，但保留旧名称以保持向后
  // 兼容性。
  s1mAccessCache?: Record<
    string,
    { hasAccess: boolean; hasAccessNotAsDefault?: boolean; timestamp: number }
  >
  // 每个组织的 Sonnet-1M 按量付费访问缓存 —— 键为组织 ID
  // hasAccess 表示 "hasAccessAsDefault"，但保留旧名称以保持向后
  // 兼容性。
  s1mNonSubscriberAccessCache?: Record<
    string,
    { hasAccess: boolean; hasAccessNotAsDefault?: boolean; timestamp: number }
  >

  // 每个组织的访客通行证资格缓存 —— 键为组织 ID
  passesEligibilityCache?: Record<
    string,
    ReferralEligibilityResponse & { timestamp: number }
  >

  // 每个账户的 Grove 配置缓存 —— 键为账户 UUID
  groveConfigCache?: Record<
    string,
    { grove_enabled: boolean; timestamp: number }
  >

  // 访客通行证增销追踪
  passesUpsellSeenCount?: number // 访客通行证增销已显示次数
  hasVisitedPasses?: boolean // 用户是否已访问 /passes 命令
  passesLastSeenRemaining?: number // 上次看到的剩余通行证数量 —— 增加时重置增销

  // 超额信用额度赠予增销追踪（按组织 UUID 键控 —— 多组织用户）。
  // 使用内联形状（非 import()），因为 config.ts 在 SDK 构建表面中，
  // 且 SDK 打包器无法解析 CLI 服务模块。
  overageCreditGrantCache?: Record<
    string,
    {
      info: {
        available: boolean
        eligible: boolean
        granted: boolean
        amount_minor_units: number | null
        currency: string | null
      }
      timestamp: number
    }
  >
  overageCreditUpsellSeenCount?: number // 超额信用额度增销已显示次数
  hasVisitedExtraUsage?: boolean // 用户是否已访问 /extra-usage —— 隐藏信用增销

  // 语音模式通知追踪
  voiceNoticeSeenCount?: number // 语音模式可用通知已显示次数
  voiceLangHintShownCount?: number // /voice 听写语言提示已显示次数
  voiceLangHintLastLanguage?: string // 上次显示提示时解析的 STT 语言代码 —— 变更时重置计数
  voiceFooterHintSeenCount?: number // "按住 X 说话"底部提示已显示的会话数

  // Opus 1M 合并通知追踪
  opus1mMergeNoticeSeenCount?: number // opus-1m-merge 通知已显示次数

  // 实验注册通知追踪（按实验 ID 键控）
  experimentNoticesSeenCount?: Record<string, number>

  // OpusPlan 实验配置
  hasShownOpusPlanWelcome?: Record<string, boolean> // 每个组织的 OpusPlan 欢迎消息是否已显示

  // 队列使用追踪
  promptQueueUseCount: number // 用户使用提示队列的次数

  // Btw 使用追踪
  btwUseCount: number // 用户使用 /btw 的次数

  // Plan 模式使用追踪
  lastPlanModeUse?: number // 上次使用 plan 模式的时间戳

  // 订阅通知追踪
  subscriptionNoticeCount?: number // 订阅通知已显示次数
  hasAvailableSubscription?: boolean // 用户是否有可用订阅的缓存结果
  subscriptionUpsellShownCount?: number // 订阅增销已显示次数（已弃用）
  recommendedSubscription?: string // 来自 Statsig 的缓存配置值（已弃用）

  // Todo 功能配置
  todoFeatureEnabled: boolean // 是否启用 todo 功能
  showExpandedTodos?: boolean // 是否展开显示 todos（即使为空时）
  showSpinnerTree?: boolean // 是否显示队友微调器树而非药丸状指示器

  // 首次启动时间追踪
  firstStartTime?: string // 此机器上首次启动 Claude Code 的 ISO 时间戳

  messageIdleNotifThresholdMs: number // 用户需空闲多久才能收到 Claude 已完成生成的通知

  githubActionSetupCount?: number // 用户设置 GitHub Action 的次数
  slackAppInstallCount?: number // 用户点击安装 Slack 应用的次数

  // 文件检查点配置
  fileCheckpointingEnabled: boolean

  // 终端进度条配置 (OSC 9;4)
  terminalProgressBarEnabled: boolean

  // 终端标签页状态指示器 (OSC 21337)。启用时，在标签页侧边栏显示彩色
  // 圆点 + 状态文本，并从标题中移除微调器前缀
  // （圆点使其多余）。
  showStatusInTerminalTab?: boolean

  // 推送通知开关（通过 /config 设置）。默认关闭 —— 需要明确选择加入。
  taskCompleteNotifEnabled?: boolean
  inputNeededNotifEnabled?: boolean
  agentPushNotifEnabled?: boolean

  // Claude Code 使用追踪
  claudeCodeFirstTokenDate?: string // 用户首个 Claude Code OAuth 令牌的 ISO 时间戳

  // 模型切换提示追踪（ant-only）
  modelSwitchCalloutDismissed?: boolean // 用户是否选择了"不再显示"
  modelSwitchCalloutLastShown?: number // 上次显示的时间戳（24 小时内不显示）
  modelSwitchCalloutVersion?: string

  // 努力程度提示追踪 —— 对 Opus 4.6 用户显示一次
  effortCalloutDismissed?: boolean // v1 - 旧版，读取以对已看到它的 Pro 用户压制 v2
  effortCalloutV2Dismissed?: boolean

  // 远程提示追踪 —— 首次启用 bridge 前显示一次
  remoteDialogSeen?: boolean

  // initReplBridge 的 oauth_expired_unrefreshable 跳过的跨进程退避。
  // `expiresAt` 是去重键 —— 内容寻址，当 /login 替换令牌时自动清除。
  // `failCount` 限制误报：瞬时刷新失败（认证服务器 5xx、锁错误）在退避开始前
  // 获得 3 次重试，镜像 useReplBridge 的 MAX_CONSECUTIVE_INIT_FAILURES。死令牌
  // 账户上限为 3 次配置写入；健康 + 瞬时波动约 210 秒自愈。
  bridgeOauthDeadExpiresAt?: number
  bridgeOauthDeadFailCount?: number

  // 桌面端增销启动对话框追踪
  desktopUpsellSeenCount?: number // 总显示次数（最多 3 次）
  desktopUpsellDismissed?: boolean // 已选择"不再询问"

  // 空闲返回对话框追踪
  idleReturnDismissed?: boolean // 已选择"不再询问"

  // Opus 4.5 Pro 迁移追踪
  opusProMigrationComplete?: boolean
  opusProMigrationTimestamp?: number

  // Sonnet 4.5 1m 迁移追踪
  sonnet1m45MigrationComplete?: boolean

  // Opus 4.0/4.1 → 当前 Opus 迁移（显示一次性通知）
  legacyOpusMigrationTimestamp?: number

  // Sonnet 4.5 → 4.6 迁移（pro/max/team premium）
  sonnet45To46MigrationTimestamp?: number

  // 缓存的 Statsig 开关值
  cachedStatsigGates: {
    [gateName: string]: boolean
  }

  // 缓存的 Statsig 动态配置
  cachedDynamicConfigs?: { [configName: string]: unknown }

  // 缓存的 GrowthBook 特性值
  cachedGrowthBookFeatures?: { [featureName: string]: unknown }

  // 本地 GrowthBook 覆盖（ant-only，通过 /config Gates 标签页设置）。
  // 在环境变量覆盖之后、真实解析值之前进行检查。
  growthBookOverrides?: { [featureName: string]: unknown }

  // 紧急提示追踪 —— 存储上次显示的提示以防止重复显示
  lastShownEmergencyTip?: string

  // 文件选择器 gitignore 行为
  respectGitignore: boolean // 文件选择器是否应遵循 .gitignore 文件（默认：true）。注意：.ignore 文件始终被遵循

  // 复制命令行为
  copyFullResponse: boolean // /copy 是否始终复制完整响应而非显示选择器

  // 全屏应用内文本选择行为
  copyOnSelect?: boolean // 鼠标释放时自动复制到剪贴板（未定义 → true；让 cmd+c 通过无操作"生效"）

  // 用于 teleport 目录切换的 GitHub 仓库路径映射
  // 键："owner/repo"（小写），值：仓库克隆的绝对路径数组
  githubRepoPaths?: Record<string, string[]>

  // 为 claude-cli:// 深度链接启动的终端模拟器。从交互式会话中的
  // TERM_PROGRAM 捕获，因为深度链接处理程序以无头模式运行
  // (LaunchServices/xdg)，未设置 TERM_PROGRAM。
  deepLinkTerminal?: string

  // iTerm2 it2 CLI 设置
  iterm2It2SetupComplete?: boolean // it2 设置是否已验证
  preferTmuxOverIterm2?: boolean // 用户偏好始终使用 tmux 而非 iTerm2 分屏

  // 技能使用追踪（用于自动补全排序）
  skillUsage?: Record<string, { usageCount: number; lastUsedAt: number }>
  // 官方市场自动安装追踪
  officialMarketplaceAutoInstallAttempted?: boolean // 是否尝试过自动安装
  officialMarketplaceAutoInstalled?: boolean // 自动安装是否成功
  officialMarketplaceAutoInstallFailReason?:
    | 'policy_blocked'
    | 'git_unavailable'
    | 'gcs_unavailable'
    | 'unknown' // 失败原因（如适用）
  officialMarketplaceAutoInstallRetryCount?: number // 重试次数
  officialMarketplaceAutoInstallLastAttemptTime?: number // 上次尝试的时间戳
  officialMarketplaceAutoInstallNextRetryTime?: number // 可再次重试的最早时间

  // Claude in Chrome 设置
  hasCompletedClaudeInChromeOnboarding?: boolean // Claude in Chrome 入门是否已显示
  claudeInChromeDefaultEnabled?: boolean // Claude in Chrome 是否默认启用（未定义表示平台默认值）
  cachedChromeExtensionInstalled?: boolean // Chrome 扩展是否已安装的缓存结果

  // Chrome 扩展配对状态（跨会话持久化）
  chromeExtension?: {
    pairedDeviceId?: string
    pairedDeviceName?: string
  }

  // LSP plugin recommendation preferences
  lspRecommendationDisabled?: boolean // 禁用所有 LSP 插件推荐
  lspRecommendationNeverPlugins?: string[] // 永不建议的插件 ID
  lspRecommendationIgnoredCount?: number // 追踪已忽略的推荐（5 次后停止）

  // Claude Code 提示协议状态（来自 CLI/SDK 的 <claude-code-hint /> 标签）。
  // 按提示类型嵌套，以便未来类型（docs、mcp 等）无需新增顶层键即可接入
  // top-level keys。
  claudeCodeHints?: {
    // 用户已被提示过的插件 ID。一次性语义：
    // 无论是否/否响应都记录，永不重新提示。上限为
    // 100 条以限制配置增长 —— 超过后提示完全停止。
    plugin?: string[]
    // 用户在对话框中选择了"不再显示插件安装提示"。
    disabled?: boolean
  }

  // 权限说明配置
  permissionExplainerEnabled?: boolean // 启用 Haiku 生成的权限请求说明（默认：true）

  // 队友生成模式：'auto' | 'tmux' | 'in-process'
  teammateMode?: 'auto' | 'tmux' | 'in-process' // 如何生成队友（默认：'auto'）
  // 当工具调用未传递模型时，新队友使用的模型。
  // 未定义 = 硬编码 Opus（向后兼容）；null = 队长的模型；string = 模型别名/ID。
  teammateDefaultModel?: string | null

  // PR 状态底部配置（通过 GrowthBook 特性开关）
  prStatusFooterEnabled?: boolean // 在底部显示 PR 审查状态（默认：true）

  // Tmux 实时面板可见性（ant-only，在 tmux 药丸上按 Enter 切换）
  tungstenPanelVisible?: boolean

  // 来自 API 的缓存组织级快速模式状态。
  // 用于检测跨会话变更并通知用户。
  penguinModeOrgEnabled?: boolean

  // 后台刷新上次运行的纪元毫秒数（快速模式、配额、通行证、客户端数据）。
  // 与 tengu_cicada_nap_ms 配合使用以限制 API 调用
  startupPrefetchedAt?: number

  // 启动时运行远程控制（需要 BRIDGE_MODE）
  // undefined = 使用默认值（优先级见 getRemoteControlAtStartup()）
  remoteControlAtStartup?: boolean

  // 来自上次 API 响应的缓存额外使用禁用原因
  // undefined = 无缓存, null = 额外使用已启用, string = 禁用原因。
  cachedExtraUsageDisabledReason?: string | null

  // 自动权限通知追踪（仅 ant）
  autoPermissionsNotificationCount?: number // 自动权限通知已显示的次数

  // 预判配置（仅 ant）
  speculationEnabled?: boolean // 是否启用预判（默认：true）


  // 用于服务端实验的客户端数据（在引导期间获取）。
  clientDataCache?: Record<string, unknown> | null

  // 模型选择器的附加模型选项（在引导期间获取）。
  additionalModelOptionsCache?: ModelOption[]

  // /api/claude_code/organizations/metrics_enabled 的磁盘缓存。
  // 组织级设置很少更改；跨进程持久化避免了
  // 每次 `claude -p` 调用时的冷 API 请求。
  metricsStatusCache?: {
    enabled: boolean
    timestamp: number
  }

  // 上次应用的迁移集版本。当等于
  // CURRENT_MIGRATION_VERSION 时，runMigrations() 跳过所有同步迁移
  // （避免每次启动时 11× saveGlobalConfig 加锁+重读）。
  migrationVersion?: number
}

/**
 * 用于创建全新默认 GlobalConfig 的工厂函数。替代深度克隆共享常量——
 * 嵌套容器（数组、记录）均为空，因此工厂函数以零克隆成本提供新引用。
 * a factory gives fresh refs at zero clone cost.
 */
function createDefaultGlobalConfig(): GlobalConfig {
  return {
    customApiEndpoint: {
      baseURL: undefined,
      apiKey: undefined,
      model: undefined,
      savedModels: [],
    },
    numStartups: 0,
    installMethod: undefined,
    autoUpdates: undefined,
    theme: 'dark',
    preferredNotifChannel: 'auto',
    verbose: false,
    editorMode: 'normal',
    autoCompactEnabled: true,
    showTurnDuration: true,
    hasSeenTasksHint: false,
    hasUsedStash: false,
    hasUsedBackgroundTask: false,
    queuedCommandUpHintCount: 0,
    diffTool: 'auto',
    customApiKeyResponses: {
      approved: [],
      rejected: [],
    },
    env: {},
    tipsHistory: {},
    memoryUsageCount: 0,
    promptQueueUseCount: 0,
    btwUseCount: 0,
    todoFeatureEnabled: true,
    showExpandedTodos: false,
    messageIdleNotifThresholdMs: 60000,
    autoConnectIde: false,
    autoInstallIdeExtension: true,
    fileCheckpointingEnabled: true,
    terminalProgressBarEnabled: true,
    cachedStatsigGates: {},
    cachedDynamicConfigs: {},
    cachedGrowthBookFeatures: {},
    respectGitignore: true,
    copyFullResponse: false,
  }
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = createDefaultGlobalConfig()

export const GLOBAL_CONFIG_KEYS = [
  'customApiEndpoint',
  'apiKeyHelper',
  'installMethod',
  'autoUpdates',
  'autoUpdatesProtectedForNative',
  'theme',
  'verbose',
  'preferredNotifChannel',
  'shiftEnterKeyBindingInstalled',
  'editorMode',
  'hasUsedBackslashReturn',
  'autoCompactEnabled',
  'showTurnDuration',
  'diffTool',
  'env',
  'tipsHistory',
  'todoFeatureEnabled',
  'showExpandedTodos',
  'messageIdleNotifThresholdMs',
  'autoConnectIde',
  'autoInstallIdeExtension',
  'fileCheckpointingEnabled',
  'terminalProgressBarEnabled',
  'showStatusInTerminalTab',
  'taskCompleteNotifEnabled',
  'inputNeededNotifEnabled',
  'agentPushNotifEnabled',
  'respectGitignore',
  'claudeInChromeDefaultEnabled',
  'hasCompletedClaudeInChromeOnboarding',
  'lspRecommendationDisabled',
  'lspRecommendationNeverPlugins',
  'lspRecommendationIgnoredCount',
  'copyFullResponse',
  'copyOnSelect',
  'permissionExplainerEnabled',
  'prStatusFooterEnabled',
  'remoteControlAtStartup',
  'remoteDialogSeen',
] as const

export type GlobalConfigKey = (typeof GLOBAL_CONFIG_KEYS)[number]

export function isGlobalConfigKey(key: string): key is GlobalConfigKey {
  return GLOBAL_CONFIG_KEYS.includes(key as GlobalConfigKey)
}

export const PROJECT_CONFIG_KEYS = [
  'allowedTools',
  'hasTrustDialogAccepted',
  'hasCompletedProjectOnboarding',
] as const

export type ProjectConfigKey = (typeof PROJECT_CONFIG_KEYS)[number]

/**
 * 检查用户是否已接受当前工作目录的信任对话框。
 *
 * 此函数遍历父目录以检查父目录是否有批准。
 * 接受对某个目录的信任即意味着对其子目录的信任。
 *
 * @returns 信任对话框是否已被接受（即"不应再显示"）
 */
let _trustAccepted = false

export function resetTrustDialogAcceptedCacheForTesting(): void {
  _trustAccepted = false
}

export function checkHasTrustDialogAccepted(): boolean {
  // 信任在会话期间仅从 false→true 转换（从不反向），
  // 因此一旦为 true 即可锁定。false 不会被缓存——它在每次调用时
  // 重新检查，以便在会话中间能感知到信任对话框的接受。
  // （lodash memoize 不适用，因为它也会缓存 false。）
  return (_trustAccepted ||= computeTrustDialogAccepted())
}

function computeTrustDialogAccepted(): boolean {
  // 检查会话级信任（针对信任不持久化的主目录场景）
  // 从主目录运行时，信任对话框会显示但接受仅存储在
  // 内存中。这允许钩子和其他功能在会话期间正常工作。
  if (getSessionTrustAccepted()) {
    return true
  }

  const config = getGlobalConfig()

  // 始终检查信任保存的位置（git 根目录或原始 cwd）
  // 这是 saveCurrentProjectConfig 持久化信任的主要位置
  const projectPath = getProjectPathForConfig()
  const projectConfig = config.projects?.[projectPath]
  if (projectConfig?.hasTrustDialogAccepted) {
    return true
  }

  // 从当前工作目录及其父目录开始检查
  // 规范化路径以获得一致的 JSON 键查找
  let currentPath = normalizePathForConfigKey(getCwd())

  // 遍历所有父目录
  while (true) {
    const pathConfig = config.projects?.[currentPath]
    if (pathConfig?.hasTrustDialogAccepted) {
      return true
    }

    const parentPath = normalizePathForConfigKey(resolve(currentPath, '..'))
    // 如果到达根目录则停止（当父目录与当前目录相同时）
    if (parentPath === currentPath) {
      break
    }
    currentPath = parentPath
  }

  return false
}

/**
 * 检查任意目录（非会话 cwd）的信任状态。
 * 从 `dir` 向上遍历，如果有任何祖先目录持久化了信任，则返回 true。
 * 与 checkHasTrustDialogAccepted 不同，此函数不会查询会话信任或
 * 缓存的项目路径——在目标目录与 cwd 不同时使用（例如
 * /assistant 安装到用户输入的路径时）。
 */
export function isPathTrusted(dir: string): boolean {
  const config = getGlobalConfig()
  let currentPath = normalizePathForConfigKey(resolve(dir))
  while (true) {
    if (config.projects?.[currentPath]?.hasTrustDialogAccepted) return true
    const parentPath = normalizePathForConfigKey(resolve(currentPath, '..'))
    if (parentPath === currentPath) return false
    currentPath = parentPath
  }
}

// 我们不得不将测试代码放在这里，因为 Jest 不支持模拟 ES 模块 :O
const TEST_GLOBAL_CONFIG_FOR_TESTING: GlobalConfig = {
  ...DEFAULT_GLOBAL_CONFIG,
  autoUpdates: false,
}
const TEST_PROJECT_CONFIG_FOR_TESTING: ProjectConfig = {
  ...DEFAULT_PROJECT_CONFIG,
}

export function isProjectConfigKey(key: string): key is ProjectConfigKey {
  return PROJECT_CONFIG_KEYS.includes(key as ProjectConfigKey)
}

/**
 * 检测写入 `fresh` 是否会丢失内存缓存中仍存在的认证/入门状态。
 * 当 `getConfig` 遇到写入中途损坏或截断的文件（来自另一个进程或
 * 非原子回退）并返回 DEFAULT_GLOBAL_CONFIG 时会发生这种情况。
 * 将默认值写回会导致永久丢失认证。参见 GH #3117。
 */
function wouldLoseAuthState(fresh: {
  oauthAccount?: unknown
  hasCompletedOnboarding?: boolean
}): boolean {
  const cached = globalConfigCache.config
  if (!cached) return false
  const lostOauth =
    cached.oauthAccount !== undefined && fresh.oauthAccount === undefined
  const lostOnboarding =
    cached.hasCompletedOnboarding === true &&
    fresh.hasCompletedOnboarding !== true
  return lostOauth || lostOnboarding
}

export function saveGlobalConfig(
  updater: (currentConfig: GlobalConfig) => GlobalConfig,
): void {
  if (process.env.NODE_ENV === 'test') {
    const config = updater(TEST_GLOBAL_CONFIG_FOR_TESTING)
    // 如果没有变更则跳过（返回相同引用）
    if (config === TEST_GLOBAL_CONFIG_FOR_TESTING) {
      return
    }
    Object.assign(TEST_GLOBAL_CONFIG_FOR_TESTING, config)
    return
  }

  let written: GlobalConfig | null = null
  try {
    const didWrite = saveConfigWithLock(
      getGlobalClaudeFile(),
      createDefaultGlobalConfig,
      current => {
        const config = updater(current)
        // 如果没有变更则跳过（返回相同引用）
        if (config === current) {
          return current
        }
        written = {
          ...config,
          projects: removeProjectHistory(current.projects),
        }
        return written
      },
    )
    // 仅在实际写入时穿透缓存。如果认证丢失保护
    // 触发（或更新器未作更改），文件未被修改且
    // 缓存仍然有效——触碰它则会破坏保护机制。
    if (didWrite && written) {
      writeThroughGlobalConfigCache(written)
    }
  } catch (error) {
    logForDebugging(`Failed to save config with lock: ${error}`, {
      level: 'error',
    })
    // 出错时回退到非锁定版本。此回退存在竞态
    // 窗口：如果另一个进程正在写入中（或文件被截断），
    // getConfig 返回默认值。拒绝将默认值写入良好的缓存
    // 配置，以避免擦除认证。参见 GH #3117。
    const currentConfig = getConfig(
      getGlobalClaudeFile(),
      createDefaultGlobalConfig,
    )
    if (wouldLoseAuthState(currentConfig)) {
      logForDebugging(
        'saveGlobalConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',
        { level: 'error' },
      )
      logEvent('tengu_config_auth_loss_prevented', {})
      return
    }
    const config = updater(currentConfig)
    // 如果没有变更则跳过（返回相同引用）
    if (config === currentConfig) {
      return
    }
    written = {
      ...config,
      projects: removeProjectHistory(currentConfig.projects),
    }
    saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG)
    writeThroughGlobalConfigCache(written)
  }
}

// 全局配置缓存
let globalConfigCache: { config: GlobalConfig | null; mtime: number } = {
  config: null,
  mtime: 0,
}

// 配置文件操作追踪（遥测）
let lastReadFileStats: { mtime: number; size: number } | null = null
let configCacheHits = 0
let configCacheMisses = 0
// 全局配置文件实际磁盘写入的会话总量计数。
// 对仅 ant 的开发诊断可见（参见 inc-4552），以便在异常写入
// 速率损坏 ~/.claude.json 之前，在 UI 中暴露出来。
let globalConfigWriteCount = 0

export function getGlobalConfigWriteCount(): number {
  return globalConfigWriteCount
}

export const CONFIG_WRITE_DISPLAY_THRESHOLD = 20

function reportConfigCacheStats(): void {
  const total = configCacheHits + configCacheMisses
  if (total > 0) {
    logEvent('tengu_config_cache_stats', {
      cache_hits: configCacheHits,
      cache_misses: configCacheMisses,
      hit_rate: configCacheHits / total,
    })
  }
  configCacheHits = 0
  configCacheMisses = 0
}

// 注册清理函数，在会话结束时报告缓存统计
// eslint-disable-next-line custom-rules/no-top-level-side-effects
registerCleanup(async () => {
  reportConfigCacheStats()
})

/**
 * Migrates old autoUpdaterStatus to new installMethod and autoUpdates fields
 * @internal
 */
function migrateConfigFields(config: GlobalConfig): GlobalConfig {
  // 已迁移
  if (config.installMethod !== undefined) {
    return config
  }

  // autoUpdaterStatus is removed from the type but may exist in old configs
  const legacy = config as GlobalConfig & {
    autoUpdaterStatus?:
      | 'migrated'
      | 'installed'
      | 'disabled'
      | 'enabled'
      | 'no_permissions'
      | 'not_configured'
  }

  // Determine install method and auto-update preference from old field
  let installMethod: InstallMethod = 'unknown'
  let autoUpdates = config.autoUpdates ?? true // Default to enabled unless explicitly disabled

  switch (legacy.autoUpdaterStatus) {
    case 'migrated':
      installMethod = 'local'
      break
    case 'installed':
      installMethod = 'native'
      break
    case 'disabled':
      // 禁用时，我们不知道安装方法
      autoUpdates = false
      break
    case 'enabled':
    case 'no_permissions':
    case 'not_configured':
      // 这些状态暗示了全局安装
      installMethod = 'global'
      break
    case undefined:
      // 无旧状态，保留默认值
      break
  }

  return {
    ...config,
    installMethod,
    autoUpdates,
  }
}

/**
 * Removes history field from projects (migrated to history.jsonl)
 * @internal
 */
function removeProjectHistory(
  projects: Record<string, ProjectConfig> | undefined,
): Record<string, ProjectConfig> | undefined {
  if (!projects) {
    return projects
  }

  const cleanedProjects: Record<string, ProjectConfig> = {}
  let needsCleaning = false

  for (const [path, projectConfig] of Object.entries(projects)) {
    // history 已从类型中移除，但可能存在于旧配置中
    const legacy = projectConfig as ProjectConfig & { history?: unknown }
    if (legacy.history !== undefined) {
      needsCleaning = true
      const { history, ...cleanedConfig } = legacy
      cleanedProjects[path] = cleanedConfig
    } else {
      cleanedProjects[path] = projectConfig
    }
  }

  return needsCleaning ? cleanedProjects : projects
}

// fs.watchFile 轮询间隔，用于检测其他实例的写入（毫秒）
const CONFIG_FRESHNESS_POLL_MS = 1000
let freshnessWatcherStarted = false

// fs.watchFile 在 libuv 线程池上轮询 stat，仅在 mtime
// 发生变化时调用我们——卡住的 stat 永远不会阻塞主线程。
function startGlobalConfigFreshnessWatcher(): void {
  if (freshnessWatcherStarted || process.env.NODE_ENV === 'test') return
  freshnessWatcherStarted = true
  const file = getGlobalClaudeFile()
  watchFile(
    file,
    { interval: CONFIG_FRESHNESS_POLL_MS, persistent: false },
    curr => {
      // 我们自己的写入也会触发此回调——写入穿透的 Date.now()
      // 超出量使得 cache.mtime > 文件 mtime，因此我们跳过重读。
      // 当文件不存在时（初始回调或删除），Bun/Node 也会以 curr.mtimeMs=0 触发
      // ——<= 比较也能处理这种情况。
      if (curr.mtimeMs <= globalConfigCache.mtime) return
      void getFsImplementation()
        .readFile(file, { encoding: 'utf-8' })
        .then(content => {
          // 写入穿透可能在我们读取时已经更新了缓存；
          // 不要回退到 watchFile 统计的过期快照。
          if (curr.mtimeMs <= globalConfigCache.mtime) return
          const parsed = safeParseJSON(stripBOM(content))
          if (parsed === null || typeof parsed !== 'object') return
          globalConfigCache = {
            config: migrateConfigFields({
              ...createDefaultGlobalConfig(),
              ...(parsed as Partial<GlobalConfig>),
            }),
            mtime: curr.mtimeMs,
          }
          lastReadFileStats = { mtime: curr.mtimeMs, size: curr.size }
        })
        .catch(() => {})
    },
  )
  registerCleanup(async () => {
    unwatchFile(file)
    freshnessWatcherStarted = false
  })
}

// 写入穿透：我们刚写入的就是新配置。cache.mtime 超出
// 文件的真实 mtime（Date.now() 在写入后记录），因此
// 新鲜度监视器会在下一次 tick 时跳过重读我们自己的写入。
function writeThroughGlobalConfigCache(config: GlobalConfig): void {
  globalConfigCache = { config, mtime: Date.now() }
  lastReadFileStats = null
}

export function getGlobalConfig(): GlobalConfig {
  if (process.env.NODE_ENV === 'test') {
    return TEST_GLOBAL_CONFIG_FOR_TESTING
  }

  // 快速路径：纯内存读取。启动后总能命中——我们自己的
  // 写入走写入穿透，其他实例的写入由后台
  // 新鲜度监视器捕获（从不阻塞此路径）。
  if (globalConfigCache.config) {
    configCacheHits++
    return globalConfigCache.config
  }

  // 慢速路径：启动加载。同步 I/O 在此可接受，因为它在任何 UI
  // 渲染之前只运行一次。先 stat 再读取，以便任何竞态
  // 能自我修正（旧 mtime + 新内容 → 监视器在下一个 tick 重读）。
  configCacheMisses++
  try {
    let stats: { mtimeMs: number; size: number } | null = null
    try {
      stats = getFsImplementation().statSync(getGlobalClaudeFile())
    } catch {
      // 文件不存在
    }
    const config = migrateConfigFields(
      getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig),
    )
    globalConfigCache = {
      config,
      mtime: stats?.mtimeMs ?? Date.now(),
    }
    lastReadFileStats = stats
      ? { mtime: stats.mtimeMs, size: stats.size }
      : null
    startGlobalConfigFreshnessWatcher()
    return config
  } catch {
    // 如果出现问题，回退到无缓存行为
    return migrateConfigFields(
      getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig),
    )
  }
}

/**
 * 返回 remoteControlAtStartup 的有效值。优先级：
 *   1. 用户的显式配置值（始终优先——尊重选择退出）
 *   2. CCR 自动连接默认值（仅 ant 构建，受 GrowthBook 控制）
 *   3. false（远程控制必须显式选择加入）
 */
export function getRemoteControlAtStartup(): boolean {
  const explicit = getGlobalConfig().remoteControlAtStartup
  if (explicit !== undefined) return explicit
  if (feature('CCR_AUTO_CONNECT')) {
    if (ccrAutoConnect?.getCcrAutoConnectDefault()) return true
  }
  return false
}

export function getCustomApiKeyStatus(
  truncatedApiKey: string,
): 'approved' | 'rejected' | 'new' {
  const config = getGlobalConfig()
  if (config.customApiKeyResponses?.approved?.includes(truncatedApiKey)) {
    return 'approved'
  }
  if (config.customApiKeyResponses?.rejected?.includes(truncatedApiKey)) {
    return 'rejected'
  }
  return 'new'
}

function saveConfig<A extends object>(
  file: string,
  config: A,
  defaultConfig: A,
): void {
  // 确保写入配置文件前目录存在
  const dir = dirname(file)
  const fs = getFsImplementation()
  // mkdirSync 在 FsOperations 实现中已经是递归的
  fs.mkdirSync(dir)

  // 过滤掉与默认值匹配的所有值
  const filteredConfig = pickBy(
    config,
    (value, key) =>
      jsonStringify(value) !== jsonStringify(defaultConfig[key as keyof A]),
  )
  // 以安全权限写入配置文件 - mode 仅适用于新文件
  writeFileSyncAndFlush_DEPRECATED(
    file,
    jsonStringify(filteredConfig, null, 2),
    {
      encoding: 'utf-8',
      mode: 0o600,
    },
  )
  if (file === getGlobalClaudeFile()) {
    globalConfigWriteCount++
  }
}

/**
 * 如果执行了写入则返回 true；如果写入被跳过则返回 false
 * （无变更，或认证丢失保护触发）。调用者用此返回值来决定
 * 是否要使缓存失效——在跳过的写入后使缓存失效会破坏
 * 认证丢失保护所依赖的良好缓存状态。
 */
function saveConfigWithLock<A extends object>(
  file: string,
  createDefault: () => A,
  mergeFn: (current: A) => A,
): boolean {
  const defaultConfig = createDefault()
  const dir = dirname(file)
  const fs = getFsImplementation()

  // 确保目录存在（mkdirSync 在 FsOperations 中已经是递归的）
  fs.mkdirSync(dir)

  let release
  try {
    const lockFilePath = `${file}.lock`
    const startTime = Date.now()
    release = lockfile.lockSync(file, {
      lockfilePath: lockFilePath,
      onCompromised: err => {
        // 默认的 onCompromised 从 setTimeout 回调中抛出异常，
        // 这会导致未处理的异常。改为记录日志——锁被
        // 窃取（例如在 10 秒事件循环暂停后）是可恢复的。
        logForDebugging(`配置锁被破坏: ${err}`, { level: 'error' })
      },
    })
    const lockTime = Date.now() - startTime
    if (lockTime > 100) {
      logForDebugging(
        '获取锁的时间超出预期 - 可能正在运行另一个 Claude 实例',
      )
      logEvent('tengu_config_lock_contention', {
        lock_time_ms: lockTime,
      })
    }

    // 检查过时写入——自上次读取后文件已更改
    // 仅检查全局配置文件，因为 lastReadFileStats 跟踪的是该特定文件
    if (lastReadFileStats && file === getGlobalClaudeFile()) {
      try {
        const currentStats = fs.statSync(file)
        if (
          currentStats.mtimeMs !== lastReadFileStats.mtime ||
          currentStats.size !== lastReadFileStats.size
        ) {
          logEvent('tengu_config_stale_write', {
            read_mtime: lastReadFileStats.mtime,
            write_mtime: currentStats.mtimeMs,
            read_size: lastReadFileStats.size,
            write_size: currentStats.size,
          })
        }
      } catch (e) {
        const code = getErrnoCode(e)
        if (code !== 'ENOENT') {
          throw e
        }
        // 文件尚不存在，无需过时检查
      }
    }

    // 重新读取当前配置以获取最新状态。如果文件
    // 暂时损坏（并发写入、写入过程中被杀死），这将
    // 返回默认值——我们不能将默认值写回良好的配置。
    const currentConfig = getConfig(file, createDefault)
    if (file === getGlobalClaudeFile() && wouldLoseAuthState(currentConfig)) {
      logForDebugging(
        'saveConfigWithLock: 重新读取的配置缺少缓存中的认证；拒绝写入以避免清空 ~/.claude.json。参见 GH #3117。',
        { level: 'error' },
      )
      logEvent('tengu_config_auth_loss_prevented', {})
      return false
    }

    // 应用合并函数以获取更新后的配置
    const mergedConfig = mergeFn(currentConfig)

    // 如果没有变更则跳过写入（返回相同引用）
    if (mergedConfig === currentConfig) {
      return false
    }

    // 过滤掉与默认值匹配的所有值
    const filteredConfig = pickBy(
      mergedConfig,
      (value, key) =>
        jsonStringify(value) !== jsonStringify(defaultConfig[key as keyof A]),
    )

    // 在写入前创建现有配置的时间戳备份
    // 我们保留多个备份，以防止重置/损坏的配置
    // 覆盖好的备份。备份存储在 ~/.claude/backups/ 中，
    // 以保持主目录整洁。
    try {
      const fileBase = basename(file)
      const backupDir = getConfigBackupDir()

      // 确保备份目录存在
      try {
        fs.mkdirSync(backupDir)
      } catch (mkdirErr) {
        const mkdirCode = getErrnoCode(mkdirErr)
        if (mkdirCode !== 'EEXIST') {
          throw mkdirErr
        }
      }

      // 首先检查现有备份——如果近期备份已存在则跳过创建新的。
      // 在启动时，许多 saveGlobalConfig 调用在几毫秒内接连触发；
      // 没有此检查，每次调用都会创建一个新的备份文件，在磁盘上累积。
      const MIN_BACKUP_INTERVAL_MS = 60_000
      const existingBackups = fs
        .readdirStringSync(backupDir)
        .filter(f => f.startsWith(`${fileBase}.backup.`))
        .sort()
        .reverse() // 最新的在前（时间戳按字典序排序）

      const mostRecentBackup = existingBackups[0]
      const mostRecentTimestamp = mostRecentBackup
        ? Number(mostRecentBackup.split('.backup.').pop())
        : 0
      const shouldCreateBackup =
        Number.isNaN(mostRecentTimestamp) ||
        Date.now() - mostRecentTimestamp >= MIN_BACKUP_INTERVAL_MS

      if (shouldCreateBackup) {
        const backupPath = join(backupDir, `${fileBase}.backup.${Date.now()}`)
        fs.copyFileSync(file, backupPath)
      }

      // 清理旧备份，仅保留最近 5 个
      const MAX_BACKUPS = 5
      // 如果刚创建了一个备份则重新读取列表；否则重用现有列表
      const backupsForCleanup = shouldCreateBackup
        ? fs
            .readdirStringSync(backupDir)
            .filter(f => f.startsWith(`${fileBase}.backup.`))
            .sort()
            .reverse()
        : existingBackups

      for (const oldBackup of backupsForCleanup.slice(MAX_BACKUPS)) {
        try {
          fs.unlinkSync(join(backupDir, oldBackup))
        } catch {
          // 忽略清理错误
        }
      }
    } catch (e) {
      const code = getErrnoCode(e)
      if (code !== 'ENOENT') {
        logForDebugging(`配置备份失败: ${e}`, {
          level: 'error',
        })
      }
      // 没有文件可备份或备份失败，继续写入
    }

    // 以安全权限写入配置文件 - mode 仅适用于新文件
    writeFileSyncAndFlush_DEPRECATED(
      file,
      jsonStringify(filteredConfig, null, 2),
      {
        encoding: 'utf-8',
        mode: 0o600,
      },
    )
    if (file === getGlobalClaudeFile()) {
      globalConfigWriteCount++
    }
    return true
  } finally {
    if (release) {
      release()
    }
  }
}

// 标记以跟踪是否允许读取配置
let configReadingAllowed = false

export function enableConfigs(): void {
  if (configReadingAllowed) {
    // 确保此操作是幂等的
    return
  }

  const startTime = Date.now()
  logForDiagnosticsNoPII('info', 'enable_configs_started')

  // 在此标记设置前对配置的任何读取都会显示控制台警告，
  // 以防止我们在模块初始化期间添加配置读取
  configReadingAllowed = true
  // 我们只检查全局配置，因为目前所有配置共享一个文件
  getConfig(
    getGlobalClaudeFile(),
    createDefaultGlobalConfig,
    true /* throw on invalid */,
  )

  logForDiagnosticsNoPII('info', 'enable_configs_completed', {
    duration_ms: Date.now() - startTime,
  })
}

/**
 * 返回配置文件备份存储的目录。
 * 使用 ~/.claude/backups/ 以保持主目录整洁。
 */
function getConfigBackupDir(): string {
  return join(getClaudeConfigHomeDir(), 'backups')
}

/**
 * 查找给定配置文件的最新备份文件。
 * 首先检查 ~/.claude/backups/，然后回退到旧位置
 * （配置文件旁边）以保持向后兼容。
 * 返回最新备份的完整路径，如果不存在则返回 null。
 */
function findMostRecentBackup(file: string): string | null {
  const fs = getFsImplementation()
  const fileBase = basename(file)
  const backupDir = getConfigBackupDir()

  // 首先检查新的备份目录
  try {
    const backups = fs
      .readdirStringSync(backupDir)
      .filter(f => f.startsWith(`${fileBase}.backup.`))
      .sort()

    const mostRecent = backups.at(-1) // 时间戳按字典序排序
    if (mostRecent) {
      return join(backupDir, mostRecent)
    }
  } catch {
    // 备份目录尚不存在
  }

  // 回退到旧位置（配置文件旁边）
  const fileDir = dirname(file)

  try {
    const backups = fs
      .readdirStringSync(fileDir)
      .filter(f => f.startsWith(`${fileBase}.backup.`))
      .sort()

    const mostRecent = backups.at(-1) // 时间戳按字典序排序
    if (mostRecent) {
      return join(fileDir, mostRecent)
    }

    // 检查旧版备份文件（无时间戳）
    const legacyBackup = `${file}.backup`
    try {
      fs.statSync(legacyBackup)
      return legacyBackup
    } catch {
      // 旧版备份不存在
    }
  } catch {
    // 忽略读取目录时的错误
  }

  return null
}

function getConfig<A>(
  file: string,
  createDefault: () => A,
  throwOnInvalid?: boolean,
): A {
  // 如果在允许之前访问配置，则记录警告
  if (!configReadingAllowed && process.env.NODE_ENV !== 'test') {
    throw new Error('Config accessed before allowed.')
  }

  const fs = getFsImplementation()

  try {
    const fileContent = fs.readFileSync(file, {
      encoding: 'utf-8',
    })
    try {
      // 在解析前去除 BOM - PowerShell 5.x 会向 UTF-8 文件添加 BOM
      const parsedConfig = jsonParse(stripBOM(fileContent))
      return {
        ...createDefault(),
        ...parsedConfig,
      }
    } catch (error) {
      // 抛出包含文件路径和默认配置的 ConfigParseError
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      throw new ConfigParseError(errorMessage, file, createDefault())
    }
  } catch (error) {
    // 处理文件未找到 - 检查备份并返回默认值
    const errCode = getErrnoCode(error)
    if (errCode === 'ENOENT') {
      const backupPath = findMostRecentBackup(file)
      if (backupPath) {
        process.stderr.write(
          `\n未能在以下位置找到 Claude 配置文件：${file}\n` +
            `存在备份文件：${backupPath}\n` +
            `你可以手动运行以下命令来恢复：cp "${backupPath}" "${file}"\n\n`,
        )
      }
      return createDefault()
    }

    // 如果 throwOnInvalid 为 true，则重新抛出 ConfigParseError
    if (error instanceof ConfigParseError && throwOnInvalid) {
      throw error
    }

    // 记录配置解析错误，以便用户了解发生了什么
    if (error instanceof ConfigParseError) {
      logForDebugging(
        `配置文件损坏，正在重置为默认值: ${error.message}`,
        { level: 'error' },
      )

      // 保护：logEvent → shouldSampleEvent → getGlobalConfig → getConfig
      // 在配置文件损坏时会导致无限递归，因为
      // 采样检查从全局配置中读取 GrowthBook 特性。
      // 仅在最外层调用时记录分析事件。
      if (!insideGetConfig) {
        insideGetConfig = true
        try {
          // 记录错误以进行监控
          logError(error)

          // 记录配置损坏的分析事件
          let hasBackup = false
          try {
            fs.statSync(`${file}.backup`)
            hasBackup = true
          } catch {
            // 无备份
          }
          logEvent('tengu_config_parse_error', {
            has_backup: hasBackup,
          })
        } finally {
          insideGetConfig = false
        }
      }

      process.stderr.write(
        `\nClaude configuration file at ${file} is corrupted: ${error.message}\n`,
      )

      // 尝试备份损坏的配置文件（仅当尚未备份时）
      const fileBase = basename(file)
      const corruptedBackupDir = getConfigBackupDir()

      // 确保备份目录存在
      try {
        fs.mkdirSync(corruptedBackupDir)
      } catch (mkdirErr) {
        const mkdirCode = getErrnoCode(mkdirErr)
        if (mkdirCode !== 'EEXIST') {
          throw mkdirErr
        }
      }

      const existingCorruptedBackups = fs
        .readdirStringSync(corruptedBackupDir)
        .filter(f => f.startsWith(`${fileBase}.corrupted.`))

      let corruptedBackupPath: string | undefined
      let alreadyBackedUp = false

      // 检查当前损坏内容是否与任何现有备份匹配
      const currentContent = fs.readFileSync(file, { encoding: 'utf-8' })
      for (const backup of existingCorruptedBackups) {
        try {
          const backupContent = fs.readFileSync(
            join(corruptedBackupDir, backup),
            { encoding: 'utf-8' },
          )
          if (currentContent === backupContent) {
            alreadyBackedUp = true
            break
          }
        } catch {
          // 忽略备份的读取错误
        }
      }

      if (!alreadyBackedUp) {
        corruptedBackupPath = join(
          corruptedBackupDir,
          `${fileBase}.corrupted.${Date.now()}`,
        )
        try {
          fs.copyFileSync(file, corruptedBackupPath)
          logForDebugging(
            `Corrupted config backed up to: ${corruptedBackupPath}`,
            {
              level: 'error',
            },
          )
        } catch {
          // 忽略备份错误
        }
      }

      // 通知用户有关配置损坏和可用备份的信息
      const backupPath = findMostRecentBackup(file)
      if (corruptedBackupPath) {
        process.stderr.write(
          `The corrupted file has been backed up to: ${corruptedBackupPath}\n`,
        )
      } else if (alreadyBackedUp) {
        process.stderr.write(`The corrupted file has already been backed up.\n`)
      }

      if (backupPath) {
        process.stderr.write(
          `存在备份文件：${backupPath}\n` +
            `你可以手动运行以下命令来恢复：cp "${backupPath}" "${file}"\n\n`,
        )
      } else {
        process.stderr.write(`\n`)
      }
    }

    return createDefault()
  }
}

// 用于获取配置查找项目路径的记忆化函数
export const getProjectPathForConfig = memoize((): string => {
  const originalCwd = getOriginalCwd()
  const gitRoot = findCanonicalGitRoot(originalCwd)

  if (gitRoot) {
    // 规范化以获得一致的 JSON 键（所有平台使用正斜杠）
    // 这确保 C:\Users\... 和 C:/Users/... 等路径映射到相同的键
    return normalizePathForConfigKey(gitRoot)
  }

  // 不在 git 仓库中
  return normalizePathForConfigKey(resolve(originalCwd))
})

export function getCurrentProjectConfig(): ProjectConfig {
  if (process.env.NODE_ENV === 'test') {
    return TEST_PROJECT_CONFIG_FOR_TESTING
  }

  const absolutePath = getProjectPathForConfig()
  const config = getGlobalConfig()

  if (!config.projects) {
    return DEFAULT_PROJECT_CONFIG
  }

  const projectConfig = config.projects[absolutePath] ?? DEFAULT_PROJECT_CONFIG
  // 不确定这个字段怎么变成了字符串
  // TODO: 修复上游
  if (typeof projectConfig.allowedTools === 'string') {
    projectConfig.allowedTools =
      (safeParseJSON(projectConfig.allowedTools) as string[]) ?? []
  }

  return projectConfig
}

export function saveCurrentProjectConfig(
  updater: (currentConfig: ProjectConfig) => ProjectConfig,
): void {
  if (process.env.NODE_ENV === 'test') {
    const config = updater(TEST_PROJECT_CONFIG_FOR_TESTING)
    // 如果没有变更则跳过（返回相同引用）
    if (config === TEST_PROJECT_CONFIG_FOR_TESTING) {
      return
    }
    Object.assign(TEST_PROJECT_CONFIG_FOR_TESTING, config)
    return
  }
  const absolutePath = getProjectPathForConfig()

  let written: GlobalConfig | null = null
  try {
    const didWrite = saveConfigWithLock(
      getGlobalClaudeFile(),
      createDefaultGlobalConfig,
      current => {
        const currentProjectConfig =
          current.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG
        const newProjectConfig = updater(currentProjectConfig)
        // 如果没有变更则跳过（返回相同引用）
        if (newProjectConfig === currentProjectConfig) {
          return current
        }
        written = {
          ...current,
          projects: {
            ...current.projects,
            [absolutePath]: newProjectConfig,
          },
        }
        return written
      },
    )
    if (didWrite && written) {
      writeThroughGlobalConfigCache(written)
    }
  } catch (error) {
    logForDebugging(`Failed to save config with lock: ${error}`, {
      level: 'error',
    })

    // Same race window as saveGlobalConfig's fallback -- refuse to write
    // defaults over good cached config. See GH #3117.
    const config = getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig)
    if (wouldLoseAuthState(config)) {
      logForDebugging(
        'saveCurrentProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',
        { level: 'error' },
      )
      logEvent('tengu_config_auth_loss_prevented', {})
      return
    }
    const currentProjectConfig =
      config.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG
    const newProjectConfig = updater(currentProjectConfig)
    // Skip if no changes (same reference returned)
    if (newProjectConfig === currentProjectConfig) {
      return
    }
    written = {
      ...config,
      projects: {
        ...config.projects,
        [absolutePath]: newProjectConfig,
      },
    }
    saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG)
    writeThroughGlobalConfigCache(written)
  }
}

export function isAutoUpdaterDisabled(): boolean {
  return getAutoUpdaterDisabledReason() !== null
}

/**
 * 如果插件自动更新应被跳过则返回 true。
 * 此函数检查自动更新器是否已禁用，并且 FORCE_AUTOUPDATE_PLUGINS
 * 环境变量未设置为 'true'。该环境变量允许在自动更新器被禁用时
 * 强制进行插件自动更新。
 */
export function shouldSkipPluginAutoupdate(): boolean {
  return (
    isAutoUpdaterDisabled() &&
    !isEnvTruthy(process.env.FORCE_AUTOUPDATE_PLUGINS)
  )
}

export type AutoUpdaterDisabledReason =
  | { type: 'development' }
  | { type: 'env'; envVar: string }
  | { type: 'config' }

export function formatAutoUpdaterDisabledReason(
  reason: AutoUpdaterDisabledReason,
): string {
  switch (reason.type) {
    case 'development':
      return '开发构建'
    case 'env':
      return `已设置 ${reason.envVar}`
    case 'config':
      return '配置'
  }
}

export function getAutoUpdaterDisabledReason(): AutoUpdaterDisabledReason | null {
  if (process.env.NODE_ENV === 'development') {
    return { type: 'development' }
  }
  if (isEnvTruthy(process.env.DISABLE_AUTOUPDATER)) {
    return { type: 'env', envVar: 'DISABLE_AUTOUPDATER' }
  }
  const essentialTrafficEnvVar = getEssentialTrafficOnlyReason()
  if (essentialTrafficEnvVar) {
    return { type: 'env', envVar: essentialTrafficEnvVar }
  }
  const config = getGlobalConfig()
  if (
    config.autoUpdates === false &&
    (config.installMethod !== 'native' ||
      config.autoUpdatesProtectedForNative !== true)
  ) {
    return { type: 'config' }
  }
  return null
}

export function getOrCreateUserID(): string {
  const config = getGlobalConfig()
  if (config.userID) {
    return config.userID
  }

  const userID = randomBytes(32).toString('hex')
  saveGlobalConfig(current => ({ ...current, userID }))
  return userID
}

export function recordFirstStartTime(): void {
  const config = getGlobalConfig()
  if (!config.firstStartTime) {
    const firstStartTime = new Date().toISOString()
    saveGlobalConfig(current => ({
      ...current,
      firstStartTime: current.firstStartTime ?? firstStartTime,
    }))
  }
}

export function getMemoryPath(memoryType: MemoryType): string {
  const cwd = getOriginalCwd()

  switch (memoryType) {
    case 'User':
      return join(getClaudeConfigHomeDir(), 'CLAUDE.md')
    case 'Local':
      return join(cwd, 'CLAUDE.local.md')
    case 'Project':
      return join(cwd, 'CLAUDE.md')
    case 'Managed':
      return join(getManagedFilePath(), 'CLAUDE.md')
    case 'AutoMem':
      return getAutoMemEntrypoint()
  }
  // TeamMem 仅在 feature('TEAMMEM') 为 true 时才是有效的 MemoryType
  if (feature('TEAMMEM')) {
    return teamMemPaths!.getTeamMemEntrypoint()
  }
  return '' // 在 TeamMem 不在 MemoryType 中的外部构建中不可达
}

export function getManagedClaudeRulesDir(): string {
  return join(getManagedFilePath(), '.claude', 'rules')
}

export function getUserClaudeRulesDir(): string {
  return join(getClaudeConfigHomeDir(), 'rules')
}

// 仅用于测试的导出
export const _getConfigForTesting = getConfig
export const _wouldLoseAuthStateForTesting = wouldLoseAuthState
export function _setGlobalConfigCacheForTesting(
  config: GlobalConfig | null,
): void {
  globalConfigCache.config = config
  globalConfigCache.mtime = config ? Date.now() : 0
}
