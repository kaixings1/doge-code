import http from 'http'
import { logForDebugging } from '../utils/debug.js'

/**
 * 发现**同机上其他 doge 实例**的移动桥接，供手机端一次拿到全部会话。
 *
 * ## 为什么需要（用户的核心诉求）
 *
 * 每个 CLI 实例各占一个端口（6000/6001/…）。手机连上**其中一个**后，
 * 此前只能拿到**那一个**会话的地址 —— 其他会话要么靠手机自己扫端口段、
 * 要么靠 UDP 广播（仅同 WiFi）。两种情况都够不到：
 * - **隧道场景**：其他实例的隧道子域各不相同，手机扫不到也收不到广播；
 * - **手机换网段/户外**：连广播都失效。
 *
 * 用户明确要求：「一旦有一个连接上，则相应的其他会话、隧道路径 ws 等
 * 所有内容都要发送到手机 app」。本模块就是做这件事：**任一连上后，
 * 服务端主动探测同机其他实例，把它们的地址一并下发**，手机据此可
 * 通过任一路径（LAN / 隧道）连到每个会话，无需自己发现。
 *
 * ## 探测方式：复用 /mobile/session-info
 *
 * 不新造协议 —— 每个实例都已暴露 `GET /mobile/session-info`
 *（多会话方案 A 的既有端点），返回 label/port/lan/tunnel。并发 GET 它
 * 即可拿到 peer 的全部接入信息。
 *
 * ## 为什么带缓存
 *
 * 探测是 N 个 HTTP 请求（N = 端口段宽度）。连接建立时若每次都扫，
 * 会拖慢握手、并给同机实例造成无谓负载。缓存 5 秒：足以覆盖
 * 「刚启动一个实例、立刻从手机连另一个」的时序，又不会拿到太旧的结果。
 */

/** 默认探测端口段宽度（与服务端顺延上限、手机端扫描段一致）。 */
export const DEFAULT_PEER_RANGE = 21

/** 单端口探测超时（毫秒）。同机直连，正常 1ms 级；给足余量防误判。 */
const PROBE_TIMEOUT_MS = 800

/** 缓存有效期（毫秒）。 */
const CACHE_TTL_MS = 5000

/** 一个 peer 会话的接入信息（即 session-info 的裁剪版）。 */
export interface PeerSession {
  port: number
  label: string
  /** 本机各候选 http 地址（`http://<ip>:<port>`）。 */
  lan: string[]
  /** 隧道 wss 地址；无隧道时为 null。 */
  tunnel: string | null
  /** 是否交互式终端（非交互时消息不会被消费，客户端据提示）。 */
  interactive: boolean
}

/** 缓存：key = `myPort:startPort:width`，避免不同参数互相污染。 */
const cache = new Map<string, { at: number; peers: PeerSession[] }>()

/**
 * 探测的候选端口列表（含自己）。
 *
 * 与 [candidatePorts] 同一套递增逻辑，但这里**必须含自己**：
 * 过滤自身由调用方按 port 相等做（纯逻辑上更清晰，也便于测试）。
 */
export function peerPorts(startPort: number, width: number = DEFAULT_PEER_RANGE): number[] {
  if (!Number.isInteger(startPort) || startPort <= 0) return []
  const out: number[] = []
  for (let i = 0; i < width; i++) {
    const p = startPort + i
    if (p > 65535) break
    out.push(p)
  }
  return out
}

/**
 * 解析 `/mobile/session-info` 响应体为 [PeerSession]。
 *
 * **纯函数**（无 IO），故可单测各字段缺失/类型错误的边界：
 * 老实例不返回 lan/tunnel 时也要能解析出 port/label（降级但可用）。
 *
 * @param body 响应体原文
 * @param expectPort 期望的端口；响应里的 port 与之不符时以**响应为准**
 *   （服务端可能顺延），无 port 字段时回落到 expectPort
 * @returns 解析成功返回 PeerSession；无法解析（非 JSON / 无 label）返回 null
 */
export function parsePeer(body: string, expectPort: number): PeerSession | null {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(body) as Record<string, unknown>
  } catch {
    return null
  }
  if (!o || typeof o !== 'object') return null

  const port = typeof o.port === 'number' && o.port > 0 ? o.port : expectPort
  // label 缺失时回落「端口 N」——与手机端 SessionScanner 的占位口径一致
  const label = typeof o.label === 'string' && o.label.trim()
    ? o.label
    : `端口 ${port}`

  const lan = Array.isArray(o.lan)
    ? (o.lan as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  const tunnel = typeof o.tunnel === 'string' && o.tunnel.length > 0 ? o.tunnel : null
  const interactive = o.interactive === true

  return { port, label, lan, tunnel, interactive }
}

/** GET 一个端口的 session-info（尽力而为，失败返回 null）。 */
function probePort(port: number): Promise<PeerSession | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: PeerSession | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    try {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/mobile/session-info', timeout: PROBE_TIMEOUT_MS },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume()
            return done(null)
          }
          let b = ''
          res.setEncoding('utf8')
          res.on('data', (c) => { b += c })
          res.on('end', () => done(parsePeer(b, port)))
        },
      )
      req.on('error', () => done(null))
      req.on('timeout', () => { req.destroy(); done(null) })
    } catch {
      done(null)
    }
  })
}

/**
 * 发现同机所有 doge 实例（含自己）。
 *
 * 并发探测 [peerPorts]，收集能响应 session-info 的实例。
 * **不抛异常**：探测失败只是「少发现几个会话」，绝不该影响本实例的
 * 连接建立（这是旁路能力，与 UDP 广播同一原则）。
 *
 * @param myPort 本实例端口（结果里会标出来，调用方自行区分）
 * @param startPort 探测起始端口（默认 6000，与服务端默认一致）
 * @param width 探测宽度（默认 21）
 * @param now 当前时间（测试注入）
 */
export async function discoverPeerSessions(
  myPort: number,
  startPort: number = 6000,
  width: number = DEFAULT_PEER_RANGE,
  now: number = Date.now(),
): Promise<PeerSession[]> {
  const key = `${myPort}:${startPort}:${width}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.peers

  const ports = peerPorts(startPort, width)
  if (ports.length === 0) return []

  try {
    const results = await Promise.all(ports.map((p) => probePort(p)))
    const peers = results.filter((x): x is PeerSession => x !== null)
    cache.set(key, { at: now, peers })
    logForDebugging(
      `[mobile-peers] 发现 ${peers.length} 个会话（含自己 port=${myPort}）：` +
        peers.map((p) => `${p.port}(${p.label})`).join(', '),
    )
    return peers
  } catch (e) {
    logForDebugging(
      `[mobile-peers] 探测失败（已忽略）：${e instanceof Error ? e.message : String(e)}`,
    )
    return []
  }
}

/** 清空缓存（仅供测试）。 */
export function clearPeerCache(): void {
  cache.clear()
}
