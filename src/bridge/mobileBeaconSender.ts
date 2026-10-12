import dgram from 'dgram'
import { logForDebugging } from '../utils/debug.js'
import {
  BEACON_GROUP,
  BEACON_INTERVAL_MS,
  BEACON_PORT,
  buildBeaconPayload,
  serializeBeacon,
} from './mobileBeacon.js'

/**
 * 广播发送器：定期把本会话信息通过 UDP 多播发给局域网。
 *
 * ## 设计要点
 *
 * 1. **尽力而为，绝不影响主流程**：广播发不出去（网卡不存在、
 *    权限不足、路由器拒绝）只是「手机发现得慢些」，不该让 CLI 报错
 *    或退出。所有网络操作都包了 try/catch。
 * 2. **只发不回收**：不需要接收响应 —— 需要回传信息时手机走 HTTP。
 *    这保持广播单向、无状态，不会因对方不响应而卡住。
 * 3. **间隔 3 秒**：手机端的「广播新鲜度」判据按 10 秒算，
 *    3 秒间隔能容忍丢 2-3 个包仍算在线。
 */
export class MobileBeaconSender {
  private socket: dgram.Socket | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  /** 取当前会话信息的回调（每次广播时调用，保证发的是最新值）。 */
  private readonly infoProvider: () => {
    sessionId: string
    resumeSessionId?: string | null
    port: number
    cwd: string
    label: string
    interactive: boolean
    clients: number
  }

  constructor(infoProvider: MobileBeaconSender['infoProvider']) {
    this.infoProvider = infoProvider
  }

  /**
   * 开始广播。
   *
   * 重复调用安全（已在跑时直接返回）。
   */
  start(): void {
    if (this.socket) return
    try {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      // 必须先绑 error 监听：否则任何发送错误都会变成
      // unhandled 'error' 事件直接终止进程
      socket.on('error', (e: unknown) => {
        logForDebugging(
          `[mobile-beacon] 广播 socket 错误（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
        )
        // 出错后停止，避免持续刷日志；下次 start() 会重建
        this.stop()
      })

      // 绑定到 0.0.0.0 的临时端口：只发不收，不必占用固定端口
      socket.bind(() => {
        try {
          // setMulticastTTL(1)：限制在同一子网内。
          // 设更大值会让广播穿到其他网段，既无意义又可能打扰别人
          socket.setMulticastTTL(1)
          // 关掉组播回环：本机也监听时不必收到自己的广播
          // （手机不在本机，故只影响本机其它实例，无害但多余）
          socket.setMulticastLoopback(false)
        } catch (e) {
          logForDebugging(
            `[mobile-beacon] 设置组播参数失败（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
        this.sendOnce()
        this.timer = setInterval(() => this.sendOnce(), BEACON_INTERVAL_MS)
        // timer 不阻止进程退出（CLI 可能在广播还在跑时退出）
        this.timer.unref?.()
      })

      this.socket = socket
    } catch (e) {
      logForDebugging(
        `[mobile-beacon] 启动广播失败（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
      )
      this.socket = null
    }
  }

  /** 发一次广播。失败静默（广播是旁路能力）。 */
  private sendOnce(): void {
    const socket = this.socket
    if (!socket) return
    try {
      const info = this.infoProvider()
      const payload = buildBeaconPayload(info)
      const buf = serializeBeacon(payload)
      if (!buf) return
      socket.send(buf, 0, buf.length, BEACON_PORT, BEACON_GROUP, (err) => {
        if (err) {
          // 只在 debug 日志里记：网络不可达是常见情况（如无网卡），
          // 每次报错会让终端刷屏
          logForDebugging(`[mobile-beacon] 广播发送失败: ${err.message}`)
        }
      })
    } catch (e) {
      logForDebugging(
        `[mobile-beacon] 广播异常（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  /** 停止广播并释放 socket。重复调用安全。 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // 已关闭或从未成功 bind：忽略
      }
      this.socket = null
    }
  }
}
