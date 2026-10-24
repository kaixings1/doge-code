/**
 * discoverAssistantSessions 契约单测（死代码清理配套）。
 *
 * 背景：
 *   - `src/commands/assistant/sessionDiscovery.ts` 曾是 `return []` 的空壳，
 *     且零调用者（main.tsx 走的是 `src/assistant/sessionDiscovery.ts` 真实实现）。
 *     该空壳已于 2026-10-19 删除。
 *   - 本测试锁定**真实实现** `src/assistant/sessionDiscovery.ts`：
 *     discoverAssistantSessions() 必须调用 getSessionHistory() 并从中提取
 *     session_start 事件，而非返回空数组。
 *
 * 变异验证：
 *   - 若把真实实现改成 `return []` → 断言「至少提取出一条会话」失败
 *   - 若去掉 `event.type === 'session_start'` 过滤 → 非 start 事件会被计入 → 计数不符
 *   - 若去掉 `includeInactive=false` 时过滤 `ended` → ended 会话不被排除 → 断言失败
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeEvents = [
  {
    type: 'session_start',
    session_id: 's1',
    id: 'e1',
    data: { status: 'active', title: '会话一', message_count: 3 },
    timestamp: '2026-10-19T10:00:00Z',
  },
  {
    // 非 start 事件，应被过滤掉
    type: 'text',
    session_id: 's1',
    timestamp: '2026-10-19T10:01:00Z',
  },
  {
    type: 'session_start',
    session_id: 's2',
    id: 'e3',
    data: { status: 'ended', title: '会话二', message_count: 1 },
    timestamp: '2026-10-19T11:00:00Z',
  },
]

vi.mock('../../src/assistant/sessionHistory.js', () => ({
  getSessionHistory: async () => ({
    events: fakeEvents,
    firstId: null,
    hasMore: false,
  }),
}))

import { discoverAssistantSessions } from '../../src/assistant/sessionDiscovery.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('discoverAssistantSessions 真实实现契约', () => {
  it('从 getSessionHistory 提取 session_start 事件（不返回空）', async () => {
    const sessions = await discoverAssistantSessions({ includeInactive: true })
    expect(sessions.length).toBeGreaterThan(0)
    // 只应有 2 个 session_start，text 事件被过滤；默认场景不含 ended，见下一个用例
    expect(sessions).toHaveLength(2)
  })

  it('默认排除 ended 会话（includeInactive=false）', async () => {
    const sessions = await discoverAssistantSessions()
    expect(sessions.map(s => s.id)).toEqual(['s1'])
    expect(sessions.every(s => s.status !== 'ended')).toBe(true)
  })

  it('includeInactive=true 时保留 ended 会话', async () => {
    const sessions = await discoverAssistantSessions({ includeInactive: true })
    expect(sessions.map(s => s.id).sort()).toEqual(['s1', 's2'])
  })

  it('字段映射正确（title / createdAt / status / messageCount）', async () => {
    const sessions = await discoverAssistantSessions({ includeInactive: true })
    const s1 = sessions.find(s => s.id === 's1')!
    expect(s1.title).toBe('会话一')
    expect(s1.createdAt).toBe('2026-10-19T10:00:00Z')
    expect(s1.status).toBe('active')
    expect(s1.messageCount).toBe(3)
  })

  it('limit 截断生效', async () => {
    const sessions = await discoverAssistantSessions({ includeInactive: true, limit: 1 })
    expect(sessions).toHaveLength(1)
  })

  it('getSessionHistory 失败时回退空数组（不抛错）', async () => {
    vi.resetModules()
    vi.doMock('../../src/assistant/sessionHistory.js', () => ({
      getSessionHistory: async () => { throw new Error('boom') },
    }))
    const mod = await import('../../src/assistant/sessionDiscovery.js')
    const sessions = await mod.discoverAssistantSessions()
    expect(sessions).toEqual([])
  })
})
