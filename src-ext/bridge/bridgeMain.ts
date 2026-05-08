import { feature } from 'bun:bundle'
import { randomUUID } from 'crypto'
import { hostname, tmpdir } from 'os'
import { basename, join, resolve } from 'path'
import { getRemoteSessionUrl } from '../constants/product.js'
import { shutdownDatadog } from '../services/analytics/datadog.js'
import { shutdown1PEventLogging } from '../services/analytics/firstPartyEventLogger.js'
import { checkGate_CACHED_OR_BLOCKING } from '../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
  logEventAsync,
} from '../services/analytics/index.js'
import { isInBundledMode } from '../utils/bundledMode.js'
import { logForDebugging } from '../utils/debug.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { isEnvTruthy, isInProtectedNamespace } from '../utils/envUtils.js'
import { errorMessage } from '../utils/errors.js'
import { truncateToWidth } from '../utils/format.js'
import { logError } from '../utils/log.js'
import { sleep } from '../utils/sleep.js'
import { createAgentWorktree, removeAgentWorktree } from '../utils/worktree.js'
import {
  BridgeFatalError,
  createBridgeApiClient,
  isExpiredErrorType,
  isSuppressible403,
  validateBridgeId,
} from './bridgeApi.js'
import { formatDuration } from './bridgeStatusUtil.js'
import { createBridgeLogger } from './bridgeUI.js'
import { createCapacityWake } from './capacityWake.js'
import { describeAxiosError } from './debugUtils.js'
import { createTokenRefreshScheduler } from './jwtUtils.js'
import { getPollIntervalConfig } from './pollConfig.js'
import { toCompatSessionId, toInfraSessionId } from './sessionIdCompat.js'
import { createSessionSpawner, safeFilenameId } from './sessionRunner.js'
import { getTrustedDeviceToken } from './trustedDevice.js'
import {
  BRIDGE_LOGIN_ERROR,
  type BridgeApiClient,
  type BridgeConfig,
  type BridgeLogger,
  DEFAULT_SESSION_TIMEOUT_MS,
  type SessionDoneStatus,
  type SessionHandle,
  type SessionSpawner,
  type SessionSpawnOpts,
  type SpawnMode,
} from './types.js'
import {
  buildCCRv2SdkUrl,
  buildSdkUrl,
  decodeWorkSecret,
  registerWorker,
  sameSessionId,
} from './workSecret.js'

export type BackoffConfig = {
  connInitialMs: number
  connCapMs: number
  connGiveUpMs: number
  generalInitialMs: number
  generalCapMs: number
  generalGiveUpMs: number
  /** SIGTERM → SIGKILL 宽限期。默认 30 秒。 */
  shutdownGraceMs?: number
  /** stopWorkWithRetry 基础延迟（采用 1s/2s/4s 指数退避）。默认 1000 毫秒。 */
  stopWorkBaseDelayMs?: number
}

const DEFAULT_BACKOFF: BackoffConfig = {
  connInitialMs: 2_000,
  connCapMs: 120_000, // 2 分钟
  connGiveUpMs: 600_000, // 10 分钟
  generalInitialMs: 500,
  generalCapMs: 30_000,
  generalGiveUpMs: 600_000, // 10 分钟
}

/** 状态实时显示的更新间隔（毫秒）。 */
const STATUS_UPDATE_INTERVAL_MS = 1_000
const SPAWN_SESSIONS_DEFAULT = 32

/**
 * 多会话生成模式（--spawn / --capacity / --create-session-in-dir）的 GrowthBook 开关。
 * 与 tengu_ccr_bridge_multi_environment（每个主机:目录对应多个环境）并列 ——
 * 此开关启用每个环境下的多个会话。
 * 通过定向规则分阶段发布：先蚂蚁内部，再逐步对外。
 *
 * 使用阻塞式开关检查，以避免因磁盘缓存失效而不公平地拒绝访问。
 * 快速路径（缓存为 true）仍然瞬间返回；仅冷启动路径需要等待服务端拉取，
 * 同时该拉取也会为下次填充磁盘缓存。
 */
async function isMultiSessionSpawnEnabled(): Promise<boolean> {
  return checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge_multi_session')
}

/**
 * 返回轮询循环中检测系统休眠/唤醒的阈值。
 * 必须超过最大退避上限——否则正常的退避延迟会触发错误的休眠检测（导致无限重置错误预算）。
 * 取连接退避上限的 2 倍，与 WebSocketTransport 和 replBridge 中的模式一致。
 */
function pollSleepDetectionThresholdMs(backoff: BackoffConfig): number {
  return backoff.connCapMs * 2
}

/**
 * 返回生成子 claude 进程时必须在 CLI 标志之前传递的参数。
 * 在编译后的二进制文件中，process.execPath 即为 claude 二进制本身，参数直接传递。
 * 在 npm 安装方式下（node 运行 cli.js），process.execPath 是 node 运行时 ——
 * 子进程生成时必须将脚本路径作为第一个参数，否则 node 会将 --sdk-url 解释为 node 选项
 * 并因 "bad option: --sdk-url" 退出。见 anthropics/claude-code#28334。
 */
function spawnScriptArgs(): string[] {
  if (isInBundledMode() || !process.argv[1]) {
    return []
  }
  return [process.argv[1]]
}

/** 尝试生成会话；若生成抛出异常则返回错误字符串。 */
function safeSpawn(
  spawner: SessionSpawner,
  opts: SessionSpawnOpts,
  dir: string,
): SessionHandle | string {
  try {
    return spawner.spawn(opts, dir)
  } catch (err) {
    const errMsg = errorMessage(err)
    logError(new Error(`会话生成失败: ${errMsg}`))
    return errMsg
  }
}

export async function runBridgeLoop(
  config: BridgeConfig,
  environmentId: string,
  environmentSecret: string,
  api: BridgeApiClient,
  spawner: SessionSpawner,
  logger: BridgeLogger,
  signal: AbortSignal,
  backoffConfig: BackoffConfig = DEFAULT_BACKOFF,
  initialSessionId?: string,
  getAccessToken?: () => string | undefined | Promise<string | undefined>,
): Promise<void> {
  // 本地中止控制器，以便 onSessionDone 可以停止轮询循环。
  // 与传入的 signal 关联，使外部中止同样生效。
  const controller = new AbortController()
  if (signal.aborted) {
    controller.abort()
  } else {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const loopSignal = controller.signal

  const activeSessions = new Map<string, SessionHandle>()
  const sessionStartTimes = new Map<string, number>()
  const sessionWorkIds = new Map<string, string>()
  // 兼容表层 ID（session_*），在生成时计算并缓存，以便清理和状态更新滴答
  // 始终使用相同的 key，无论 tengu_bridge_repl_v2_cse_shim_enabled 开关是否在会话中途翻转。
  const sessionCompatIds = new Map<string, string>()
  // 用于心跳认证的会话入口 JWT，以 sessionId 为键。
  // 与 handle.accessToken 分开存储，因为令牌刷新调度器会在大约 3 小时 55 分后用 OAuth 令牌覆盖该字段。
  const sessionIngressTokens = new Map<string, string>()
  const sessionTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const completedWorkIds = new Set<string>()
  const sessionWorktrees = new Map<
    string,
    {
      worktreePath: string
      worktreeBranch?: string
      gitRoot?: string
      hookBased?: boolean
    }
  >()
  // 跟踪被超时看门狗终止的会话，以便 onSessionDone 能将其与服务端发起的中断或关闭中断区分开。
  const timedOutSessions = new Set<string>()
  // 已有标题的会话（服务端设置或桥接器派生的），防止 onFirstUserMessage 覆盖用户指定的 --name / 网页重命名。
  // 以 compatSessionId 为键，与 logger.setSessionTitle 的键匹配。
  const titledSessions = new Set<string>()
  // 用于在会话完成时提前唤醒容量休眠，使桥接器能立即接受新工作。
  const capacityWake = createCapacityWake(loopSignal)

  /**
   * 对所有活跃工作项发送心跳。
   * 如果至少有一次心跳成功则返回 'ok'；如果任何一次返回 401/403（JWT 过期——通过 reconnectSession 重新入队，
   * 以便下次轮询获取新工作），则返回 'auth_failed'；如果所有心跳均因其他原因失败则返回 'failed'。
   */
  async function heartbeatActiveWorkItems(): Promise<
    'ok' | 'auth_failed' | 'fatal' | 'failed'
  > {
    let anySuccess = false
    let anyFatal = false
    const authFailedSessions: string[] = []
    for (const [sessionId] of activeSessions) {
      const workId = sessionWorkIds.get(sessionId)
      const ingressToken = sessionIngressTokens.get(sessionId)
      if (!workId || !ingressToken) {
        continue
      }
      try {
        await api.heartbeatWork(environmentId, workId, ingressToken)
        anySuccess = true
      } catch (err) {
        logForDebugging(
          `[bridge:heartbeat] sessionId=${sessionId} workId=${workId} 失败: ${errorMessage(err)}`,
        )
        if (err instanceof BridgeFatalError) {
          logEvent('tengu_bridge_heartbeat_error', {
            status:
              err.status as unknown as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            error_type: (err.status === 401 || err.status === 403
              ? 'auth_failed'
              : 'fatal') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          if (err.status === 401 || err.status === 403) {
            authFailedSessions.push(sessionId)
          } else {
            // 404/410 = 环境已过期或删除 —— 重试无意义
            anyFatal = true
          }
        }
      }
    }
    // JWT 过期 → 触发服务端重新分发。否则工作将一直处于已确认状态而无法从 Redis PEL 中移除，
    // 轮询将永远返回空（CC-1263）。下面的 existingHandle 路径会将新令牌传递给子进程。
    // sessionId 已经是 /bridge/reconnect 期望的格式：它来自 work.data.id，与服务端的 EnvironmentInstance 存储匹配
    // （在兼容开关下为 cse_*，否则为 session_*）。
    for (const sessionId of authFailedSessions) {
      logger.logVerbose(
        `会话 ${sessionId} 令牌已过期 — 通过 bridge/reconnect 重新入队`,
      )
      try {
        await api.reconnectSession(environmentId, sessionId)
        logForDebugging(
          `[bridge:heartbeat] 通过 bridge/reconnect 将会话 ${sessionId} 重新入队`,
        )
      } catch (err) {
        logger.logError(
          `刷新会话 ${sessionId} 令牌失败: ${errorMessage(err)}`,
        )
        logForDebugging(
          `[bridge:heartbeat] reconnectSession(${sessionId}) 失败: ${errorMessage(err)}`,
          { level: 'error' },
        )
      }
    }
    if (anyFatal) {
      return 'fatal'
    }
    if (authFailedSessions.length > 0) {
      return 'auth_failed'
    }
    return anySuccess ? 'ok' : 'failed'
  }

  // 使用 CCR v2 环境变量生成的会话。v2 子进程不能使用 OAuth 令牌
  // （CCR 工作节点端点会验证 JWT 的 session_id 声明，register_worker.go:32），
  // 因此 onRefresh 改为触发服务端重新分发 —— 下次轮询将通过 existingHandle 路径交付带有新 JWT 的新工作。
  const v2Sessions = new Set<string>()

  // 主动令牌刷新：在会话入口 JWT 过期前 5 分钟调度定时器。
  // v1 直接向子进程交付 OAuth；v2 调用 reconnectSession 触发服务端重新分发（CC-1263：否则
  // v2 守护进程会话会在约 5 小时后静默死亡，因为服务端不会在租约过期后自动重新分发已确认的工作）。
  const tokenRefresh = getAccessToken
    ? createTokenRefreshScheduler({
        getAccessToken,
        onRefresh: (sessionId, oauthToken) => {
          const handle = activeSessions.get(sessionId)
          if (!handle) {
            return
          }
          if (v2Sessions.has(sessionId)) {
            logger.logVerbose(
              `通过 bridge/reconnect 刷新会话 ${sessionId} 令牌`,
            )
            void api
              .reconnectSession(environmentId, sessionId)
              .catch((err: unknown) => {
                logger.logError(
                  `刷新会话 ${sessionId} 令牌失败: ${errorMessage(err)}`,
                )
                logForDebugging(
                  `[bridge:token] reconnectSession(${sessionId}) 失败: ${errorMessage(err)}`,
                  { level: 'error' },
                )
              })
          } else {
            handle.updateAccessToken(oauthToken)
          }
        },
        label: 'bridge',
      })
    : null
  const loopStartTime = Date.now()
  // 跟踪所有进行中的清理 Promise（stopWork、工作树移除），以便关闭流程能在 process.exit() 前等待它们完成。
  const pendingCleanups = new Set<Promise<unknown>>()
  function trackCleanup(p: Promise<unknown>): void {
    pendingCleanups.add(p)
    void p.finally(() => pendingCleanups.delete(p))
  }
  let connBackoff = 0
  let generalBackoff = 0
  let connErrorStart: number | null = null
  let generalErrorStart: number | null = null
  let lastPollErrorTime: number | null = null
  let statusUpdateTimer: ReturnType<typeof setInterval> | null = null
  // 由 BridgeFatalError 和放弃路径设置，以便关闭代码块可以跳过恢复消息
  //（环境过期/认证失败/持续的连接错误后恢复是不可能的）。
  let fatalExit = false

  logForDebugging(
    `[bridge:work] 开始轮询循环 spawnMode=${config.spawnMode} maxSessions=${config.maxSessions} environmentId=${environmentId}`,
  )
  logForDiagnosticsNoPII('info', 'bridge_loop_started', {
    max_sessions: config.maxSessions,
    spawn_mode: config.spawnMode,
  })

  // 对于蚂蚁用户，展示会话调试日志的落脚点，方便他们 tail。
  // sessionRunner.ts 使用相同的基础路径。会话生成后文件即会出现。
  if (process.env.USER_TYPE === 'ant') {
    let debugGlob: string
    if (config.debugFile) {
      const ext = config.debugFile.lastIndexOf('.')
      debugGlob =
        ext > 0
          ? `${config.debugFile.slice(0, ext)}-*${config.debugFile.slice(ext)}`
          : `${config.debugFile}-*`
    } else {
      debugGlob = join(tmpdir(), 'claude', 'bridge-session-*.log')
    }
    logger.setDebugLogPath(debugGlob)
  }

  logger.printBanner(config, environmentId)

  // 在首次渲染之前将日志记录器的会话计数与生成模式同步。若无此操作，
  // 下面的 setAttached() 渲染时日志记录器默认 sessionMax=1，会显示 "容量: 0/1"，
  // 直到状态滴答器启动（而状态滴答器受 !initialSessionId 控制，仅在轮询循环收到工作后才启动）。
  logger.updateSessionCount(0, config.maxSessions, config.spawnMode)

  // 如果预创建了初始会话，则从一开始就显示其 URL，以便用户能立即点击进入（与 /remote-control 行为一致）。
  if (initialSessionId) {
    logger.setAttached(initialSessionId)
  }

  /** 刷新内联状态显示。根据状态显示空闲或活跃。 */
  function updateStatusDisplay(): void {
    // 推送会话计数（当 maxSessions === 1 时为空操作），以便下一次 renderStatusLine 滴答显示当前计数。
    logger.updateSessionCount(
      activeSessions.size,
      config.maxSessions,
      config.spawnMode,
    )

    // 将每个会话的活动推送到多会话显示中。
    for (const [sid, handle] of activeSessions) {
      const act = handle.currentActivity
      if (act) {
        logger.updateSessionActivity(sessionCompatIds.get(sid) ?? sid, act)
      }
    }

    if (activeSessions.size === 0) {
      logger.updateIdleStatus()
      return
    }

    // 显示最近启动且仍在积极工作的会话。
    // 当前活动为 'result' 或 'error' 的会话处于轮次之间 —— CLI 已输出结果，但进程保持存活等待下一条用户消息。
    // 跳过更新，让状态行保持原有状态（已附加 / 会话标题）。
    const [sessionId, handle] = [...activeSessions.entries()].pop()!
    const startTime = sessionStartTimes.get(sessionId)
    if (!startTime) return

    const activity = handle.currentActivity
    if (!activity || activity.type === 'result' || activity.type === 'error') {
      // 会话处于轮次之间 —— 保持当前状态（已附加/已标题）。
      // 在多会话模式下，仍需刷新以使项目符号列表中的活动保持最新。
      if (config.maxSessions > 1) logger.refreshDisplay()
      return
    }

    const elapsed = formatDuration(Date.now() - startTime)

    // 从最近的工具活动中构建轨迹（最近 5 条）
    const trail = handle.activities
      .filter(a => a.type === 'tool_start')
      .slice(-5)
      .map(a => a.summary)

    logger.updateSessionStatus(sessionId, elapsed, activity, trail)
  }

  /** 启动状态显示更新滴答器。 */
  function startStatusUpdates(): void {
    stopStatusUpdates()
    // 立即调用，使首次转换（例如“连接中” → “就绪”）无延迟发生，避免并发的定时器竞态。
    updateStatusDisplay()
    statusUpdateTimer = setInterval(
      updateStatusDisplay,
      STATUS_UPDATE_INTERVAL_MS,
    )
  }

  /** 停止状态显示更新滴答器。 */
  function stopStatusUpdates(): void {
    if (statusUpdateTimer) {
      clearInterval(statusUpdateTimer)
      statusUpdateTimer = null
    }
  }

  function onSessionDone(
    sessionId: string,
    startTime: number,
    handle: SessionHandle,
  ): (status: SessionDoneStatus) => void {
    return (rawStatus: SessionDoneStatus): void => {
      const workId = sessionWorkIds.get(sessionId)
      activeSessions.delete(sessionId)
      sessionStartTimes.delete(sessionId)
      sessionWorkIds.delete(sessionId)
      sessionIngressTokens.delete(sessionId)
      const compatId = sessionCompatIds.get(sessionId) ?? sessionId
      sessionCompatIds.delete(sessionId)
      logger.removeSession(compatId)
      titledSessions.delete(compatId)
      v2Sessions.delete(sessionId)
      // 清除每个会话的超时定时器
      const timer = sessionTimers.get(sessionId)
      if (timer) {
        clearTimeout(timer)
        sessionTimers.delete(sessionId)
      }
      // 清除令牌刷新定时器
      tokenRefresh?.cancel(sessionId)
      // 唤醒容量休眠，使桥接器能立即接受新工作
      capacityWake.wake()

      // 如果会话是被超时看门狗终止的，将其视为失败会话（而非服务端/关闭中断），
      // 以便下面仍然调用 stopWork 和 archiveSession。
      const wasTimedOut = timedOutSessions.delete(sessionId)
      const status: SessionDoneStatus =
        wasTimedOut && rawStatus === 'interrupted' ? 'failed' : rawStatus
      const durationMs = Date.now() - startTime

      logForDebugging(
        `[bridge:session] sessionId=${sessionId} workId=${workId ?? 'unknown'} 退出 status=${status} 持续 ${formatDuration(durationMs)}`,
      )
      logEvent('tengu_bridge_session_done', {
        status:
          status as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        duration_ms: durationMs,
      })
      logForDiagnosticsNoPII('info', 'bridge_session_done', {
        status,
        duration_ms: durationMs,
      })

      // 在打印最终日志前清除状态显示
      logger.clearStatus()
      stopStatusUpdates()

      // 如果可用，从 stderr 构建错误消息
      const stderrSummary =
        handle.lastStderr.length > 0 ? handle.lastStderr.join('\n') : undefined
      let failureMessage: string | undefined

      switch (status) {
        case 'completed':
          logger.logSessionComplete(sessionId, durationMs)
          break
        case 'failed':
          // 关闭期间跳过失败日志 —— 子进程在被终止时会以非零退出码退出，这是预期行为而非真正的失败。
          // 对于超时终止的会话同样跳过 —— 超时看门狗已经打印了明确的超时消息。
          if (!wasTimedOut && !loopSignal.aborted) {
            failureMessage = stderrSummary ?? '进程因错误退出'
            logger.logSessionFailed(sessionId, failureMessage)
            logError(new Error(`桥接器会话失败: ${failureMessage}`))
          }
          break
        case 'interrupted':
          logger.logVerbose(`会话 ${sessionId} 中断`)
          break
      }

      // 通知服务端该工作项已完成。对于中断的会话跳过 —— 中断要么是服务端发起的（服务端已知晓），
      // 要么是由桥接器关闭引起的（关闭流程会单独调用 stopWork()）。
      if (status !== 'interrupted' && workId) {
        trackCleanup(
          stopWorkWithRetry(
            api,
            environmentId,
            workId,
            logger,
            backoffConfig.stopWorkBaseDelayMs,
          ),
        )
        completedWorkIds.add(workId)
      }

      // 清理为该会话创建的工作树
      const wt = sessionWorktrees.get(sessionId)
      if (wt) {
        sessionWorktrees.delete(sessionId)
        trackCleanup(
          removeAgentWorktree(
            wt.worktreePath,
            wt.worktreeBranch,
            wt.gitRoot,
            wt.hookBased,
          ).catch((err: unknown) =>
            logger.logVerbose(
              `移除工作树 ${wt.worktreePath} 失败: ${errorMessage(err)}`,
            ),
          ),
        )
      }

      // 生命周期决策：在多会话模式下，会话完成后桥接器保持运行。
      // 在单会话模式下，中止轮询循环以便桥接器干净退出。
      if (status !== 'interrupted' && !loopSignal.aborted) {
        if (config.spawnMode !== 'single-session') {
          // 多会话：归档已完成的会话，防止其在 Web UI 中残留为陈旧状态。
          // archiveSession 是幂等的（如果已归档则返回 409），因此在关闭时重复归档是安全的。
          // sessionId 从工作轮询中到达时为 cse_*（基础设施层标签）。
          // archiveSession 调用 /v1/sessions/{id}/archive，这是兼容表层并会验证 TagSession（session_*）。
          // 重新标记 —— 底层 UUID 相同。
          trackCleanup(
            api
              .archiveSession(compatId)
              .catch((err: unknown) =>
                logger.logVerbose(
                  `归档会话 ${sessionId} 失败: ${errorMessage(err)}`,
                ),
              ),
          )
          logForDebugging(
            `[bridge:session] 会话 ${status}，返回空闲状态（多会话模式）`,
          )
        } else {
          // 单会话：耦合的生命周期 —— 拆除环境
          logForDebugging(
            `[bridge:session] 会话 ${status}，中止轮询循环以拆除环境`,
          )
          controller.abort()
          return
        }
      }

      if (!loopSignal.aborted) {
        startStatusUpdates()
      }
    }
  }

  // 立即开始空闲状态显示 —— 除非存在预创建的会话，
  // 此时 setAttached() 已经设置了显示，轮询循环将在获取会话时启动状态更新。
  if (!initialSessionId) {
    startStatusUpdates()
  }

  while (!loopSignal.aborted) {
    // 每次迭代获取一次 —— GrowthBook 缓存每 5 分钟刷新一次，
    // 因此以容量限制速率运行的循环会在一个休眠周期内获取到配置变更。
    const pollConfig = getPollIntervalConfig()

    try {
      const work = await api.pollForWork(
        environmentId,
        environmentSecret,
        loopSignal,
        pollConfig.reclaim_older_than_ms,
      )

      // 如果之前处于断开状态，记录重新连接
      const wasDisconnected =
        connErrorStart !== null || generalErrorStart !== null
      if (wasDisconnected) {
        const disconnectedMs =
          Date.now() - (connErrorStart ?? generalErrorStart ?? Date.now())
        logger.logReconnected(disconnectedMs)
        logForDebugging(
          `[bridge:poll] 经过 ${formatDuration(disconnectedMs)} 后重新连接`,
        )
        logEvent('tengu_bridge_reconnected', {
          disconnected_ms: disconnectedMs,
        })
      }

      connBackoff = 0
      generalBackoff = 0
      connErrorStart = null
      generalErrorStart = null
      lastPollErrorTime = null

      // 空响应 = 队列中无可用工作。
      // 添加最小延迟以避免冲击服务端。
      if (!work) {
        // 使用实时检查（而非快照），因为会话可能在轮询期间结束。
        const atCap = activeSessions.size >= config.maxSessions
        if (atCap) {
          const atCapMs = pollConfig.multisession_poll_interval_ms_at_capacity
          // 心跳循环时不进行轮询。当启用容量限制下的轮询时（atCapMs > 0），循环会跟踪一个截止时间并在该时间到达时跳出以进行轮询
          // —— 心跳与轮询叠加，而非一方抑制另一方。跳出轮询的条件为：
          //   - 到达轮询截止时间（仅当 atCapMs > 0）
          //   - 认证失败（JWT 过期 → 轮询刷新令牌）
          //   - 容量唤醒触发（会话结束 → 轮询新工作）
          //   - 循环中止（关闭）
          if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
            logEvent('tengu_bridge_heartbeat_mode_entered', {
              active_sessions: activeSessions.size,
              heartbeat_interval_ms:
                pollConfig.non_exclusive_heartbeat_interval_ms,
            })
            // 截止时间在入口处计算一次 —— GB 对 atCapMs 的更新不会改变进行中的截止时间（下次入口才会应用新值）。
            const pollDeadline = atCapMs > 0 ? Date.now() + atCapMs : null
            let hbResult: 'ok' | 'auth_failed' | 'fatal' | 'failed' = 'ok'
            let hbCycles = 0
            while (
              !loopSignal.aborted &&
              activeSessions.size >= config.maxSessions &&
              (pollDeadline === null || Date.now() < pollDeadline)
            ) {
              // 每个周期重新读取配置，以便 GrowthBook 更新生效
              const hbConfig = getPollIntervalConfig()
              if (hbConfig.non_exclusive_heartbeat_interval_ms <= 0) break

              // 在异步心跳调用之前捕获容量信号，这样在 HTTP 请求期间结束的会话
              // 能被随后的休眠捕获（而非因替换控制器而丢失）。
              const cap = capacityWake.signal()

              hbResult = await heartbeatActiveWorkItems()
              if (hbResult === 'auth_failed' || hbResult === 'fatal') {
                cap.cleanup()
                break
              }

              hbCycles++
              await sleep(
                hbConfig.non_exclusive_heartbeat_interval_ms,
                cap.signal,
              )
              cap.cleanup()
            }

            // 确定遥测用的退出原因
            const exitReason =
              hbResult === 'auth_failed' || hbResult === 'fatal'
                ? hbResult
                : loopSignal.aborted
                  ? 'shutdown'
                  : activeSessions.size < config.maxSessions
                    ? 'capacity_changed'
                    : pollDeadline !== null && Date.now() >= pollDeadline
                      ? 'poll_due'
                      : 'config_disabled'
            logEvent('tengu_bridge_heartbeat_mode_exited', {
              reason:
                exitReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              heartbeat_cycles: hbCycles,
              active_sessions: activeSessions.size,
            })
            if (exitReason === 'poll_due') {
              // bridgeApi 会限制空轮询日志（EMPTY_POLL_LOG_INTERVAL=100），
              // 因此每 10 分钟一次的 poll_due 轮询在计数器为 2 时是不可见的。
              // 在此处记录，以便验证运行能在调试日志中看到两端点。
              logForDebugging(
                `[bridge:poll] 心跳 poll_due 经过 ${hbCycles} 个周期 — 回落至 pollForWork`,
              )
            }

            // 对于 auth_failed 或 fatal，在轮询前休眠以避免紧致的轮询+心跳循环。
            // auth_failed: heartbeatActiveWorkItems 已经调用了 reconnectSession —— 休眠给服务端时间传播重新入队。
            // fatal (404/410): 可能是单个工作项被 GC 而环境仍有效。
            // 如果 atCapMs 启用则使用它，否则使用心跳间隔作为下限（此处保证 >0），使仅心跳配置不会紧致循环。
            if (hbResult === 'auth_failed' || hbResult === 'fatal') {
              const cap = capacityWake.signal()
              await sleep(
                atCapMs > 0
                  ? atCapMs
                  : pollConfig.non_exclusive_heartbeat_interval_ms,
                cap.signal,
              )
              cap.cleanup()
            }
          } else if (atCapMs > 0) {
            // 心跳禁用：慢速轮询作为活跃信号。
            const cap = capacityWake.signal()
            await sleep(atCapMs, cap.signal)
            cap.cleanup()
          }
        } else {
          const interval =
            activeSessions.size > 0
              ? pollConfig.multisession_poll_interval_ms_partial_capacity
              : pollConfig.multisession_poll_interval_ms_not_at_capacity
          await sleep(interval, loopSignal)
        }
        continue
      }

      // 已达容量 —— 我们轮询是为了维持心跳，但此刻无法接受新工作。
      // 我们仍会进入下方的 switch 语句，以便处理已有会话的令牌刷新
      //（'session' 分支的处理程序会在内部容量守卫之前检查已有会话）。
      const atCapacityBeforeSwitch = activeSessions.size >= config.maxSessions

      // 跳过已完成并已停止的工作项。
      // 服务端可能在处理我们的停止请求前重新投递陈旧工作，否则会导致重复生成会话。
      if (completedWorkIds.has(work.id)) {
        logForDebugging(
          `[bridge:work] 跳过已完成的 workId=${work.id}`,
        )
        // 尊重容量节流 —— 如果没有此处的休眠，持续的陈旧重新投递会以轮询请求速度紧致循环
        //（只有 !work 分支才有休眠，而 work != null 跳过了它）。
        if (atCapacityBeforeSwitch) {
          const cap = capacityWake.signal()
          if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
            await heartbeatActiveWorkItems()
            await sleep(
              pollConfig.non_exclusive_heartbeat_interval_ms,
              cap.signal,
            )
          } else if (pollConfig.multisession_poll_interval_ms_at_capacity > 0) {
            await sleep(
              pollConfig.multisession_poll_interval_ms_at_capacity,
              cap.signal,
            )
          }
          cap.cleanup()
        } else {
          await sleep(1000, loopSignal)
        }
        continue
      }

      // 解码工作密钥用于会话生成，并提取用于下方确认调用的 JWT。
      let secret
      try {
        secret = decodeWorkSecret(work.secret)
      } catch (err) {
        const errMsg = errorMessage(err)
        logger.logError(
          `解码 workId=${work.id} 的工作密钥失败: ${errMsg}`,
        )
        logEvent('tengu_bridge_work_secret_failed', {})
        // 无法确认（需要解码失败的 JWT）。stopWork 使用 OAuth，因此此处可调用 —— 防止
        // XAUTOCLAIM 在每个 reclaim_older_than_ms 周期重新投递此中毒项。
        completedWorkIds.add(work.id)
        trackCleanup(
          stopWorkWithRetry(
            api,
            environmentId,
            work.id,
            logger,
            backoffConfig.stopWorkBaseDelayMs,
          ),
        )
        // 在重试前尊重容量节流 —— 如果没有此处的休眠，
        // 在容量已满时重复的解码失败会以轮询请求速度紧致循环（work != null 跳过了上面的 !work 休眠）。
        if (atCapacityBeforeSwitch) {
          const cap = capacityWake.signal()
          if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
            await heartbeatActiveWorkItems()
            await sleep(
              pollConfig.non_exclusive_heartbeat_interval_ms,
              cap.signal,
            )
          } else if (pollConfig.multisession_poll_interval_ms_at_capacity > 0) {
            await sleep(
              pollConfig.multisession_poll_interval_ms_at_capacity,
              cap.signal,
            )
          }
          cap.cleanup()
        }
        continue
      }

      // 在承诺处理工作后显式确认 —— 而不是之前。
      // case 'session' 内部的容量守卫可能在不生成会话的情况下跳出；若在此处确认则工作将永久丢失。
      // 确认失败不是致命的：服务端会重新投递，existingHandle / completedWorkIds 路径处理去重。
      const ackWork = async (): Promise<void> => {
        logForDebugging(`[bridge:work] 确认 workId=${work.id}`)
        try {
          await api.acknowledgeWork(
            environmentId,
            work.id,
            secret.session_ingress_token,
          )
        } catch (err) {
          logForDebugging(
            `[bridge:work] 确认 workId=${work.id} 失败: ${errorMessage(err)}`,
          )
        }
      }

      const workType: string = work.data.type
      switch (work.data.type) {
        case 'healthcheck':
          await ackWork()
          logForDebugging('[bridge:work] 收到健康检查')
          logger.logVerbose('收到健康检查')
          break
        case 'session': {
          const sessionId = work.data.id
          try {
            validateBridgeId(sessionId, 'session_id')
          } catch {
            await ackWork()
            logger.logError(`收到无效的 session_id: ${sessionId}`)
            break
          }

          // 如果会话已在运行，传递新令牌，以便子进程能用新的会话入口令牌重新连接其 WebSocket。
          // 这处理了服务端在 WebSocket 断开后为已有会话重新分发工作的情况。
          const existingHandle = activeSessions.get(sessionId)
          if (existingHandle) {
            existingHandle.updateAccessToken(secret.session_ingress_token)
            sessionIngressTokens.set(sessionId, secret.session_ingress_token)
            sessionWorkIds.set(sessionId, work.id)
            // 根据新 JWT 的过期时间重新调度下一次刷新。onRefresh 在 v2Sessions 上有分支，因此 v1 和 v2 均安全。
            tokenRefresh?.schedule(sessionId, secret.session_ingress_token)
            logForDebugging(
              `[bridge:work] 为现有会话 ${sessionId} 更新访问令牌 workId=${work.id}`,
            )
            await ackWork()
            break
          }

          // 已达容量 —— 上面已处理了已有会话的令牌刷新，但无法生成新会话。
          // switch 后的容量休眠将节流循环；此处仅跳出。
          if (activeSessions.size >= config.maxSessions) {
            logForDebugging(
              `[bridge:work] 已达容量 (${activeSessions.size}/${config.maxSessions})，无法为 workId=${work.id} 生成新会话`,
            )
            break
          }

          await ackWork()
          const spawnStartTime = Date.now()

          // CCR v2 路径：将此桥接器注册为会话工作节点，获取 epoch，并将子进程指向 /v1/code/sessions/{id}。
          // 子进程已具有完整的 v2 客户端（SSETransport + CCRClient）—— 与环境管理器在容器中启动的代码路径相同。
          //
          // v1 路径：Session-Ingress WebSocket。使用 config.sessionIngressUrl
          //（而非 secret.api_base_url，后者可能指向不知晓本地创建会话的远程代理隧道）。
          let sdkUrl: string
          let useCcrV2 = false
          let workerEpoch: number | undefined
          // 服务端通过工作密钥按会话决定；环境变量是蚂蚁开发覆盖项（例如在服务端标志开启前强制使用 v2）。
          if (
            secret.use_code_sessions === true ||
            isEnvTruthy(process.env.CLAUDE_BRIDGE_USE_CCR_V2)
          ) {
            sdkUrl = buildCCRv2SdkUrl(config.apiBaseUrl, sessionId)
            // 在永久放弃并终止会话之前，对临时故障（网络抖动、500）重试一次。
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                workerEpoch = await registerWorker(
                  sdkUrl,
                  secret.session_ingress_token,
                )
                useCcrV2 = true
                logForDebugging(
                  `[bridge:session] CCR v2: 已注册工作节点 sessionId=${sessionId} epoch=${workerEpoch} attempt=${attempt}`,
                )
                break
              } catch (err) {
                const errMsg = errorMessage(err)
                if (attempt < 2) {
                  logForDebugging(
                    `[bridge:session] CCR v2: registerWorker 尝试 ${attempt} 失败，重试: ${errMsg}`,
                  )
                  await sleep(2_000, loopSignal)
                  if (loopSignal.aborted) break
                  continue
                }
                logger.logError(
                  `CCR v2 工作节点注册失败，会话 ${sessionId}: ${errMsg}`,
                )
                logError(new Error(`registerWorker 失败: ${errMsg}`))
                completedWorkIds.add(work.id)
                trackCleanup(
                  stopWorkWithRetry(
                    api,
                    environmentId,
                    work.id,
                    logger,
                    backoffConfig.stopWorkBaseDelayMs,
                  ),
                )
              }
            }
            if (!useCcrV2) break
          } else {
            sdkUrl = buildSdkUrl(config.sessionIngressUrl, sessionId)
          }

          // 在工作树模式下，按需会话获得隔离的 git 工作树，以便并发会话不相互干扰文件更改。
          // 预创建的初始会话（如果有）运行在 config.dir 中，使用户的第一个会话落在他们调用 `rc` 的目录中
          // —— 与旧的单会话 UX 匹配。
          // 在相同目录和单会话模式下，所有会话共享 config.dir。
          // 在下方的 await 之前捕获 spawnMode —— `w` 键处理程序会直接修改 config.spawnMode，
          // 而 createAgentWorktree 可能耗时 1-2 秒，因此等待后再读取 config.spawnMode 可能产生矛盾的遥测数据
          //（spawn_mode:'same-dir', in_worktree:true）。
          const spawnModeAtDecision = config.spawnMode
          let sessionDir = config.dir
          let worktreeCreateMs = 0
          if (
            spawnModeAtDecision === 'worktree' &&
            (initialSessionId === undefined ||
              !sameSessionId(sessionId, initialSessionId))
          ) {
            const wtStart = Date.now()
            try {
              const wt = await createAgentWorktree(
                `bridge-${safeFilenameId(sessionId)}`,
              )
              worktreeCreateMs = Date.now() - wtStart
              sessionWorktrees.set(sessionId, {
                worktreePath: wt.worktreePath,
                worktreeBranch: wt.worktreeBranch,
                gitRoot: wt.gitRoot,
                hookBased: wt.hookBased,
              })
              sessionDir = wt.worktreePath
              logForDebugging(
                `[bridge:session] 为 sessionId=${sessionId} 创建工作树于 ${wt.worktreePath}`,
              )
            } catch (err) {
              const errMsg = errorMessage(err)
              logger.logError(
                `为会话 ${sessionId} 创建工作树失败: ${errMsg}`,
              )
              logError(new Error(`工作树创建失败: ${errMsg}`))
              completedWorkIds.add(work.id)
              trackCleanup(
                stopWorkWithRetry(
                  api,
                  environmentId,
                  work.id,
                  logger,
                  backoffConfig.stopWorkBaseDelayMs,
                ),
              )
              break
            }
          }

          logForDebugging(
            `[bridge:session] 生成 sessionId=${sessionId} sdkUrl=${sdkUrl}`,
          )

          // 用于日志记录器/Sessions-API 调用的兼容表层 session_* 形式。
          // 工作轮询在 v2 兼容下返回 cse_*；在生成前转换，以便 onFirstUserMessage 回调能闭包捕获它。
          const compatSessionId = toCompatSessionId(sessionId)

          const spawnResult = safeSpawn(
            spawner,
            {
              sessionId,
              sdkUrl,
              accessToken: secret.session_ingress_token,
              useCcrV2,
              workerEpoch,
              onFirstUserMessage: text => {
                // 服务端设置的标题（--name、网页重命名）优先。fetchSessionTitle 并发运行；
                // 如果它已经填充了 titledSessions，则跳过。如果尚未解析，派生的标题将生效 ——
                // 可以接受，因为生成时服务端尚无标题。
                if (titledSessions.has(compatSessionId)) return
                titledSessions.add(compatSessionId)
                const title = deriveSessionTitle(text)
                logger.setSessionTitle(compatSessionId, title)
                logForDebugging(
                  `[bridge:title] 为 ${compatSessionId} 派生标题: ${title}`,
                )
                void import('./createSession.js')
                  .then(({ updateBridgeSessionTitle }) =>
                    updateBridgeSessionTitle(compatSessionId, title, {
                      baseUrl: config.apiBaseUrl,
                    }),
                  )
                  .catch(err =>
                    logForDebugging(
                      `[bridge:title] 为 ${compatSessionId} 更新标题失败: ${err}`,
                      { level: 'error' },
                    ),
                  )
              },
            },
            sessionDir,
          )
          if (typeof spawnResult === 'string') {
            logger.logError(
              `生成会话 ${sessionId} 失败: ${spawnResult}`,
            )
            // 清理为该会话创建的工作树
            const wt = sessionWorktrees.get(sessionId)
            if (wt) {
              sessionWorktrees.delete(sessionId)
              trackCleanup(
                removeAgentWorktree(
                  wt.worktreePath,
                  wt.worktreeBranch,
                  wt.gitRoot,
                  wt.hookBased,
                ).catch((err: unknown) =>
                  logger.logVerbose(
                    `移除工作树失败 ${wt.worktreePath}: ${errorMessage(err)}`,
                  ),
                ),
              )
            }
            completedWorkIds.add(work.id)
            trackCleanup(
              stopWorkWithRetry(
                api,
                environmentId,
                work.id,
                logger,
                backoffConfig.stopWorkBaseDelayMs,
              ),
            )
            break
          }
          const handle = spawnResult

          const spawnDurationMs = Date.now() - spawnStartTime
          logEvent('tengu_bridge_session_started', {
            active_sessions: activeSessions.size,
            spawn_mode:
              spawnModeAtDecision as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            in_worktree: sessionWorktrees.has(sessionId),
            spawn_duration_ms: spawnDurationMs,
            worktree_create_ms: worktreeCreateMs,
            inProtectedNamespace: isInProtectedNamespace(),
          })
          logForDiagnosticsNoPII('info', 'bridge_session_started', {
            spawn_mode: spawnModeAtDecision,
            in_worktree: sessionWorktrees.has(sessionId),
            spawn_duration_ms: spawnDurationMs,
            worktree_create_ms: worktreeCreateMs,
          })

          activeSessions.set(sessionId, handle)
          sessionWorkIds.set(sessionId, work.id)
          sessionIngressTokens.set(sessionId, secret.session_ingress_token)
          sessionCompatIds.set(sessionId, compatSessionId)

          const startTime = Date.now()
          sessionStartTimes.set(sessionId, startTime)

          // 使用通用提示描述，因为我们不再获得 startup_context
          logger.logSessionStart(sessionId, `会话 ${sessionId}`)

          // 计算实际的调试文件路径（镜像 sessionRunner.ts 的逻辑）
          const safeId = safeFilenameId(sessionId)
          let sessionDebugFile: string | undefined
          if (config.debugFile) {
            const ext = config.debugFile.lastIndexOf('.')
            if (ext > 0) {
              sessionDebugFile = `${config.debugFile.slice(0, ext)}-${safeId}${config.debugFile.slice(ext)}`
            } else {
              sessionDebugFile = `${config.debugFile}-${safeId}`
            }
          } else if (config.verbose || process.env.USER_TYPE === 'ant') {
            sessionDebugFile = join(
              tmpdir(),
              'claude',
              `bridge-session-${safeId}.log`,
            )
          }

          if (sessionDebugFile) {
            logger.logVerbose(`调试日志: ${sessionDebugFile}`)
          }

          // 在启动状态更新前将会话注册到 sessions Map，以便首次渲染滴答显示正确的计数和同步的项目符号列表。
          logger.addSession(
            compatSessionId,
            getRemoteSessionUrl(compatSessionId, config.sessionIngressUrl),
          )

          // 启动实时状态更新并转换到“已附加”状态。
          startStatusUpdates()
          logger.setAttached(compatSessionId)

          // 一次性标题获取。如果会话已有标题（通过 --name、网页重命名或 /remote-control 设置），
          // 则显示并标记为已标题，以免首次用户消息回退覆盖它。
          // 否则 onFirstUserMessage 从第一条提示派生标题。
          void fetchSessionTitle(compatSessionId, config.apiBaseUrl)
            .then(title => {
              if (title && activeSessions.has(sessionId)) {
                titledSessions.add(compatSessionId)
                logger.setSessionTitle(compatSessionId, title)
                logForDebugging(
                  `[bridge:title] 服务端标题 ${compatSessionId}: ${title}`,
                )
              }
            })
            .catch(err =>
              logForDebugging(
                `[bridge:title] 获取 ${compatSessionId} 标题失败: ${err}`,
                { level: 'error' },
              ),
            )

          // 启动每个会话的超时看门狗
          const timeoutMs =
            config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
          if (timeoutMs > 0) {
            const timer = setTimeout(
              onSessionTimeout,
              timeoutMs,
              sessionId,
              timeoutMs,
              logger,
              timedOutSessions,
              handle,
            )
            sessionTimers.set(sessionId, timer)
          }

          // 在 JWT 过期前调度主动令牌刷新。
          // onRefresh 在 v2Sessions 上分支：v1 向子进程交付 OAuth，v2 通过 reconnectSession 触发服务端重新分发。
          if (useCcrV2) {
            v2Sessions.add(sessionId)
          }
          tokenRefresh?.schedule(sessionId, secret.session_ingress_token)

          void handle.done.then(onSessionDone(sessionId, startTime, handle))
          break
        }
        default:
          await ackWork()
          // 优雅地忽略未知工作类型。后端可能在桥接器客户端更新之前发送新类型。
          logForDebugging(
            `[bridge:work] 未知工作类型: ${workType}，跳过`,
          )
          break
      }

      // 当容量已满时，对循环进行节流。上面的 switch 仍会运行以便处理已有会话的令牌刷新，
      // 但我们在此处休眠以避免忙循环。包含容量唤醒信号，以便会话完成时能立即中断休眠。
      if (atCapacityBeforeSwitch) {
        const cap = capacityWake.signal()
        if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
          await heartbeatActiveWorkItems()
          await sleep(
            pollConfig.non_exclusive_heartbeat_interval_ms,
            cap.signal,
          )
        } else if (pollConfig.multisession_poll_interval_ms_at_capacity > 0) {
          await sleep(
            pollConfig.multisession_poll_interval_ms_at_capacity,
            cap.signal,
          )
        }
        cap.cleanup()
      }
    } catch (err) {
      if (loopSignal.aborted) {
        break
      }

      // 致命错误 (401/403) —— 重试无意义，认证不会自行修复
      if (err instanceof BridgeFatalError) {
        fatalExit = true
        // 服务端强制过期给出干净的状态消息，而非错误
        if (isExpiredErrorType(err.errorType)) {
          logger.logStatus(err.message)
        } else if (isSuppressible403(err)) {
          // 装饰性 403 错误（例如 external_poll_sessions 作用域、environments:manage 权限）—— 不向用户展示
          logForDebugging(`[bridge:work] 抑制 403 错误: ${err.message}`)
        } else {
          logger.logError(err.message)
          logError(err)
        }
        logEvent('tengu_bridge_fatal_error', {
          status: err.status,
          error_type:
            err.errorType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        logForDiagnosticsNoPII(
          isExpiredErrorType(err.errorType) ? 'info' : 'error',
          'bridge_fatal_error',
          { status: err.status, error_type: err.errorType },
        )
        break
      }

      const errMsg = describeAxiosError(err)

      if (isConnectionError(err) || isServerError(err)) {
        const now = Date.now()

        // 检测系统休眠/唤醒：如果自上次轮询错误以来的间隔远大于预期的退避，则机器可能休眠了。
        // 重置错误跟踪，以便桥接器以全新预算重试。
        if (
          lastPollErrorTime !== null &&
          now - lastPollErrorTime > pollSleepDetectionThresholdMs(backoffConfig)
        ) {
          logForDebugging(
            `[bridge:work] 检测到系统休眠 (间隔 ${Math.round((now - lastPollErrorTime) / 1000)} 秒)，重置错误预算`,
          )
          logForDiagnosticsNoPII('info', 'bridge_poll_sleep_detected', {
            gapMs: now - lastPollErrorTime,
          })
          connErrorStart = null
          connBackoff = 0
          generalErrorStart = null
          generalBackoff = 0
        }
        lastPollErrorTime = now

        if (!connErrorStart) {
          connErrorStart = now
        }
        const elapsed = now - connErrorStart
        if (elapsed >= backoffConfig.connGiveUpMs) {
          logger.logError(
            `服务端无法访问已达 ${Math.round(elapsed / 60_000)} 分钟，放弃。`,
          )
          logEvent('tengu_bridge_poll_give_up', {
            error_type:
              'connection' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            elapsed_ms: elapsed,
          })
          logForDiagnosticsNoPII('error', 'bridge_poll_give_up', {
            error_type: 'connection',
            elapsed_ms: elapsed,
          })
          fatalExit = true
          break
        }

        // 切换错误类型时重置另一条跟踪线
        generalErrorStart = null
        generalBackoff = 0

        connBackoff = connBackoff
          ? Math.min(connBackoff * 2, backoffConfig.connCapMs)
          : backoffConfig.connInitialMs
        const delay = addJitter(connBackoff)
        logger.logVerbose(
          `连接错误，${formatDelay(delay)} 后重试 (已过 ${Math.round(elapsed / 1000)} 秒): ${errMsg}`,
        )
        logger.updateReconnectingStatus(
          formatDelay(delay),
          formatDuration(elapsed),
        )
        // poll_due 心跳循环退出使健康的租约暴露于此退避路径。
        // 在每次休眠前发送心跳，以便 /poll 中断（引入 VerifyEnvironmentSecretAuth DB 路径的心跳正是为了避免这种情况）
        // 不会导致 300 秒的租约 TTL 被耗尽。当 activeSessions 为空或心跳禁用时为空操作。
        if (getPollIntervalConfig().non_exclusive_heartbeat_interval_ms > 0) {
          await heartbeatActiveWorkItems()
        }
        await sleep(delay, loopSignal)
      } else {
        const now = Date.now()

        // 针对一般错误的休眠检测（与连接错误逻辑相同）
        if (
          lastPollErrorTime !== null &&
          now - lastPollErrorTime > pollSleepDetectionThresholdMs(backoffConfig)
        ) {
          logForDebugging(
            `[bridge:work] 检测到系统休眠 (间隔 ${Math.round((now - lastPollErrorTime) / 1000)} 秒)，重置错误预算`,
          )
          logForDiagnosticsNoPII('info', 'bridge_poll_sleep_detected', {
            gapMs: now - lastPollErrorTime,
          })
          connErrorStart = null
          connBackoff = 0
          generalErrorStart = null
          generalBackoff = 0
        }
        lastPollErrorTime = now

        if (!generalErrorStart) {
          generalErrorStart = now
        }
        const elapsed = now - generalErrorStart
        if (elapsed >= backoffConfig.generalGiveUpMs) {
          logger.logError(
            `持续错误已达 ${Math.round(elapsed / 60_000)} 分钟，放弃。`,
          )
          logEvent('tengu_bridge_poll_give_up', {
            error_type:
              'general' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            elapsed_ms: elapsed,
          })
          logForDiagnosticsNoPII('error', 'bridge_poll_give_up', {
            error_type: 'general',
            elapsed_ms: elapsed,
          })
          fatalExit = true
          break
        }

        // 切换错误类型时重置另一条跟踪线
        connErrorStart = null
        connBackoff = 0

        generalBackoff = generalBackoff
          ? Math.min(generalBackoff * 2, backoffConfig.generalCapMs)
          : backoffConfig.generalInitialMs
        const delay = addJitter(generalBackoff)
        logger.logVerbose(
          `轮询失败，${formatDelay(delay)} 后重试 (已过 ${Math.round(elapsed / 1000)} 秒): ${errMsg}`,
        )
        logger.updateReconnectingStatus(
          formatDelay(delay),
          formatDuration(elapsed),
        )
        if (getPollIntervalConfig().non_exclusive_heartbeat_interval_ms > 0) {
          await heartbeatActiveWorkItems()
        }
        await sleep(delay, loopSignal)
      }
    }
  }

  // 清理
  stopStatusUpdates()
  logger.clearStatus()

  const loopDurationMs = Date.now() - loopStartTime
  logEvent('tengu_bridge_shutdown', {
    active_sessions: activeSessions.size,
    loop_duration_ms: loopDurationMs,
  })
  logForDiagnosticsNoPII('info', 'bridge_shutdown', {
    active_sessions: activeSessions.size,
    loop_duration_ms: loopDurationMs,
  })

  // 优雅关闭：终止活跃会话，将它们报告为中断，归档会话，然后注销环境，
  // 使 Web UI 显示桥接器已离线。

  // 收集退出时需要归档的所有会话 ID。包括：
  // 1. 活跃会话（在终止前快照 —— onSessionDone 会清理映射）
  // 2. 初始自动创建的会话（可能从未有过工作分发）
  // api.archiveSession 是幂等的（已归档则返回 409），因此重复归档是安全的。
  const sessionsToArchive = new Set(activeSessions.keys())
  if (initialSessionId) {
    sessionsToArchive.add(initialSessionId)
  }
  // 在终止前快照 —— onSessionDone 会清理 sessionCompatIds。
  const compatIdSnapshot = new Map(sessionCompatIds)

  if (activeSessions.size > 0) {
    logForDebugging(
      `[bridge:shutdown] 正在关闭 ${activeSessions.size} 个活跃会话`,
    )
    logger.logStatus(
      `正在关闭 ${activeSessions.size} 个活跃会话…`,
    )

    // 在终止前快照工作 ID —— onSessionDone 会在每个子进程退出时清理映射，
    // 因此我们需要一份副本用于下面的 stopWork 调用。
    const shutdownWorkIds = new Map(sessionWorkIds)

    for (const [sessionId, handle] of activeSessions.entries()) {
      logForDebugging(
        `[bridge:shutdown] 向 sessionId=${sessionId} 发送 SIGTERM`,
      )
      handle.kill()
    }

    const timeout = new AbortController()
    await Promise.race([
      Promise.allSettled([...activeSessions.values()].map(h => h.done)),
      sleep(backoffConfig.shutdownGraceMs ?? 30_000, timeout.signal),
    ])
    timeout.abort()

    // 对在宽限期内未响应 SIGTERM 的进程发送 SIGKILL
    for (const [sid, handle] of activeSessions.entries()) {
      logForDebugging(`[bridge:shutdown] 强制终止卡住的会话 sessionId=${sid}`)
      handle.forceKill()
    }

    // 清除所有残留的会话超时和刷新定时器
    for (const timer of sessionTimers.values()) {
      clearTimeout(timer)
    }
    sessionTimers.clear()
    tokenRefresh?.cancelAll()

    // 清理活跃会话中残留的工作树。
    // 先快照并清空映射，以便 onSessionDone（可能在下方等待 handle.done 解析时触发）
    // 不会尝试再次移除相同的工作树。
    if (sessionWorktrees.size > 0) {
      const remainingWorktrees = [...sessionWorktrees.values()]
      sessionWorktrees.clear()
      logForDebugging(
        `[bridge:shutdown] 正在清理 ${remainingWorktrees.length} 个工作树`,
      )
      await Promise.allSettled(
        remainingWorktrees.map(wt =>
          removeAgentWorktree(
            wt.worktreePath,
            wt.worktreeBranch,
            wt.gitRoot,
            wt.hookBased,
          ),
        ),
      )
    }

    // 停止所有活跃工作项，使服务端知晓它们已完成
    await Promise.allSettled(
      [...shutdownWorkIds.entries()].map(([sessionId, workId]) => {
        return api
          .stopWork(environmentId, workId, true)
          .catch(err =>
            logger.logVerbose(
              `停止工作 ${workId}（会话 ${sessionId}）失败: ${errorMessage(err)}`,
            ),
          )
      }),
    )
  }

  // 确保所有来自 onSessionDone 的进行中清理（stopWork、工作树移除）在注销前完成 ——
  // 否则 process.exit() 可能在中途终止它们。
  if (pendingCleanups.size > 0) {
    await Promise.allSettled([...pendingCleanups])
  }

  // 在单会话模式下，如果存在已知会话，保留会话和环境，以便 `claude remote-control --session-id=<id>` 可以恢复。
  // 后端通过 4 小时 TTL 对陈旧环境进行 GC（BRIDGE_LAST_POLL_TTL）。
  // 归档会话或注销环境会使打印的恢复命令成为谎言 —— 注销会删除 Firestore + Redis 流。
  // 如果循环因致命原因退出（环境过期、认证失败、放弃），则跳过 —— 此时恢复不可能，消息会与已打印的错误相矛盾。
  // feature('KAIROS') 开关：--session-id 仅限蚂蚁内部；没有开关时回退到 PR 之前的行为（每次关闭都归档+注销）。
  if (
    feature('KAIROS') &&
    config.spawnMode === 'single-session' &&
    initialSessionId &&
    !fatalExit
  ) {
    logger.logStatus(
      `通过运行 \`claude remote-control --continue\` 恢复此会话`,
    )
    logForDebugging(
      `[bridge:shutdown] 跳过归档+注销以允许恢复会话 ${initialSessionId}`,
    )
    return
  }

  // 归档所有已知会话，防止桥接器离线后它们在服务端上残留为“空闲”或“运行中”状态。
  if (sessionsToArchive.size > 0) {
    logForDebugging(
      `[bridge:shutdown] 正在归档 ${sessionsToArchive.size} 个会话`,
    )
    await Promise.allSettled(
      [...sessionsToArchive].map(sessionId =>
        api
          .archiveSession(
            compatIdSnapshot.get(sessionId) ?? toCompatSessionId(sessionId),
          )
          .catch(err =>
            logger.logVerbose(
              `归档会话失败 ${sessionId}: ${errorMessage(err)}`,
            ),
          ),
      ),
    )
  }

  // 注销环境，使 Web UI 显示桥接器已离线，并清理 Redis 流。
  try {
    await api.deregisterEnvironment(environmentId)
    logForDebugging(
      `[bridge:shutdown] 环境已注销，桥接器离线`,
    )
    logger.logVerbose('环境已注销。')
  } catch (err) {
    logger.logVerbose(`注销环境失败: ${errorMessage(err)}`)
  }

  // 清除崩溃恢复指针 —— 环境已不存在，指针将变得陈旧。
  // 上面的提前返回（可恢复的 SIGINT 关闭）跳过了此步骤，将指针作为打印的 --session-id 提示的后备保留。
  const { clearBridgePointer } = await import('./bridgePointer.js')
  await clearBridgePointer(config.dir)

  logger.logVerbose('环境离线。')
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
])

export function isConnectionError(err: unknown): boolean {
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof err.code === 'string' &&
    CONNECTION_ERROR_CODES.has(err.code)
  ) {
    return true
  }
  return false
}

/** 检测来自 axios 的 HTTP 5xx 错误（code: 'ERR_BAD_RESPONSE'）。 */
export function isServerError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof err.code === 'string' &&
    err.code === 'ERR_BAD_RESPONSE'
  )
}

/** 为延迟值添加 ±25% 的抖动。 */
function addJitter(ms: number): number {
  return Math.max(0, ms + ms * 0.25 * (2 * Math.random() - 1))
}

function formatDelay(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}秒` : `${Math.round(ms)}毫秒`
}

/**
 * 使用指数退避重试 stopWork（3 次尝试，1s/2s/4s）。
 * 确保服务端知晓工作项已结束，防止服务端产生僵尸进程。
 */
async function stopWorkWithRetry(
  api: BridgeApiClient,
  environmentId: string,
  workId: string,
  logger: BridgeLogger,
  baseDelayMs = 1000,
): Promise<void> {
  const MAX_ATTEMPTS = 3

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await api.stopWork(environmentId, workId, false)
      logForDebugging(
        `[bridge:work] stopWork 对 workId=${workId} 成功，第 ${attempt}/${MAX_ATTEMPTS} 次尝试`,
      )
      return
    } catch (err) {
      // 认证/权限错误重试无法修复
      if (err instanceof BridgeFatalError) {
        if (isSuppressible403(err)) {
          logForDebugging(
            `[bridge:work] 抑制 stopWork 403 错误 workId=${workId}: ${err.message}`,
          )
        } else {
          logger.logError(`停止工作 ${workId} 失败: ${err.message}`)
        }
        logForDiagnosticsNoPII('error', 'bridge_stop_work_failed', {
          attempts: attempt,
          fatal: true,
        })
        return
      }
      const errMsg = errorMessage(err)
      if (attempt < MAX_ATTEMPTS) {
        const delay = addJitter(baseDelayMs * Math.pow(2, attempt - 1))
        logger.logVerbose(
          `停止工作 ${workId} 失败 (第 ${attempt}/${MAX_ATTEMPTS} 次尝试)，${formatDelay(delay)} 后重试: ${errMsg}`,
        )
        await sleep(delay)
      } else {
        logger.logError(
          `在 ${MAX_ATTEMPTS} 次尝试后停止工作 ${workId} 失败: ${errMsg}`,
        )
        logForDiagnosticsNoPII('error', 'bridge_stop_work_failed', {
          attempts: MAX_ATTEMPTS,
        })
      }
    }
  }
}

function onSessionTimeout(
  sessionId: string,
  timeoutMs: number,
  logger: BridgeLogger,
  timedOutSessions: Set<string>,
  handle: SessionHandle,
): void {
  logForDebugging(
    `[bridge:session] sessionId=${sessionId} 在 ${formatDuration(timeoutMs)} 后超时`,
  )
  logEvent('tengu_bridge_session_timeout', {
    timeout_ms: timeoutMs,
  })
  logger.logSessionFailed(
    sessionId,
    `会话在 ${formatDuration(timeoutMs)} 后超时`,
  )
  timedOutSessions.add(sessionId)
  handle.kill()
}

export type ParsedArgs = {
  verbose: boolean
  sandbox: boolean
  debugFile?: string
  sessionTimeoutMs?: number
  permissionMode?: string
  name?: string
  /** 传递给 --spawn 的值（如果有）；若未提供 --spawn 标志则为 undefined。 */
  spawnMode: SpawnMode | undefined
  /** 传递给 --capacity 的值（如果有）；若未提供 --capacity 标志则为 undefined。 */
  capacity: number | undefined
  /** --[no-]create-session-in-dir 覆盖；undefined = 使用默认值（开启）。 */
  createSessionInDir: boolean | undefined
  /** 恢复已有会话而非创建新会话。 */
  sessionId?: string
  /** 恢复此目录中的最后一次会话（读取 bridge-pointer.json）。 */
  continueSession: boolean
  help: boolean
  error?: string
}

const SPAWN_FLAG_VALUES = ['session', 'same-dir', 'worktree'] as const

function parseSpawnValue(raw: string | undefined): SpawnMode | string {
  if (raw === 'session') return 'single-session'
  if (raw === 'same-dir') return 'same-dir'
  if (raw === 'worktree') return 'worktree'
  return `--spawn 需要以下之一: ${SPAWN_FLAG_VALUES.join(', ')} (得到: ${raw ?? '<缺失>'})`
}

function parseCapacityValue(raw: string | undefined): number | string {
  const n = raw === undefined ? NaN : parseInt(raw, 10)
  if (isNaN(n) || n < 1) {
    return `--capacity 需要一个正整数 (得到: ${raw ?? '<缺失>'})`
  }
  return n
}

export function parseArgs(args: string[]): ParsedArgs {
  let verbose = false
  let sandbox = false
  let debugFile: string | undefined
  let sessionTimeoutMs: number | undefined
  let permissionMode: string | undefined
  let name: string | undefined
  let help = false
  let spawnMode: SpawnMode | undefined
  let capacity: number | undefined
  let createSessionInDir: boolean | undefined
  let sessionId: string | undefined
  let continueSession = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true
    } else if (arg === '--sandbox') {
      sandbox = true
    } else if (arg === '--no-sandbox') {
      sandbox = false
    } else if (arg === '--debug-file' && i + 1 < args.length) {
      debugFile = resolve(args[++i]!)
    } else if (arg.startsWith('--debug-file=')) {
      debugFile = resolve(arg.slice('--debug-file='.length))
    } else if (arg === '--session-timeout' && i + 1 < args.length) {
      sessionTimeoutMs = parseInt(args[++i]!, 10) * 1000
    } else if (arg.startsWith('--session-timeout=')) {
      sessionTimeoutMs =
        parseInt(arg.slice('--session-timeout='.length), 10) * 1000
    } else if (arg === '--permission-mode' && i + 1 < args.length) {
      permissionMode = args[++i]!
    } else if (arg.startsWith('--permission-mode=')) {
      permissionMode = arg.slice('--permission-mode='.length)
    } else if (arg === '--name' && i + 1 < args.length) {
      name = args[++i]!
    } else if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length)
    } else if (
      feature('KAIROS') &&
      arg === '--session-id' &&
      i + 1 < args.length
    ) {
      sessionId = args[++i]!
      if (!sessionId) {
        return makeError('--session-id 需要一个值')
      }
    } else if (feature('KAIROS') && arg.startsWith('--session-id=')) {
      sessionId = arg.slice('--session-id='.length)
      if (!sessionId) {
        return makeError('--session-id 需要一个值')
      }
    } else if (feature('KAIROS') && (arg === '--continue' || arg === '-c')) {
      continueSession = true
    } else if (arg === '--spawn' || arg.startsWith('--spawn=')) {
      if (spawnMode !== undefined) {
        return makeError('--spawn 只能指定一次')
      }
      const raw = arg.startsWith('--spawn=')
        ? arg.slice('--spawn='.length)
        : args[++i]
      const v = parseSpawnValue(raw)
      if (v === 'single-session' || v === 'same-dir' || v === 'worktree') {
        spawnMode = v
      } else {
        return makeError(v)
      }
    } else if (arg === '--capacity' || arg.startsWith('--capacity=')) {
      if (capacity !== undefined) {
        return makeError('--capacity 只能指定一次')
      }
      const raw = arg.startsWith('--capacity=')
        ? arg.slice('--capacity='.length)
        : args[++i]
      const v = parseCapacityValue(raw)
      if (typeof v === 'number') capacity = v
      else return makeError(v)
    } else if (arg === '--create-session-in-dir') {
      createSessionInDir = true
    } else if (arg === '--no-create-session-in-dir') {
      createSessionInDir = false
    } else {
      return makeError(
        `未知参数: ${arg}\n运行 'claude remote-control --help' 查看用法。`,
      )
    }
  }

  // 注意：--spawn/--capacity/--create-session-in-dir 的开关检查在 bridgeMain 中
  //（带开关意识的错误）。标志交叉验证在此处进行。

  // --capacity 仅对多会话模式有意义。
  if (spawnMode === 'single-session' && capacity !== undefined) {
    return makeError(
      `--capacity 不能与 --spawn=session 一起使用（单会话模式固定容量为 1）。`,
    )
  }

  // --session-id / --continue 在其原始环境中恢复特定会话；与配置新会话生成的标志不兼容，
  // 且彼此互斥。
  if (
    (sessionId || continueSession) &&
    (spawnMode !== undefined ||
      capacity !== undefined ||
      createSessionInDir !== undefined)
  ) {
    return makeError(
      `--session-id 和 --continue 不能与 --spawn、--capacity 或 --create-session-in-dir 一起使用。`,
    )
  }
  if (sessionId && continueSession) {
    return makeError(`--session-id 和 --continue 不能同时使用。`)
  }

  return {
    verbose,
    sandbox,
    debugFile,
    sessionTimeoutMs,
    permissionMode,
    name,
    spawnMode,
    capacity,
    createSessionInDir,
    sessionId,
    continueSession,
    help,
  }

  function makeError(error: string): ParsedArgs {
    return {
      verbose,
      sandbox,
      debugFile,
      sessionTimeoutMs,
      permissionMode,
      name,
      spawnMode,
      capacity,
      createSessionInDir,
      sessionId,
      continueSession,
      help,
      error,
    }
  }
}

async function printHelp(): Promise<void> {
  // 使用 EXTERNAL_PERMISSION_MODES 生成帮助文本 —— 内部模式（bubble）仅限蚂蚁内部，
  // auto 受功能开关控制；它们仍会被验证接受。
  const { EXTERNAL_PERMISSION_MODES } = await import('../types/permissions.js')
  const modes = EXTERNAL_PERMISSION_MODES.join(', ')
  const showServer = await isMultiSessionSpawnEnabled()
  const serverOptions = showServer
    ? `  --spawn <模式>                   生成模式：same-dir、worktree、session
                                   （默认：same-dir）
  --capacity <N>                   工作树或相同目录模式下的最大并发会话数
                                   （默认：${SPAWN_SESSIONS_DEFAULT}）
  --[no-]create-session-in-dir     在当前目录中预创建会话；在工作树模式下，
                                   此会话停留在当前工作目录，而按需会话获得
                                   隔离的工作树（默认：开启）
`
    : ''
  const serverDescription = showServer
    ? `
  远程控制作为持久服务器运行，接受当前目录中的多个并发会话。启动时预创建一个会话，
  以便立即有地方输入。使用 --spawn=worktree 将每个按需会话隔离到各自的 git 工作树中，
  或使用 --spawn=session 恢复经典的单会话模式（会话结束时退出）。运行时按 'w' 键
  可在 same-dir 和 worktree 之间切换。
`
    : ''
  const serverNote = showServer
    ? `  - 工作树模式需要 git 仓库或配置了 WorktreeCreate/WorktreeRemove 钩子
`
    : ''
  const help = `
远程控制 - 将本地环境连接到 claude.ai/code

用法
  claude remote-control [选项]
选项
  --name <名称>                    会话名称（显示在 claude.ai/code 中）
${
  feature('KAIROS')
    ? `  -c, --continue                   恢复此目录中的最后一次会话
  --session-id <id>                按 ID 恢复特定会话（不能与生成标志或
                                   --continue 一起使用）
`
    : ''
}  --permission-mode <模式>         生成会话的权限模式
                                   (${modes})
  --debug-file <路径>              将调试日志写入文件
  -v, --verbose                    启用详细输出
  -h, --help                       显示此帮助
${serverOptions}
描述
  远程控制允许您从 claude.ai/code (https://claude.ai/code) 控制本地设备上的会话。
  在您想要工作的目录中运行此命令，然后从 Claude 应用或网页连接。
${serverDescription}
注意事项
  - 您必须使用具有订阅的 Claude 账户登录
  - 先在目录中运行 \`claude\` 以接受工作区信任对话框
${serverNote}`
  // biome-ignore lint/suspicious/noConsole: 有意为之的帮助输出
  console.log(help)
}

const TITLE_MAX_LEN = 80

/** 从用户消息派生会话标题：第一行，截断。 */
function deriveSessionTitle(text: string): string {
  // 折叠空白字符 —— 换行/制表符会破坏单行状态显示。
  const flat = text.replace(/\s+/g, ' ').trim()
  return truncateToWidth(flat, TITLE_MAX_LEN)
}

/**
 * 通过 GET /v1/sessions/{id} 一次性获取会话标题。
 *
 * 使用 createSession.ts 中的 `getBridgeSession`（ccr-byoc 头 + 组织 UUID），
 * 而非环境级的 bridgeApi 客户端，后者的头会导致 Sessions API 返回 404。
 * 如果会话尚无标题或获取失败，则返回 undefined —— 调用方将回退到从首条用户消息派生标题。
 */
async function fetchSessionTitle(
  compatSessionId: string,
  baseUrl: string,
): Promise<string | undefined> {
  const { getBridgeSession } = await import('./createSession.js')
  const session = await getBridgeSession(compatSessionId, { baseUrl })
  return session?.title || undefined
}

export async function bridgeMain(args: string[]): Promise<void> {
  const parsed = parseArgs(args)

  if (parsed.help) {
    await printHelp()
    return
  }
  if (parsed.error) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
    console.error(`错误：${parsed.error}`)
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  const {
    verbose,
    sandbox,
    debugFile,
    sessionTimeoutMs,
    permissionMode,
    name,
    spawnMode: parsedSpawnMode,
    capacity: parsedCapacity,
    createSessionInDir: parsedCreateSessionInDir,
    sessionId: parsedSessionId,
    continueSession,
  } = parsed
  // 可变，以便 --continue 可以从指针文件中设置。下方的 #20460 恢复流程随后将其视为显式 --session-id 处理。
  let resumeSessionId = parsedSessionId
  // 当 --continue 找到指针时，这是指针来源的目录（可能是工作树兄弟目录，而非 `dir`）。
  // 在恢复流程的确定性失败时，清除此文件，以免 --continue 持续命中同一个已失效会话。
  // 对于显式 --session-id 则为 undefined（保留指针不动）。
  let resumePointerDir: string | undefined

  const usedMultiSessionFeature =
    parsedSpawnMode !== undefined ||
    parsedCapacity !== undefined ||
    parsedCreateSessionInDir !== undefined

  // 提前验证权限模式，以便用户在桥接器开始轮询工作前收到错误。
  if (permissionMode !== undefined) {
    const { PERMISSION_MODES } = await import('../types/permissions.js')
    const valid: readonly string[] = PERMISSION_MODES
    if (!valid.includes(permissionMode)) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
      console.error(
        `错误：无效的权限模式 '${permissionMode}'。有效模式：${valid.join(', ')}`,
      )
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1)
    }
  }

  const dir = resolve('.')

  // 桥接器快速路径绕过了 init.ts，因此必须在任何会传递调用 getGlobalConfig() 的代码之前启用配置读取
  const { enableConfigs, checkHasTrustDialogAccepted } = await import(
    '../utils/config.js'
  )
  enableConfigs()

  // 初始化遥测和错误报告接收器。桥接器绕过了 setup() 初始化流程，因此我们在此直接调用 initSinks() 来附加接收器。
  const { initSinks } = await import('../utils/sinks.js')
  initSinks()

  // 带开关意识的验证：--spawn / --capacity / --create-session-in-dir 需要多会话开关。
  // parseArgs 已验证了标志组合；此处仅检查开关，因为这需要异步 GrowthBook 调用。
  // 在 enableConfigs()（GrowthBook 缓存读取全局配置）和 initSinks()（以便拒绝事件能被入队）之后运行。
  const multiSessionEnabled = await isMultiSessionSpawnEnabled()
  if (usedMultiSessionFeature && !multiSessionEnabled) {
    await logEventAsync('tengu_bridge_multi_session_denied', {
      used_spawn: parsedSpawnMode !== undefined,
      used_capacity: parsedCapacity !== undefined,
      used_create_session_in_dir: parsedCreateSessionInDir !== undefined,
    })
    // logEventAsync 仅入队 —— process.exit() 会丢弃缓冲的事件。
    // 显式刷新，上限 500 毫秒以匹配 gracefulShutdown.ts。
    //（sleep() 不会 unref 其定时器，但 process.exit() 紧随其后，因此引用的定时器无法延迟关闭。）
    await Promise.race([
      Promise.all([shutdown1PEventLogging(), shutdownDatadog()]),
      sleep(500, undefined, { unref: true }),
    ]).catch(() => {})
    // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
    console.error(
      '错误：你的账户尚未启用多会话远程控制功能。',
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  // 设置引导 CWD，以便信任检查、项目配置查找和 git 工具（getBranch、getRemoteUrl）针对正确路径解析。
  const { setOriginalCwd, setCwdState } = await import('../bootstrap/state.js')
  setOriginalCwd(dir)
  setCwdState(dir)

  // 桥接器绕过了 main.tsx（后者通过 showSetupScreens 渲染交互式 TrustDialog），
  // 因此我们必须验证信任是否已在之前的正常 `claude` 会话中建立。
  if (!checkHasTrustDialogAccepted()) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.error(
      `错误：工作区不受信任。请先在 ${dir} 中运行 \`claude\` 以审查并接受工作区信任对话框。`,
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  // 解析认证
  const { clearOAuthTokenCache, checkAndRefreshOAuthTokenIfNeeded } =
    await import('../utils/auth.js')
  const { getBridgeAccessToken, getBridgeBaseUrl } = await import(
    './bridgeConfig.js'
  )

  const bridgeToken = getBridgeAccessToken()
  if (!bridgeToken) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.error(BRIDGE_LOGIN_ERROR)
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  // 首次远程对话框 —— 解释桥接器的作用并征得同意
  const {
    getGlobalConfig,
    saveGlobalConfig,
    getCurrentProjectConfig,
    saveCurrentProjectConfig,
  } = await import('../utils/config.js')
  if (!getGlobalConfig().remoteDialogSeen) {
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(
      '\n远程控制允许您从网页 (claude.ai/code) 或 Claude 应用访问此 CLI 会话，' +
        '以便在任何设备上继续您的工作。\n\n您可以随时再次运行 /remote-control 来断开远程访问。\n',
    )
    const answer = await new Promise<string>(resolve => {
      rl.question('启用远程控制？(y/n) ', resolve)
    })
    rl.close()
    saveGlobalConfig(current => {
      if (current.remoteDialogSeen) return current
      return { ...current, remoteDialogSeen: true }
    })
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(0)
    }
  }

  // --continue：从崩溃恢复指针解析最近的会话，并链接到 #20460 --session-id 流程。
  // 支持工作树感知：首先检查当前目录（快速路径，零执行），如果未命中则扩散到 git 工作树兄弟目录 ——
  // REPL 桥接器写入 getOriginalCwd()，EnterWorktreeTool/activeWorktreeSession 可以指向工作树，
  // 而用户的 shell 位于仓库根目录。
  // 在 parseArgs 处受 KAIROS 开关限制 —— 外部构建中 continueSession 始终为 false，因此此块会被 tree-shaking。
  if (feature('KAIROS') && continueSession) {
    const { readBridgePointerAcrossWorktrees } = await import(
      './bridgePointer.js'
    )
    const found = await readBridgePointerAcrossWorktrees(dir)
    if (!found) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
      console.error(
        `错误：在此目录或其工作树中未找到最近的会话。运行 \`claude remote-control\` 启动新会话。`,
      )
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1)
    }
    const { pointer, dir: pointerDir } = found
    const ageMin = Math.round(pointer.ageMs / 60_000)
    const ageStr = ageMin < 60 ? `${ageMin}分钟` : `${Math.round(ageMin / 60)}小时`
    const fromWt = pointerDir !== dir ? ` 来自工作树 ${pointerDir}` : ''
    // biome-ignore lint/suspicious/noConsole: 有意为之的信息输出
    console.error(
      `正在恢复会话 ${pointer.sessionId}（${ageStr} 前）${fromWt}…`,
    )
    resumeSessionId = pointer.sessionId
    // 追踪指针来源，以便下方的 #20460 exit(1) 路径在确定性失败时清除正确的文件 ——
    // 否则 --continue 会持续命中同一个已失效会话。可能是一个工作树兄弟目录。
    resumePointerDir = pointerDir
  }

  // 生产环境中，baseUrl 是 Anthropic API（来自 OAuth 配置）。
  // CLAUDE_BRIDGE_BASE_URL 仅用于蚂蚁本地开发覆盖。
  const baseUrl = getBridgeBaseUrl()

  // 对于非 localhost 目标，要求使用 HTTPS 以保护凭据。
  if (
    baseUrl.startsWith('http://') &&
    !baseUrl.includes('localhost') &&
    !baseUrl.includes('127.0.0.1')
  ) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.error(
      '错误：远程控制基础 URL 使用 HTTP。仅允许 HTTPS 或 localhost HTTP。',
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  // WebSocket 连接的会话入口 URL。生产环境中与 baseUrl 相同（Envoy 将 /v1/session_ingress/* 路由到 session-ingress）。
  // 本地环境中，session-ingress 运行在与 contain-provide-api (8211) 不同的端口 (9413)，
  // 因此必须显式设置 CLAUDE_BRIDGE_SESSION_INGRESS_URL。仅限蚂蚁内部，与 CLAUDE_BRIDGE_BASE_URL 匹配。
  const sessionIngressUrl =
    process.env.USER_TYPE === 'ant' &&
    process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
      ? process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
      : baseUrl

  const { getBranch, getRemoteUrl, findGitRoot } = await import(
    '../utils/git.js'
  )

  // 预先检查工作树可用性，用于首次运行对话框和 `w` 切换。无条件执行，以便预先知晓工作树是否可选。
  const { hasWorktreeCreateHook } = await import('../utils/hooks.js')
  const worktreeAvailable = hasWorktreeCreateHook() || findGitRoot(dir) !== null

  // 加载保存的每个项目的生成模式偏好。受 multiSessionEnabled 限制，
  // 这样 GrowthBook 回滚可以干净地将用户恢复到单会话模式 ——
  // 否则保存的偏好会悄然重新启用多会话行为（工作树隔离、32 最大会话数、w 切换），尽管开关已关闭。
  // 同时防范由于此目录曾是 git 仓库（或用户复制了配置）而留下的陈旧工作树偏好 ——
  // 在磁盘上清除它，以免每次启动都重复显示警告。
  let savedSpawnMode = multiSessionEnabled
    ? getCurrentProjectConfig().remoteControlSpawnMode
    : undefined
  if (savedSpawnMode === 'worktree' && !worktreeAvailable) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的警告输出
    console.error(
      '警告：保存的生成模式是 worktree，但此目录不是 git 仓库。回退到 same-dir。',
    )
    savedSpawnMode = undefined
    saveCurrentProjectConfig(current => {
      if (current.remoteControlSpawnMode === undefined) return current
      return { ...current, remoteControlSpawnMode: undefined }
    })
  }

  // 首次运行生成模式选择：当选项有意义时（开关开启、两种模式均可用、无显式覆盖、非恢复），
  // 每个项目询问一次。保存到 ProjectConfig，后续运行将跳过此步骤。
  if (
    multiSessionEnabled &&
    !savedSpawnMode &&
    worktreeAvailable &&
    parsedSpawnMode === undefined &&
    !resumeSessionId &&
    process.stdin.isTTY
  ) {
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    // biome-ignore lint/suspicious/noConsole: 有意为之的对话框输出
    console.log(
      `\nClaude 远程控制正在以生成模式启动，您可以从网页版或移动端的 Claude Code 为此项目创建新会话。了解更多：https://code.claude.com/docs/en/remote-control\n\n` +
        `此项目的生成模式：\n` +
        `  [1] same-dir — 会话共享当前目录（默认）\n` +
        `  [2] worktree — 每个会话获得独立的 git 工作树\n\n` +
        `后续可以更改，或通过 --spawn=same-dir 或 --spawn=worktree 显式设置。\n`,
    )
    const answer = await new Promise<string>(resolve => {
      rl.question('选择 [1/2]（默认：1）：', resolve)
    })
    rl.close()
    const chosen: 'same-dir' | 'worktree' =
      answer.trim() === '2' ? 'worktree' : 'same-dir'
    savedSpawnMode = chosen
    logEvent('tengu_bridge_spawn_mode_chosen', {
      spawn_mode:
        chosen as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    saveCurrentProjectConfig(current => {
      if (current.remoteControlSpawnMode === chosen) return current
      return { ...current, remoteControlSpawnMode: chosen }
    })
  }

  // 确定有效的生成模式。
  // 优先级：恢复 > 显式 --spawn > 保存的项目偏好 > 开关默认值
  // - 通过 --continue / --session-id 恢复：始终为单会话模式（恢复目标是原始目录中的特定会话）
  // - 显式 --spawn 标志：直接使用该值（不持久化）
  // - 保存的 ProjectConfig.remoteControlSpawnMode：由首次运行对话框或 `w` 设置
  // - 开关开启时的默认值：same-dir（持久多会话，共享当前工作目录）
  // - 开关关闭时的默认值：single-session（不变的旧版行为）
  // 追踪生成模式的来源，用于发布分析。
  type SpawnModeSource = 'resume' | 'flag' | 'saved' | 'gate_default'
  let spawnModeSource: SpawnModeSource
  let spawnMode: SpawnMode
  if (resumeSessionId) {
    spawnMode = 'single-session'
    spawnModeSource = 'resume'
  } else if (parsedSpawnMode !== undefined) {
    spawnMode = parsedSpawnMode
    spawnModeSource = 'flag'
  } else if (savedSpawnMode !== undefined) {
    spawnMode = savedSpawnMode
    spawnModeSource = 'saved'
  } else {
    spawnMode = multiSessionEnabled ? 'same-dir' : 'single-session'
    spawnModeSource = 'gate_default'
  }
  const maxSessions =
    spawnMode === 'single-session'
      ? 1
      : (parsedCapacity ?? SPAWN_SESSIONS_DEFAULT)
  // 启动时预创建一个空会话，以便用户立即有地方输入，
  // 该会话运行在当前目录中（在生成循环中豁免工作树创建）。默认开启；--no-create-session-in-dir
  // 选择退出，变为纯按需服务器，每个会话都被隔离。
  // 创建位置的有效 resumeSessionId 守卫处理了恢复情况（恢复成功时跳过创建；在环境不匹配回退时回落到全新创建）。
  const preCreateSession = parsedCreateSessionInDir ?? true

  // 没有 --continue：残留的指针意味着上一次运行未干净关闭（崩溃、kill -9、终端关闭）。
  // 清除它，以免陈旧环境在其相关性消失后仍残留。在所有模式下运行（clearBridgePointer 在文件不存在时为空操作）——
  // 覆盖了开关转换场景，例如用户在单会话模式下崩溃后以工作树模式全新启动。仅单会话模式会写入新指针。
  if (!resumeSessionId) {
    const { clearBridgePointer } = await import('./bridgePointer.js')
    await clearBridgePointer(dir)
  }

  // 工作树模式需要 git 或 WorktreeCreate/WorktreeRemove 钩子。
  // 仅通过显式 --spawn=worktree 可达（默认是 same-dir）；保存的工作树偏好已在上面被守卫。
  if (spawnMode === 'worktree' && !worktreeAvailable) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
    console.error(
      `错误：Worktree 模式需要 git 仓库或配置了 WorktreeCreate 钩子。使用 --spawn=session 进行单会话模式。`,
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  const branch = await getBranch()
  const gitRepoUrl = await getRemoteUrl()
  const machineName = hostname()
  const bridgeId = randomUUID()

  const { handleOAuth401Error } = await import('../utils/auth.js')
  const api = createBridgeApiClient({
    baseUrl,
    getAccessToken: getBridgeAccessToken,
    runnerVersion: MACRO.VERSION,
    onDebug: logForDebugging,
    onAuth401: handleOAuth401Error,
    getTrustedDeviceToken,
  })

  // 当通过 --session-id 恢复会话时，获取它以获知其 environment_id 并在注册时复用（后端幂等）。
  // 否则保持 undefined —— 后端拒绝客户端生成的 UUID，并将分配一个新环境。
  // feature('KAIROS') 开关：--session-id 仅限蚂蚁内部；parseArgs 已在开关关闭时拒绝该标志，
  // 因此外部构建中 resumeSessionId 在此处始终为 undefined —— 此守卫用于 tree-shaking。
  let reuseEnvironmentId: string | undefined
  if (feature('KAIROS') && resumeSessionId) {
    try {
      validateBridgeId(resumeSessionId, 'sessionId')
    } catch {
      // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
      console.error(
        `错误：无效的会话 ID "${resumeSessionId}"。会话 ID 不能包含不安全字符。`,
      )
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1)
    }
    // 主动刷新 OAuth 令牌 —— getBridgeSession 使用原始 axios 而没有 withOAuthRetry 的 401 刷新逻辑。
    // 否则一个已过期但存在的令牌会产生误导性的“未找到”错误。
    await checkAndRefreshOAuthTokenIfNeeded()
    clearOAuthTokenCache()
    const { getBridgeSession } = await import('./createSession.js')
    const session = await getBridgeSession(resumeSessionId, {
      baseUrl,
      getAccessToken: getBridgeAccessToken,
    })
    if (!session) {
      // 会话在服务端已消失 → 指针陈旧。清除它，以免用户下次启动时再次提示。
      //（显式 --session-id 保留指针不动 —— 它是一个独立文件，他们甚至可能没有。）
      // resumePointerDir 可能是工作树兄弟目录 —— 清除该文件。
      if (resumePointerDir) {
        const { clearBridgePointer } = await import('./bridgePointer.js')
        await clearBridgePointer(resumePointerDir)
      }
      // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
      console.error(
        `错误：未找到会话 ${resumeSessionId}。该会话可能已被归档或过期，或者你的登录已失效（运行 \`claude /login\`）。`,
      )
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1)
    }
    if (!session.environment_id) {
      if (resumePointerDir) {
        const { clearBridgePointer } = await import('./bridgePointer.js')
        await clearBridgePointer(resumePointerDir)
      }
      // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
      console.error(
        `错误：会话 ${resumeSessionId} 没有 environment_id。该会话可能从未关联到桥接器。`,
      )
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1)
    }
    reuseEnvironmentId = session.environment_id
    logForDebugging(
      `[bridge:init] 在环境 ${reuseEnvironmentId} 上恢复会话 ${resumeSessionId}`,
    )
  }

  const config: BridgeConfig = {
    dir,
    machineName,
    branch,
    gitRepoUrl,
    maxSessions,
    spawnMode,
    verbose,
    sandbox,
    bridgeId,
    workerType: 'claude_code',
    environmentId: randomUUID(),
    reuseEnvironmentId,
    apiBaseUrl: baseUrl,
    sessionIngressUrl,
    debugFile,
    sessionTimeoutMs,
  }

  logForDebugging(
    `[bridge:init] bridgeId=${bridgeId}${reuseEnvironmentId ? ` reuseEnvironmentId=${reuseEnvironmentId}` : ''} dir=${dir} branch=${branch} gitRepoUrl=${gitRepoUrl} machine=${machineName}`,
  )
  logForDebugging(
    `[bridge:init] apiBaseUrl=${baseUrl} sessionIngressUrl=${sessionIngressUrl}`,
  )
  logForDebugging(
    `[bridge:init] sandbox=${sandbox}${debugFile ? ` debugFile=${debugFile}` : ''}`,
  )

  // 在进入轮询循环前注册桥接器环境。
  let environmentId: string
  let environmentSecret: string
  try {
    const reg = await api.registerBridgeEnvironment(config)
    environmentId = reg.environment_id
    environmentSecret = reg.environment_secret
  } catch (err) {
    logEvent('tengu_bridge_registration_failed', {
      status: err instanceof BridgeFatalError ? err.status : undefined,
    })
    // 注册失败是致命的 —— 打印清晰的消息而非堆栈跟踪。
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.error(
      err instanceof BridgeFatalError && err.status === 404
        ? '你的账户不可用远程控制环境。'
        : `错误：${errorMessage(err)}`,
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  // 跟踪 --session-id 恢复流程是否成功完成。
  // 用于下方跳过新会话创建，并为 initialSessionId 提供种子。
  // 在环境不匹配时清除，以便优雅地回退到新会话。
  let effectiveResumeSessionId: string | undefined
  if (feature('KAIROS') && resumeSessionId) {
    if (reuseEnvironmentId && environmentId !== reuseEnvironmentId) {
      // 后端返回了不同的 environment_id —— 原始环境已过期或被回收。
      // 重新连接无法针对新环境工作（会话绑定到旧环境）。记录到 sentry 以引起注意，
      // 并回退到在新环境中创建全新会话。
      logError(
        new Error(
          `桥接器恢复环境不匹配：请求 ${reuseEnvironmentId}，后端返回 ${environmentId}。回退到新会话。`,
        ),
      )
      // biome-ignore lint/suspicious/noConsole: 有意为之的警告输出
      console.warn(
        `警告：无法恢复会话 ${resumeSessionId} —— 其环境已过期。改为创建全新会话。`,
      )
      // 不要注销 —— 我们将使用这个新环境。
      // effectiveResumeSessionId 保持 undefined → 下方的新会话路径。
    } else {
      // 强制停止此会话的任何陈旧工作节点实例，并将其重新入队，以便我们的轮询循环能获取它。
      // 必须在注册之后进行，这样后端才知道该环境存在活跃工作节点。
      //
      // 指针存储的是 session_* ID，但 /bridge/reconnect 在 ccr_v2_compat_enabled 开启时
      // 通过其基础设施标签（cse_*）查找会话。两者都尝试；如果已经是 cse_*，转换是空操作。
      const infraResumeId = toInfraSessionId(resumeSessionId)
      const reconnectCandidates =
        infraResumeId === resumeSessionId
          ? [resumeSessionId]
          : [resumeSessionId, infraResumeId]
      let reconnected = false
      let lastReconnectErr: unknown
      for (const candidateId of reconnectCandidates) {
        try {
          await api.reconnectSession(environmentId, candidateId)
          logForDebugging(
            `[bridge:init] 会话 ${candidateId} 通过 bridge/reconnect 重新入队`,
          )
          effectiveResumeSessionId = resumeSessionId
          reconnected = true
          break
        } catch (err) {
          lastReconnectErr = err
          logForDebugging(
            `[bridge:init] reconnectSession(${candidateId}) 失败: ${errorMessage(err)}`,
          )
        }
      }
      if (!reconnected) {
        const err = lastReconnectErr

        // 在临时重新连接失败时不要注销 —— 此时 environmentId 正是该会话自身所在的环境。
        // 注销将使重试不可能。后端的 4 小时 TTL 会负责清理。
        const isFatal = err instanceof BridgeFatalError
        // 仅在致命的重新连接失败时清除指针。临时失败（“请尝试再次运行相同命令”）应保留指针，
        // 以便下次启动时重新提示 —— 这本身就是重试机制。
        if (resumePointerDir && isFatal) {
          const { clearBridgePointer } = await import('./bridgePointer.js')
          await clearBridgePointer(resumePointerDir)
        }
        // biome-ignore lint/suspicious/noConsole: 有意为之的错误输出
        console.error(
          isFatal
            ? `错误：${errorMessage(err)}`
            : `错误：重新连接会话 ${resumeSessionId} 失败：${errorMessage(err)}\n该会话可能仍然可以重新连接——请尝试再次运行相同的命令。`,
        )
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(1)
      }
    }
  }

  logForDebugging(
    `[bridge:init] 已注册，服务端 environmentId=${environmentId}`,
  )
  const startupPollConfig = getPollIntervalConfig()
  logEvent('tengu_bridge_started', {
    max_sessions: config.maxSessions,
    has_debug_file: !!config.debugFile,
    sandbox: config.sandbox,
    verbose: config.verbose,
    heartbeat_interval_ms:
      startupPollConfig.non_exclusive_heartbeat_interval_ms,
    spawn_mode:
      config.spawnMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    spawn_mode_source:
      spawnModeSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    multi_session_gate: multiSessionEnabled,
    pre_create_session: preCreateSession,
    worktree_available: worktreeAvailable,
  })
  logForDiagnosticsNoPII('info', 'bridge_started', {
    max_sessions: config.maxSessions,
    sandbox: config.sandbox,
    spawn_mode: config.spawnMode,
  })

  const spawner = createSessionSpawner({
    execPath: process.execPath,
    scriptArgs: spawnScriptArgs(),
    env: process.env,
    verbose,
    sandbox,
    debugFile,
    permissionMode,
    onDebug: logForDebugging,
    onActivity: (sessionId, activity) => {
      logForDebugging(
        `[bridge:activity] sessionId=${sessionId} ${activity.type} ${activity.summary}`,
      )
    },
    onPermissionRequest: (sessionId, request, _accessToken) => {
      logForDebugging(
        `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (不自动批准)`,
      )
    },
  })

  const logger = createBridgeLogger({ verbose })
  const { parseGitHubRepository } = await import('../utils/detectRepository.js')
  const ownerRepo = gitRepoUrl ? parseGitHubRepository(gitRepoUrl) : null
  // 使用解析出的 owner/repo 中的仓库名称，或回退到目录基本名称
  const repoName = ownerRepo ? ownerRepo.split('/').pop()! : basename(dir)
  logger.setRepoInfo(repoName, branch)

  // `w` 切换仅在多会话模式且工作树是有效选项时可用。不可用时，模式后缀和提示将被隐藏。
  const toggleAvailable = spawnMode !== 'single-session' && worktreeAvailable
  if (toggleAvailable) {
    // 安全的类型转换：spawnMode 不是 single-session（已在上面检查），且对非 git 中保存工作树偏好的守卫和退出检查
    // 确保仅在可用时才到达工作树。
    logger.setSpawnModeDisplay(spawnMode as 'same-dir' | 'worktree')
  }

  // 监听按键：空格切换二维码，w 切换生成模式
  const onStdinData = (data: Buffer): void => {
    if (data[0] === 0x03 || data[0] === 0x04) {
      // Ctrl+C / Ctrl+D — 触发优雅关闭
      process.emit('SIGINT')
      return
    }
    if (data[0] === 0x20 /* 空格 */) {
      logger.toggleQr()
      return
    }
    if (data[0] === 0x77 /* 'w' */) {
      if (!toggleAvailable) return
      const newMode: 'same-dir' | 'worktree' =
        config.spawnMode === 'same-dir' ? 'worktree' : 'same-dir'
      config.spawnMode = newMode
      logEvent('tengu_bridge_spawn_mode_toggled', {
        spawn_mode:
          newMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      logger.logStatus(
        newMode === 'worktree'
          ? '生成模式: worktree（新会话获得隔离的 git 工作树）'
          : '生成模式: same-dir（新会话共享当前目录）',
      )
      logger.setSpawnModeDisplay(newMode)
      logger.refreshDisplay()
      saveCurrentProjectConfig(current => {
        if (current.remoteControlSpawnMode === newMode) return current
        return { ...current, remoteControlSpawnMode: newMode }
      })
      return
    }
  }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onStdinData)
  }

  const controller = new AbortController()
  const onSigint = (): void => {
    logForDebugging('[bridge:shutdown] 收到 SIGINT，正在关闭')
    controller.abort()
  }
  const onSigterm = (): void => {
    logForDebugging('[bridge:shutdown] 收到 SIGTERM，正在关闭')
    controller.abort()
  }
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)

  // 自动创建一个空会话，以便用户立即有地方输入（与 /remote-control 行为一致）。
  // 由 preCreateSession 控制：默认开启；--no-create-session-in-dir 选择退出。
  // 当 --session-id 恢复成功时，完全跳过创建 —— 会话已存在且 bridge/reconnect 已将其重新入队。
  // 当恢复请求因环境不匹配失败时，effectiveResumeSessionId 为 undefined，
  // 因此我们回退到全新会话创建（遵循上面打印的“改为创建全新会话”警告）。
  let initialSessionId: string | null =
    feature('KAIROS') && effectiveResumeSessionId
      ? effectiveResumeSessionId
      : null
  if (preCreateSession && !(feature('KAIROS') && effectiveResumeSessionId)) {
    const { createBridgeSession } = await import('./createSession.js')
    try {
      initialSessionId = await createBridgeSession({
        environmentId,
        title: name,
        events: [],
        gitRepoUrl,
        branch,
        signal: controller.signal,
        baseUrl,
        getAccessToken: getBridgeAccessToken,
        permissionMode,
      })
      if (initialSessionId) {
        logForDebugging(
          `[bridge:init] 创建了初始会话 ${initialSessionId}`,
        )
      }
    } catch (err) {
      logForDebugging(
        `[bridge:init] 会话创建失败（非致命）: ${errorMessage(err)}`,
      )
    }
  }

  // 崩溃恢复指针：立即写入，以便在此之后的任何时刻 kill -9 都能留下可恢复的痕迹。
  // 同时覆盖新会话和已恢复会话（这样恢复后再次崩溃仍可恢复）。
  // 当 runBridgeLoop 落到归档+注销路径时清除；在 SIGINT 可恢复关闭返回时保留
  //（作为用户在复制打印的 --session-id 提示前关闭终端的后备）。
  // 每小时刷新一次，这样运行超过 5 小时的会话在崩溃时仍有一个新鲜的指针
  //（陈旧性检查文件修改时间，后端 TTL 自轮询开始滚动计算）。
  let pointerRefreshTimer: ReturnType<typeof setInterval> | null = null
  // 仅单会话模式：--continue 在恢复时强制使用单会话模式，
  // 因此在多会话模式下写入的指针会与用户尝试恢复时的配置相矛盾。
  // 可恢复关闭路径也限制在单会话模式（约 1254 行），因此指针将被孤立。
  if (initialSessionId && spawnMode === 'single-session') {
    const { writeBridgePointer } = await import('./bridgePointer.js')
    const pointerPayload = {
      sessionId: initialSessionId,
      environmentId,
      source: 'standalone' as const,
    }
    await writeBridgePointer(config.dir, pointerPayload)
    pointerRefreshTimer = setInterval(
      writeBridgePointer,
      60 * 60 * 1000,
      config.dir,
      pointerPayload,
    )
    // 不要让间隔定时器单独保持进程活跃。
    pointerRefreshTimer.unref?.()
  }

  try {
    await runBridgeLoop(
      config,
      environmentId,
      environmentSecret,
      api,
      spawner,
      logger,
      controller.signal,
      undefined,
      initialSessionId ?? undefined,
      async () => {
        // 清除缓存的 OAuth 令牌，以便重新从安全存储读取，从而获取子进程刷新的令牌。
        clearOAuthTokenCache()
        // 如果磁盘上的令牌已过期，也主动刷新。
        await checkAndRefreshOAuthTokenIfNeeded()
        return getBridgeAccessToken()
      },
    )
  } finally {
    if (pointerRefreshTimer !== null) {
      clearInterval(pointerRefreshTimer)
    }
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    process.stdin.off('data', onStdinData)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
  }

  // 桥接器绕过了 init.ts（及其优雅关闭处理器），因此我们必须显式退出。
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(0)
}

// ─── 无头桥接器（守护进程工作节点）────────────────────────────────────────

/**
 * 由 runBridgeHeadless 针对配置问题抛出，表示主管不应重试
 *（信任未接受、工作树不可用、http 而非 https）。
 * 守护进程工作节点捕获此异常并退出，退出码为 EXIT_CODE_PERMANENT，
 * 以便主管将该工作节点置于搁置状态，而非按退避策略重新生成。
 */
export class BridgeHeadlessPermanentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BridgeHeadlessPermanentError'
  }
}

export type HeadlessBridgeOpts = {
  dir: string
  name?: string
  spawnMode: 'same-dir' | 'worktree'
  capacity: number
  permissionMode?: string
  sandbox: boolean
  sessionTimeoutMs?: number
  createSessionOnStart: boolean
  getAccessToken: () => string | undefined
  onAuth401: (failedToken: string) => Promise<boolean>
  log: (s: string) => void
}

/**
 * 为 `remoteControl` 守护进程工作节点提供的非交互式桥接器入口点。
 *
 * bridgeMain() 的线性子集：无 readline 对话框、无标准输入键处理、无 TUI、无 process.exit()。
 * 配置来自调用方（daemon.json），认证通过 IPC 获取（主管的 AuthManager），
 * 日志输出到工作节点的标准输出管道。在致命错误时抛出异常 —— 工作节点捕获后将永久性错误与
 * 临时性错误映射到正确的退出码。
 *
 * 当 `signal` 中止且轮询循环拆除后，Promise 干净地解析。
 */
export async function runBridgeHeadless(
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
): Promise<void> {
  const { dir, log } = opts

  // 工作节点继承主管的 CWD。首先 chdir，以便 git 工具（getBranch/getRemoteUrl）
  // —— 它们从下面设置的引导 CWD 状态读取 —— 针对正确的仓库解析。
  process.chdir(dir)
  const { setOriginalCwd, setCwdState } = await import('../bootstrap/state.js')
  setOriginalCwd(dir)
  setCwdState(dir)

  const { enableConfigs, checkHasTrustDialogAccepted } = await import(
    '../utils/config.js'
  )
  enableConfigs()
  const { initSinks } = await import('../utils/sinks.js')
  initSinks()

  if (!checkHasTrustDialogAccepted()) {
    throw new BridgeHeadlessPermanentError(
      `工作区不受信任: ${dir}。请先在该目录中运行 \`claude\` 以接受信任对话框。`,
    )
  }

  if (!opts.getAccessToken()) {
    // 临时性错误 —— 主管的 AuthManager 可能在下一个周期获取到令牌。
    throw new Error(BRIDGE_LOGIN_ERROR)
  }

  const { getBridgeBaseUrl } = await import('./bridgeConfig.js')
  const baseUrl = getBridgeBaseUrl()
  if (
    baseUrl.startsWith('http://') &&
    !baseUrl.includes('localhost') &&
    !baseUrl.includes('127.0.0.1')
  ) {
    throw new BridgeHeadlessPermanentError(
      '远程控制基础 URL 使用 HTTP。仅允许 HTTPS 或 localhost HTTP。',
    )
  }
  const sessionIngressUrl =
    process.env.USER_TYPE === 'ant' &&
    process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
      ? process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL
      : baseUrl

  const { getBranch, getRemoteUrl, findGitRoot } = await import(
    '../utils/git.js'
  )
  const { hasWorktreeCreateHook } = await import('../utils/hooks.js')

  if (opts.spawnMode === 'worktree') {
    const worktreeAvailable =
      hasWorktreeCreateHook() || findGitRoot(dir) !== null
    if (!worktreeAvailable) {
      throw new BridgeHeadlessPermanentError(
        `工作树模式需要 git 仓库或 WorktreeCreate 钩子。目录 ${dir} 两者皆无。`,
      )
    }
  }

  const branch = await getBranch()
  const gitRepoUrl = await getRemoteUrl()
  const machineName = hostname()
  const bridgeId = randomUUID()

  const config: BridgeConfig = {
    dir,
    machineName,
    branch,
    gitRepoUrl,
    maxSessions: opts.capacity,
    spawnMode: opts.spawnMode,
    verbose: false,
    sandbox: opts.sandbox,
    bridgeId,
    workerType: 'claude_code',
    environmentId: randomUUID(),
    apiBaseUrl: baseUrl,
    sessionIngressUrl,
    sessionTimeoutMs: opts.sessionTimeoutMs,
  }

  const api = createBridgeApiClient({
    baseUrl,
    getAccessToken: opts.getAccessToken,
    runnerVersion: MACRO.VERSION,
    onDebug: log,
    onAuth401: opts.onAuth401,
    getTrustedDeviceToken,
  })

  let environmentId: string
  let environmentSecret: string
  try {
    const reg = await api.registerBridgeEnvironment(config)
    environmentId = reg.environment_id
    environmentSecret = reg.environment_secret
  } catch (err) {
    // 临时性错误 —— 让主管退避重试。
    throw new Error(`网桥注册失败：${errorMessage(err)}`)
  }

  const spawner = createSessionSpawner({
    execPath: process.execPath,
    scriptArgs: spawnScriptArgs(),
    env: process.env,
    verbose: false,
    sandbox: opts.sandbox,
    permissionMode: opts.permissionMode,
    onDebug: log,
  })

  const logger = createHeadlessBridgeLogger(log)
  logger.printBanner(config, environmentId)

  let initialSessionId: string | undefined
  if (opts.createSessionOnStart) {
    const { createBridgeSession } = await import('./createSession.js')
    try {
      const sid = await createBridgeSession({
        environmentId,
        title: opts.name,
        events: [],
        gitRepoUrl,
        branch,
        signal,
        baseUrl,
        getAccessToken: opts.getAccessToken,
        permissionMode: opts.permissionMode,
      })
      if (sid) {
        initialSessionId = sid
        log(`创建初始会话 ${sid}`)
      }
    } catch (err) {
      log(`会话预创建失败(非致命): ${errorMessage(err)}`)
    }
  }

  await runBridgeLoop(
    config,
    environmentId,
    environmentSecret,
    api,
    spawner,
    logger,
    signal,
    undefined,
    initialSessionId,
    async () => opts.getAccessToken(),
  )
}

/** 将所有内容路由到单个行日志函数的 BridgeLogger 适配器。 */
function createHeadlessBridgeLogger(log: (s: string) => void): BridgeLogger {
  const noop = (): void => {}
  return {
    printBanner: (cfg, envId) =>
      log(
        `已注册 environmentId=${envId} 目录=${cfg.dir} 生成模式=${cfg.spawnMode} 容量=${cfg.maxSessions}`,
      ),
    logSessionStart: (id, _prompt) => log(`会话开始 ${id}`),
    logSessionComplete: (id, ms) => log(`会话完成 ${id}（${ms}毫秒）`),
    logSessionFailed: (id, err) => log(`会话失败 ${id}: ${err}`),
    logStatus: log,
    logVerbose: log,
    logError: s => log(`错误: ${s}`),
    logReconnected: ms => log(`经过 ${ms}毫秒后重新连接`),
    addSession: (id, _url) => log(`会话已附加 ${id}`),
    removeSession: id => log(`会话已分离 ${id}`),
    updateIdleStatus: noop,
    updateReconnectingStatus: noop,
    updateSessionStatus: noop,
    updateSessionActivity: noop,
    updateSessionCount: noop,
    updateFailedStatus: noop,
    setSpawnModeDisplay: noop,
    setRepoInfo: noop,
    setDebugLogPath: noop,
    setAttached: noop,
    setSessionTitle: noop,
    clearStatus: noop,
    toggleQr: noop,
    refreshDisplay: noop,
  }
}