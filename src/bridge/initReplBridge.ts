/**
 * initBridgeCore 的 REPL 专用包装器。负责读取引导状态的部分 —
 * 门控、cwd、会话 ID、git 上下文、OAuth、标题推导 — 然后委托给无引导的核心。
 *
 * 从 replBridge.ts 中拆分出来，因为 sessionStorage 导入
 * （getCurrentSessionTitle）会传递性地引入 src/commands.ts → 整个
 * 斜杠命令 + React 组件树（约 1300 个模块）。将 initBridgeCore 放在
 * 不触及 sessionStorage 的文件中，可以让 daemonBridge.ts 导入核心
 * 而不会膨胀 Agent SDK 包。
 *
 * 由 useReplBridge（自动启动）和 print.ts（SDK -p 模式通过
 * query.enableRemoteControl）通过动态导入调用。
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
import { getCurrentSessionTitle } from '../utils/sessionStorage.js'
import {
  extractConversationText,
  generateSessionTitle,
} from '../utils/sessionTitle.js'
import { generateShortWordSlug } from '../utils/words.js'
import {
  getBridgeAccessToken,
  getBridgeBaseUrl,
  getBridgeTokenOverride,
} from './bridgeConfig.js'
import {
  checkBridgeMinVersion,
  isBridgeEnabledBlocking,
  isCseShimEnabled,
  isEnvLessBridgeEnabled,
} from './bridgeEnabled.js'
import {
  archiveBridgeSession,
  createBridgeSession,
  updateBridgeSessionTitle,
} from './createSession.js'
import { logBridgeSkip } from './debugUtils.js'
import { checkEnvLessBridgeMinVersion } from './envLessBridgeConfig.js'
import { getPollIntervalConfig } from './pollConfig.js'
import type { BridgeState, ReplBridgeHandle } from './replBridge.js'
import { initBridgeCore } from './replBridge.js'
import { setCseShimGate } from './sessionIdCompat.js'
import type { BridgeWorkerType } from './types.js'

export type InitBridgeOptions = {
  onInboundMessage?: (msg: SDKMessage) => void | Promise<void>
  onPermissionResponse?: (response: SDKControlResponse) => void
  onInterrupt?: () => void
  onSetModel?: (model: string | undefined) => void
  onSetMaxThinkingTokens?: (maxTokens: number | null) => void
  onSetPermissionMode?: (
    mode: PermissionMode,
  ) => { ok: true } | { ok: false; error: string }
  onStateChange?: (state: BridgeState, detail?: string) => void
  initialMessages?: Message[]
  // 来自 `/remote-control <name>` 的显式会话名称。设置后，会覆盖
  // 从对话或 /rename 推导出的标题。
  initialName?: string
  // 调用时完整对话的新鲜视图。由 onUserMessage 的 count-3 推导使用，
  // 以在整个对话上调用 generateSessionTitle。
  // 可选 — print.ts 的 SDK enableRemoteControl 路径没有 REPL 消息数组；
  // 当不存在时，count-3 回退到单条消息文本。
  getMessages?: () => Message[]
  // 已在先前桥接器会话中刷新的 UUID。具有这些 UUID 的消息
  // 在初始刷新中被排除，以避免污染服务器
  //（跨会话的重复 UUID 会导致 WebSocket 被终止）。
  // 原地修改 — 新刷新的 UUID 在每次刷新后被添加。
  previouslyFlushedUUIDs?: Set<string>
  /** See BridgeCoreParams.perpetual. */
  perpetual?: boolean
  /**
   * 当为 true 时，桥接器仅转发出站事件（无 SSE 入站流）。
   * 由 CCR 镜像模式使用 — 本地会话在 claude.ai 上可见，
   * 而无需启用入站控制。
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

  // 连接 cse_ shim 终止开关，使 toCompatSessionId 遵守
  // GrowthBook 门控。守护进程/SDK 路径跳过此设置 — shim 默认为激活状态。
  setCseShimGate(isCseShimEnabled)

  // 1. Runtime gate
  if (!(await isBridgeEnabledBlocking())) {
    logBridgeSkip('not_enabled', '[bridge:repl] Skipping: bridge not enabled')
    return null
  }

  // 1b. 最低版本检查 — 推迟到下面的 v1/v2 分支之后，
  // 因为每个实现有自己的最低要求（v1 为 tengu_bridge_min_version，
  // v2 为 tengu_bridge_repl_v2_config.min_version）。

  // 2. 检查 OAuth — 必须使用 claude.ai 登录。在策略检查之前运行，
  // 以便控制台认证用户获得可操作的"/login"提示，
  // 而不是来自过期/错误组织缓存的误导性策略错误。
  if (!getBridgeAccessToken()) {
    logBridgeSkip('no_oauth', '[bridge:repl] Skipping: no OAuth tokens')
    onStateChange?.('failed', '/login')
    return null
  }

  // 3. 检查组织策略 — 远程控制可能被禁用
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    logBridgeSkip(
      'policy_denied',
      '[bridge:repl] Skipping: allow_remote_control policy not allowed',
    )
    onStateChange?.('failed', "被您组织的策略禁用")
    return null
  }

  // 当设置了 CLAUDE_BRIDGE_OAUTH_TOKEN（蚂蚁内部本地开发）时，桥接器
  // 通过 getBridgeAccessToken() 直接使用该令牌 — 钥匙串状态无关紧要。
  // 跳过 2b/2c 以保持解耦：过期的钥匙串令牌不应阻止不使用它的桥接器连接。
  if (!getBridgeTokenOverride()) {
    // 2a. 跨进程退避。如果 N 个先前进程已经看到这个确切的
    // 死亡令牌（通过 expiresAt 匹配），静默跳过 — 无事件、无刷新尝试。
    // 计数阈值容忍瞬态刷新失败（认证服务器 5xx、auth.ts:1437/1444/1485 的锁文件错误）：
    // 每个进程独立重试，直到 3 次连续失败证明令牌已死亡。
    // 镜像 useReplBridge 的进程内 MAX_CONSECUTIVE_INIT_FAILURES。
    // expiresAt 键是内容寻址的：/login → 新令牌 → 新 expiresAt
    // → 这会在无需任何显式清除的情况下停止匹配。
    const cfg = getGlobalConfig()
    if (
      cfg.bridgeOauthDeadExpiresAt != null &&
      (cfg.bridgeOauthDeadFailCount ?? 0) >= 3 &&
      getClaudeAIOAuthTokens()?.expiresAt === cfg.bridgeOauthDeadExpiresAt
    ) {
      logForDebugging(
        `[bridge:repl] Skipping: cross-process backoff (dead token seen ${cfg.bridgeOauthDeadFailCount} times)`,
      )
      return null
    }

    // 2b. 如果过期则主动刷新。镜像 bridgeMain.ts:2096 — REPL 桥接器
    // 在 useEffect 挂载时触发，在任何 v1/messages 调用之前，使其通常
    // 成为会话的第一个 OAuth 请求。没有这个，约 9% 的注册会使用
    // 已过期（>8h）的令牌访问服务器 → 401 → withOAuthRetry 可以恢复，
    // 但服务器会记录一个我们可以避免的 401。观察到 VPN 出口 IP 在
    // 许多不相关用户聚集在 8 小时 TTL 边界时，401:200 比例达到 30:1。
    //
    // 新鲜令牌成本：一次记忆化读取 + 一次 Date.now() 比较（~微秒）。
    // checkAndRefreshOAuthTokenIfNeeded 在每条触及钥匙串的路径中
    //（刷新成功、锁文件竞争、抛出异常）清除自己的缓存，因此这里
    // 没有显式的 clearOAuthTokenCache() — 那会在 91%+ 的新鲜令牌路径上
    // 强制阻塞钥匙串生成。
    await checkAndRefreshOAuthTokenIfNeeded()

    // 2c. 如果令牌在刷新尝试后仍然过期则跳过。环境变量 / FD
    // 令牌（auth.ts:894-917）的 expiresAt=null → 永远不会触发此检查。
    // 但是刷新令牌已失效（密码更改、离开组织、令牌被 GC）的钥匙串令牌
    // 具有 expiresAt<now 且刷新刚失败 — 否则客户端会永远 401 循环：
    // withOAuthRetry → handleOAuth401Error → 再次刷新失败 →
    // 使用相同的过时令牌重试 → 再次 401。
    // Datadog 2026-03-08：单个 IP 每天产生 2,879 次这样的 401。跳过
    // 保证失败的 API 调用；useReplBridge 会呈现失败信息。
    //
    // 有意不使用 isOAuthTokenExpired — 该函数有 5 分钟的主动刷新缓冲，
    // 这对于"应该尽快刷新"是正确的启发式，但对于"可证明不可用"是错误的。
    // 一个还有 3 分钟有效期的令牌 + 瞬态刷新端点故障（5xx/超时/wifi 重连）会
    // 错误触发缓冲检查；仍然有效的令牌本可以正常连接。
    // 改为检查实际过期时间：已过期且刷新失败 → 真正死亡。
    const tokens = getClaudeAIOAuthTokens()
    if (tokens && tokens.expiresAt !== null && tokens.expiresAt <= Date.now()) {
      logBridgeSkip(
        'oauth_expired_unrefreshable',
        '[bridge:repl] Skipping: OAuth token expired and refresh failed (re-login required)',
      )
      onStateChange?.('failed', '/login')
      // 为下一个进程持久化。当重新发现相同的死亡令牌时
      //（通过 expiresAt 匹配），递增 failCount；对于不同的令牌重置为 1。
      // 一旦计数达到 3，步骤 2a 的提前返回触发，此路径不再到达 —
      // 每个死亡令牌的写入上限为 3 次。
      // 局部 const 捕获收窄后的类型（闭包会丢失 !==null 收窄）。
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
  }

  // 4. 计算 baseUrl — v1（基于环境）和 v2（无环境）路径都需要。
  // 提升到 v2 门控之上，以便两者都可以使用它。
  const baseUrl = getBridgeBaseUrl()

  // 5. 推导会话标题。优先级：显式 initialName → /rename
  //（会话存储）→ 最后有意义的用户消息 → 生成的短词。
  // 仅用于展示（claude.ai 会话列表）；模型永远不会看到它。
  // 两个标志：`hasExplicitTitle`（initialName 或 /rename — 永不自动
  // 覆盖）与 `hasTitle`（任何标题，包括自动推导的 — 阻止
  // count-1 重新推导但不阻止 count-3）。onUserMessage 回调
  //（同时连接到下面的 v1 和 v2）从第 1 条提示推导，再从第 3 条推导，
  // 以便移动端/网页端显示反映更多上下文的标题。
  // 短词回退（例如 "remote-control-graceful-unicorn"）使
  // 自动启动的会话在第一个提示之前就能在 claude.ai 列表中区分开来。
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
    } else if (initialMessages && initialMessages.length > 0) {
      // 找到最后一条有有意义内容的用户消息。跳过元信息
      //（nudges）、工具结果、紧凑摘要（"此会话正在继续…"）、非人类来源
      //（任务通知、频道推送）和合成中断（[请求被用户中断]）—
      // 这些都不是人类编写的。与 extractTitleText + isSyntheticMessage 相同的过滤器。
      for (let i = initialMessages.length - 1; i >= 0; i--) {
        const msg = initialMessages[i]!
        if (
          msg.type !== 'user' ||
          msg.isMeta ||
          msg.toolUseResult ||
          msg.isCompactSummary ||
          (msg.origin && msg.origin.kind !== 'human') ||
          isSyntheticMessage(msg)
        )
          continue
        const rawContent = getContentText(msg.message.content)
        if (!rawContent) continue
        const derived = deriveTitle(rawContent)
        if (!derived) continue
        title = derived
        hasTitle = true
        break
      }
    }
  }

  // v1 和 v2 共享 — 在每条值得生成标题的用户消息上触发，直到
  // 返回 true。在计数 1：立即 deriveTitle 占位符，然后
  // generateSessionTitle（Haiku，句子大小写）即发即弃升级。在
  // 计数 3：在整个对话上重新生成。如果标题是显式的则完全跳过
  //（/remote-control <name> 或 /rename）— 在调用时重新检查
  // sessionStorage，以避免消息之间的 /rename 被覆盖。
  // 如果 initialMessages 已经推导过则跳过计数 1（该标题是新鲜的）；
  // 在计数 3 时仍会刷新。v2 传递 cse_*；updateBridgeSessionTitle
  // 内部重新标记。
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
      `[bridge:repl] derived title from message ${atCount}: ${derived}`,
    )
    void updateBridgeSessionTitle(bridgeSessionId, derived, {
      baseUrl,
      getAccessToken: getBridgeAccessToken,
    }).catch(() => {})
  }
  // 即发即弃的 Haiku 生成，带有 await 后守卫。重新检查 /rename
  //（sessionStorage）、v1 env-lost（lastBridgeSessionId）和同会话
  // 乱序解析（genSeq — count-1 的 Haiku 在 count-3 之后解析
  // 会覆盖更丰富的标题）。generateSessionTitle 从不拒绝。
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
    // v1 env-lost 使用新 ID 重新创建会话。重置计数以便
    // 新会话获得自己的 count-3 推导；hasTitle 保持为 true
    //（新会话通过 getCurrentTitle() 创建，它从此闭包中读取 count-1
    // 标题），因此新周期的 count-1 正确跳过。
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
      generateAndPatch(text, bridgeSessionId)
    } else if (userMessageCount === 3) {
      const msgs = getMessages?.()
      const input = msgs
        ? extractConversationText(getMessagesAfterCompactBoundary(msgs))
        : text
      generateAndPatch(input, bridgeSessionId)
    }
    // 如果 v1 env-lost 将传输的 done 标志重置超过 3，也重新锁定。
    return userMessageCount >= 3
  }

  const initialHistoryCap = getFeatureValue_CACHED_WITH_REFRESH(
    'tengu_bridge_initial_history_cap',
    200,
    5 * 60 * 1000,
  )

  // 在 v1/v2 分支之前获取 orgUUID — 两条路径都需要它。v1 用于
  // 环境注册；v2 用于归档（位于兼容的
  // /v1/sessions/{id}/archive，而非 /v1/code/sessions）。没有它，v2
  // 归档会返回 404，且会话在 /exit 后仍在 CCR 中存活。
  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logBridgeSkip('no_org_uuid', '[bridge:repl] Skipping: no org UUID')
    onStateChange?.('failed', '/login')
    return null
  }

  // ── GrowthBook 门控：无环境（env-less）桥接器 ──────────────────────────────────
  // 启用时，完全跳过环境 API 层（无 register/
  // poll/ack/heartbeat），直接通过 POST /bridge → worker_jwt 连接。
  // 详见服务器 PR #292605（在 #293280 中重命名）。仅限 REPL — 守护进程/print 路径
  // 继续使用基于环境的方案。
  //
  // 命名说明："无环境"不同于"CCR v2"（/worker/* 传输层）。
  // 下面的基于环境路径也可以通过 CLAUDE_CODE_USE_CCR_V2 使用 CCR v2。
  // tengu_bridge_repl_v2 门控的是无环境（无轮询循环），而非传输版本。
  //
  // perpetual（通过 bridge-pointer.json 的助手模式会话连续性）是
  // 与环境耦合的，此处尚未实现 — 当设置时回退到基于环境的方案，
  // 以便 KAIROS 用户不会静默丢失跨重启的连续性。
  if (isEnvLessBridgeEnabled() && !perpetual) {
    const versionError = await checkEnvLessBridgeMinVersion()
    if (versionError) {
      logBridgeSkip(
        'version_too_old',
        `[bridge:repl] Skipping: ${versionError}`,
        true,
      )
      onStateChange?.('failed', '运行 `claude update` 进行升级')
      return null
    }
    logForDebugging(
      '[bridge:repl] Using env-less bridge path (tengu_bridge_repl_v2)',
    )
    const { initEnvLessBridgeCore } = await import('./remoteBridgeCore.js')
    return initEnvLessBridgeCore({
      baseUrl,
      orgUUID,
      title,
      getAccessToken: getBridgeAccessToken,
      onAuth401: handleOAuth401Error,
      toSDKMessages,
      initialHistoryCap,
      initialMessages,
      // v2 总是创建新的服务器会话（新的 cse_*  id），因此
      // 不传递 previouslyFlushedUUIDs — 不存在跨会话
      // UUID 冲突风险，且引用在 enable→disable→
      // 重新启用周期中持续存在，这会导致新会话接收零条
      // 历史记录（所有 UUID 都已在先前启用的集合中）。
      // v1 通过在新会话创建时调用 previouslyFlushedUUIDs.clear()
      // 来处理此问题（replBridge.ts:768）；v2 完全跳过该参数。
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
  }

  // ── v1 路径：基于环境（register/poll/ack/heartbeat）──────────────────

  const versionError = checkBridgeMinVersion()
  if (versionError) {
    logBridgeSkip('version_too_old', `[bridge:repl] 跳过：${versionError}`)
    onStateChange?.('failed', '运行 `claude update` 以升级')
    return null
  }

  // 收集 git 上下文 — 这是引导读取的边界。
  // 从这里开始的所有内容都显式传递给 bridgeCore。
  const branch = await getBranch()
  const gitRepoUrl = await getRemoteUrl()
  const sessionIngressUrl =
    process.env.USER_TYPE === 'ant' &&
    process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
      ? process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
      : baseUrl

  // 助手模式（assistant-mode）会话通告不同的 worker_type，以便网页 UI
  // 可以将它们筛选到专用的选择器中。KAIROS 守卫将
  // 助手模块完全排除在外部构建之外。
  let workerType: BridgeWorkerType = 'claude_code'
  if (feature('KAIROS')) {
     
    const { isAssistantMode } =
      require('../assistant/index.js') as typeof import('../assistant/index.js')
     
    if (isAssistantMode()) {
      workerType = 'claude_code_assistant'
    }
  }

  // 6. 委派。BridgeCoreHandle 是 ReplBridgeHandle 的结构超集
  //（增加了 REPL 调用者不使用的 writeSdkMessages），
  // 因此不需要适配器 — 只需在返回时使用更窄的类型。
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
    createSession: opts =>
      createBridgeSession({
        ...opts,
        events: [],
        baseUrl,
        getAccessToken: getBridgeAccessToken,
      }),
    archiveSession: sessionId =>
      archiveBridgeSession(sessionId, {
        baseUrl,
        getAccessToken: getBridgeAccessToken,
        // gracefulShutdown.ts:407 将 runCleanupFunctions 与 2s 超时竞速。
        // 拆除还会执行 stopWork（并行）+ deregister（顺序），
        // 因此归档不能占用全部预算。1.5s 与 v2 的
        // teardown_archive_timeout_ms 默认值一致。
        timeoutMs: 1500,
      }).catch((err: unknown) => {
        // archiveBridgeSession 没有 try/catch — 5xx/超时/网络错误会
        // 直接抛出。以前被静默吞掉，使得归档失败
        // 在 BQ 中不可见且无法从调试日志诊断。
        logForDebugging(
          `[bridge:repl] archiveBridgeSession threw: ${errorMessage(err)}`,
          { level: 'error' },
        )
      }),
    // getCurrentTitle 在环境丢失后重新连接时被读取，以重新命名新的
    // 会话。/rename 写入会话存储；onUserMessage 直接改变
    // `title` — 两条路径都会在这里被捕获。
    getCurrentTitle: () => getCurrentSessionTitle(getSessionId()) ?? title,
    onUserMessage,
    toSDKMessages,
    onAuth401: handleOAuth401Error,
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
}

const TITLE_MAX_LEN = 50

/**
 * 快速占位标题：去除显示标签，取第一句，
 * 折叠空白，截断至 50 个字符。如果结果为空
 *（例如消息只有 <local-command-stdout>），返回 undefined。
 * 一旦 Haiku 解析完成（约 1-15s），会被 generateSessionTitle 替换。
 */
function deriveTitle(raw: string): string | undefined {
  // 去除 <ide_opened_file>、<session-start-hook> 等 — 这些出现在
  // IDE/钩子注入上下文的用户消息中。stripDisplayTagsAllowEmpty
  // 返回 ''（而非原始文本），因此纯标签消息会被跳过。
  const clean = stripDisplayTagsAllowEmpty(raw)
  // 第一句通常是意图；其余部分通常是上下文/细节。
  // 使用捕获组而非后顾断言 — 保持 YARR JIT 愉快。
  const firstSentence = /^(.*?[.!?])\s/.exec(clean)?.[1] ?? clean
  // 折叠换行/制表符 — 标题在 claude.ai 列表中是单行的。
  const flat = firstSentence.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > TITLE_MAX_LEN
    ? flat.slice(0, TITLE_MAX_LEN - 1) + '\u2026'
    : flat
}
