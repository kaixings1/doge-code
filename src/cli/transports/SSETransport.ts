import axios, { type AxiosError } from 'axios'
import type { StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../../utils/debug.js'
import { logForDiagnosticsNoPII } from '../../utils/diagLogs.js'
import { errorMessage } from '../../utils/errors.js'
import { getSessionIngressAuthHeaders } from '../../utils/sessionIngressAuth.js'
import { sleep } from '../../utils/sleep.js'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js'
import type { Transport } from './Transport.js'

// ============================================================================
// 配置
// ============================================================================

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30_000
/** 放弃前重连尝试的时间预算（10 分钟）。*/
const RECONNECT_GIVE_UP_MS = 600_000
/** 服务器每 15 秒发送保持活动信号；沉默 45 秒后将连接视为死亡。*/
const LIVENESS_TIMEOUT_MS = 45_000

/**
 * 表示永久性服务端拒绝的 HTTP 状态码。
 * 传输层立即转换为 'closed' 状态，不进行重试。
 */
const PERMANENT_HTTP_CODES = new Set([401, 403, 404])

// POST 重试配置（与 HybridTransport 匹配）
const POST_MAX_RETRIES = 10
const POST_BASE_DELAY_MS = 500
const POST_MAX_DELAY_MS = 8000

/** 提升的 TextDecoder 选项，避免 readStream 中每块分配。*/
const STREAM_DECODE_OPTS: TextDecodeOptions = { stream: true }

/** 提升的 axios validateStatus 回调以避免每请求闭包分配。*/
function alwaysValidStatus(): boolean {
  return true
}

// ============================================================================
// SSE 帧解析器
// ============================================================================

type SSEFrame = {
  event?: string
  id?: string
  data?: string
}

/**
 * 从文本缓冲区增量解析 SSE 帧。
 * 返回解析后的帧和剩余的（不完整）缓冲区。
 *
 * @internal 导出用于测试
 */
export function parseSSEFrames(buffer: string): {
  frames: SSEFrame[]
  remaining: string
} {
  const frames: SSEFrame[] = []
  let pos = 0

  // SSE 帧由双换行符分隔
  let idx: number
  while ((idx = buffer.indexOf('\n\n', pos)) !== -1) {
    const rawFrame = buffer.slice(pos, idx)
    pos = idx + 2

    // 跳过空帧
    if (!rawFrame.trim()) continue

    const frame: SSEFrame = {}
    let isComment = false

    for (const line of rawFrame.split('\n')) {
      if (line.startsWith(':')) {
        // SSE 注释（例如 `:keepalive`）
        isComment = true
        continue
      }

      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const field = line.slice(0, colonIdx)
      // 根据 SSE 规范，如果存在则删除冒号后的一个前导空格
      const value =
        line[colonIdx + 1] === ' '
          ? line.slice(colonIdx + 2)
          : line.slice(colonIdx + 1)

      switch (field) {
        case 'event':
          frame.event = value
          break
        case 'id':
          frame.id = value
          break
        case 'data':
          // 根据 SSE 规范，多个 data: 行使用 \n 连接
          frame.data = frame.data ? frame.data + '\n' + value : value
          break
        // 忽略其他字段（retry:等）
      }
    }

    // 仅输出有数据的帧（或重置生命周期的纯注释）
    if (frame.data || isComment) {
      frames.push(frame)
    }
  }

  return { frames, remaining: buffer.slice(pos) }
}

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

type SSETransportState =
  | 'idle'
  | 'connected'
  | 'reconnecting'
  | 'closing'
  | 'closed'

/**
 * `event: client_event` 帧的负载，与 session_stream.proto 中的
 * StreamClientEvent proto 消息匹配。这是唯一发送给工作订阅者的
 * 事件类型 — delivery_update、session_update、ephemeral_event
 * 和 catch_up_truncated 仅限客户端通道（参见 notifier.go 和
 * event_stream.go 中的 SubscriberClient 守卫）。
 */
export type StreamClientEvent = {
  event_id: string
  sequence_num: number
  event_type: string
  source: string
  payload: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// SSETransport
// ---------------------------------------------------------------------------

/**
 * 使用 SSE 进行读取、HTTP POST 进行写入的传输层。
 *
 * 通过 Server-Sent Events 从 CCR v2 事件流端点读取事件。
 * 通过 HTTP POST 写入事件，带有重试逻辑（与 HybridTransport 相同模式）。
 *
 * 每个 `event: client_event` 帧直接在 `data:` 中包含 StreamClientEvent
 * proto JSON。传输层提取 `payload` 并将其作为换行符分隔的 JSON
 * 传递给 `onData`，供 StructuredIO 消费者使用。
 *
 * 支持带指数退避的自动重连和用于断线恢复的 Last-Event-ID。
 */
export class SSETransport implements Transport {
  private state: SSETransportState = 'idle'
  private onData?: (data: string) => void
  private onCloseCallback?: (closeCode?: number) => void
  private onEventCallback?: (event: StreamClientEvent) => void
  private headers: Record<string, string>
  private sessionId?: string
  private refreshHeaders?: () => Record<string, string>
  private readonly getAuthHeaders: () => Record<string, string>

  // SSE 连接状态
  private abortController: AbortController | null = null
  private lastSequenceNum = 0
  private seenSequenceNums = new Set<number>()

  // 重连状态
  private reconnectAttempts = 0
  private reconnectStartTime: number | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  // 活跃度检测
  private livenessTimer: NodeJS.Timeout | null = null

  // POST URL（从 SSE URL 派生）
  private postUrl: string

  // CCR v2 事件格式的运行时纪元

  constructor(
    private readonly url: URL,
    headers: Record<string, string> = {},
    sessionId?: string,
    refreshHeaders?: () => Record<string, string>,
    initialSequenceNum?: number,
    /**
     * 每个实例的身份验证头部来源。省略则读取进程范围的
     * CLAUDE_CODE_SESSION_ACCESS_TOKEN（单会话调用者）。并发多会话调用者
     * 必须提供此参数——环境变量路径是进程全局的，会跨会话冲突。
     */
    getAuthHeaders?: () => Record<string, string>,
  ) {
    this.headers = headers
    this.sessionId = sessionId
    this.refreshHeaders = refreshHeaders
    this.getAuthHeaders = getAuthHeaders ?? getSessionIngressAuthHeaders
    this.postUrl = convertSSEUrlToPostUrl(url)
    // 用调用者提供的高水位标记进行种子处理，以便第一次 connect()
    // 从 from_sequence_num / Last-Event-ID 发送。如果没有这个，新的
    // SSETransport 总是要求服务器从 sequence 0 开始重放 —
    // 每次传输交换时的整个会话历史。
    if (initialSequenceNum !== undefined && initialSequenceNum > 0) {
      this.lastSequenceNum = initialSequenceNum
    }
    logForDebugging(`SSETransport: SSE 地址 = ${url.href}`)
    logForDebugging(`SSETransport: POST 地址 = ${this.postUrl}`)
    logForDiagnosticsNoPII('info', 'cli_sse_transport_initialized')
  }

  /**
   * 此流上看到的高水位序列号。重新创建传输层的调用者
   *（例如 replBridge onWorkReceived）在 close() 之前读取此值，
   * 并将其作为 `initialSequenceNum` 传递给下一个实例，以便
   * 服务器从正确的位置恢复，而不是重放所有内容。
   */
  getLastSequenceNum(): number {
    return this.lastSequenceNum
  }

  async connect(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'reconnecting') {
      logForDebugging(
        `SSETransport: 无法连接，当前状态为 ${this.state}`,
        { level: 'error' },
      )
      logForDiagnosticsNoPII('error', 'cli_sse_connect_failed')
      return
    }

    this.state = 'reconnecting'
    const connectStartTime = Date.now()

    // 构建带有序列号的 SSE URL 用于恢复
    const sseUrl = new URL(this.url.href)
    if (this.lastSequenceNum > 0) {
      sseUrl.searchParams.set('from_sequence_num', String(this.lastSequenceNum))
    }

    // 构建头部 -- 使用新的认证头部（支持 Cookie 作为会话密钥）。
    // 当使用 Cookie 认证时，从这个头部中移除过时的 Authorization，
    // 因为同时发送两者会使认证拦截器困惑。
    const authHeaders = this.getAuthHeaders()
    const headers: Record<string, string> = {
      ...this.headers,
      ...authHeaders,
      Accept: 'text/event-stream',
      'anthropic-version': '2023-06-01',
      'User-Agent': getClaudeCodeUserAgent(),
    }
    if (authHeaders['Cookie']) {
      delete headers['Authorization']
    }
    if (this.lastSequenceNum > 0) {
      headers['Last-Event-ID'] = String(this.lastSequenceNum)
    }

    logForDebugging(`SSETransport: 正在打开 ${sseUrl.href}`)
    logForDiagnosticsNoPII('info', 'cli_sse_connect_opening')

    this.abortController = new AbortController()

    try {
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const response = await fetch(sseUrl.href, {
        headers,
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const isPermanent = PERMANENT_HTTP_CODES.has(response.status)
        logForDebugging(
          `SSETransport: HTTP ${response.status}${isPermanent ? ' (永久)' : ''}`,
          { level: 'error' },
        )
        logForDiagnosticsNoPII('error', 'cli_sse_connect_http_error', {
          status: response.status,
        })

        if (isPermanent) {
          this.state = 'closed'
          this.onCloseCallback?.(response.status)
          return
        }

        this.handleConnectionError()
        return
      }

      if (!response.body) {
        logForDebugging('SSETransport: 无响应体（stream body）')
        this.handleConnectionError()
        return
      }

      // 成功连接
      const connectDuration = Date.now() - connectStartTime
      logForDebugging('SSETransport: 已连接')
      logForDiagnosticsNoPII('info', 'cli_sse_connect_connected', {
        duration_ms: connectDuration,
      })

      this.state = 'connected'
      this.reconnectAttempts = 0
      this.reconnectStartTime = null
      this.resetLivenessTimer()

      // 读取 SSE 流
      await this.readStream(response.body)
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        // 有意关闭
        return
      }

      logForDebugging(
        `SSETransport: 连接错误: ${errorMessage(error)}`,
        { level: 'error' },
      )
      logForDiagnosticsNoPII('error', 'cli_sse_connect_error')
      this.handleConnectionError()
    }
  }

  /**
   * 读取并处理 SSE 流体。
   */
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, STREAM_DECODE_OPTS)
        const { frames, remaining } = parseSSEFrames(buffer)
        buffer = remaining

        for (const frame of frames) {
          // 任何帧（包括 keepalive 注释）都证明连接是活的
          this.resetLivenessTimer()

          if (frame.id) {
            const seqNum = parseInt(frame.id, 10)
            if (!isNaN(seqNum)) {
              if (this.seenSequenceNums.has(seqNum)) {
                logForDebugging(
                  `SSETransport: 重复帧 seq=${seqNum} (lastSequenceNum=${this.lastSequenceNum}, seenCount=${this.seenSequenceNums.size})`,
                  { level: 'warn' },
                )
                logForDiagnosticsNoPII('warn', 'cli_sse_duplicate_sequence')
              } else {
                this.seenSequenceNums.add(seqNum)
                // 防止无界增长：一旦有很多条目，修剪
                // 远低于高水位标记的旧序列号。
                // 只有接近 lastSequenceNum 的序列号对去重有意义。
                if (this.seenSequenceNums.size > 1000) {
                  const threshold = this.lastSequenceNum - 200
                  for (const s of this.seenSequenceNums) {
                    if (s < threshold) {
                      this.seenSequenceNums.delete(s)
                    }
                  }
                }
              }
              if (seqNum > this.lastSequenceNum) {
                this.lastSequenceNum = seqNum
              }
            }
          }

          if (frame.event && frame.data) {
            this.handleSSEFrame(frame.event, frame.data)
          } else if (frame.data) {
            // data: 没有 event: — 服务器正在发送旧的信封格式
            // 或者是一个 bug。记录日志以便故障表现为信号而不是静默丢弃。
            logForDebugging(
              'SSETransport: Frame has data: but no event: field — dropped',
              { level: 'warn' },
            )
            logForDiagnosticsNoPII('warn', 'cli_sse_frame_missing_event_field')
          }
        }
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) return
      logForDebugging(
        `SSETransport: 流读取错误: ${errorMessage(error)}`,
        { level: 'error' },
      )
      logForDiagnosticsNoPII('error', 'cli_sse_stream_read_error')
    } finally {
      reader.releaseLock()
    }

    // 流已结束 — 除非正在关闭，否则重新连接
    if (this.state !== 'closing' && this.state !== 'closed') {
      logForDebugging('SSETransport: 流已结束，正在重新连接')
      this.handleConnectionError()
    }
  }

  /**
   * 处理单个 SSE 帧。event: 字段命名变体；data:
   * 直接携带内部 proto JSON（无信封）。
   *
   * 工作订阅者只接收 client_event 帧（参见 notifier.go）—
   * 任何其他事件类型表示服务端发生了 CC 尚不理解的变化。
   * 记录诊断日志以便在遥测中注意到。
   */
  private handleSSEFrame(eventType: string, data: string): void {
    if (eventType !== 'client_event') {
      logForDebugging(
        `SSETransport: 意外的 SSE 事件类型 '${eventType}'`,
        { level: 'warn' },
      )
      logForDiagnosticsNoPII('warn', 'cli_sse_unexpected_event_type', {
        event_type: eventType,
      })
      return
    }

    let ev: StreamClientEvent
    try {
      ev = jsonParse(data) as StreamClientEvent
    } catch (error) {
      logForDebugging(
        `SSETransport: 解析 client_event 数据失败: ${errorMessage(error)}`,
        { level: 'error' },
      )
      return
    }

    const payload = ev.payload
    if (payload && typeof payload === 'object' && 'type' in payload) {
      const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : ''
      logForDebugging(
        `SSETransport: 事件 seq=${ev.sequence_num} event_id=${ev.event_id} event_type=${ev.event_type} payload_type=${String(payload.type)}${sessionLabel}`,
      )
      logForDiagnosticsNoPII('info', 'cli_sse_message_received')
      // 将解包后的负载作为换行符分隔的 JSON 传递，
      // 匹配 StructuredIO/WebSocketTransport 消费者期望的格式
      this.onData?.(jsonStringify(payload) + '\n')
    } else {
      logForDebugging(
        `SSETransport: 忽略负载中无类型的 client_event: event_id=${ev.event_id}`,
      )
    }

    this.onEventCallback?.(ev)
  }

  /**
   * 使用指数退避和时间预算处理连接错误。
   */
  private handleConnectionError(): void {
    this.clearLivenessTimer()

    if (this.state === 'closing' || this.state === 'closed') return

    // 中止任何正在进行的 SSE 获取
    this.abortController?.abort()
    this.abortController = null

    const now = Date.now()
    if (!this.reconnectStartTime) {
      this.reconnectStartTime = now
    }

    const elapsed = now - this.reconnectStartTime
    if (elapsed < RECONNECT_GIVE_UP_MS) {
      // 清除任何现有计时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }

      // 重新连接前刷新头部
      if (this.refreshHeaders) {
        const freshHeaders = this.refreshHeaders()
        Object.assign(this.headers, freshHeaders)
        logForDebugging('SSETransport: Refreshed headers for reconnect')
      }

      this.state = 'reconnecting'
      this.reconnectAttempts++

      const baseDelay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
        RECONNECT_MAX_DELAY_MS,
      )
      // 添加 ±25% 抖动
      const delay = Math.max(
        0,
        baseDelay + baseDelay * 0.25 * (2 * Math.random() - 1),
      )

      logForDebugging(
        `SSETransport: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}, ${Math.round(elapsed / 1000)}s elapsed)`,
      )
      logForDiagnosticsNoPII('error', 'cli_sse_reconnect_attempt', {
        reconnectAttempts: this.reconnectAttempts,
      })

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        void this.connect()
      }, delay)
    } else {
      logForDebugging(
        `SSETransport: Reconnection time budget exhausted after ${Math.round(elapsed / 1000)}s`,
        { level: 'error' },
      )
      logForDiagnosticsNoPII('error', 'cli_sse_reconnect_exhausted', {
        reconnectAttempts: this.reconnectAttempts,
        elapsedMs: elapsed,
      })
      this.state = 'closed'
      this.onCloseCallback?.()
    }
  }

  /**
   * 绑定的超时回调。从内联闭包提升而来，以便
   * resetLivenessTimer（每帧调用）不会在每个 SSE 帧上
   * 分配新的闭包。
   */
  private readonly onLivenessTimeout = (): void => {
    this.livenessTimer = null
    logForDebugging('SSETransport: 活跃性超时，正在重新连接', {
      level: 'error',
    })
    logForDiagnosticsNoPII('error', 'cli_sse_liveness_timeout')
    this.abortController?.abort()
    this.handleConnectionError()
  }

  /**
   * 重置活跃度计时器。如果在超时内没有 SSE 帧到达，
   * 则将连接视为死亡并重新连接。
   */
  private resetLivenessTimer(): void {
    this.clearLivenessTimer()
    this.livenessTimer = setTimeout(this.onLivenessTimeout, LIVENESS_TIMEOUT_MS)
  }

  private clearLivenessTimer(): void {
    if (this.livenessTimer) {
      clearTimeout(this.livenessTimer)
      this.livenessTimer = null
    }
  }

  // -----------------------------------------------------------------------
  // 写入（HTTP POST）—— 与 HybridTransport 相同模式
  // -----------------------------------------------------------------------

  async write(message: StdoutMessage): Promise<void> {
    const authHeaders = this.getAuthHeaders()
    if (Object.keys(authHeaders).length === 0) {
      logForDebugging('SSETransport: No session token available for POST')
      logForDiagnosticsNoPII('warn', 'cli_sse_post_no_token')
      return
    }

    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'User-Agent': getClaudeCodeUserAgent(),
    }

    logForDebugging(
      `SSETransport: POST body keys=${Object.keys(message as Record<string, unknown>).join(',')}`,
    )

    for (let attempt = 1; attempt <= POST_MAX_RETRIES; attempt++) {
      try {
        const response = await axios.post(this.postUrl, message, {
          headers,
          validateStatus: alwaysValidStatus,
        })

        if (response.status === 200 || response.status === 201) {
          logForDebugging(`SSETransport: POST 成功 type=${message.type}`)
          return
        }

        logForDebugging(
          `SSETransport: POST ${response.status} body=${jsonStringify(response.data).slice(0, 200)}`,
        )
        // 4xx 错误（429 除外）是永久性的 — 不重试
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          logForDebugging(
            `SSETransport: POST 返回 ${response.status} (客户端错误)，不重试`,
          )
          logForDiagnosticsNoPII('warn', 'cli_sse_post_client_error', {
            status: response.status,
          })
          return
        }

        // 429 或 5xx — 重试
        logForDebugging(
          `SSETransport: POST 返回 ${response.status}，第 ${attempt}/${POST_MAX_RETRIES} 次尝试`,
        )
        logForDiagnosticsNoPII('warn', 'cli_sse_post_retryable_error', {
          status: response.status,
          attempt,
        })
      } catch (error) {
        const axiosError = error as AxiosError
        logForDebugging(
          `SSETransport: POST 错误: ${axiosError.message}，第 ${attempt}/${POST_MAX_RETRIES} 次尝试`,
        )
        logForDiagnosticsNoPII('warn', 'cli_sse_post_network_error', {
          attempt,
        })
      }

      if (attempt === POST_MAX_RETRIES) {
        logForDebugging(
          `SSETransport: POST 在 ${POST_MAX_RETRIES} 次尝试后失败，继续`,
        )
        logForDiagnosticsNoPII('warn', 'cli_sse_post_retries_exhausted')
        return
      }

      const delayMs = Math.min(
        POST_BASE_DELAY_MS * Math.pow(2, attempt - 1),
        POST_MAX_DELAY_MS,
      )
      await sleep(delayMs)
    }
  }

  // -----------------------------------------------------------------------
  // 传输接口
  // -----------------------------------------------------------------------

  isConnectedStatus(): boolean {
    return this.state === 'connected'
  }

  isClosedStatus(): boolean {
    return this.state === 'closed'
  }

  setOnData(callback: (data: string) => void): void {
    this.onData = callback
  }

  setOnClose(callback: (closeCode?: number) => void): void {
    this.onCloseCallback = callback
  }

  setOnEvent(callback: (event: StreamClientEvent) => void): void {
    this.onEventCallback = callback
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.clearLivenessTimer()

    this.state = 'closing'
    this.abortController?.abort()
    this.abortController = null
  }
}

// ---------------------------------------------------------------------------
// URL 转换
// ---------------------------------------------------------------------------

/**
 * 将 SSE URL 转换为 HTTP POST 端点 URL。
 * SSE 流 URL 和 POST URL 共享相同的基础；POST 端点在
 * `/events`（不带 `/stream`）。
 *
 * 从: https://api.example.com/v2/session_ingress/session/<session_id>/events/stream
 * 到:   https://api.example.com/v2/session_ingress/session/<session_id>/events
 */
function convertSSEUrlToPostUrl(sseUrl: URL): string {
  let pathname = sseUrl.pathname
  // 删除 /stream 后缀以获取 POST events 端点
  if (pathname.endsWith('/stream')) {
    pathname = pathname.slice(0, -'/stream'.length)
  }
  return `${sseUrl.protocol}//${sseUrl.host}${pathname}`
}
