import axios, { type AxiosError } from 'axios'
import type { StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../../utils/debug.js'
import { logForDiagnosticsNoPII } from '../../utils/diagLogs.js'
import { getSessionIngressAuthToken } from '../../utils/sessionIngressAuth.js'
import { SerialBatchEventUploader } from './SerialBatchEventUploader.js'
import {
  WebSocketTransport,
  type WebSocketTransportOptions,
} from './WebSocketTransport.js'

const BATCH_FLUSH_INTERVAL_MS = 100
// 单次 POST 尝试的超时时间。限制单个卡住的 POST 阻塞序列化队列的时间。
// 如果没有这个限制，挂起的连接会阻塞所有后续写入。
const POST_TIMEOUT_MS = 15_000
// close() 时队列中等待写入的宽限期。涵盖正常的 POST (~100ms)
// 加上余量；尽力而为，在网络降级情况下不保证交付。
// 已设为 void（没有任何东西等待它）所以这是最后手段 —— replBridge  teardown
// 现在在归档之后关闭，所以归档延迟是主要的排空窗口。
// 注意：gracefulShutdown 的清理预算是 2s（而不是外部 5s 的故障保险）；
// 这里的 3s 超过了它，但进程会多存活 ~2s 用于钩子和分析。
const CLOSE_GRACE_MS = 3000

// ============================================================================
// 混合传输：WebSocket 用于读取，HTTP POST 用于写入
// ============================================================================
/**
 * 混合传输：WebSocket 用于读取，HTTP POST 用于写入。
 *
 * 写入流程：
 *
 *   write(stream_event) ─┐
 *                        │ (100ms 定时器)
 *                        │
 *                        ▼
 *   write(other) ────► uploader.enqueue()  (SerialBatchEventUploader)
 *                        ▲    │
 *   writeBatch() ────────┘    │ 序列化、批量、无限重试、
 *                             │ 在 maxQueueSize 处背压
 *                             ▼
 *                        postOnce()  (单次 HTTP POST，在可重试失败时抛出)
 *
 * stream_event 消息在入队前会在 streamEventBuffer 中累积最多 100ms
 * （减少高容量内容增量的 POST 次数）。非流式写入会先刷新任何缓冲的 stream_events
 * 以保持顺序。
 *
 * 序列化 + 重试 + 背压委托给 SerialBatchEventUploader
 * （与 CCR 使用的相同原语）。最多只有一个 POST 在进行中；
 * 在 POST 期间到达的事件会批量进入下一个批次。失败时，上传器重新入队并使用
 * 指数退避 + 抖动重试。如果队列填充超过 maxQueueSize，
 * enqueue() 会阻塞 —— 给等待的调用者施加背压。
 *
 * 为什么要序列化？桥接模式通过 `void transport.write()` 触发写入
 * （fire-and-forget）。没有这个机制，并发 POST → 并发 Firestore
 * 写入同一文档 → 冲突 → 重试风暴 → 唤醒值班人员。
 */
export class HybridTransport extends WebSocketTransport {
  private postUrl: string
  private uploader: SerialBatchEventUploader<StdoutMessage>

  // stream_event 延迟缓冲区 —— 在入队前累积内容增量最多
  // BATCH_FLUSH_INTERVAL_MS 毫秒（减少 POST 次数）
  private streamEventBuffer: StdoutMessage[] = []
  private streamEventTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    url: URL,
    headers: Record<string, string> = {},
    sessionId?: string,
    refreshHeaders?: () => Record<string, string>,
    options?: WebSocketTransportOptions & {
      maxConsecutiveFailures?: number
      onBatchDropped?: (batchSize: number, failures: number) => void
    },
  ) {
    super(url, headers, sessionId, refreshHeaders, options)
    const { maxConsecutiveFailures, onBatchDropped } = options ?? {}
    this.postUrl = convertWsUrlToPostUrl(url)
    this.uploader = new SerialBatchEventUploader<StdoutMessage>({
      // 较大的上限 —— session-ingress 接受任意批量大小。事件
      // 在进行中的 POST 期间自然批量处理；这只是限制载荷大小。
      maxBatchSize: 500,
      // 桥接调用者使用 `void transport.write()` —— 背压
      // 不适用（他们不等待）。批量 >maxQueueSize 会死锁（参见
      // SerialBatchEventUploader 背压检查）。所以将它设置得足够高，
      // 仅作为内存限制。在后续版本中实现真正的背压，
      // 一旦调用者等待。
      maxQueueSize: 100_000,
      baseDelayMs: 500,
      maxDelayMs: 8000,
      jitterMs: 1000,
      // 可选的上限，以便持续失败的服务器不会在进程生命周期内
      // 一直占用排空循环。Undefined = 无限重试。
      // replBridge 设置这个；1P transportUtils 路径不设置。
      maxConsecutiveFailures,
      onBatchDropped: (batchSize, failures) => {
        logForDiagnosticsNoPII(
          'error',
          'cli_hybrid_batch_dropped_max_failures',
          {
            batchSize,
            failures,
          },
        )
        onBatchDropped?.(batchSize, failures)
      },
      send: batch => this.postOnce(batch),
    })
    logForDebugging(`HybridTransport: POST URL = ${this.postUrl}`)
    logForDiagnosticsNoPII('info', 'cli_hybrid_transport_initialized')
  }

  /**
   * 入队消息并等待队列排空。返回 flush()
   * 保留了 `await write()` 在事件被
   * POST 后解析的约定（测试和 replBridge 的初始刷新依赖于此）。
   * Fire-and-forget 调用者（`void transport.write()`）不受影响 —— 他们不等待，
   * 所以后面的解析不会增加延迟。
   */
  override async write(message: StdoutMessage): Promise<void> {
    if (message.type === 'stream_event') {
      // 延迟：入队前短暂累积 stream_events。
      // Promise 立即解析 —— 调用者不等待 stream_events。
      this.streamEventBuffer.push(message)
      if (!this.streamEventTimer) {
        this.streamEventTimer = setTimeout(
          () => this.flushStreamEvents(),
          BATCH_FLUSH_INTERVAL_MS,
        )
      }
      return
    }
    // 立即：刷新任何缓冲的 stream_events（保持顺序），然后处理此事件。
    await this.uploader.enqueue([...this.takeStreamEvents(), message])
    return this.uploader.flush()
  }

  async writeBatch(messages: StdoutMessage[]): Promise<void> {
    await this.uploader.enqueue([...this.takeStreamEvents(), ...messages])
    return this.uploader.flush()
  }

  /** 在 writeBatch() 之前/之后快照，以检测静默丢弃。 */
  get droppedBatchCount(): number {
    return this.uploader.droppedBatchCount
  }

  /**
   * 阻塞直到所有待处理事件都被 POST。由桥接的初始
   * 历史刷新使用，以便 onStateChange('connected') 在持久化后触发。
   */
  flush(): Promise<void> {
    void this.uploader.enqueue(this.takeStreamEvents())
    return this.uploader.flush()
  }

  /** 获取缓冲的 stream_events 的所有权并清除延迟定时器。 */
  private takeStreamEvents(): StdoutMessage[] {
    if (this.streamEventTimer) {
      clearTimeout(this.streamEventTimer)
      this.streamEventTimer = null
    }
    const buffered = this.streamEventBuffer
    this.streamEventBuffer = []
    return buffered
  }

  /** 延迟定时器触发 —— 入队累积的 stream_events。 */
  private flushStreamEvents(): void {
    this.streamEventTimer = null
    void this.uploader.enqueue(this.takeStreamEvents())
  }

  override close(): void {
    if (this.streamEventTimer) {
      clearTimeout(this.streamEventTimer)
      this.streamEventTimer = null
    }
    this.streamEventBuffer = []
    // 队列中等待写入的宽限期 —— 后备方案。replBridge  teardown 现在
    // 在写入和关闭之间等待归档（参见 CLOSE_GRACE_MS），所以
    // 归档延迟是主要的排空窗口，这是最后手段。
    // 保持 close() 同步（立即返回）但延迟
    // uploader.close() 以便剩余队列有机会完成。
    const uploader = this.uploader
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    void Promise.race([
      uploader.flush(),
      new Promise<void>(r => {

        graceTimer = setTimeout(r, CLOSE_GRACE_MS)
      }),
    ]).finally(() => {
      clearTimeout(graceTimer)
      uploader.close()
    })
    super.close()
  }

  /**
   * 单次尝试 POST。在可重试失败时抛出（429、5xx、网络错误）
   * 以便 SerialBatchEventUploader 重新入队并重试。成功时返回，
   * 永久失败时（4xx 非 429、无令牌）也返回，以便上传器继续。
   */
  private async postOnce(events: StdoutMessage[]): Promise<void> {
    const sessionToken = getSessionIngressAuthToken()
    if (!sessionToken) {
      logForDebugging('HybridTransport: 没有可用于 POST 的会话令牌')
      logForDiagnosticsNoPII('warn', 'cli_hybrid_post_no_token')
      return
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    }

    let response
    try {
      response = await axios.post(
        this.postUrl,
        { events },
        {
          headers,
          validateStatus: () => true,
          timeout: POST_TIMEOUT_MS,
        },
      )
    } catch (error) {
      const axiosError = error as AxiosError
      logForDebugging(`HybridTransport: POST 错误: ${axiosError.message}`)
      logForDiagnosticsNoPII('warn', 'cli_hybrid_post_network_error')
      throw error
    }

    if (response.status >= 200 && response.status < 300) {
      logForDebugging(`HybridTransport: POST 成功 count=${events.length}`)
      return
    }

    // 4xx（除了 429）是永久性的 —— 丢弃，不重试。
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      logForDebugging(
        `HybridTransport: POST 返回 ${response.status} (永久)，正在丢弃`,
      )
      logForDiagnosticsNoPII('warn', 'cli_hybrid_post_client_error', {
        status: response.status,
      })
      return
    }

    // 429 / 5xx —— 可重试。抛出以便上传器重新入队并退避。
    logForDebugging(
      `HybridTransport: POST 返回 ${response.status} (可重试)`,
    )
    logForDiagnosticsNoPII('warn', 'cli_hybrid_post_retryable_error', {
      status: response.status,
    })
    throw new Error(`POST 失败，状态码 ${response.status}`)
  }
}

/**
 * 将 WebSocket URL 转换为 HTTP POST 端点 URL。
 * 从：wss://api.example.com/v2/session_ingress/ws/<session_id>
 * 到：https://api.example.com/v2/session_ingress/session/<session_id>/events
 */
function convertWsUrlToPostUrl(wsUrl: URL): string {
  const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:'

  // 将 /ws/ 替换为 /session/ 并追加 /events
  let pathname = wsUrl.pathname
  pathname = pathname.replace('/ws/', '/session/')
  if (!pathname.endsWith('/events')) {
    pathname = pathname.endsWith('/')
      ? pathname + 'events'
      : pathname + '/events'
  }

  return `${protocol}//${wsUrl.host}${pathname}${wsUrl.search}`
}
