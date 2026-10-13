/**
 * 端到端契约测试：工具活动推送的**实际 WS 帧字段**。
 *
 * 为什么必须测这一层（此前的测试缺口）：
 * `describeToolActivityForMobile` 的测试只验证「转换后的对象」，
 * 而客户端解析的是 `pushToolActivityToMobileClients` 编码出的 **JSON 帧**。
 * 两者之间还有一个字段白名单（sendToAll 的数据对象）。若白名单漏字段
 * 或改了字段名，转换层测试依然全绿，而客户端会静默收到残缺数据 ——
 * 表现为「手机上工具气泡一直转圈、看不到结果」，真要定位得抓 WS 包。
 *
 * 与 Android 端 BridgeProtocol.kt 解析的字段构成**双向契约**：
 * 本文件断言服务端「发了什么」，客户端单测断言「能否解析」。
 * 任一侧改名而另一侧未跟进，必有一侧失败。
 *
 * 关键断言：结果事件的 name 为空串（Anthropic 结果块无工具名），
 * 客户端必须靠 toolUseId 配对 —— 若某天服务端给它填了占位名，
 * 客户端的配对判据（依赖 toolUseId）仍应有效，此处锁死该行为。
 */
import { describe, it, expect, afterEach } from 'vitest'
import WebSocket from 'ws'
import {
  MobileBridgeServer,
  pushToolActivityToMobileClients,
  getActiveMobileBridgeServer,
} from '../../src/bridge/mobileBridge.js'

/**
 * 轮询等待条件成立。
 *
 * 超时给到 10 秒而非 3 秒：本文件在**全量套件并发运行**时，CPU 被其他
 * 测试进程抢占，WS 握手与帧投递可能显著变慢。过短的超时会让测试变成
 * 「单跑绿、全量红」的脆弱测试 —— 那是测试自身的问题，不是产品缺陷。
 */
async function waitFor(cond: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (cond()) return
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error(`等待超时：${what}`)
}

/** 启动真实服务器并连一个真实 WS 客户端，返回收帧工具。 */
async function withServer(
  port: number,
  fn: (received: any[], wait: (n: number) => Promise<void>) => Promise<void>,
) {
  const server = new MobileBridgeServer({ sessionId: `test-${port}`, port, secret: '' })
  await server.start()

  const ws = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws?deviceId=t&deviceType=android`)
  const received: any[] = []
  ws.on('message', (raw: Buffer) => {
    try {
      received.push(JSON.parse(raw.toString()))
    } catch {
      /* 忽略坏帧 */
    }
  })

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve())
    ws.on('error', reject)
    setTimeout(() => reject(new Error('客户端连接超时')), 10_000)
  })

  // 必须等到收到 client_connected 才推送 —— 那是服务器把本连接计入
  // connectedClients 的证据。pushToolActivityToMobileClients 在
  // getClientCount()===0 时直接返回，过早推送会静默丢弃。
  await waitFor(() => received.some(f => f.type === 'client_connected'), 'client_connected')
  // 清掉开场帧，后续断言只看 tool_activity
  received.length = 0

  const wait = async (n: number) => {
    await waitFor(
      () => received.filter(f => f.type === 'tool_activity').length >= n,
      `${n} 条 tool_activity 帧`,
    )
  }

  try {
    await fn(received, wait)
  } finally {
    ws.close()
    await server.stop()
  }
}

/** 过滤出 tool_activity 帧的 data。 */
const toolFrames = (received: any[]) =>
  received.filter(f => f.type === 'tool_activity').map(f => f.data)

describe('工具活动 WS 帧端到端契约', () => {
  afterEach(() => {
    // 每个用例后确认全局注册表已清空，避免相互污染
    expect(getActiveMobileBridgeServer()).toBeNull()
  })

  it('running 事件的帧带 name / state / detail，客户端据此新建气泡', async () => {
    await withServer(15800, async (received, wait) => {
      pushToolActivityToMobileClients({
        kind: 'tool',
        name: 'Bash',
        target: 'npm test',
        state: 'running',
        detail: 'npm test -- --run',
        toolUseId: 'toolu_001',
      })
      await wait(1)

      const [d] = toolFrames(received)
      expect(d).toBeTruthy()
      expect(d.kind).toBe('tool')
      expect(d.name).toBe('Bash')          // 客户端用它做气泡标题
      expect(d.state).toBe('running')
      expect(d.detail).toBe('npm test -- --run') // 命令原文，展开后显示
      expect(d.toolUseId).toBe('toolu_001')      // 供结果配对
    })
  })

  it('结果事件的帧 name 为空但带 toolUseId 与 result —— 客户端不能因名空丢弃', async () => {
    await withServer(15801, async (received, wait) => {
      // 与 describeToolResultForMobile 的真实输出一致：name 空串
      pushToolActivityToMobileClients({
        kind: 'tool',
        name: '',
        state: 'done',
        result: '全部 12 个用例通过',
        toolUseId: 'toolu_001',
      })
      await wait(1)

      const [d] = toolFrames(received)
      expect(d).toBeTruthy()
      expect(d.name).toBe('')              // 关键：结果块无工具名
      expect(d.state).toBe('done')
      expect(d.result).toBe('全部 12 个用例通过')
      expect(d.toolUseId).toBe('toolu_001') // 客户端唯一可用的配对依据
    })
  })

  it('截断字段随帧下发（客户端据此显示「已截断，共 N 字符」）', async () => {
    await withServer(15802, async (received, wait) => {
      pushToolActivityToMobileClients({
        kind: 'tool',
        name: 'Read',
        state: 'done',
        result: 'x'.repeat(100),
        truncated: true,
        fullLength: 83214,
        toolUseId: 'toolu_002',
      })
      await wait(1)

      const [d] = toolFrames(received)
      expect(d.truncated).toBe(true)
      expect(d.fullLength).toBe(83214)
    })
  })

  it('thinking 事件的帧带 detail（思考内容）且无 toolUseId', async () => {
    await withServer(15803, async (received, wait) => {
      pushToolActivityToMobileClients({
        kind: 'thinking',
        name: '思考',
        state: 'running',
        detail: '先定位文件再看调用方',
        truncated: false,
        fullLength: 12,
      })
      await wait(1)

      const [d] = toolFrames(received)
      expect(d.kind).toBe('thinking')
      expect(d.detail).toBe('先定位文件再看调用方')
      expect(d.toolUseId).toBeUndefined()
    })
  })

  it('error 状态与空 detail 不写入帧（客户端 optString 回落空串）', async () => {
    await withServer(15804, async (received, wait) => {
      pushToolActivityToMobileClients({
        kind: 'tool',
        name: 'Bash',
        state: 'error',
        result: 'Command failed',
        toolUseId: 'toolu_003',
      })
      await wait(1)

      const [d] = toolFrames(received)
      expect(d.state).toBe('error')
      expect(d.result).toBe('Command failed')
      // detail 未提供 → 条件展开不写该字段；客户端 optString 得到空串
      expect(d.detail).toBeUndefined()
    })
  })

  it('完整往返：running 与 done 两帧的 toolUseId 相同（配对前提）', async () => {
    await withServer(15805, async (received, wait) => {
      pushToolActivityToMobileClients({
        kind: 'tool', name: 'Bash', target: 'ls', state: 'running',
        detail: 'ls -la', toolUseId: 'toolu_pair',
      })
      pushToolActivityToMobileClients({
        kind: 'tool', name: '', state: 'done',
        result: 'total 4', toolUseId: 'toolu_pair',
      })
      await wait(2)

      const frames = toolFrames(received)
      expect(frames).toHaveLength(2)
      // 两帧 id 一致是客户端 findRunningToolCallId 能配对的前提
      expect(frames[0].toolUseId).toBe(frames[1].toolUseId)
      expect(frames[0].state).toBe('running')
      expect(frames[1].state).toBe('done')
      expect(frames[1].result).toBe('total 4')
    })
  })

  it('无客户端连接时推送静默成功（不抛异常、不留注册表）', async () => {
    const server = new MobileBridgeServer({ sessionId: 'test-none', port: 15806, secret: '' })
    await server.start()
    expect(() =>
      pushToolActivityToMobileClients({ kind: 'tool', name: 'Bash', state: 'running' }),
    ).not.toThrow()
    await server.stop()
  })
})
