import { describe, expect, it } from 'vitest'
import { initLocalBridge } from '../../src/bridge/localBridge.js'

/**
 * 针对「连上即断」缺陷的回归测试。
 *
 * 服务端 scripts/bridge.ts:703 在 upgrade 时校验会话是否存在，不存在即
 * `ws.close(1008, 'Session not found')`。客户端若用自造 id 直连，会先触发
 * onopen（+39ms）再触发 onclose（+40ms），表现为"连上成功但立刻断开"。
 *
 * 需要真实的桥接服务器（bun run scripts/bridge.ts）。未运行时跳过。
 */
async function bridgeServerUp(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:5678/health', { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

describe('initLocalBridge', () => {
  it('使用服务端注册的会话 id 建连，且连接持续存活', async () => {
    if (!(await bridgeServerUp())) {
      console.warn('[skip] 桥接服务器未运行 (localhost:5678)，跳过')
      return
    }

    const states: string[] = []
    const handle = await initLocalBridge({
      sessionId: 'local-selfmade-should-be-ignored',
      role: 'host',
      initialName: 'vitest-probe',
      onStateChange: (s, d) => states.push(d ? `${s}:${d}` : s),
    })

    expect(handle).not.toBeNull()
    // 关键回归点：不得沿用调用方自造的 id
    expect(handle!.sessionId).not.toBe('local-selfmade-should-be-ignored')
    expect(handle!.bridgeSessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(handle!.sessionIngressUrl).toContain(handle!.sessionId)

    // 服务端确认识别该会话
    const res = await fetch(`http://localhost:5678/v1/code/sessions/${handle!.sessionId}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { metadata?: { role?: string } }
    expect(body.metadata?.role).toBe('host')

    // 等待超过 1008 关闭的触发窗口，确认连接未被踢掉
    await new Promise(r => setTimeout(r, 2000))
    expect(states).not.toContain('disconnected')
    expect(states).toContain('ready')

    await handle!.teardown()
  }, 15000)

  it('服务器不可用时返回 null 并上报 failed', async () => {
    const prev = process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
    process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = 'http://127.0.0.1:1'
    try {
      const states: string[] = []
      const handle = await initLocalBridge({
        sessionId: 'x',
        role: 'host',
        onStateChange: (s, d) => states.push(d ? `${s}:${d}` : s),
      })
      expect(handle).toBeNull()
      expect(states.some(s => s.startsWith('failed'))).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
      else process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = prev
    }
  }, 10000)
})
