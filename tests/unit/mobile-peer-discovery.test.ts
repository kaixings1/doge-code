/**
 * peer 发现（同机多实例地址下发）的测试。
 *
 * 覆盖用户诉求：「一旦有一个连接上，则相应的其他会话、隧道路径 ws 等
 * 所有内容都要发送到手机 app」。
 *
 *   - peerPorts()        端口段生成（含起止边界）
 *   - parsePeer()        解析 session-info 响应（各字段缺失/类型错误的降级）
 *   - sessionEndpoints() peers 字段（剔除自己、老客户端兼容）
 *
 * 设计见 src/bridge/mobilePeerDiscovery.ts、mobileBridge.ts。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import http from 'http'
import { sessionEndpoints } from '../../src/bridge/mobileBridge.js'
import {
  DEFAULT_PEER_RANGE,
  discoverPeerSessions,
  parsePeer,
  peerPorts,
  clearPeerCache,
} from '../../src/bridge/mobilePeerDiscovery.js'

// ─── peerPorts：端口段生成 ───

describe('peerPorts', () => {
  it('从起点生成指定宽度的连续端口', () => {
    expect(peerPorts(6000, 5)).toEqual([6000, 6001, 6002, 6003, 6004])
  })

  it('默认宽度为 DEFAULT_PEER_RANGE', () => {
    expect(peerPorts(6000)).toHaveLength(DEFAULT_PEER_RANGE)
  })

  it('非法起点返回空（不崩）', () => {
    expect(peerPorts(0)).toEqual([])
    expect(peerPorts(-1)).toEqual([])
    expect(peerPorts(1.5)).toEqual([])
  })

  it('接近 65535 时截断而非回绕', () => {
    // 从 65534 起 5 个 → 只到 65535（两个），不产生越界端口
    expect(peerPorts(65534, 5)).toEqual([65534, 65535])
  })
})

// ─── parsePeer：解析 session-info ───

describe('parsePeer', () => {
  it('完整字段正常解析', () => {
    const body = JSON.stringify({
      port: 6001,
      label: '修CI',
      lan: ['http://192.168.0.106:6001'],
      tunnel: 'wss://abc.trycloudflare.com/mobile/ws',
      interactive: true,
    })
    const p = parsePeer(body, 6001)
    expect(p).not.toBeNull()
    expect(p!.port).toBe(6001)
    expect(p!.label).toBe('修CI')
    expect(p!.lan).toEqual(['http://192.168.0.106:6001'])
    expect(p!.tunnel).toBe('wss://abc.trycloudflare.com/mobile/ws')
    expect(p!.interactive).toBe(true)
  })

  it('老实例（无 lan/tunnel）也能解析出 port/label', () => {
    const body = JSON.stringify({ port: 6002, label: 'old' })
    const p = parsePeer(body, 6002)
    expect(p!.port).toBe(6002)
    expect(p!.label).toBe('old')
    expect(p!.lan).toEqual([])
    expect(p!.tunnel).toBeNull()
    expect(p!.interactive).toBe(false)
  })

  it('label 缺失回落「端口 N」', () => {
    const p = parsePeer(JSON.stringify({ port: 6005 }), 6005)
    expect(p!.label).toBe('端口 6005')
  })

  it('响应里的 port 优先于期望端口（服务端可能顺延）', () => {
    const p = parsePeer(JSON.stringify({ port: 6009 }), 6000)
    expect(p!.port).toBe(6009)
  })

  it('缺 port 字段时回落到期望端口', () => {
    const p = parsePeer(JSON.stringify({ label: 'x' }), 6007)
    expect(p!.port).toBe(6007)
  })

  it('非 JSON 返回 null', () => {
    expect(parsePeer('not-json', 6000)).toBeNull()
    expect(parsePeer('', 6000)).toBeNull()
  })

  it('lan 里混入非字符串时只保留字符串项', () => {
    const p = parsePeer(
      JSON.stringify({ port: 6000, lan: ['http://a:1', 123, null, '', 'http://b:2'] }),
      6000,
    )
    expect(p!.lan).toEqual(['http://a:1', 'http://b:2'])
  })

  it('tunnel 为空串视作无隧道', () => {
    expect(parsePeer(JSON.stringify({ port: 6000, tunnel: '' }), 6000)!.tunnel).toBeNull()
  })
})

// ─── sessionEndpoints：peers 字段 ───

describe('sessionEndpoints 的 peers', () => {
  it('peers 剔除自己（避免手机端把本会话列两遍）', () => {
    const peers = [
      { port: 6000, label: 'A', lan: [], tunnel: null, interactive: false },
      { port: 6001, label: 'B', lan: [], tunnel: null, interactive: false },
    ]
    const ep = sessionEndpoints(6001, 'sess', peers)
    expect(ep.peers.map((p) => p.port)).toEqual([6000])
  })

  it('不传 peers 时为默认空数组（老调用点兼容）', () => {
    const ep = sessionEndpoints(6000, 'sess')
    expect(ep.peers).toEqual([])
  })
})

// ─── discoverPeerSessions：真实探测（起两个真实实例） ───

describe('discoverPeerSessions 端到端', () => {
  // 各测试用**互不相交**的端口段：mock 服务的 close() 是异步的，
  // 若两个测试复用同一端口，前一个的 TIME_WAIT 会让后一个 listen 失败
  //（实测踩过：单跑通过、同文件连跑失败）。
  const P1 = 15701
  const P2 = 15702
  const P3 = 15711
  const P4 = 15712

  beforeEach(() => {
    // 清缓存：否则上一次探测结果会被复用，测试间互相污染
    clearPeerCache()
  })

  /**
   * 起一个 Mock 的 session-info 服务（不依赖 MobileBridgeServer）。
   *
   * 为什么不用两个 MobileBridgeServer：它有**全局单例**注册表
   *（activeMobileServer），同进程起第二个会把第一个视作「已被接管」，
   * 导致端口实际只有一个在监听 —— 测试会因端口没起来而假失败
   *（实测踩过：expected [] to deeply equal [15701, 15702]）。
   * 直接起最小 http 服务返回固定 JSON，才能可靠地模拟「同机多实例」。
   */
  function mockSessionInfo(port: number, payload: Record<string, unknown>): Promise<http.Server> {
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => {
        if (req.url === '/mobile/session-info') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(payload))
        } else {
          res.writeHead(404)
          res.end()
        }
      })
      srv.listen(port, '127.0.0.1', () => resolve(srv))
    })
  }

  it('探测到同机其他实例并带回其地址（用户核心诉求）', async () => {
    const s1 = await mockSessionInfo(P1, {
      port: P1, label: 'peer-A', lan: [`http://192.168.0.106:${P1}`], tunnel: null, interactive: false,
    })
    // B 是「另一个实例」，带自己的隧道地址（这正是手机自己扫不到的）
    const s2 = await mockSessionInfo(P2, {
      port: P2, label: 'peer-B',
      lan: [`http://192.168.0.106:${P2}`],
      tunnel: 'wss://b.trycloudflare.com/mobile/ws',
      interactive: true,
    })

    try {
      const peers = await discoverPeerSessions(P1, P1, 2)
      // 两个实例都被发现（含自己；调用方在 sessionEndpoints 里剔除自己）
      expect(peers.map((p) => p.port).sort()).toEqual([P1, P2])
      const p2 = peers.find((p) => p.port === P2)!
      expect(p2.label).toBe('peer-B')
      expect(p2.lan).toEqual([`http://192.168.0.106:${P2}`])
      // **关键**：peer 的隧道地址也被带回 —— 手机据此可通过隧道连到 B，
      // 而这条地址手机自己**扫不到**（隧道子域各不同）。
      expect(p2.tunnel).toBe('wss://b.trycloudflare.com/mobile/ws')
      expect(p2.interactive).toBe(true)
    } finally {
      await new Promise<void>((r) => s1.close(() => r()))
      await new Promise<void>((r) => s2.close(() => r()))
    }
  })

  it('不存在的端口被跳过（不崩、不误报）', async () => {
    // 用独立端口段 P3，避免与上一个测试的 P1 端口 TIME_WAIT 冲突
    const s1 = await mockSessionInfo(P3, { port: P3, label: 'only' })
    try {
      // 探测 3 个端口，只有 P3 在监听
      const peers = await discoverPeerSessions(P3, P3, 3)
      expect(peers.map((p) => p.port)).toEqual([P3])
    } finally {
      await new Promise<void>((r) => s1.close(() => r()))
    }
  })
})
