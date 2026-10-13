import { describe, expect, it } from 'vitest'
import { MobileSessionManager } from '../../bridge/mobileSession.js'

/**
 * 会话回收回归测试。
 *
 * 真机 bug：endSession 只标记 disconnected 却不从 map 移除 →
 * sessions.size 永不下降 → 同一手机反复重连打满 5 个上限后**永久拒绝**，
 * 表现为 WS 刚握上手就被服务端 close（客户端 EOFException）。
 */

describe('MobileSessionManager 会话回收', () => {
  it('endSession 后会话数下降（可再次建满上限）', () => {
    const m = new MobileSessionManager({ maxSessions: 2 })
    const a = m.createSession('dev-a')
    m.createSession('dev-b')

    // 打满：第 3 个应抛「已达上限」
    expect(() => m.createSession('dev-c')).toThrow(/上限/)

    // 断开 a → 释放一个名额
    m.endSession(a.sessionId)

    // 现在应能再建（若 endSession 不删，这里会抛「已达上限」）
    expect(() => m.createSession('dev-d')).not.toThrow()
  })

  it('反复连接-断开不累积僵尸会话', () => {
    const m = new MobileSessionManager({ maxSessions: 2 })
    // 模拟同一手机重连 10 次：每次建后立刻断
    for (let i = 0; i < 10; i++) {
      const s = m.createSession('android-app')
      m.endSession(s.sessionId)
    }
    // 若 Zombie 累积，第 3 次就该抛错；能跑完 10 次即证明已回收
    expect(m.getActiveSessions().length).toBe(0)
  })

  it('endSession 对不存在的会话返回 false（幂等安全）', () => {
    const m = new MobileSessionManager({ maxSessions: 5 })
    expect(m.endSession('mobile-nonexistent')).toBe(false)
  })
})
