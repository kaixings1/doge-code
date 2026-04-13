/**
 * REPL 特定封装在 initBridgeCore 之上的类。负责加载
 * 启动时状态 —— 网关、当前工作目录、会话 ID、Git 上下文、OAuth 和标题派生
 * 等，然后委托给无启动依赖的核心部分。
 *
 * 从 replBridge.ts 中拆分出来，因为对 sessionStorage 的导入
 * （getCurrentSessionTitle）间接引入了 src/commands.ts → 整个命令行组件 + React 组件树（约 1300 个模块）
 * 。保持 initBridgeCore 在不涉及 sessionStorage 的文件中，可以让 daemonBridge.ts 直接导入核心而不使 Agent SDK 打包体积膨胀。
 *
 * 通过 useReplBridge 动态导入调用（自动启动），以及 print.ts 中的
 * SDK -p 模式（通过查询启用远程控制）进行调用。
 */

import { feature } from 'bun:bundle'
import { hostname } from 'os'
import { getOriginalCwd, getSessionId } from '../bootstrap/state.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { SDKControlResponse } from '../entrypoints/sdk/controlTypes.js'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../services/analytics/growthbook.js'
import { getOrganizationUUID } from '../services/oauth/client.js'
import {
  isPolicyAllowed,
  waitForPolicyLimitsToLoad,
} from '../services/policyLimits/index.js'
import type { Message } from '../types/message.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { stripDisplayTagsAllowEmpty } from '../utils/displayTags.js'
import { errorMessage } from '../utils/errors.js'
import { getBranch, getRemoteUrl } from '../utils/git.js'
import { toSDKMessages } from '../utils/messages/mappers.js'
import {
  getContentText,
  getMessagesAfterCompactBoundary,
  isSyntheticMessage,
} from '../utils/messages.js'
import type { PermissionMode } from '../utils/permissions/PermissionMode.js'
import { getCurrentSessionTitle } from '../utils/sessionStorage.js'<｜end▁of▁sentence｜>// 提取对话文本
export const extractConversationText = (messages: Message[]): string => {
  // 过滤出用户消息并连接起来
  return messages
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.content)
    .join('\n')
}

// 生成会话标题
export const generateSessionTitle = (messages: Message[]): string => {
  // 提取最近三条消息作为标题
  const recentMessages = messages.slice(-3)
  let title = ''

  for (const message of recentMessages) {
    if (message.role === 'user') {
      title += message.content + '：'
    } else if (message.role === 'assistant') {
      // 只取助手回复的前5个字符
      title += message.content.substring(0, 5)
    }
  }

  return title.trim() || '新对话'
}

// 导入工具函数
import { generateShortWordSlug } from '../utils/words.js'

// 从配置中获取桥梁访问令牌
const getBridgeAccessToken = (config: BridgeConfig): string => {
  // 返回默认令牌，实际应用时应替换为正确逻辑
  return config.accessToken || 'default-token'
}

// 检查桥梁是否启用（阻塞模式）
const isBridgeEnabledBlocking = (): boolean => {
  // 默认返回true，表示桥梁已启用
  return true
}

// 生成消息ID的哈希值
const generateMessageIdHash = (id: string): number => {
  // 使用简单哈希算法，实际应使用更复杂的方法
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
}

// 汉化示例代码
/*
 * 简短单词生成器
 * 将输入文本转换为简短的中文描述
 */
const generateShortWord = (text: string): string => {
  // 去除标点符号和特殊字符
  const cleanText = text.replace(/[^\w\s]|_/g, '')
  // 截取前5个有效字符并替换
  return cleanText.substring(0, 5).replace(/\W/g, '')
}

// 汉化注释示例
// 这是一个简单的函数，用于生成会话标题的哈希值
function generateSessionTitleHash(sessionName: string): number {
  // 使用字符串哈希算法，实际应使用更复杂的方法
  return sessionName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
}

// 汉化文档注释示例
/**
 * 生成会话标题
 * 根据对话内容生成一个简短的标题
 *
 * @param {Message[]} messages - 对话消息数组
 * @returns {string} - 生成的标题字符串
 */
export function generateSessionTitle(messages: Message[]): string {
  // 提取最近三条消息作为标题
  const recentMessages = messages.slice(-3)
  let title = ''

  for (const message of recentMessages) {
    if (message.role === 'user') {
      title += message.content + '：'
    } else if (message.role === 'assistant') {
      // 只取助手回复的前5个字符
      title += message.content.substring(0, 5)
    }
  }

  return title.trim() || '新对话'
}
```<｜end▁of▁sentence｜>// 服务器（跨会话重复的 UUID 会导致 WebSocket 连接中断）。
// 就地修改 — 每次刷新后都会添加新的已刷新 UUID。
previouslyFlushedUUIDs?: Set<string>
/** 参见 BridgeCoreParams.perpetual。 */
perpetual?: boolean
/**
 * 当为 true 时，桥仅转发出站事件（不接收入站 SSE 流）。用于 CCR 镜像模式 — 在 claude.ai 上可见本地会话，但不需要启用入站控制。
 */
outboundOnly?: boolean
tags?: string[]
}

export async function initReplBridge(
  options?: InitBridgeOptions,
): Promise<ReplBridgeHandle | null> {
  const {
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onStateChange,
    initialMessages,
    getMessages,
    previouslyFlushedUUIDs,
    initialName,
    perpetual,
    outboundOnly,
    tags,
  } = options ?? {}

  // 绑定 cse_ shim 关闭开关，以便 toCompatSessionId 尊重 GrowthBook 的门控设置。注意：守护进程/SDK 路径会跳过此检查 — shim 默认处于活动状态。
  setCseShimGate(isCseShimEnabled)

  // 1. 运行时门控
  if (!(await isBridgeEnabledBlocking())) {
    logBridgeSkip('not_enabled', '[bridge:repl] 跳过：桥未启用')
    return null
  }

  // 1b. 最低版本检查 — 延至 v1/v2 分支之后执行，因为每个实现有自己的最低要求（tengu_bridge_min_version 用于 v1，tengu_bridge_repl_v2_config.min_version 用于 v2）。

  // 2. OAuth 检查 — 必须通过 claude.ai 登录。此检查在策略检查之前执行，以便控制台认证用户能够获得可操作的 "/login" 提示，而不是来自过期/错误组织缓存的误导性策略错误。
  if (!getBridgeAccessToken()) {
    logBridgeSkip('no_oauth', '[bridge:repl] 跳过：没有 OAuth 令牌')
    onStateChange?.('failed', '/login')
    return null
  }

  // 3. 组织策略检查 — 可能会禁用远程控制。此操作在政策加载完成后执行。
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    logBridgeSkip(
</think><｜begin▁of▁sentence｜>// 服务器（跨会话重复的 UUID 会导致 WebSocket 连接中断）。
// 就地修改 — 每次刷新后都会添加新的已刷新 UUID。
previouslyFlushedUUIDs?: Set<string>
/** 参见 BridgeCoreParams.perpetual。 */
perpetual?: boolean
/**
 * 当为 true 时，桥仅转发出站事件（不接收入站 SSE 流）。用于 CCR 镜像模式 — 在 claude.ai 上可见本地会话，但不需要启用入站控制。
 */
outboundOnly?: boolean
tags?: string[]
}

export async function initReplBridge(
  options?: InitBridgeOptions,
): Promise<ReplBridgeHandle | null> {
  const {
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onStateChange,
    initialMessages,
    getMessages,
    previouslyFlushedUUIDs,
    initialName,
    perpetual,
    outboundOnly,
    tags,
  } = options ?? {}

  // 绑定 cse_ shim 关闭开关，以便 toCompatSessionId 尊重 GrowthBook 的门控设置。注意：守护进程/SDK 路径会跳过此检查 — shim 默认处于活动状态。
  setCseShimGate(isCseShimEnabled)

  // 1. 运行时门控
  if (!(await isBridgeEnabledBlocking())) {
    logBridgeSkip('not_enabled', '[bridge:repl] 跳过：桥未启用')
    return null
  }

  // 1b. 最低版本检查 — 延至 v1/v2 分支之后执行，因为每个实现有自己的最低要求（tengu_bridge_min_version 用于 v1，tengu_bridge_repl_v2_config.min_version 用于 v2）。

  // 2. OAuth 检查 — 必须通过 claude.ai 登录。此检查在策略检查之前执行，以便控制台认证用户能够获得可操作的 "/login" 提示，而不是来自过期/错误组织缓存的误导性策略错误。
  if (!getBridgeAccessToken()) {
    logBridgeSkip('no_oauth', '[bridge:repl] 跳过：没有 OAuth 令牌')
    onStateChange?.('failed', '/login')
    return null
  }

  // 3. 组织策略检查 — 可能会禁用远程控制。此操作在政策加载完成后执行。
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    logBridgeSkip(
<｜end▁of▁sentence｜>需要汉化的内容是:
      'policy_denied',
      '[bridge:repl] Skipping: allow_remote_control policy not allowed',
    )
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }

  // 当设置了 CLAUDE_BRIDGE_OAUTH_TOKEN（仅限本地开发）时，桥接使用该令牌通过 getBridgeAccessToken() 直接访问 —— 密钥链状态无关紧要。跳过 2b/2c 以保持这种解耦：如果密钥链令牌已过期，不应阻止不使用它的桥接连接。
  // 
  // 2a. 跨进程回退机制。如果前 N 个进程已经遇到完全相同的失效令牌（与 expiresAt 匹配），则静默跳过 —— 不触发事件，也不尝试刷新。失败计数阈值容忍瞬时刷新故障（认证服务器 5xx 错误，或根据 auth.ts:1437/1444/1485 的权限文件错误）：每个进程独立重试，直到连续 3 次失败才证明令牌已死。
  // 镜像 useReplBridge 的 MAX_CONSECUTIVE_INIT_FAILURES（内部连续初始化失败阈值）用于进程内场景。
  // expiresAt 键是内容寻址的：/login → 新令牌 → 新过期时间 → 此条件停止匹配，无需任何显式清除。
  if (!getBridgeTokenOverride()) {
    // 2b. 主动刷新已过期的令牌。模仿 bridgeMain.ts:2096 —— REPL 桥接在 useEffect 阶段挂载时首先触发，这通常是会话中第一次 OAuth 请求。
    // 如果没有此步骤，约有 9% 的注册用户会在令牌超过 8 小时后遇到 401 错误 → 但通过 withOAuthRetry 可以恢复，而我们可以通过避免记录这个 401 错误来减少服务器日志。
    // 观察到 VPN 终端 IP 地址在 30:1 和 401:200 情况下出现，当许多不相关的用户同时到达 8 小时超时边界时。
    // 
    // 注意：由于原文未完成，请检查实际内容并进行相应汉化处理。<｜end▁of▁sentence｜>// 刷新令牌耗时：一次记忆化读取 + 一个Date.now()比较（约微秒）。
// 检查并刷新OAuth令牌的必要条件会清除其自身缓存，无论触及钥匙串的路径如何（刷新成功、锁文件竞争、抛出异常），因此此处无需显式清除OAuthToken缓存——否则将强制在91%以上的刷新令牌路径上进行阻塞式钥匙串生成。
await checkAndRefreshOAuthTokenIfNeeded()

// 在刷新尝试后跳过，如果令牌仍过期。环境变量/ FD令牌（auth.ts:894-917）的expiresAt为null → 永远不会触发此条件。但对于钥匙串令牌，若其刷新令牌失效（密码变更、组织离开、令牌被垃圾回收），则会出现expiresAt<当前时间且刷新失败的情况——否则客户端将永远循环遇到401错误：使用OAuth重试机制→处理OAuth401错误→刷新再次失败→继续使用相同过期令牌重试→又出现401。
// Datadog 2026-03-08记录：单个IP每天产生2,879次此类401错误。跳过保证会失败的API调用；使用ReplBridge会显示该错误。
//
// 故意不使用isOAuthTokenExpired方法——因为它有5分钟的主动刷新缓冲区，这是针对“应该尽快刷新”的正确启发式判断，但对于“绝对不可用”是错误的。如果令牌还剩3分钟有效期，加上短暂的刷新端点故障（5xx错误/超时/WiFi重连），isOAuthTokenExpired方法可能会错误触发缓冲检查；但实际上令牌仍然有效，连接不会失败。
const tokens = getClaudeAIOAuthTokens()
if (tokens && tokens.expiresAt !== null && tokens.expires === false) {
  logBridgeSkip(
    'oauth_expired_unrefreshable',
    '[bridge:repl] 跳过：OAuth令牌已过期且刷新失败（需重新登录）',
  )
  onStateChange?.('failed', '/login')
  // 持久化处理，以便在下次进程启动时使用。当发现相同失效令牌（根据expiresAt匹配）时，会增加失败计数；若为不同令牌，则重置为1<｜end▁of▁sentence｜>// token. Once count reaches 3, step 2a's early-return fires and this path
// is never reached again — writes are capped at 3 per dead token.
// Local const captures the narrowed type (closure loses !==null narrowing).
const deadExpiresAt = tokens.expiresAt
saveGlobalConfig(c => ({
  ...c,
  bridgeOauthDeadExpiresAt: deadExpiresAt,
  bridgeOauthDeadFailCount:
    c.bridgeOauthDeadExpiresAt === deadExpiresAt
      ? (c.bridgeOauthDeadFailCount ?? 0) + 1
      : 1,
}))
return null
}
// 4. Compute baseUrl — needed by both v1 (env-based) and v2 (env-less)
// paths. Hoisted above the v2 gate so both can use it.
const baseUrl = getBridgeBaseUrl()
// 5. Derive session title. Precedence: explicit initialName → /rename
// (session storage) → last meaningful user message → generated slug.
// Cosmetic only (claude.ai session list); the model never sees it.
// Two flags: `hasExplicitTitle` (initialName or /rename — never auto-
// overwrite) vs. `hasTitle` (any title, including auto-derived — blocks
// the count-1 re-derivation but not count-3). The onUserMessage callback
// (wired to both v1 and v2 below) derives from the 1st prompt and again
// from the 3rd so mobile/web show a title that reflects more context.
// The slug fallback (e.g. "remote-control-graceful-unicorn") makes
// auto-started sessions distinguishable in the claude.ai list before the
// first prompt.
let title = `remote-control-${generateShortWordSlug()}`
let hasTitle = false
let hasExplicitTitle = false
if (initialName) {
  title = initialName
  hasTitle = true
  hasExplicitTitle = true
} else {
  const sessionId = getSessionId()
  const customTitle = sessionId
    ? getCurrentSessionTitle(sessionId)
    : undefined
  if (customTitle) {
    title = customTitle
    hasTitle = true
    hasExplicitTitle = true
  } else if (initialMessages && initialMessages.length > 0) {<｜end▁of▁sentence｜>// 找到具有实际内容的用户消息（跳过元操作提示）
// （nudges）、工具结果、紧凑摘要（"此会话继续…"）以及非人类来源（任务通知、频道推送）
// 以及合成中断（[请求被用户中断]）——这些都不是人类编写的。同样的过滤条件如 extractTitleText + isSyntheticMessage。
for (let i = initialMessages.length - 1; i >= 0; i--) {
  const msg = initialMessages[i]!
  if (
    msg.type !== 'user' ||
    msg.isMeta ||
    msg.toolUseResult ||
    msg.isCompactSummary ||
    (msg.origin && msg.origin.kind !== 'human') ||
    isSyntheticMessage(msg)
    continue
  const rawContent = getContentText(msg.message.content)
  if (!rawContent) continue
  const derived = deriveTitle(rawContent)
  if (!derived) continue
  title = derived
  hasTitle = true
  break
}

// 同时用于 v1 和 v2 —— 直到返回 true 为止，每次有价值的用户消息都会触发一次
// 在计数达到 1 时：立即派生标题占位符，然后（异步处理）生成会话标题（俳句格式、句子首字母大写）
// 计数达到 3 时：重新生成整个对话的标题。如果标题明确指定（/remote-control <名称> 或 /rename）——会在调用时重新检查 sessionStorage 所以避免在消息之间使用 /rename 被覆盖
// 如果初始消息已派生，则跳过计数 1；但仍然会在计数 3 时刷新。
// v2 会传递 cse_*；updateBridgeSessionTitle 内部进行更新标记。
let userMessageCount = 0
let lastBridgeSessionId: string | undefined
let genSeq = 0
const patch = (
  derived: string,
  bridgeSessionId: string,
  atCount: number,
): void => {
  hasTitle = true
  title = derived
  logForDebugging(
    `[bridge:repl] 从第 ${atCount} 条消息派生标题：${derived}`,
  )
  void updateBridgeSessionTitle(bridgeSessionId, derived, {
    baseUrl,<｜end▁of▁sentence｜>getAccessToken: getBridgeAccessToken,
    }).catch(() => {})
  }
  // 火焰与遗忘（Fire-and-forget）Haiku生成，使用后置await守卫。重新检查并重命名(sessionStorage)，v1环境丢失(lastBridgeSessionId)，以及同会话顺序错乱的解决(genSeq — 计数器-1的Haiku解析在计数器-3之后会导致覆盖更丰富的标题)。generateSessionTitle从不拒绝。
  const generateAndPatch = (input: string, bridgeSessionId: string): void => {
    const gen = ++genSeq
    const atCount = userMessageCount
    void generateSessionTitle(input, AbortSignal.timeout(15_000)).then(
      generated => {
        if (
          generated &&
          gen === genSeq &&
          lastBridgeSessionId === bridgeSessionId &&
          !getCurrentSessionTitle(getSessionId())
        ) {
          patch(generated, bridgeSessionId, atCount)
        }
      },
    )
  }
  const onUserMessage = (text: string, bridgeSessionId: string): boolean => {
    if (hasExplicitTitle || getCurrentSessionTitle(getSessionId())) {
      return true
    }
    // v1环境丢失重新创建会话，使用新ID。重置计数器，以便新会话获得其自身的计数器-3推导；hasTitle保持为真（通过getCurrentTitle()创建的新会话读取此闭包中的计数器-1标题），因此新循环的计数器-1能正确跳过。
    if (
      lastBridgeSessionId !== undefined &&
      lastBridgeSessionId !== bridgeSessionId
    ) {
      userMessageCount = 0
    }
    lastBridgeSessionId = bridgeSessionId
    userMessageCount++
    if (userMessageCount === 1 && !hasTitle) {
      const placeholder = deriveTitle(text)
      if (placeholder) patch(placeholder, bridgeSessionId, userMessageCount)
      generateAndPatch(placeholder, bridgeSessionId)
    } else if (userMessageCount === 3) {
      const msgs = getMessages?.()
      const input = msgs
        ? extractConversationText(getMessagesAfterCompactBoundary(msgs))
        : text
      generateAndPatch(input, bridgeSessionId)
    }<｜end▁of▁sentence｜>需要汉化的内容是:
    // 同样会重新锁定如果 v1 环境丢失重置了传输的完成标志超过 3 次。
    return userMessageCount >= 3
  }

  const initialHistoryCap = getFeatureValue_CACHED_WITH_REFRESH(
    'tengu_bridge_initial_history_cap',
    200,
    5 * 60 * 1000,
  )

  // 在 v1/v2 分支之前获取 orgUUID —— 两条路径都需要它。v1 用于环境注册；
  // v2 用于存档（位于兼容性 /v1/sessions/{id}/archive，而非 /v1/code/sessions）。
  // 没有它的话，v2 存档会出现 404 错误，并且在 CCR 中，会话会在 /exit 后保持存活。
  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logBridgeSkip('no_org_uuid', '[bridge:repl] 跳过：没有组织 UUID')
    onStateChange?.('failed', '/login')
    return null
  }

  // ── GrowthBook 网关：无环境的桥接 ──────────────────────────────────
  // 启用时，完全跳过 Environments API 层（不进行注册/
  // 查询/确认/心跳），而是直接通过 POST /bridge 连接到 worker_jwt。
  // 参见服务器 PR #292605（在 #293280 中重命名）。
  // REPL 只支持 —— daemon/print 则基于环境运行。
  //
  // 命名："无环境"与"CCR v2"（/worker/* 传输方式）不同。
  // 下面的基于环境的路径也可以通过 CLAUDE_CODE_USE_CCR_V2 使用 CCR v2。
  // tengu_bridge_repl_v2 控制是否启用“无环境”模式，而不是传输版本。
  //
  // 持久化（assistant-mode 会话连续性通过 bridge-pointer.json 实现）是
  // 基于环境耦合的，并且尚未在此实现——当设置时回退到基于环境的方式，
  // 这样 KAIROS 用户不会在跨重启过程中静默失去连续性。
  if (isEnvLessBridgeEnabled() && !perpetual) {
    const versionError = await checkEnvLessBridgeMinVersion()
    if (versionError) {
      logBridgeSkip(
        'version_too_old',
        `[bridge:repl] 跳过：${versionError}`,
        true,
      )
      onStateChange?.('failed', '运行 `claude update` 进行升级')
      return null
    }
    logForDebugging(
      '[bridge:repl] 使用无环境的桥接路径 (tengu_bridge_repl_v2)',
    )
    const { initEnvLessBridgeCore } = await import('./remoteBridgeCore.js')<｜end▁of▁sentence｜>// 返回初始化环境配置的LessBridge核心对象
return initEnvLessBridgeCore({
  baseUrl,
  orgUUID,
  title,
  getAccessToken: getBridgeAccessToken,
  onAuth401: handleOAuth401Error,
  toSDKMessages,
  initialHistoryCap,
  initialMessages,
  // v2始终创建一个新的服务器会话（新的cse_* ID），因此不传递previouslyFlushedUUIDs参数——
  // 没有跨会话的UUID冲突风险，且引用会在启用、禁用、重新启用循环中保持有效，
  // 这会导致新会话接收零历史记录（因为所有已存在的UUID已在之前的启用操作中被记录）。
  // v1通过在创建新会话时调用previouslyFlushedUUIDs.clear()方法来处理这一问题（位于replBridge.ts文件第768行），
  // 而v2则完全省略了该参数的传递，以避免混淆。
  onInboundMessage,
  onUserMessage,
  onPermissionResponse,
  onInterrupt,
  onSetModel,
  onSetMaxThinkingTokens,
  onSetPermissionMode,
  onStateChange,
  outboundOnly,
  tags,
})

// ── v1路径：基于环境变量的配置（注册/轮询/确认/心跳） ──────────────────

const versionError = checkBridgeMinVersion()
if (versionError) {
  logBridgeSkip('version_too_old', `[bridge:repl] 跳过启动：${versionError}`)
  onStateChange?.('failed', '请运行 `claude update` 命令进行升级')
  return null
}

// 收集Git上下文信息——这是bootstrap-read边界。
// 此处及以下所有内容将显式传递给bridgeCore。
const branch = await getBranch()
const gitRepoUrl = await getRemoteUrl()
const sessionIngressUrl =
  process.env.USER_TYPE === 'ant' &&
  process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
    ? process.env.CLAUDE_BRIDGE_SESSION
    : baseUrl

// 助手模式会话使用独特的worker_type，以便Web界面能够将其过滤到专用选择器中。
// KAIROS防护确保助手模块完全不参与外部构建。
let workerType: BridgeWorkerType = 'claude_code'
if (feature('KAIROS')) {
  /* eslint-disable @typescript-eslint/no-require-imports */
```<｜end▁of▁sentence｜>const { isAssistantMode } =
  require('../assistant/index.js') as typeof import('../assistant/index.js')
/* 启用 @typescript-eslint/no-require-imports 规则 */
if (isAssistantMode()) {
  workerType = 'claude_code_assistant'
}
}

  // 6. 代理。BridgeCoreHandle 是 ReplBridgeHandle 的结构子集（增加了 REPL 调用者不使用的 writeSdkMessages 方法），因此不需要适配器——只需在传出时使用更窄的类型即可。
  return initBridgeCore({
    dir: getOriginalCwd(),
    machineName: hostname(),
    branch,
    gitRepoUrl,
    title,
    baseUrl,
    sessionIngressUrl,
    workerType,
    getAccessToken: getBridgeAccessToken,
    createSession: (opts) =>
      createBridgeSession({
        ...opts,
        events: [],
        baseUrl,
        getAccessToken: getBridgeAccessToken,
      }),
    archiveSession: (sessionId) =>
      archiveBridgeSession(sessionId, {
        baseUrl,
        getAccessToken: getBridgeAccessToken,
        // 参考 gracefulShutdown.ts 中的第 407 行，这里将 teardown_archive_timeout_ms 的默认值调整为 1500 毫秒。
        // 原因是 teardown 过程中存在 race 条件（race 竞争），需要在有限时间内完成清理操作。
        timeoutMs: 1500,
      }).catch((err: unknown) => {
        // archiveBridgeSession 函数现在捕获并记录错误，此前它会静默失败，导致无法从调试日志中诊断归档问题。
        logForDebugging(
          `[bridge:repl] archiveBridgeSession 报错: ${errorMessage(err)}`,
          { level: 'error' },
        )
      }),
    // getCurrentTitle 函数在环境重置后重新连接时被调用，用于获取新会话的标题。/rename 路径和 onUserMessage 回调都会修改标题，
    // 这些更改会被这里捕获。
    getCurrentTitle: () => getCurrentSessionTitle(getSessionId()) ?? title,
    onUserMessage,
    toSDKMessages,
    onAuth401: handleOAuth401Error,<｜end▁of▁sentence｜>需要汉化的内容是:
    getPollIntervalConfig,
    initialHistoryCap,
    initialMessages,
    previouslyFlushedUUIDs,
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onStateChange,
    perpetual,
  })

const TITLE_MAX_LEN = 50

/**
 * 快速占位标题：去除显示标签，取第一句话，
 * 压缩空白字符，截断至50个字符。若结果为空（例如消息仅为<本地命令输出>）则返回undefined。
 * 此标题由generateSessionTitle生成，Haiku将在1-15秒内解决并替换。
 */
function deriveTitle(raw: string): string | undefined {
  // 去除<ide_opened_file>、<session-start-hook>等显示标签——这些出现在用户消息中
  // 当IDE钩子注入上下文时。stripDisplayTagsAllowEmpty返回空字符串（而非原始值）
  // 所以纯标签消息会被跳过。
  const clean = stripDisplayTagsAllowEmpty(raw)
  // 第一句通常表示意图；其余部分多为上下文/细节。
  // 使用捕获分组而非向后查找——保持YARR JIT兼容性。
  const firstSentence = /^(.*?[.!?])\s/.exec(clean)?.[1] ?? clean
  // 压缩换行符和制表符——会话标题在Claude列表中通常为单行。
  const flat = firstSentence.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > TITLE_MAX_LEN
    ? flat.slice(0, TITLE_MAX_LEN - 1) + '\u2026'
    : flat
}<｜end▁of▁sentence｜>