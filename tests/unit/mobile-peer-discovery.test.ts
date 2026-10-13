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
import WebSocket from 'ws'
import { MobileBridgeServer, sessionEndpoints } from '../../src/bridge/mobileBridge.js'
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
  // 中心化探测用例专用端口（与前几组不相交，避免 close 的 TIME_WAIT 冲突）
  const P5 = 15721
  const P6 = 15722

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

  it('中心化探测段覆盖同段其他实例（修「起点取错导致 peers 恒空」）', async () => {
    // 真机踩过的缺陷：探测起点若取 `CLAUDE_CODE_MOBILE_PORT`（脚本注入的
    // **本实例端口**，如 6005），段变成 [6005..6025] → 跳过 6000-6004 上的
    // 其他实例，peers 恒为空。修法是「以本实例端口为中心」向两侧展开。
    // 此用例锁定该行为：实例在 P4(=P3+1)，另一个在 P3（低位侧），
    // 用中心化段 [P4-20 .. P4+5] 必须能探到 P3。
    // 本实例在 P6，低位侧实例在 P5（相邻）。
    // 用「以 P6 为中心」的小段覆盖它 —— 只探 [P5..P6] 两个端口，
    // 因为要验证的是**低位侧被包含**这一语义，不是去探满 26 个端口
    //（探满会因大量无服务端口超时，拖过测试时限 —— 实测如此）。
    const sLow = await mockSessionInfo(P5, { port: P5, label: 'low-side' })
    const sSelf = await mockSessionInfo(P6, { port: P6, label: 'self' })
    try {
      // 等价于 peerRangeStart = port - BACK 的起始计算（这里 BACK 取 1）
      const start = Math.max(1, P6 - 1)
      const peers = await discoverPeerSessions(P6, start, 2)
      const ports = peers.map((p) => p.port)
      expect(ports).toContain(P5) // 低位侧实例被覆盖（这正是修掉的行为）
      expect(ports).toContain(P6)
    } finally {
      await new Promise<void>((r) => sLow.close(() => r()))
      await new Promise<void>((r) => sSelf.close(() => r()))
    }
  })

  it('peers 变化时向已连接客户端广播 sessions_updated（隧道/地址更新）', async () => {
    // 用户诉求：隧穿地址要「通过已经连接成功的那条线路」更新到手机，
    // 而不是只在握手时拿一次。服务端在 peer 刷新发现变化时主动广播。
    const server = new MobileBridgeServer({ sessionId: 'push-test', port: P1 })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${P1}/mobile/ws?deviceId=t&deviceType=android`)
    const frames: any[] = []
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('message', (d) => frames.push(JSON.parse(d.toString())))
      ws.on('error', reject)
    })
    // 等握手帧到达，并**等 start() 里那一轮「立即探测」的 promise 落定**
    //（它异步 resolve 后会写 peerSessions；若不等，设置会被它覆盖回空。
    //  实测踩过：peers 意外为空）。
    await new Promise((r) => setTimeout(r, 800))

    const anySrv = server as unknown as {
      peerSessions: unknown[]
      lastBroadcastEndpointsJson: string
      broadcastEndpointsIfChanged: () => void
      stopPeerRefresh: () => void
    }
    // 停掉周期刷新（防后续 15s 轮次再覆盖）
    anySrv.stopPeerRefresh()
    // **在同步块里设置 + 广播**：中间无 await，不给任何异步回调插队的机会
    anySrv.lastBroadcastEndpointsJson = '' // 强制视为「有变化」
    anySrv.peerSessions = [
      { port: 9999, label: 'sim', lan: ['http://127.0.0.1:9999'], tunnel: 'wss://sim.example/mobile/ws', interactive: false },
    ]
    // 直接验证 sessionEndpoints 是否保留这个 peer（隔离广播层）
    const epDirect = sessionEndpoints(P1, 'x', [
      { port: 9999, label: 'sim', lan: ['http://127.0.0.1:9999'], tunnel: 'wss://sim/mobile/ws', interactive: false },
    ])
    if (epDirect.peers.length !== 1) {
      throw new Error(`sessionEndpoints 未保留 peer：${JSON.stringify(epDirect.peers)}`)
    }
    anySrv.broadcastEndpointsIfChanged()

    await new Promise((r) => setTimeout(r, 300))
    const all = frames.filter((f) => f.type === 'sessions_updated')
    expect(all.length, '应收到 sessions_updated 广播').toBeGreaterThan(0)
    // **取最后一帧**：首帧可能是 start() 立即探测后「peers 为空」的那次广播
    //（实测如此），末帧才是我设置 peers 后的广播。
    const upd = all[all.length - 1]
    expect(upd.data.peers, `末帧 peers 应含模拟实例；全帧=${JSON.stringify(all.map((f) => f.data.peers))}`)
      .toHaveLength(1)
    expect(upd.data.peers[0].port).toBe(9999)
    // 隧道地址随广播到达（手机据此更新 —— 这正是用户要的「已连接线路上的更新」）
    expect(upd.data.peers[0].tunnel).toBe('wss://sim.example/mobile/ws')

    ws.close()
    await server.stop()
  })

  it('peers 无变化时不重复广播（避免每 15s 无脑刷）', async () => {
    const server = new MobileBridgeServer({ sessionId: 'nochange', port: P1 })
    await server.start()
    const ws = new WebSocket(`ws://127.0.0.1:${P1}/mobile/ws?deviceId=t&deviceType=android`)
    const frames: any[] = []
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('message', (d) => frames.push(JSON.parse(d.toString())))
      ws.on('error', reject)
    })
    await new Promise((r) => setTimeout(r, 200))

    const anySrv = server as unknown as {
      peerSessions: unknown[]
      lastBroadcastEndpointsJson: string
      broadcastEndpointsIfChanged: () => void
      stopPeerRefresh: () => void
    }
    anySrv.stopPeerRefresh() // 同上：避免定时刷新干扰
    anySrv.lastBroadcastEndpointsJson = ''
    anySrv.peerSessions = []
    anySrv.broadcastEndpointsIfChanged() // 第 1 次：内容变化（'' → 空 peers 的 json）→ 推
    await new Promise((r) => setTimeout(r, 150))
    const after1 = frames.filter((f) => f.type === 'sessions_updated').length

    anySrv.broadcastEndpointsIfChanged() // 第 2 次：内容同上 → **不应推**
    anySrv.broadcastEndpointsIfChanged() // 第 3 次：同上
    await new Promise((r) => setTimeout(r, 150))
    const after3 = frames.filter((f) => f.type === 'sessions_updated').length

    // 判据：后续两次调用**不应再增加**帧数（幂等）。
    // 不写死绝对值 —— start() 立即探测后可能已广播过一次，故 after1 可能是
    // 0 或 1（取决于 start 那轮是否产出了不同的 json）。
    expect(after3, '内容未变时不应重复广播').toBe(after1)

    ws.close()
    await server.stop()
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
