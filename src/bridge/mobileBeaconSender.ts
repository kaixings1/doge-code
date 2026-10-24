import dgram from 'dgram'
import os from 'os'
import { logForDebugging } from '../utils/debug.js'
import {
  BEACON_GROUP,
  BEACON_INTERVAL_MS,
  BEACON_PORT,
  buildBeaconPayload,
  serializeBeacon,
} from './mobileBeacon.js'

/**
 * 挑选用于组播发送的网卡地址。
 *
 * ## 为什么必须显式挑（真实故障）
 *
 * 不调 `setMulticastInterface` 时，OS 按默认路由挑网卡。开发机上常有
 * VBox / WSL / Tailscale / VMware 等虚拟网卡，默认路由很可能落在
 * 链路本地地址（169.254.x.x）或虚拟网段上 —— 此时广播确实发出去了，
 * 手机（真实 WiFi 192.168.x.x）一个包也收不到，表现为"同一 WiFi 却搜不到"。
 *
 * 判据按优先级：
 * 1. 私有网段的 IPv4（192.168 / 10. / 172.16-31）—— 手机最可能在同一网段
 * 2. 其它非链路本地、非环回的 IPv4
 * 明确排除 169.254.x.x（link-local，虚拟网卡常见）、127.x、以及
 * VBox/VMware/WSL/Tailscale 等命名网卡。
 *
 * 注意：排除 Tailscale **不是**否认它的价值 —— 组播只在同一二层网段内传播，
 * 想靠广播本身穿过 Tailscale 的三层覆盖网是不可能的。Tailscale 路径改由
 * `detectTailscaleHost()` 把地址搭车进报文，见 `mobileBeacon.ts` 的说明。
 */
export function pickBeaconInterface(): string | null {
  const candidates = collectLanIpv4Candidates()
  const best = candidates[0]
  if (best) {
    logForDebugging(`[mobile-beacon] 组播出口网卡: ${best.name} (${best.address})`)
  } else {
    logForDebugging('[mobile-beacon] 未找到可用 LAN 网卡，组播可能发不出去')
  }
  return best?.address ?? null
}

/**
 * 收集可用 LAN 网卡的 IPv4 地址，按"最可能是手机所在网段"排序。
 *
 * 评分只依赖网段形态，不做默认路由探测：探测公网地址只能得到
 * 电脑的默认出口（常常是有线/虚拟网卡），并不能说明手机连在哪张卡上。
 */
function collectLanIpv4Candidates(): {
  name: string
  address: string
  score: number
}[] {
  const ifaces = os.networkInterfaces()
  const virtual =
    /vbox|vmware|virtualbox|wsl|vethernet|tailscale|docker|hyper-v|loopback/i
  const out: { name: string; address: string; score: number }[] = []

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    // 命名像 WiFi 的网卡加权：手机走 WiFi，同网段的概率最高
    const wifiish = /^wl|wlan|wi-?fi|无线/i.test(name)
    for (const a of addrs) {
      // Node <18 用 family === 'IPv4'，>=18 用数字 4，两者都认
      const isV4 = a.family === 'IPv4' || (a.family as unknown) === 4
      if (!isV4 || a.internal) continue
      if (a.address.startsWith('169.254.')) continue // 链路本地，虚拟网卡常见
      if (virtual.test(name)) continue

      let score = 0
      if (/^192\.168\./.test(a.address)) score = 3
      else if (/^10\./.test(a.address)) score = 2
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score = 2
      else score = 1
      if (wifiish) score += 1

      out.push({ name, address: a.address, score })
    }
  }

  return out.sort((x, y) => y.score - x.score)
}

/** 100.64.0.0/10 —— Tailscale 使用的 CGNAT 段。 */
const TAILSCALE_CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./

let tailscaleHostCache: string | null | undefined

/**
 * 取本机 Tailscale（或同类虚拟网）地址，形如 `100.99.118.124`。
 *
 * 不调 `tailscale` 命令行：它不一定在 PATH（Windows 装在 Program Files），
 * 且每 3 秒广播都起子进程代价过高。网卡表里本就有 `100.x` 地址，按网段
 * 识别即可，还顺带覆盖了其它使用该段的同类方案。
 *
 * 结果缓存整个进程生命周期：网卡地址极少变化，没必要每轮重扫。
 * 返回裸地址不带 scheme —— 由客户端按模式自行拼 ws/wss，与 `port`
 * 的处理方式保持一致。
 */
export function detectTailscaleHost(): string | null {
  const cached = tailscaleHostCache
  if (cached !== undefined) return cached

  const found = findCgnatAddress()
  tailscaleHostCache = found
  logForDebugging(
    found
      ? `[mobile-beacon] Tailscale 地址: ${found}`
      : '[mobile-beacon] 未检测到 Tailscale 地址（未安装或未登录）',
  )
  return found
}

/** 扫描网卡表取 CGNAT 段地址；命名含 tailscale 的优先。 */
function findCgnatAddress(): string | null {
  const ifaces = os.networkInterfaces()
  let fallback: string | null = null

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    for (const a of addrs) {
      const isV4 = a.family === 'IPv4' || (a.family as unknown) === 4
      if (!isV4 || a.internal) continue
      if (!TAILSCALE_CGNAT.test(a.address)) continue
      // 各平台网卡名不一（tailscale0 / Tailscale / tun0），名称只作优先级
      if (/tailscale/i.test(name)) return a.address
      if (!fallback) fallback = a.address
    }
  }
  return fallback
}

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
          // 显式指定出口网卡：多网卡机器上默认路由常落在虚拟网卡（VBox/WSL/
          // Tailscale），广播会发到手机根本不在的网段，表现为"同一 WiFi 搜不到"
          const ifaceAddr = pickBeaconInterface()
          if (ifaceAddr) socket.setMulticastInterface(ifaceAddr)
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
      const payload = buildBeaconPayload({
        ...info,
        // 搭车告诉手机 "出门时可以从这个地址回来"。
        // 手机在局域网收到后即可存下模式 3 的地址，不必手抄 100.x
        tailscaleHost: detectTailscaleHost(),
      })
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
