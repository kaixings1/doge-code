import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from '../utils/debug.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { errorMessage } from '../utils/errors.js'
import { jsonParse } from '../utils/slowOperations.js'

/** 将毫秒持续时间格式化为人类可读字符串（例如 "5m 30s"）。 */
function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/**
 * 解码 JWT 的有效载荷段，不验证签名。
 * 如果存在，去除 `sk-ant-si-` 会话入口前缀。
 * 返回解析后的 JSON 有效载荷为 `unknown`，如果令牌格式错误
 * 或有效载荷不是有效 JSON，返回 `null`。
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
 * 从 JWT 中解码 `exp`（过期）声明，不验证签名。
 * @returns `exp` 值（Unix 秒），如果无法解析则返回 `null`
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

/** 刷新缓冲：在过期前请求新令牌。 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** 新令牌过期时间未知时的回退刷新间隔。 */
const FALLBACK_REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

/** 放弃刷新链前的最大连续失败次数。 */
const MAX_REFRESH_FAILURES = 3

/** 当 getAccessToken 返回 undefined 时的重试延迟。 */
const REFRESH_RETRY_DELAY_MS = 60_000

/**
 * 创建令牌刷新调度器，主动在会话令牌过期前刷新它们。
 * 由独立桥接器和 REPL 桥接器共同使用。
 *
 * 当令牌即将过期时，调度器使用会话 ID 和桥接器的 OAuth 访问令牌调用 `onRefresh`。
 * 调用者负责将令牌传递到适当的传输层（独立桥接器的子进程 stdin、
 * REPL 桥接器的 WebSocket 重连）。
 */
export function createTokenRefreshScheduler({
  getAccessToken,
  onRefresh,
  label,
  refreshBufferMs = TOKEN_REFRESH_BUFFER_MS,
}: {
  getAccessToken: () => string | undefined | Promise<string | undefined>
  onRefresh: (sessionId: string, oauthToken: string) => void
  label: string
  /** 过期前多久触发刷新。默认为 5 分钟。 */
  refreshBufferMs?: number
}): {
  schedule: (sessionId: string, token: string) => void
  scheduleFromExpiresIn: (sessionId: string, expiresInSeconds: number) => void
  cancel: (sessionId: string) => void
  cancelAll: () => void
} {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const failureCounts = new Map<string, number>()
  // 每个会话的生成号计数器 — 由 schedule() 和 cancel() 递增，
  // 以便进行中的异步 doRefresh() 调用可以检测到它们已被
  // 取代，并应跳过设置后续定时器。
  const generations = new Map<string, number>()

  function nextGeneration(sessionId: string): number {
    const gen = (generations.get(sessionId) ?? 0) + 1
    generations.set(sessionId, gen)
    return gen
  }

  function schedule(sessionId: string, token: string): void {
    const expiry = decodeJwtExpiry(token)
    if (!expiry) {
      // 令牌不是可解码的 JWT（例如从 REPL 桥接器 WebSocket 打开处理器
      // 传递的 OAuth 令牌）。保留任何现有定时器
      //（例如 doRefresh 设置的后续刷新），以便刷新
      // 链不被中断。
      logForDebugging(
        `[${label}:token] Could not decode JWT expiry for sessionId=${sessionId}, token prefix=${token.slice(0, 15)}…, keeping existing timer`,
      )
      return
    }

    // 清除任何现有刷新定时器 — 我们有一个具体的过期时间来替换它。
    const existing = timers.get(sessionId)
    if (existing) {
      clearTimeout(existing)
    }

    // 递增生成号以使任何进行中的异步 doRefresh 失效。
    const gen = nextGeneration(sessionId)

    const expiryDate = new Date(expiry * 1000).toISOString()
    const delayMs = expiry * 1000 - Date.now() - refreshBufferMs
    if (delayMs <= 0) {
      logForDebugging(
        `[${label}:token] Token for sessionId=${sessionId} expires=${expiryDate} (past or within buffer), refreshing immediately`,
      )
      void doRefresh(sessionId, gen)
      return
    }

    logForDebugging(
      `[${label}:token] Scheduled token refresh for sessionId=${sessionId} in ${formatDuration(delayMs)} (expires=${expiryDate}, buffer=${refreshBufferMs / 1000}s)`,
    )

    const timer = setTimeout(doRefresh, delayMs, sessionId, gen)
    timers.set(sessionId, timer)
  }

  /**
   * 使用显式 TTL（到期前的秒数）调度刷新，而非解码 JWT 的 exp 声明。
   * 由 JWT 不透明的调用者使用
   *（例如 POST /v1/code/sessions/{id}/bridge 直接返回 expires_in）。
   */
  function scheduleFromExpiresIn(
    sessionId: string,
    expiresInSeconds: number,
  ): void {
    const existing = timers.get(sessionId)
    if (existing) clearTimeout(existing)
    const gen = nextGeneration(sessionId)
    // 钳制到 30 秒下限 — 如果 refreshBufferMs 超过服务器的 expires_in
    //（例如为频繁刷新测试设置非常大的缓冲，或服务器意外缩短了
    // expires_in），未钳制的 delayMs ≤ 0 会导致紧密循环。
    const delayMs = Math.max(expiresInSeconds * 1000 - refreshBufferMs, 30_000)
    logForDebugging(
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

    // 如果会话在我们等待期间被取消或重新调度，
    // 生成号将会改变 — 退出以避免孤立定时器。
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
      // 调度重试，以便在令牌重新可用时刷新链可以恢复
      //（例如刷新期间瞬时缓存清除）。
      // 限制重试次数以避免在真正失败时反复重试。
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

    // 成功获取令牌时重置失败计数器
    failureCounts.delete(sessionId)

    logForDebugging(
      `[${label}:token] Refreshing token for sessionId=${sessionId}: new token prefix=${oauthToken.slice(0, 15)}…`,
    )
    logEvent('tengu_bridge_token_refreshed', {})
    onRefresh(sessionId, oauthToken)

    // 调度后续刷新，以便长时间运行的会话保持认证状态。
    // 没有这个，初始一次性定时器会使会话在运行超过
    // 第一个刷新窗口时容易因令牌过期而中断。
    const timer = setTimeout(
      doRefresh,
      FALLBACK_REFRESH_INTERVAL_MS,
      sessionId,
      gen,
    )
    timers.set(sessionId, timer)
    logForDebugging(
      `[${label}:token] Scheduled follow-up refresh for sessionId=${sessionId} in ${formatDuration(FALLBACK_REFRESH_INTERVAL_MS)}`,
    )
  }

  function cancel(sessionId: string): void {
    // 递增生成号以使任何进行中的异步 doRefresh 失效。
    nextGeneration(sessionId)
    const timer = timers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      timers.delete(sessionId)
    }
    failureCounts.delete(sessionId)
  }

  function cancelAll(): void {
    // 递增所有生成号，使进行中的 doRefresh 调用失效。
    for (const sessionId of generations.keys()) {
      nextGeneration(sessionId)
    }
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    timers.clear()
    failureCounts.clear()
  }

  return { schedule, scheduleFromExpiresIn, cancel, cancelAll }
}
