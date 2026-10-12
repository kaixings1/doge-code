import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * 隧道地址「约定文件」的读取端。
 *
 * ## 为什么用文件而不是环境变量
 *
 * 快隧道由启动脚本（`scripts/start-mobile-bridge.mjs`）拉起，地址在
 * **cloudflared 的 stdout** 里，服务端进程本身不知道。
 *
 * 第一直觉是「脚本起完隧道后 set 环境变量再启动 CLI」，但**不成立**：
 * 脚本遇到「端口已有桥接在跑」时会**复用**已有的 doge 进程（见脚本 231 行），
 * 此时 CLI 早已启动，环境变量根本注入不进去 —— 而「复用」恰恰是最常见的
 * 路径（用户开着的 doge-code 主进程自带 mobile bridge）。
 *
 * 文件方案对两条路径都生效：进程随时读文件，与启动时机无关。
 *
 * ## 路径必须与脚本一致
 *
 * 脚本侧同样的拼法（`join(os.tmpdir(), 'doge-tunnel-url.json')`）见
 * `scripts/start-mobile-bridge.mjs` 的 `TUNNEL_URL_FILE`。改一处必须改两处。
 */

/**
 * 隧道地址「约定文件」的路径。
 *
 * ## 为什么按端口分文件（多实例多隧道）
 *
 * 每个 CLI 实例各自起一条 cloudflared 快隧道（各自一个端口）。若共用一个
 * 文件，后起的实例会**覆盖**先起的地址 → 所有实例的 beacon 广播同一个
 * `tunnelUrl` → 手机在隧道模式下看到多个会话，地址却全一样，切换「切了
 * 等于没切」。按端口分文件后，每个实例读自己那份，多隧道才真正成立。
 *
 * ## 兼容旧路径
 *
 * 不传 port（旧调用 / 旧脚本写的 `doge-tunnel-url.json`）时回落单文件
 * 路径 —— 老脚本配新服务端仍能读到，不会突然失联。
 *
 * **两端必须一致**：脚本（`scripts/start-mobile-bridge.mjs`）写、服务端读；
 * 文件名拼法改一处必须改两处。用 `tmpdir()` 而非项目目录 —— 换工作目录
 * 时路径仍稳定。
 */
export function tunnelUrlFilePath(port?: number): string {
  if (typeof port === 'number' && Number.isInteger(port) && port > 0) {
    return join(tmpdir(), `doge-tunnel-url-${port}.json`)
  }
  return join(tmpdir(), 'doge-tunnel-url.json')
}

/**
 * 读取指定端口的隧道地址（`https://<子域>.trycloudflare.com`）。
 *
 * @param port 桥接端口；不传时读旧的单文件路径（兼容）。
 * @returns 有效地址；文件不存在/损坏/超期则返回 null。
 *
 * 失败一律返回 null 而非抛异常：这是**旁路能力**（只为让手机自动拿到地址），
 * 读不到就是「不广播这个字段」，绝不该影响任何主流程。
 */
export function readTunnelUrl(port?: number, now: number = Date.now()): string | null {
  try {
    const raw = readFileSync(tunnelUrlFilePath(port), 'utf8')
    const obj = JSON.parse(raw) as { url?: unknown; at?: unknown }
    if (typeof obj.url !== 'string' || !obj.url.startsWith('https://')) return null
    // 超期保护：快隧道子域只在电脑端进程存活期间有效。若文件是几天前写的，
    // 那个子域早失效了，广播它只会让手机存下一个连不上的地址。
    // 取 12 小时 —— 覆盖一个工作日的会话，又足以滤掉陈旧文件。
    if (typeof obj.at === 'number' && now - obj.at > 12 * 60 * 60 * 1000) return null
    return obj.url
  } catch {
    return null
  }
}

/**
 * 把隧道地址（`https://<域>`）转成 WebSocket 地址（`wss://<域>/mobile/ws`）。
 *
 * 与手机端 `BridgeUrl.buildWsUrl` 的语义一致：隧道只走 443，**不补端口**。
 * 广播里发的就是 wss 终态，手机可直接用。
 */
export function toWsUrl(httpsUrl: string): string {
  const host = httpsUrl.replace(/^https:\/\//, '').replace(/\/.*$/, '')
  return `wss://${host}/mobile/ws`
}
