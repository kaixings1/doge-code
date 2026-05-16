import type { StdoutMessage } from '../entrypoints/sdk/controlTypes.js'
import { PassThrough } from 'stream'
import { URL } from 'url'
import { getSessionId } from '../bootstrap/state.js'
import { getPollIntervalConfig } from '../bridge/pollConfig.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { setCommandLifecycleListener } from '../utils/commandLifecycle.js'
import { isDebugMode, logForDebugging } from '../utils/debug.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { errorMessage } from '../utils/errors.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import { logError } from '../utils/log.js'
import { writeToStdout } from '../utils/process.js'
import { getSessionIngressAuthToken } from '../utils/sessionIngressAuth.js'
import {
  setSessionMetadataChangedListener,
  setSessionStateChangedListener,
} from '../utils/sessionState.js'
import {
  setInternalEventReader,
  setInternalEventWriter,
} from '../utils/sessionStorage.js'
import { ndjsonSafeStringify } from './ndjsonSafeStringify.js'
import { StructuredIO } from './structuredIO.js'
import { CCRClient, CCRInitError } from './transports/ccrClient.js'
import { SSETransport } from './transports/SSETransport.js'
import type { Transport } from './transports/Transport.js'
import { getTransportForUrl } from './transports/transportUtils.js'

/**
 * 支持会话跟踪的 SDK 模式双向流
 * 支持 WebSocket 传输
 */
export class RemoteIO extends StructuredIO {
  private url: URL
  private transport: Transport
  private inputStream: PassThrough
  private readonly isBridge: boolean = false
  private readonly isDebug: boolean = false
  private ccrClient: CCRClient | null = null
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    streamUrl: string,
    initialPrompt?: AsyncIterable<string>,
    replayUserMessages?: boolean,
  ) {
    const inputStream = new PassThrough({ encoding: 'utf8' })
    super(inputStream, replayUserMessages)
    this.inputStream = inputStream
    this.url = new URL(streamUrl)

    // 准备带会话头的头部，如果可用
    const headers: Record<string, string> = {}
    const sessionToken = getSessionIngressAuthToken()
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
    } else {
      logForDebugging('[remote-io] 无可用的会话入口令牌', {
        level: 'error',
      })
    }

    // 添加环境运行程序版本（如果可用，由环境管理器设置）
    const erVersion = process.env.CLAUDE_CODE_ENVIRONMENT_RUNNER_VERSION
    if (erVersion) {
      headers['x-environment-runner-version'] = erVersion
    }

    // 提供一个回调来动态重新读取会话令牌。
    // 当父进程刷新令牌时（通过令牌文件或环境变量），
    // 传输可以在重新连接时获取它。
    const refreshHeaders = (): Record<string, string> => {
      const h: Record<string, string> = {}
      const freshToken = getSessionIngressAuthToken()
      if (freshToken) {
        h['Authorization'] = `Bearer ${freshToken}`
      }
      const freshErVersion = process.env.CLAUDE_CODE_ENVIRONMENT_RUNNER_VERSION
      if (freshErVersion) {
        h['x-environment-runner-version'] = freshErVersion
      }
      return h
    }

    // 根据 URL 协议获取适当的传输
    this.transport = getTransportForUrl(
      this.url,
      headers,
      getSessionId(),
      refreshHeaders,
    )

    // 设置数据回调
    this.isBridge = process.env.CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge'
    this.isDebug = isDebugMode()
    this.transport.setOnData((data: string) => {
      this.inputStream.write(data)
      if (this.isBridge && this.isDebug) {
        writeToStdout(data.endsWith('\n') ? data : data + '\n')
      }
    })

    // 设置关闭回调以处理连接失败
    this.transport.setOnClose(() => {
      // 结束输入流以触发优雅关闭
      this.inputStream.end()
    })

    // 初始化 CCR v2 客户端（心跳、纪元、状态报告、事件写入）。
    // CCRClient 构造函数同步连接 SSE received-ack 处理程序
    //，因此新的 CCRClient() 必须在 transport.connect() 之前运行 —
    // 否则早期的 SSE 帧会命中未连接的 onEventCallback，它们的
    // 'received' 交付确认会被静默丢弃。
    if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
      // CCR v2 按定义是 SSE+POST。getTransportForUrl 返回
      // SSETransport 在相同的环境变量下，但这两个检查位于
      // 不同的文件 — 断言不变式以便未来的解耦
      // 在这里大声失败，而不是在 CCRClient 中令人困惑地失败。
      if (!(this.transport instanceof SSETransport)) {
        throw new Error(
          'CCR v2 需要 SSETransport; 检查 getTransportForUrl',
        )
      }
      this.ccrClient = new CCRClient(this.transport, this.url)
      const init = this.ccrClient.initialize()
      this.restoredWorkerState = init.catch(() => null)
      init.catch((error: unknown) => {
        logForDiagnosticsNoPII('error', 'cli_worker_lifecycle_init_failed', {
          reason: error instanceof CCRInitError ? error.reason : 'unknown',
        })
        logError(
          new Error(`CCRClient 初始化失败: ${errorMessage(error)}`),
        )
        void gracefulShutdown(1, 'other')
      })
      registerCleanup(async () => this.ccrClient?.close())

      // 注册内部事件写入器用于转录持久化。
      // 设置时，sessionStorage 将转录消息写为 CCR v2
      // 内部事件而不是 v1 会话入口。
      setInternalEventWriter((eventType, payload, options) =>
        this.ccrClient!.writeInternalEvent(eventType, payload, options),
      )

      // 注册内部事件读取器用于会话恢复。
      // 设置时，hydrateFromCCRv2InternalEvents() 可以获取前台
      // 和子代理内部事件以重建对话状态。
      setInternalEventReader(
        () => this.ccrClient!.readInternalEvents(),
        () => this.ccrClient!.readSubagentInternalEvents(),
      )

      const LIFECYCLE_TO_DELIVERY = {
        started: 'processing',
        completed: 'processed',
      } as const
      setCommandLifecycleListener((uuid, state) => {
        this.ccrClient?.reportDelivery(uuid, LIFECYCLE_TO_DELIVERY[state])
      })
      setSessionStateChangedListener((state, details) => {
        this.ccrClient?.reportState(state, details)
      })
      setSessionMetadataChangedListener(metadata => {
        this.ccrClient?.reportMetadata(metadata)
      })
    }

    // 仅在所有回调都连接后才开始连接（上面的 setOnData，
    // CCR v2 启用时在 new CCRClient() 内部的 setOnEvent）。
    void this.transport.connect()

    // 在固定间隔推送静默 keep_alive 帧，以便上游
    // 代理和会话入口层不会 GC 一个空闲的
    // 远程会控制会话。keep_alive 类型在到达任何客户端 UI 之前被过滤
    //（Query.ts 丢弃它；structuredIO.ts 丢弃它；
    // web/iOS/Android 在消息循环中永远看不到它）。间隔来自
    // GrowthBook（tengu_bridge_poll_interval_config
    // session_keepalive_interval_v2_ms，默认 120 秒）；0 = 禁用。
    // 仅桥接器：修复 bridge-topology 会话的 Envoy 空闲超时
    //（#21931）。byoc worker 在#21931 之前运行而没有这个，不需要
    // 它 — 不同的网络路径。
    const keepAliveIntervalMs =
      getPollIntervalConfig().session_keepalive_interval_v2_ms
    if (this.isBridge && keepAliveIntervalMs > 0) {
      this.keepAliveTimer = setInterval(() => {
        logForDebugging('[remote-io] keep_alive sent')
        void this.write({ type: 'keep_alive' }).catch(err => {
          logForDebugging(
            `[remote-io] keep_alive write failed: ${errorMessage(err)}`,
          )
        })
      }, keepAliveIntervalMs)
      this.keepAliveTimer.unref?.()
    }

    // 注册优雅关闭清理
    registerCleanup(async () => this.close())

    // 如果提供初始提示，通过输入流发送
    if (initialPrompt) {
      // 将初始提示转换为输入流格式。
      // stdin 的数据块可能已经包含尾部换行符，因此在追加我们自己的
      // 换行符之前将其去除，以避免出现双换行符导致 structuredIO
      // 解析出空行的问题。String() 可以同时处理来自 process.stdin 的
      // 字符串块和 Buffer 对象。
      const stream = this.inputStream
      void (async () => {
        for await (const chunk of initialPrompt) {
          stream.write(String(chunk).replace(/\n$/, '') + '\n')
        }
      })()
    }
  }

  override flushInternalEvents(): Promise<void> {
    return this.ccrClient?.flushInternalEvents() ?? Promise.resolve()
  }

  override get internalEventsPending(): number {
    return this.ccrClient?.internalEventsPending ?? 0
  }

  /**
   * 将输出发送到传输层。
   * 在桥接模式下，control_request 消息始终回显到 stdout，
   * 以便桥接父进程可以检测权限请求。
   * 其他消息仅在调试模式下回显。
   */
  async write(message: StdoutMessage): Promise<void> {
    if (this.ccrClient) {
      await this.ccrClient.writeEvent(message)
    } else {
      await this.transport.write(message)
    }
    if (this.isBridge) {
      if (message.type === 'control_request' || this.isDebug) {
        writeToStdout(ndjsonSafeStringify(message) + '\n')
      }
    }
  }

  /**
   * 优雅地清理连接
   */
  close(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
    this.transport.close()
    this.inputStream.end()
  }
}
