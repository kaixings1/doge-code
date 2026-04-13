import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from '../utils/debug.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { errorMessage } from '../utils/errors.js'
import { jsonParse } from '../utils/slowOperations.js'

/** 格式化毫秒持续时间作为可读字符串 (例如 "5m 30s")。 */
function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/**
 * 不验证签名地解码JWT的负载部分。
 * 去除可能存在的 `sk-ant-si-` 会话入口前缀。
 * 返回解析后的JSON负载作为 `unknown` 类型，如果令牌格式错误或负载不是有效的JSON，则返回 `null`。
 */
export function decodeJwtPayload(token: string): unknown | null {
  const jwt = token.startsWith('sk-ant-si-')
    ? token.slice('sk-ant-si-'.length)
    : token
  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    return jsonParse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * 不验证签名地从JWT中解码 `exp`（过期时间）声明。
 * @返回 解析后的 `exp` 值，单位为Unix秒数。如果无法解析，则返回 `null`
 */
export function decodeJwtExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token)
  if (
    payload !== null &&
    typeof payload === 'object' &&
    'exp' in payload &&
    typeof payload.exp === 'number'
  ) {
    return payload.exp
  }
  return null
}

/** 在过期前刷新令牌的缓冲时间。 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** 当新令牌的过期时间未知时，使用默认的刷新间隔。 */
const FALLBACK_REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30分钟

/** 最大连续失败次数，在达到此次数后放弃刷新过程。 */
const MAX_REFRESH_FAILURES = 3<｜end▁of▁sentence｜>/** 当getAccessToken返回undefined时的重试延迟。 */
const REFRESH_RETRY_DELAY_MS = 60_000

/**
 * 创建一个token刷新调度器，用于在令牌即将过期前主动刷新会话令牌。
 * 同时被独立桥和REPL桥使用。
 *
 * 当令牌即将过期时，调度器会调用`onRefresh`函数，并传入会话ID和桥接的OAuth访问令牌。
 * 调用者需要负责将令牌传递到相应的传输方式（独立桥通过子进程标准输入，REPL桥通过WebSocket重连）。
 */
export function createTokenRefreshScheduler({
  getAccessToken,
  onRefresh,
  label,
  refreshBufferMs = TOKEN_REFRESH_BUFFER_MS,
}: {
  get = (): string | undefined | Promise<string | undefined>
  onRefresh: (sessionId: string, oauthToken: string) => void
  label: string
  /** 在过期前多久触发刷新。默认为5分钟。 */
  refreshBufferMs?: number
}): {
  schedule: (sessionId: string, token: string) => void
  scheduleFromExpiresIn: (sessionId: string, expiresInSeconds: number) => void
  cancel: (sessionId: string) => void
  cancelAll: () => void
} {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const failureCounts = new Map<string, number>()
  // 每个会话的生成计数器 —— 通过schedule()和cancel()递增，
  // 以便检测过时的异步doRefresh()调用并跳过设置后续定时器。
  const generations = new Map<string, number>()

  function nextGeneration(sessionId: string): number {
    const gen = (generations.get(sessionId) ?? 0) + 1
    generations.set(sessionId, gen)
    return gen
  }

  function schedule(sessionId: string, token: string): void {
    const expiry = decodeJwtExpiry(token)
    if (!expiry) {
      // 令牌不是可解码的JWT（例如，来自REPL桥WebSocket打开处理程序的OAuth令牌）。
      // 保留任何现有的定时器（由doRefresh设置的后续刷新定时器）。
<｜end▁of▁sentence｜>需要汉化的内容是:
      // 链路未中断。
      logForDebugging(
        `[${label}:token] 无法解码JWT过期时间，sessionId=${sessionId}，token前缀=${token.slice(0, 15)}…，保留现有定时器`,
      )
      return
    }

    // 清除任何现有的刷新定时器——我们有明确的过期时间来替换它。
    const existing = timers.get(sessionId)
    if (existing) {
      clearTimeout(existing)
    }

    // 提高版本号以使任何正在进行中的异步doRefresh失效。
    const gen = nextGeneration(sessionId)

    const expiryDate = new Date(expiry * 1000).toISOString()
    const delayMs = expiry * 1000 - Date.now() - refreshBufferMs
    if (delayMs <= 0) {
      logForDebugging(
        `[${label}:token] Token for sessionId=${sessionId} expires=${expiryDate} (已过期或在缓冲区内)，立即刷新`,
      )
      void doRefresh(sessionId, gen)
      return
    }

    logForDebugging(
      `[${label}:token] 为sessionId=${sessionId}的token设置延迟刷新，延迟时间=${formatDuration(delayMs)} (过期时间=${expiryDate}, 缓冲时间=${refreshBufferMs / 1000}s)`,
    )

    const timer = setTimeout(doRefresh, delayMs, sessionId, gen)
    timers.set(sessionId, timer)
  }

  /**
   * 使用显式的TTL（秒数直到过期）而不是解码JWT的exp声明来安排刷新。
   * 用于那些JWT是不透明类型（例如，POST /v1/code/sessions/{id}/bridge直接返回expires_in）的调用者。
   */
  function scheduleFromExpiresIn(
    sessionId: string,
    expiresInSeconds: number,
  ): void {
    const existing = timers.get(sessionId)
    if (existing) clearTimeout(existing)
    const gen = nextGeneration(sessionId)
    // 将延迟时间限制在30秒的最小值——如果refreshBufferMs过大（例如，在测试频繁刷新时，或服务器意外缩短了过期时间）
    // 则未限制的delayMs ≤ 0会导致死循环。
    const delayMs = Math.max(expiresInSeconds * 1000 - refreshBufferMs, 30_000)
    logForDebugging(<｜end▁of▁sentence｜>需要汉化的内容是:
      `[${label}:token] Scheduled token refresh for sessionId=${sessionId} in ${formatDuration(delayMs)} (expires_in=${expiresInSeconds}s, buffer=${refreshBufferMs / 1000}s)`,
    )
    const timer = setTimeout(doRefresh, delayMs, sessionId, gen)
    timers.set(sessionId, timer)
  }

  async function doRefresh(sessionId: string, gen: number): Promise<void> {
    let oauthToken: string | undefined
    try {
      oauthToken = await getAccessToken()
    } catch (err) {
      logForDebugging(
        `[${label}:token] getAccessToken threw for sessionId=${sessionId}: ${errorMessage(err)}`,
        { level: 'error' },
      )
    }

    // If the session was cancelled or rescheduled while we were awaiting,
    // the generation will have changed — bail out to avoid orphaned timers.
    if (generations.get(sessionId) !== gen) {
      logForDebugging(
        `[${label}:token] doRefresh for sessionId=${sessionId} stale (gen ${gen} vs ${generations.get(sessionId)}), skipping`,
      )
      return
    }

    if (!oauthToken) {
      const failures = (failureCounts.get(sessionId) ?? 0) + 1
      failureCounts.set(sessionId, failures)
      logForDebugging(
        `[${label}:token] No OAuth token available for refresh, sessionId=${sessionId} (failure ${failures}/${MAX_REFRESH_FAILURES})`,
        { level: 'error' },
      )
      logForDiagnosticsNoPII('error', 'bridge_token_refresh_no_oauth')
      // Schedule a retry so the refresh chain can recover if the token
      // becomes available again (e.g. transient cache clear during refresh).
      // Cap retries to avoid spamming on genuine failures.
      if (failures < MAX_REFRESH_FAILURES) {
        const retryTimer = setTimeout(
          doRefresh,
          REFRESH_RETRY_DELAY_MS,
          sessionId,
          gen,
        )
        timers.set(sessionId, retryTimer)
      }
      return
    }

    // Reset failure counter on successful token retrieval
    failureCounts.delete(sessionId)

    logForDebugging(<｜end▁of▁sentence｜>需要汉化的内容是:
      `[${label}:令牌] 正在刷新 sessionId=${sessionId} 的令牌...`,
    )
    logEvent('tengu_bridge_token_refreshed', {})
    onRefresh(sessionId, oauthToken)

    // 已安排后续刷新，以便长时间运行的会话保持认证状态。
    // 若不进行此操作，初始一次性定时器将在第一次刷新窗口过后失效，
    // 导致会话因令牌过期而暴露风险。
    const timer = setTimeout(
      doRefresh,
      FALLBACK_REFRESH_INTERVAL_MS,
      sessionId,
      gen,
    )
    timers.set(sessionId, timer)
    logForDebugging(
      `[${label}:令牌] 已为 sessionId=${sessionId} 安排了 ${formatDuration(FALLBACK_REFRESH_INTERVAL_MS)} 的后续刷新`,
    )

  function cancel(sessionId: string): void {
    // 刷新生成代号以取消正在进行的异步 doRefresh 调用。
    nextGeneration(sessionId)
    const timer = timers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      timers.delete(sessionId)
    }
    failureCounts.delete(sessionId)
  }

  function cancelAll(): void {
    // 将所有会话的生成代号刷新一次，以取消正在进行的所有 doRefresh 调用。
    for (const sessionId of generations.keys()) {
      nextGeneration(sessionId)
    }
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    timers.clear()
    failureCounts.clear()
  }

  return { schedule, scheduleFromExpiresIn, cancel, cancelAll }<｜end▁of▁sentence｜>