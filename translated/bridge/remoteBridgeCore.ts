// biome-ignore-all assist/source/organizeImports: 环境无关导入标记不得重新排序

 /**
 * 环境无关远程控制桥接核心。
 *
 * "环境无关" = 不使用环境API层。与"CCR v2"（/worker/*传输协议）不同 — 基于环境的路径（replBridge.ts）也可以通过CLAUDE_CODE_USE_CCR_V2使用CCR v2传输协议。此文件关注的是移除轮询/分派层，而非底层传输协议。
 *
 * 与initBridgeCore（基于环境，约2400行）不同，此方法直接连接到会话入口层，无需环境API的工作分发层：
 *
 *   1. POST /v1/code/sessions              （OAuth，无环境ID）→ session.id
 *   2. POST /v1/code/sessions/{id}/bridge （OAuth）→ 返回{worker_jwt, expires_in, api_base_url, worker_epoch}
 *      每次/bridge调用都会增加版本号 — 它就是注册。无需单独的/worker/register。
 *   3. createV2ReplTransport(worker_jwt, worker_epoch) → 使用SSE + CCRClient
 *   4. createTokenRefreshScheduler → 主动/bridge重新调用（新的JWT + 新的版本号）
 *   5. SSE上的401错误 → 使用新的/bridge凭证重建传输（相同序列号）
 *
 * 不包含注册/轮询/确认/停止/心跳/取消注册等环境生命周期管理功能。
 * 环境API历史上存在是因为CCR的/worker/*端点需要会话ID+角色=worker的JWT，而该JWT只能由工作分发层生成。服务器PR #292605（在#293280中重命名）添加了/bridge端点，作为直接的OAuth→worker_jwt交换，使得环境层对于REPL会话变得可选。
 *
 * 受限于`tengu_bridge_repl_v2`增长书标志，在initReplBridge.ts中启用。
 * 仅限REPL使用 — 守护进程/打印功能仍基于环境。
 */

 import { feature } from 'bun:bundle'
 import axios from 'axios'
 import {
 createV2ReplTransport,
 type ReplBridgeTransport,
 } from './replBridgeTransport.js'
import { buildCCRv2SdkUrl } from './workSecret.js'
import { toCompatSessionId } from './sessionIdCompat.js'
import { FlushGate } from './flushGate.js'
import { createTokenRefreshScheduler } from './jwtUtils.js'
  import { getTrustedDeviceToken } from './trustedDevice.js'
  import {
getEnvLessBridgeConfig,
type EnvLessBridgeConfig,
} from './envLessBridgeConfig.js'
import {
handleIngressMessage,
handleServerControlRequest,
makeResultMessage,
  isEligibleBridgeMessage,
  extractTitleText,
BoundedUUIDSet,
} from './bridgeMessaging.js'
  import { logBridgeSkip } from './debugUtils.js'
  import { logForDebugging } from '../utils/debug.js'
  import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
  import { isInProtectedNamespace } from '../utils/envUtils.js'
  import { errorMessage } from '../utils/errors.js'
  import { sleep } from '../utils/sleep.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import {
type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
logEvent,
} from '../services/analytics/index.js'
import type { ReplBridgeHandle, BridgeState } from './replBridge.js'
import type { Message } from '../types/message.js'<｜end▁of▁sentence｜>
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlRequest,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import type { PermissionMode } from '../utils/permissions/PermissionMode.js'

const ANTHROPIC_VERSION = '2023-06-01'

// ws_connected 连接器的遥测区分符。'initial' 是默认值，
// 并且不会传递给 rebuildTransport（该函数只能在初始化后调用）；
// 使用 Exclude<> 在两个签名中都明确该约束。
type ConnectCause = 'initial' | 'proactive_refresh' | 'auth_401_recovery'

function oauthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
  }
}

export type EnvLessBridgeParams = {
  baseUrl: string
  orgUUID: string
  title: string
  getAccessToken: () => string | undefined
  onAuth401?: (staleAccessToken: string) => Promise<boolean>
  /**
   * 将内部消息数组转换为 SDK 消息数组，用于 writeMessages() 函数以及
   * 初始消息/历史消息的刷新和同步。通过注入而非导入实现——因为 mappers.ts
   * 会间接引入整个命令注册表和 React 树，这会导致未使用该模块的包体积膨胀。
   */
   toSDKMessages: (messages: Message[]) => SDKMessage[]
  initialHistoryCap: number
  initialMessages?: Message[]
  onInboundMessage?: (msg: SDKMessage) => void | Promise<void>
  /**
  * 每当在 writeMessages() 中看到值得记录的用户消息时触发，
   * 直到回调返回 true（完成）。镜像 replBridge.ts 中的 onUserMessage ——
   * 调用者根据消息生成标题并 PATCH 到 /v1/sessions/{id}，这样自动启动的会话
   * 就不会停留在通用的备用标题上。调用者负责实现生成标题的策略（计数和频率）；
   * 连接器只是持续调用直到被指示停止。sessionId 是原始的 cse_* 格式，
   * 而 updateBridgeSessionTitle 会内部重新标记。
   */
   onUserMessage?: (text: string, sessionId: string) => boolean
   onPermissionResponse?: (response: SDKControlResponse) => void
  onInterrupt?: () => void
  onSetModel?: (model: string | undefined) => void
  onSetMaxThinkingTokens?: (maxTokens: number | null) => void
  onSetPermissionMode?: (
  mode: PermissionMode,
  ) => { ok: true } | { ok: false; error: string }
    onStateChange?: (state: BridgeState, detail?: string) => void
  /**
  * 当为 true 时，跳过打开 SSE 读取流——仅激活 CCRClient 写入路径。
  * 该函数会创建 v2 REPL 连接器并处理服务器控制请求。
   */
   outboundOnly?: boolean
   /** 用于会话分类的自由标签（例如 ['ccr-mirror']）。 */
   tags?: string[]
  }

  /**
* 创建一个会话，获取 worker 的 JWT，连接 v2 转换器。
*
* 在任何预处理失败时（会话创建失败、/bridge 接口失败、转换器设置失败）返回 null。
 * 调用者（initReplBridge）将其作为“初始化失败”的通用状态呈现。
 */
 export async function initEnvLessBridgeCore(
 params: EnvLessBridgeParams,
 ): Promise<ReplBridgeHandle | null> {<｜end▁of▁sentence｜>
  const {
    baseUrl,
    orgUUID,
    title,
    getAccessToken,
    onAuth401,
    toSDKMessages,
    initialHistoryCap,
    initialMessages,
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
  } = params

  const cfg = await getEnvLessBridgeConfig()

  // ── 1. 创建会话 (POST /v1/code/sessions, 不带环境ID) ───────────────
  const accessToken = getAccessToken()
  if (!accessToken) {
    logForDebugging('[remote-bridge] 没有OAuth令牌')
    return null
  }

  const createdSessionId = await withRetry(
    () =>
      createCodeSession(baseUrl, accessToken, title, cfg.http_timeout_ms, tags),
    'createCodeSession',
    cfg,
  )
  if (!createdSessionId) {
    onStateChange?.('failed', '会话创建失败 — 查看调试日志')
    logBridgeSkip('v2_session_create_failed', undefined, true)
    return null
  }
  const sessionId: string = createdSessionId
  logForDebugging(`[remote-bridge] 创建了会话 ${sessionId}`)
  logForDiagnosticsNoPII('info', 'bridge_repl_v2_session_created')

  // ── 2. 获取桥接凭证 (POST /bridge → worker_jwt, expires_in, api_base_url) ──
  const credentials = await withRetry(
    () =>
      fetchRemoteCredentials(
        sessionId,
        baseUrl,
        accessToken,
        cfg.http_timeout_ms,
      ),
    'fetchRemoteCredentials',
    cfg,
  )
  if (!credentials) {
    onStateChange?.('failed', '远程凭证获取失败 — 查看调试日志')
    logBridgeSkip('v2_remote_creds_failed', undefined, true)
    void archiveSession(
      sessionId,
      baseUrl,
      accessToken,
      orgUUID,
      cfg.http_timeout
    )
    return null
  }
  logForDebugging(
    `[remote-bridge] 获取了桥接凭证 (expires_in=${credentials.expires_in}s)`,
  )

  // ── 3. 构建v2传输 (SSETransport + CCRClient) ────────────────────
  const sessionUrl = buildCCRv2SdkUrl(credentials.api_base_url, sessionId)
  logForDebugging(`[remote-bridge] v2会话URL: ${sessionUrl}`)

  let transport: ReplBridgeTransport
  try {
    transport = await createV2ReplTransport({
      sessionUrl,
      ingressToken: credentials.worker_jwt,
      sessionId,
      epoch: credentials.worker_epoch,
      heartbeatIntervalMs: cfg.heartbeat_interval_ms,
      heartbeatJitterFraction: cfg.heartbeat_jitter_fraction,
      // 实例级配置 — 避免将worker_jwt写入到
      // process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN中，因为mcp/client.ts
      // 会无条件读取它并发送到用户配置的ws/http
      // MCP服务器。冻结在构造时是正确的：传输将在刷新时
      // 完全重建（通过下方的rebuildTransport函数）。
      getAuthToken: () => credentials.worker_jwt,
      outboundOnly,
    })
  } catch (err) {
    logForDebugging(
      `[remote-bridge] v2传输设置失败: ${errorMessage(err)}`,
      { level: 'error' },
    )
    onStateChange?.('failed', `传输设置失败: ${errorMessage(err)}`)
}<｜end▁of▁sentence｜>
    需要汉化的内容是:
    logBridgeSkip('v2_transport_setup_failed', undefined, true)
      void archiveSession(
      sessionId,
      baseUrl,
      accessToken,
      orgUUID,
    cfg.http_timeout_ms,
    )
  return null
  }
    logForDebugging(
  `[remote-bridge] v2 transport created (epoch=${credentials.worker_epoch})`,
  )
onStateChange?.('ready')

// ── 4. 状态 ────────────────────────────────────────────────────────────

  // Echo 去重：我们 POST 的消息会通过读取流返回。初始消息 UUID 进行了预填充，
  // 以便服务器对已刷新历史的回显能够被识别。两个集合都覆盖了初始 UUID —
  // recentPostedUUIDs 是一个容量为 2000 的环形缓冲区，可能会在足够多的实时写入后将其移除；
  // initialMessageUUIDs 是无界的后备方案。纵深防御策略；与 replBridge.ts 类似。
  const recentPostedUUIDs = new BoundedUUIDSet(cfg.uuid_dedup_buffer_size)
  const initialMessageUUIDs = new Set<string>()
  if (initialMessages) {
    for (const msg of initialMessages) {
      initialMessageUUIDs.add(msg.uuid)
      recentPostedUUIDs.add(msg.uuid)
    }
  }

  // 防御性去重：用于重新投递的入站提示（序列号协商边缘情况，
  // 服务器在传输切换后对历史记录进行重放）。
  const recentInboundUUIDs = new BoundedUUIDSet(cfg.uuid_dedup_buffer_size)

  // FlushGate：在刷新门闩开启期间队列实时写入，确保服务器按顺序接收 [历史记录..., 实时...]
  const flushGate = new FlushGate<Message>()

let initialFlushDone = false
  let tornDown = false
  let authRecoveryIn = false
  // 用户消息回调完成的闩锁 — 当回调返回 true 时切换为 true
  // （策略表示“完成派生”）。sessionId 是常量（没有重新创建路径 —
  // rebuildTransport 切换 JWT/epoch，会话相同），因此无需重置。
  let userMessageCallbackDone = !onUserMessage

// 测绘：为什么连接触发了？在重建传输前设置；
  // 异步读取 onConnect 中的值。由于 authRecoveryInFlight 对重建调用进行序列化，
  // 而新的 initEnvLessBridgeCore() 调用会获得默认的 'initial' 值，因此是安全的。
  let connectCause: ConnectCause = 'initial'

  // 连接超时：在 onConnect 之后设定连接的截止时间。在连接或关闭（获得关闭 — 非静默）时清除。
// 如果既没有连接也没有关闭，在 cfg.connect_timeout_ms 之前，onConnectTimeout 将触发 —
  // 这是连接后静默间隙的唯一信号。
  let connectDeadline: ReturnType<typeof setTimeout> | undefined
  function onConnectTimeout(cause: ConnectCause): void {
  if (tornDown) return
  logEvent('tengu_bridge_repl_connect_timeout', {
  v2: true,
    elapsed_ms: cfg.connect_timeout_ms,
    cause:
      cause as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      }

    // ── 5. JWT 刷新调度器 ────────────────────────────────────────────
  // 在到期前 5 分钟（根据每个响应的 expires_in）安排一个回调。触发时，
// 使用 OAuth 重新获取 /bridge —— 用新凭证重建传输。
  </think>
  需要汉化的内容是:
  logBridgeSkip('v2_transport_setup_failed', undefined, true)
    void archiveSession(
      sessionId,
      baseUrl,
      accessToken,
      orgUUID,
      cfg.http_timeout_ms,
    )
    return null
  }
  logForDebugging(
    `[remote-bridge] v2 transport created (epoch=${credentials.worker_epoch})`,
  )
  onStateChange?.('ready')

  // ── 4. 状态 ────────────────────────────────────────────────────────────

  // Echo 去重：我们 POST 的消息会通过读取流返回。初始消息 UUID 进行了预填充，
  // 以便服务器对已刷新历史的回显能够被识别。两个集合都覆盖了初始 UUID —
  // recentPostedUUIDs 是一个容量为 2000 的环形缓冲区，可能会在足够多的实时写入后将其移除；
  // initialMessageUUIDs 是无界的后备方案。纵深防御策略；与 replBridge.ts 类似。
  const recentPostedUUIDs = new BoundedUUIDSet(cfg.uuid_dedup_buffer_size)
  const initialMessageUUIDs = new Set<string>()
  if (initialMessages) {
    for (const msg of initialMessages) {
      initialMessageUUIDs.add(msg.uuid)
      recentPostedUUIDs.add(msg.uuid)
    }
  }

  // 防御性去重：用于重新投递的入站提示（序列号协商边缘情况，
  // 服务器在传输切换后对历史记录进行重放）。
  const recentInboundUUIDs = new BoundedUUIDSet(cfg.uuid_dedup_buffer_size)

  // FlushGate：在刷新门闩开启期间队列实时写入，确保服务器按顺序接收 [历史记录..., 实时...]
  const flushGate = new FlushGate<Message>()

  let initialFlushDone = false
  let tornDown = false
  let authRecoveryInFlight = false
  // 用户消息回调完成的闩锁 — 当回调返回 true 时切换为 true
  // （策略表示“完成派生”）。sessionId 是常量（没有重新创建路径 —
  // rebuildTransport 切换 JWT/epoch，会话相同），因此无需重置。
  let userMessageCallbackDone = !onUserMessage

  // 测绘：为什么连接触发了？在重建传输前设置；
  // 异步读取 onConnect 中的值。由于 authRecoveryInFlight 对重建调用进行序列化，
  // 而新的 initEnvLessBridgeCore() 调用会获得默认的 'initial' 值，因此是安全的。
  let connectCause: ConnectCause = 'initial'

  // 连接超时：在 onConnect 之后设定连接的截止时间。在连接或关闭（获得关闭 — 非静默）时清除。
  // 如果既没有连接也没有关闭，在 cfg.connect_timeout_ms 之前，onConnectTimeout 将触发 —
  // 这是连接后静默间隙的唯一信号。
  let connectDeadline: ReturnType<typeof setTimeout> | undefined
  function onConnectTimeout(cause: ConnectCause): void {
    if (tornDown) return
    logEvent('tengu_bridge_repl_connect_timeout', {
      v2: true,
      elapsed_ms: cfg.connect_timeout_ms,
      cause:
        cause as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // ── 5. JWT 刷新调度器 ────────────────────────────────────────────
  // 在到期前 5 分钟（根据每个响应的 expires_in）安排一个回调。触发时，
  // 使用 OAuth 重新获取 /bridge —— 用新凭证重建传输。
  // 注意：expires_in 是响应中的一个字段，表示令牌的有效期（秒）
  // 回调函数应在令牌过期前执行，以刷新凭证
  // 这有助于保持连接的活跃状态并处理令牌到期问题

  // 示例代码：假设我们有一个函数可以刷新令牌
  function refreshAccessToken() {
    // 使用新的 access token 进行操作
    // 注意：这里需要根据实际情况实现刷新逻辑
  }

  // 安排刷新任务
  function scheduleRefresh() {
    const expiresIn = cfg.accessTokenExpiresIn; // 获取有效期（秒）
    const refreshTime = expiresIn * 0.9; // 在过期前 10% 的时间安排刷新

    // 计算刷新时间（毫秒）
    // 注意：这里使用 setTimeout 来安排任务，但实际应用中可能需要更精确的计时
    const now = Date.now();
    const refreshInMs = refreshTime * 1000 - now; // 转换为毫秒

    if (refreshInMs > 0) {
      // 安排刷新任务
      // 注意：使用 setTimeout 而不是 setInterval，因为令牌有效期是固定的
      setTimeout(scheduleRefresh, refreshInMs); // 重新安排刷新任务（以防任务执行时间过长）
    }

    // 执行刷新逻辑
    refreshAccessToken();
  }

  // 初始调度
  scheduleRefresh();<｜end▁of▁sentence｜>
  // 每次 /bridge 调用都会在服务器端增加纪元（epoch），因此仅使用 JWT 进行交换会留下旧的 CCRClient 心跳使用过时的纪元 → 20 秒内出现 409 错误。
  const refresh = createTokenRefreshScheduler({
  refreshBufferMs: cfg.token_refresh_buffer_ms,
  getAccessToken: async () => {
    // 无条件地在调用 /bridge 之前刷新 OAuth 认证。
    // getAccessToken() 返回的过期令牌被当作非空字符串（不检查过期时间），
      // 所以布尔值为真并不表示令牌有效。将过时的令牌传递给 onAuth401
      // 这样 handleOAuth401Error 的密钥链比较才能检测到并行刷新。
      const stale = getAccessToken()
      if (onAuth401) await onAuth401(stale ?? '')
      return getAccessToken() ?? stale
      },
      onRefresh: (sid, oauthToken) => {
    void (async () => {
    // 笔记本唤醒：主动定时器过期 + SSE 401 错误同时触发。
      // 在调用 /bridge 之前先声明该标志，这样另一路径可以完全跳过
        // 避免双重纪元增加（每次 /bridge 调用都会增加；如果两者都执行，则第一个重建会得到过时的纪元并返回 409 错误）。
        if (authRecoveryInFlight || tornDown) {
        logForDebugging(
        '[remote-bridge] 恢复操作已在进行中，跳过主动刷新',
        )
          return
            }
          authRecoveryInFlight = true
          try {
        const fresh = await withRetry(
        () =>
        fetchRemoteCredentials(
          sid,
            baseUrl,
              oauthToken,
                cfg.http_timeout_ms,
                ),
                'fetchRemoteCredentials (主动)',
                cfg,
              )
            if (!fresh || tornDown) return
            await rebuildTransport(fresh, '主动刷新')
          logForDebugging(
          '[remote-bridge] 传输已重建（主动刷新）',
          )
          } catch (err) {
            logForDebugging(
          `[remote-bridge] 主动刷新重建失败：${errorMessage(err)}`,
        { level: 'error' },
          )
            logForDiagnosticsNoPII(
            'error',
          'bridge_repl_v2_主动刷新失败',
          )
            if (!tornDown) {
            onStateChange?.('failed', `刷新失败：${errorMessage(err)}`)
          }
          } finally {
            authRecoveryInFlight = false
          }
        })()
          },
        label: 'remote',
      })

    refresh.scheduleFromExpiresIn(sessionId, credentials.expires_in)

  // ── 6. 绑定回调函数（提取出来以便在传输重建时重新绑定） ──────
function wireTransportCallbacks(): void {
  transport.setOnConnect(() => {
  clearTimeout(connectDeadline)
    logForDebugging('[remote-bridge] v2 传输已连接')
      logForDiagnosticsNoPII('info', 'bridge_repl_v2_传输已连接')
      logEvent('tengu_bridge_repl_ws_已连接', {
      v2: true,
      原因:
        connectCause as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })

      if (!initialFlushDone && initialMessages && initialMessages.length > 0) {
        需要汉化的内容是:
        initialFlushDone = true
        // 捕获当前传输 —— 如果在刷新过程中发生 401/teardown 错误，
        // 那么过时的 .finally() 不应刷新网关或信号连接。
        // (与 replBridge.ts:1119 中相同的防护模式。)
        const flushTransport = transport
          void flushHistory(initialMessages)
            .catch(e =>
          logForDebugging(`[remote-bridge] flushHistory 失败: ${e}`),
          )
            .finally(() => {
            // authRecoveryInFlight 捕获 v1 与 v2 的不对称性：v1 在 setOnClose 中同步设置为 null（在 replBridge.ts:1175），
            // 因此 transport !== flushTransport 会立即触发条件。v2 不会将 transport 设为 null ——
            // transport 仅在 rebuildTransport:346 处重新赋值，且有 3 个等待深度。
            // authRecoveryInFlight 在 rebuildTransport 的入口处同步设置。
            if (
              transport !== flushTransport ||
              tornDown ||
              authRecoveryInFlight
            ) {
              return
            }
            drainFlushGate()
            onStateChange?.('connected')
          })
      } else if (!flushGate.active) {
        onStateChange?.('connected')
      }
    })

    transport.setOnData((data: string) => {
      handleIngressMessage(
        data,
        recentPostedUUIDs,
        recentInboundUUIDs,
        onInboundMessage,
        // 远程客户端已回答权限提示 —— 轮次恢复。
        // 若无此设置，服务器将保持在 requires_action 状态，直到下一条用户消息或轮次结束结果。
        onPermissionResponse
        ? res => {
          transport.reportState('running')
              onPermissionResponse(res)
              }
            : undefined,
          req =>
        handleServerControlRequest(req, {
          transport,
            sessionId,
            onInterrupt,
            onSetModel,
            onSetMaxThinkingTokens,
            onSetPermissionMode,
            outboundOnly,
            }),
          )
      })

transport.setOnClose((code?: number) => {
    clearTimeout(connectDeadline)
      if (tornDown) return
      logForDebugging(`[remote-bridge] v2 transport 关闭 (code=${code})`)
      logEvent('tengu_bridge_repl_ws_closed', { code, v2: true })
      // onClose 仅在 TERMINAL 失败时触发：401（JWT 无效），
      // 4090（CCR 版本不匹配），4091（CCR 初始化失败），或 SSE 10 分钟
      // 重新连接配额耗尽。临时断开连接会在内部的 SSETransport 中透明处理。
      // 401 错误可以恢复（获取新 JWT，重建传输）；所有其他错误码都是死路。
      if (code === 401 && !authRecoveryInFlight) {
      void recoverFromAuthFailure()
      return
        }
        onState = 'failed'
      onStateChange?.('failed', `传输关闭 (错误码 ${code})`)
      })
    }

// ── 7. 传输重建（由主动刷新和 401 恢复共享） ──
  // 每次 /bridge 调用都会在服务器端增加一个版本号。
  // 两种刷新路径都必须使用新版本号重建传输 —— 一个仅 JWT 交换的轮换会保留旧版本<｜end▁of▁sentence｜>
  需要汉化的内容是:
  // 旧的 CCRClient 心跳传输过时 → 409. SSE 从旧传输的高水位标记序列号继续
  // 因此无需服务器端重放。
  // 调用者必须在调用前（同步地，且在任何 await 之前）设置 authRecoveryInFlight = true，并在 finally 中清除它。
  // 此函数不管理该标志——将其移至此处会导致在防止双重 /bridge 获取时为时已晚，且每次获取都会增加 epoch。
  异步函数重建传输(
  新鲜: 远程凭证,
    原因: 排除<连接原因, '初始'>,
    ): 承诺<void> {
  连接原因 = 原因
    // 在重建期间排队写入 —— /bridge 返回后，旧传输的
    // epoch 将过时，其下一次写入或心跳将导致 409 错误。
    // 没有这个门控，
    // 写入消息会将 UUID 添加到最近已发布 UUID 列表中，然后写入批次会静默地
    // 不操作（关闭上传器后 409）→ 永久丢失消息。
    门控开始()
    尝试 {
      const 序列号 = 传输.getLastSequenceNum()
      传输.close()
      传输 = 等待创建 V2 REPL 传输({
        会话 URL: 构建 CCR v2 SDK URL(新鲜.api基础URL, 会话 ID),
        入站令牌: 新鲜.工作线 JWT,
        会话 ID,
        epoch: 新鲜.工作线 epoch,
        心跳间隔毫秒: 配置.心跳间隔毫秒,
        心跳抖动分数: 配置.心跳抖动分数,
        初始序列号: 序列号,
        获取授权令牌: () => 新鲜.工作线 JWT,
        出站仅用,
      })
      如果 已拆除 {
        // 异常解除期间，解除已触发。
        // 不连接/解除连接/安排 —— 我们会在取消所有()后重新启动定时器
        // 并在解除连接的桥上触发 onInboundMessage。
        传输.close()
        返回
      }
      连接传输回调()
      传输.connect()
      连接超时 = 设置超时(
        连接超时,
        配置.连接超时毫秒,
        连接原因,
      )
      刷新计划从过期开始(会话 ID, 新鲜.过期时间)
      // 将排队的消息排入新的上传器。在
      // ccr.initialize() 解析之前运行（传输.connect() 是触发即忘），
      // 但初始 PUT /worker 后上传器会序列化。如果
      // 初始化失败（4091），事件将丢失 —— 但只有最近已发布 UUID 列表
      // （每个实例）被填充，因此重新启用桥会重新刷新。
      排门控()
    } 最后 {
      // 在失败路径上也结束门控 —— 排门控已经在成功时结束
      // 它。排队的消息将被丢弃（传输仍然无效）。
      门控结束()
    }
  }

  // ── 8. 401 认证恢复（OAuth 刷新 + 重建） ───────────────────────────
  异步函数从认证失败中恢复(): 承诺<void> {
    // setOnClose 已经通过 `!authRecoveryInFlight` 保护了设置，但
    // 此设置必须在任何 await 之前与 onRefresh 同步进行。笔记本唤醒时会同时
    // 触发两条路径。
    如果 认证恢复正在进行 {
    返回
    }
    认证恢复正在进行 = 真实
    触发状态变化('重新连接中', 'JWT 已过期 —— 正在刷新')<｜end▁of▁sentence｜>
    // 需要汉化的内容是:
    logForDebugging('[remote-bridge] 401 on SSE — attempting JWT refresh')
      try {
      // 无条件尝试OAuth刷新 — getAccessToken()返回的令牌即使已过期也不会为null，所以!oauthToken无法检测过期情况。
      // 传递陈旧令牌，以便handleOAuth401Error中的密钥对比能判断其他标签是否已刷新。
      const stale = getAccessToken()
      if (onAuth401) await onAuth401(stale ?? '')
      const oauthToken = getAccessToken() ?? stale
      if (!oauthToken || tornDown) {
      if (!tornDone) {
        onStateChange?.('failed', 'JWT refresh failed: no OAuth token')
          }
        return
        }

const fresh = await withRetry(
      () =>
        fetchRemoteCredentials(
          sessionId,
            baseUrl,
            oauthToken,
            cfg.http_timeout_ms,
            ),
          'fetchRemoteCredentials (recovery)',
        cfg,
        )
      if (!fresh || tornDown) {
      if (!tornDown) {
        onStateChange?.('failed', 'JWT refresh failed after 401')
          }
        return
        }
      // 若401中断了初始刷新，writeBatch可能已在关闭的上传器上静默执行（因为SSE包装器在我们的setOnClose回调之前运行了ccr.close()）。
      // 重置初始刷新状态，以便新的onConnect能重新刷新。
      initialFlushDone = false
      await rebuildTransport(fresh, 'auth_401_recovery')
      logForDebugging('[remote-bridge] Transport rebuilt after 401')
      } catch (err) {
      logForDebugging(
      `[remote-bridge] 401 recovery failed: ${errorMessage(err)}`,
      { level: 'error' },
    )
      logForDiagnosticsNoPII('error', 'bridge_repl_v2_jwt_refresh_failed')
        if (!tornDown) {
        onStateChange?.('failed', `JWT refresh failed: ${errorMessage(err)}`)
      }
      } finally {
      authRecoveryInFlight = false
        }
      }

      wireTransportCallbacks()

  // 在连接之前启动flushGate，以便在握手期间writeMessages()能够排队处理消息，而不是与历史POST竞争。
if (initialMessages && initialMessages.length > 0) {
  flushGate.start()
}
  transport.connect()
  connectDeadline = setTimeout(
  onConnectTimeout,
    cfg.connect_timeout_ms,
  connectCause,
  )

    // ── 8. 历史刷新 + 排队辅助函数 ────────────────────────────────────
    function drainFlushGate(): void {
    const msgs = flushGate.end()
  if (msgs.length === 0) return
for (const msg of msgs) recentPostedUUIDs.add(msg.uuid)
  const events = toSDKMessages(msgs).map(m => ({
  ...m,
    session_id: sessionId,
    }))
    if (msgs.some(m => m.type === 'user')) {
    transport.reportState('running')
      }
      logForDebugging(
    `[remote-bridge] 在刷新后清空了${msgs.length}条排队消息`,
    )
      void transport.writeBatch(events)
    }

      async function flushHistory(msgs: Message[]): Promise<void> {
    需要汉化的内容是:
    // v2 始终创建一个新的服务器会话（上面的 unconditional createCodeSession）
    // 没有会话重用，也没有双重发布的风险。与 v1 不同，我们不
    // 过滤先前已刷新的 UUID：该集合在 REPL 启用/禁用周期之间
    // 保持不变（使用 useRef），因此在重新启用时会错误地
    // 隐藏历史记录。
      const eligible = msgs.filter(isEligibleBridgeMessage)
        const capped =
        initialHistoryCap > 0 && eligible.length > initialHistoryCap
    ? eligible.slice(-initialHistoryCap)
      : eligible
        if (capped.length < eligible.length) {
      logForDebugging(
    `[remote-bridge] 截断初始刷新: ${eligible.length} -> ${capped.length} (截断限制=${initialHistoryCap})`,
    )
      }
      const events = toSDKMessages(capped).map(m => ({
    ...m,
    session_id: sessionId,
    }))
    if (events.length === 0) return
    // 中段初始化：如果在查询过程中启用了远程控制，
    // 最后一条合格消息是用户提示或工具结果（都是 '用户' 类型）。
    // 没有此设置，初始化 PUT 的 '空闲' 状态会一直保持直到下一条
    // 用户类型消息通过 writeMessages 发送——但在纯文本回合中，
    // 这永远不会发生（只有助手部分在初始化后发送）。
    // 检查合格（未截断）的消息，而不是截断后的：截断可能
      // 截断到用户消息，即使实际尾随消息是助手。
    if (eligible.at(-1)?.type === 'user') {
    transport.reportState('运行中')
    }
  logFor (logForDebugging)`[remote-bridge] 刷新 ${events.length} 条历史记录`
await transport.writeBatch(events)
  }

  // ── 9. 拆解 ───────────────────────────────────────────────────────────
  // 在收到 SIGINT/SIGTERM 或退出信号时，会进行优雅的拆解，
  // 并在强制退出前设置 2 秒的超时限制。
  // 需要相应地分配预算：
  //   - 拆解存档：teardown_archive_timeout_ms（默认 1500，上限 2000）
    //   - 结果发送：后台运行，拆解存档延迟覆盖了发送过程
    //   - 401 重试：如果首次存档失败是 401 错误，则共享相同的预算
    async function teardown(): Promise<void> {
    if (tornDown) return
    tornDown = true
refresh.cancelAll()
    clearTimeout(connectDeadline)
    flushGate.drop()

    // 在拆解前发送结果消息——transport.write() 只等待
    // 消息入队（SerialBatchEventUploader 在缓冲区处理完成后
    // 才会解析）。在关闭前存档，给上传器的处理循环留出
    // 窗口（通常存档需要 100-500 毫秒）来发送结果，而无需
    // 明确的睡眠等待。close() 设置 closed=true 会中断处理，
// 因此在存档前关闭会导致结果消息丢失。
    transport.reportState('空闲')
    void transport.write(makeResultMessage(sessionId))

      let token = getAccessToken()
      let status = await archiveSession(
      sessionId,
      baseUrl,
    token,
orgUUID,
    cfg.teardown_archive_timeout_ms,
    )

    // 令牌通常很新鲜（刷新调度器会在过期前 5 分钟运行），
    // 但如果笔记本休眠超过了刷新窗口，getAccessToken() 会返回一个<｜end▁of▁sentence｜>
    // 过时字符串。在401錯誤時嘗試一次重試 —— onAuth401（= handleOAuth401Error）
    // 清除金鑵鎖定緩存 + 強制刷新。在快樂路徑上不主動刷新：
    // handleOAuth401Error 即使令牌有效也會強制刷新，這將導致99%的情況下浪費配額。
    // try/catch 模擬 recoverFromAuthFailure：金鑵鎖定讀取可能拋出異常（macOS喚醒後鎖定）；
    // 這裡未捕獲的異常將跳過 transport.close + 遊戲化數據記錄。

    if (status === 401 && onAuth401) {
      try {
        await onAuth401(token ?? '')
        token = getAccessToken()
        status = await archiveSession(
          sessionId,
          baseUrl,
          token,
          orgUUID,
          cfg.teardown_archive_timeout_ms,
        )
      } catch (err) {
        logForDebugging(
          `[remote-bridge] 拆卸401重試拋出錯誤：${errorMessage(err)}`,
          { level: 'error' },
        )
      }
    }

    transport.close()

    const archiveStatus: ArchiveTelemetryStatus =
      status === 'no_token'
        ? 'skipped_no_token'
        : status === 'timeout' || status === 'error'
          ? 'network_error'
          : status >= 500
            ? 'server_5xx'
            : status >= 400
              ? 'server_4xx'
              : 'ok'

    logForDebugging(`[remote-bridge] 拆卸完成 (archive=${status})`)
    logForDiagnosticsNoPII('info', 'bridge_repl_v2_teardown')
    logEvent(
      feature('CCR_MIRROR') && outboundOnly
        ? 'tengu_ccr_mirror_teardown'
        : 'tengu_bridge_repl_teardown',
      {
        v2: true,
        archive_status:
          archiveStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        archive_ok: typeof status === 'number' && status < 400,
        archive_http_status: typeof status === 'number' ? status : undefined,
        archive_timeout: status === 'timeout',
        archive_no_token: status === 'no_token',
      },
    )

  const unregister = registerCleanup(teardown)

  if (feature('CCR_MIRROR') && outboundOnly) {
    logEvent('tengu_ccr_mirror_started', {
      v2: true,
      expires_in_s: credentials.expires_in,
    })
  } else {
    logEvent('tengu_bridge_repl_started', {
      has_initial_messages: !!(initialMessages && initialMessages.length > 0),
      v2: true,
      expires_in_s: credentials.expires_in,
      inProtectedNamespace: isInProtectedNamespace(),
    })
  }

  // ── 10. 處理 ──────────────────────────────────────────────────────────
  return {
    bridgeSessionId: sessionId,
    environmentId: '',
    sessionIngressUrl: credentials.api_base_url,
    writeMessages(messages) {
      const filtered = messages.filter(
        m =>
          isEligibleBridgeMessage(m) &&
          !initialMessageUUIDs.has(m.uuid) &&
          !recentPostedUUIDs.has(m.uuid),
      )
      if (filtered.length === 0) return

      // 觸發 onUserMessage 用於標題推導。在 flushGate 檢查前進行掃描 —— 提示即使排隊也會被視為標題內容；
      // 繼續在每次符合標題條件的消息上調用，直到回呼返回 true；<｜end▁of▁sentence｜>
      需要汉化的内容是:
      // 调用者拥有策略（推导在第一和第三处，如果明确则跳过）。
        if (!userMessageCallbackDone) {
          for (const m of filtered) {
          const text = extractTitleText(m)
            if (text !== undefined && onUserMessage?.(text, sessionId)) {
            userMessageCallbackDone = true
          break
        }
      }
}

        if (flushGate.enqueue(...filtered)) {
          logForDebugging(
        `[remote-bridge] 在刷新期间排队 ${filtered.length} 条消息`,
        )
      return
}

      for (const msg of filtered) recentPostedUUIDs.add(msg.uuid)
        const events = toSDKMessages(filtered).map(m => ({
        ...m,
      session_id: sessionId,
      }))
      // v2 不会在服务器端推导工作状态（不像 v1 会话入口点的 session_status_updater.go）。这里推送，以便 CCR 网站会话列表显示“运行中”而不是卡在“空闲”状态。批次中的用户消息标记了轮询开始。CCRClient.reportState 会合并推送连续相同状态。
      if (filtered.some(m => m.type === 'user')) {
      transport.reportState('running')
      }
      logForDebugging(`[remote-bridge] 发送 ${filtered.length} 条消息`)
        void transport.writeBatch(events)
      },
      writeSdkMessages(messages: SDKMessage[]) {
      const filtered = messages.filter(
    m => !m.uuid || !recentPostedUUIDs.has(m.uuid),
    )
      if (filtered.length === 0) return
        for (const msg of filtered) {
      if (msg.uuid) recentPostedUUIDs.add(msg.uuid)
      }
      const events = filtered.map(m => ({ ...m, session_id: sessionId }))
        void transport.writeBatch(events)
      },
      sendControlRequest(request: SDKControlRequest) {
      if (authRecoveryInFlight) {
    logForDebugging(
    `[remote-bridge] 在 401 恢复期间丢弃控制请求：${request.request_id}`,
      )
        return
          }
        const event = { ...request, session_id: sessionId }
        if (request.request.subtype === 'can_use_tool') {
      transport.reportState('requires_action')
      }
      void transport.write(event)
        logForDebugging(
      `[remote-bridge] 已发送控制请求，请求ID=${request.request_id}`,
      )
      },
        sendControlResponse(response: SDKControlResponse) {
      if (authRecoveryInFlight) {
    logForDebugging(
    '[remote-bridge] 在 401 恢复期间丢弃控制响应',
      )
        return
          }
        const event = { ...response, session_id: sessionId }
        transport.reportState('running')
      void transport.write(event)
      logForDebugging('[remote-bridge] 已发送控制响应')
      },
      sendControlCancelRequest(requestId: string) {
      if (authRecoveryInFlight) {
    logForDebugging(
    `[remote-bridge] 在 401 恢复期间丢弃控制取消请求：${requestId}`,
      )
        return
          }
        const event = {
        type: 'control_cancel_request' as const,
      request_id: requestId,
      session_id: sessionId,
        }
        // 本地解决了权限问题的钩子/分类器/通道/重新检查——
        </think><｜begin▁of▁sentence｜>需要汉化的内容是:
      // 调用者拥有策略（推导在第一和第三处，如果明确则跳过）。
      if (!userMessageCallbackDone) {
        for (const m of filtered) {
          const text = extractTitleText(m)
          if (text !== undefined && onUserMessage?.(text, sessionId)) {
            userMessageCallbackDone = true
            break
          }
        }
      }

      if (flushGate.enqueue(...filtered)) {
        logForDebugging(
          `[remote-bridge] 在刷新期间排队 ${filtered.length} 条消息`,
        )
        return
      }

      for (const msg of filtered) recentPostedUUIDs.add(msg.uuid)
      const events = toSDKMessages(filtered).map(m => ({
        ...m,
        session_id: sessionId,
      }))
      // v2 不会在服务器端推导工作状态（不像 v1 会话入口点的 session_status_updater.go）。这里推送，以便 CCR 网站会话列表显示“运行中”而不是卡在“空闲”状态。批次中的用户消息标记了轮询开始。CCRClient.reportState 会合并推送连续相同状态。
      if (filtered.some(m => m.type === 'user')) {
        transport.reportState('running')
      }
      logForDebugging(`[remote-bridge] 发送 ${filtered.length} 条消息`)
      void transport.writeBatch(events)
    },
    writeSdkMessages(messages: SDKMessage[]) {
      const filtered = messages.filter(
        m => !m.uuid || !recentPostedUUIDs.has(m.uuid),
      )
      if (filtered.length === 0) return
      for (const msg of filtered) {
        if (msg.uuid) recentPostedUUIDs.add(msg.uuid)
      }
      const events = filtered.map(m => ({ ...m, session_id: sessionId }))
      void transport.writeBatch(events)
    },
    sendControlRequest(request: SDKControlRequest) {
      if (authRecoveryInFlight) {
        logForDebugging(
          `[remote-bridge] 在 401 恢复期间丢弃控制请求：${request.request_id}`,
        )
        return
      }
      const event = { ...request, session_id: sessionId }
      if (request.request.subtype === 'can_use_tool') {
        transport.reportState('requires_action')
      }
      void transport.write(event)
      logForDebugging(
        `[remote-bridge] 已发送控制请求，请求ID=${request.request_id}`,
      )
    },
    sendControlResponse(response: SDKControlResponse) {
      if (authRecoveryInFlight) {
        logForDebugging(
          '[remote-bridge] 在 401 恢复期间丢弃控制响应',
        )
        return
      }
      const event = { ...response, session_id: sessionId }
      transport.reportState('running')
      void transport.write(event)
      logForDebugging('[remote-bridge] 已发送控制响应')
    },
    sendControlCancelRequest(requestId: string) {
      if (authRecoveryInFlight) {
        logForDebugging(
          `[remote-bridge] 在 401 恢复期间丢弃控制取消请求：${requestId}`,
        )
        return
      }
      const event = {
        type: 'control_cancel_request' as const,
        request_id: requestId,
        session_id: sessionId,
      }
      // 本地解决了权限问题的钩子/分类器/通道/重新检查——
      // (注释内容保持不变，因为它是技术术语或未明确指定翻译的部分)<｜end▁of▁sentence｜>
      需要汉化的内容是:
      // interactiveHandler 仅在以下路径中调用 cancelRequest（不发送响应）
      // 因此如果没有这个条件，服务器将保持在 requires_action 状态。
      transport.reportState('运行中')
      void transport.write(event)
        logForDebugging(
      `[remote-bridge] 已发送控制取消请求 request_id=${requestId}`,
    )
    },
      sendResult() {
        if (authRecoveryInFlight) {
        logForDebugging('[remote-bridge] 在 401 恢复期间丢弃结果')
      return
      }
      transport.reportState('空闲')
      void transport.write(makeResultMessage(sessionId))
    logForDebugging('[remote-bridge] 已发送结果')
    },
      async teardown() {
      unregister()
    await teardown()
  },
}
}

// ─── Session API (v2 /code/sessions, 无环境变量) ─────────────────────────────────

/** 使用指数退避 + 延迟抖动重试异步初始化调用。 */
  async function withRetry<T>(
  fn: () => Promise<T | null>,
  label: string,
cfg: EnvLessBridgeConfig,
  ): Promise<T | null> {
  const max = cfg.init_retry_max_attempts
    for (let attempt = 1; attempt <= max; attempt++) {
    const result = await fn()
    if (result !== null) return result
      if (attempt < max) {
      const base = cfg.init_retry_base_delay_ms * 2 ** (attempt - 1)
        const jitter =
      base * cfg.init_retry_jitter_fraction * (2 * Math.random() - 1)
      const delay = Math.min(base + jitter, cfg.init_retry_max_delay_ms)
        logFor (Debugging(
      `[remote-bridge] ${label} 失败（第 ${attempt}/${max} 次尝试），将在 ${Math.round(delay)}ms 后重试`,
      )
    await sleep(delay)
  }
  }
return null
}

// 已移至 codeSessionApi.ts，以便 SDK /bridge 子路径可以打包它们
// 而不会拉入此文件的重型 CLI 树（分析、传输）。
  export {
  createCodeSession,
type RemoteCredentials,
} from './codeSessionApi.js'
  import {
  createCodeSession,
  fetchRemoteCredentials as fetchRemoteCredentialsRaw,
type RemoteCredentials,
} from './codeSessionApi.js'
import { getBridgeBaseUrlOverride } from './bridgeConfig.js'

// CLI 端包装函数，应用 CLAUDE_BRIDGE_BASE_URL 开发覆盖并注入可信设备令牌
// （两者都是环境变量/增长分析读取，而 SDK 面向的 codeSessionApi.ts 导出必须保持无污染）。
export async function fetchRemoteCredentials(
  sessionId: string,
  baseUrl: string,
  accessToken: string,
  timeoutMs: number,
): Promise<RemoteCredentials | null> {
  const creds = await fetchRemoteCredentialsRaw(
    sessionId,
    baseUrl,
    accessToken,
    timeoutMs,
    getTrustedDeviceToken(),
  )
  if (!creds) return null
  return getBridgeBaseUrlOverride()
    ? { ...creds, api_base_url: baseUrl }
    : creds
}

type ArchiveStatus = number | '超时' | '错误' | '无令牌'

// 单类别型用于 BQ `GROUP BY archive_status`。 teardown 上的布尔值早于此存在
// 并且是冗余的（除了 archive_timeout，它区分 ECONNABORTED 与其它网络错误 ——
// 两者在此都映射到 '网络错误'，因为在 1.5 秒窗口内主要原因是超时）。<｜end▁of▁sentence｜>
// 会话存档状态类型定义
  type ArchiveTelemetryStatus =
  | 'ok'
  | 'skipped_no_token'
  | 'network_error'
  | 'server_4xx'
| 'server_5xx'

  // 异步函数：存档会话
  async function archiveSession(
  sessionId: string,
  baseUrl: string,
  accessToken: string | undefined,
orgUUID: string,
  timeoutMs: number,
  ): Promise<ArchiveStatus> {
  // 如果没有访问令牌，则返回 'no_token'
  if (!accessToken) return 'no_token'

  // 存档位于兼容层 (/v1/sessions/*，而不是 /v1/code/sessions)
  // 兼容层 parseSessionID 只接受 TagSession（session_*），因此将 cse_* 重新标记
  // 需要 anthropic-beta 和 x-organization-uuid 头部 —— 没有它们，请求会在到达处理器前在兼容网关处返回 404
  //
  // 与 bridgeMain.ts 不同（它在 sessionCompatIds 中缓存兼容ID以保持
  // 中间存储会话的日志记录器键在兼容网关切换时保持一致），这里的兼容ID
  // 只是一个服务器URL路径段 —— 没有内存状态。每次计算的新服务器
  // 会匹配当前服务器验证的内容：如果网关关闭，服务器已更新为接受
  // cse_*，则正确发送。
    const compatId = toCompatSessionId(sessionId)

      try {
      // 使用 axios 发送 POST 请求到存档端点
        const response = await axios.post(
          `${baseUrl}/v1/sessions/${compatId}/archive`,
          {},
          {
        headers: {
        ...oauthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    },
    timeout: timeoutMs,
      validateStatus: () => true,
    },
    )

    // 调试日志：记录存档操作状态
    logForDebugging(
    `[远程桥接] 存档 ${compatId} 状态=${response.status}`,
      )

  // 返回响应状态码
return response.status
  } catch (err) {
    // 获取错误信息
    const msg = errorMessage(err)

    // 调试日志：记录存档失败信息
    logFor =Debugging(`[远程桥接] 存档失败: ${msg}`)

    // 处理错误：根据错误类型返回不同状态
    return axios.isAxiosError(err) && err.code === 'ECONNABORTED'
      ? '超时'
      : '错误'
  }
}
