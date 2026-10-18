import { describe, it, expect } from 'vitest'
import { parseSessionsResponse, discoverSessions } from '../sessionDiscovery.js'

// W32 微提交2：会话发现层（name→sessionId）。纯解析 + 注入 fetch 的行为验证 + 变异测试。
describe('parseSessionsResponse', () => {
  it('从响应构造 name→sessionId 映射', () => {
    const body = {
      sessions: [
        { id: 'sid-1', metadata: { name: 'foo' } },
        { id: 'sid-2', metadata: { name: 'bar' } },
      ],
    }
    const map = parseSessionsResponse(body)
    expect(map.get('foo')).toBe('sid-1')
    expect(map.get('bar')).toBe('sid-2')
  })

  it('排除自身 session', () => {
    const body = {
      sessions: [
        { id: 'self', metadata: { name: 'me' } },
        { id: 'other', metadata: { name: 'you' } },
      ],
    }
    const map = parseSessionsResponse(body, 'self')
    expect(map.has('me')).toBe(false)
    expect(map.get('you')).toBe('other')
  })

  it('跳过缺 name/缺 id 的会话', () => {
    const body = {
      sessions: [
        { id: 'a', metadata: {} },
        { id: 'b' },
        { metadata: { name: 'x' } },
      ],
    }
    expect(parseSessionsResponse(body).size).toBe(0)
  })

  it('畸形响应降级为空映射（不抛）', () => {
    expect(parseSessionsResponse(null).size).toBe(0)
    expect(parseSessionsResponse({ foo: 1 }).size).toBe(0)
  })

  // 变异测试：若 parseSessionsResponse 把 selfSessionId 判断写成恒不等（漏掉 continue），
  // 第 2 用例会包含 'me' → 失败。
})

describe('discoverSessions', () => {
  it('注入 fetch 成功解析映射', async () => {
    const fakeFetch = (async () =>
      ({
        ok: true,
        json: async () => ({
          sessions: [{ id: 'sid-9', metadata: { name: 'alpha' } }],
        }),
      }) as Response) as unknown as typeof fetch
    const map = await discoverSessions('self', fakeFetch)
    expect(map.get('alpha')).toBe('sid-9')
  })

  it('HTTP 非 200 降级空映射', async () => {
    const fakeFetch = (async () =>
      ({ ok: false, json: async () => ({}) }) as Response) as unknown as typeof fetch
    expect((await discoverSessions(undefined, fakeFetch)).size).toBe(0)
  })

  it('fetch 抛错降级空映射（不阻断主流程）', async () => {
    const fakeFetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    expect((await discoverSessions(undefined, fakeFetch)).size).toBe(0)
  })
})
