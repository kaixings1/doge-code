/**
 * /clear 用量保存契约单测。
 *
 * 背景：/clear 调用 regenerateSessionId() 生成新会话 ID，但此前未调用
 * saveCurrentSessionCosts()，导致当前会话累计 token/费用不落盘——
 * 与官方 v2.1.302「新进程恢复后归零」同类缺陷（doge 本地表现为
 * /clear 后同进程切换或 resume 时用量归零）。
 *
 * 修复（src/commands/clear/conversation.ts）：regenerateSessionId 之前
 * 先 saveCurrentSessionCosts()。
 *
 * 本测试锁定修复依赖的核心语义不变量：
 *   save 用「当前 sessionId」写入 project config 的 lastSessionId；
 *   regenerate 改变 sessionId 后，用「旧 sessionId」仍可 restore 成功。
 *
 * 注意：测试直接驱动 cost-tracker 的 save/restore 契约，而非 import
 * clearConversation（该函数级联 30+ 重型模块，单测成本过高）。修复点
 * （src/commands/clear/conversation.ts 在 regenerateSessionId 前调用
 * saveCurrentSessionCosts）由代码审查保证；本测试保证该不变量一旦
 * 被破坏（save 不先于 regenerate）restore 旧 ID 即失败。
 *
 * 变异验证：第二个用例证明「未 save 则 restore 失败」，即 save 是该
 * 不变量成立的必要条件。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 用内存对象充当 project config 读写层，隔离真实文件系统/JSON 解析
let store: Record<string, unknown> = {}
let sessionId = 'old-session-id' as unknown as import('../../src/types/ids.js').SessionId

vi.mock('../../src/utils/config.ts', () => ({
  getCurrentProjectConfig: () => store,
  saveCurrentProjectConfig: (updater: (c: Record<string, unknown>) => Record<string, unknown>) => {
    store = updater(store)
  },
}))

// regenerateSessionId 改的是 bootstrap/state 的 STATE.sessionId；这里直接
// 拦截它以便在测试中模拟「生成新 ID」的副作用。
vi.mock('../../src/bootstrap/state.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../src/bootstrap/state.js')>()
  return {
    ...actual,
    regenerateSessionId: (opts: { setCurrentAsParent?: boolean }) => {
      // 仅需模拟「生成新 ID」副作用：改局部 sessionId，
      // 因为 getSessionId 已被 mock 返回该局部变量。
      // setCurrentAsParent 在真实实现中设置 STATE.parentSessionId，
      // 本测试不依赖该字段，故忽略 opts。
      void opts
      sessionId = 'new-session-id' as unknown as import('../../src/types/ids.js').SessionId
      return sessionId
    },
    getSessionId: () => sessionId,
  }
})

const { saveCurrentSessionCosts, restoreCostStateForSession } = await import(
  '../../src/cost-tracker.ts'
)

describe('clear 用量保存契约', () => {
  beforeEach(() => {
    store = {}
    sessionId = 'old-session-id' as unknown as import('../../src/types/ids.js').SessionId
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('save 后用旧 sessionId 可恢复（修复依赖的不变量）', async () => {
    // 模拟 /clear 正确顺序：save（旧 ID）→ regenerate（新 ID）
    saveCurrentSessionCosts()
    const { regenerateSessionId } = await import('../../src/bootstrap/state.js')
    regenerateSessionId({ setCurrentAsParent: true })
    // regenerateSessionId 已被 mock 改为 new-session-id
    expect(sessionId).toBe('new-session-id')

    // 用旧 ID 恢复，应成功命中（lastSessionId 记录的是旧 ID）
    const restored = restoreCostStateForSession('old-session-id')
    expect(restored).toBe(true)
  })

  it('未 save 时 restore 旧 ID 应失败（证明 save 是关键）', () => {
    // 跳过 save，直接 regenerate
    expect(sessionId).toBe('old-session-id')
    const restored = restoreCostStateForSession('old-session-id')
    // store 为空，lastSessionId 未设置 → 返回 false
    expect(restored).toBe(false)
  })
})
