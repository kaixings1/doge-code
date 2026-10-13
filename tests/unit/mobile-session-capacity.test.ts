/**
 * MobileSessionManager 名额管理的回归测试。
 *
 * 背景（真实缺陷，由 mobile-permission 测试的失败暴露）：
 *   createSession() 的上限检查用的是 `this.sessions.size`（含已断开的），
 *   而 endSession() 只把状态标为 'disconnected' 却不从 map 删除。
 *
 *   后果：同一 CLI 历史上累计连过 maxSessions 次（换设备、App 重装、
 *   反复重连都会累积），第 N+1 次连接被服务端 close(4002) 拒绝，
 *   且唯一清理途径是 30 分钟超时。用户看到「手机一直连不上，
 *   电脑侧无任何变化」—— 极难排查，因为服务端日志也不显眼。
 *
 * 实测证据（探针输出）：
 *   server.getClientCount()=0 | ws.readyState=3(CLOSED)
 * 即连接在建立后立刻被服务端关闭。
 *
 * 变异验证：把 createSession 里的 purgeDisconnectedSessions() 去掉，
 * 本文件「断开后重连可以超过 maxSessions 次」用例必然失败。
 */
import { describe, it, expect } from 'vitest'
import { MobileSessionManager } from '../../src/bridge/mobileSession.js'

describe('移动会话名额管理', () => {
  it('断开后不占用名额：可反复重连超过 maxSessions 次', () => {
    const mgr = new MobileSessionManager({ maxSessions: 3 })
    // 模拟用户反复重连 10 次（每次断开后才连下一次）
    for (let i = 0; i < 10; i++) {
      const s = mgr.createSession(`device-${i}`, 'android')
      mgr.endSession(s.sessionId)
    }
    // 修复前：第 4 次就 throw「会话数已达上限」
    expect(mgr.getStats().activeSessions).toBe(0)
  })

  it('累计断开数远超上限后仍能连接', () => {
    const mgr = new MobileSessionManager({ maxSessions: 5 })
    for (let i = 0; i < 50; i++) {
      const s = mgr.createSession('phone', 'android')
      mgr.endSession(s.sessionId)
    }
    // 不该抛异常
    const fresh = mgr.createSession('phone', 'android')
    expect(fresh.sessionId).toBeTruthy()
    expect(mgr.getStats().activeSessions).toBe(1)
  })

  it('真正满员（同时活跃）时仍拒绝', () => {
    const mgr = new MobileSessionManager({ maxSessions: 3 })
    mgr.createSession('a', 'android')
    mgr.createSession('b', 'android')
    mgr.createSession('c', 'android')
    // 3 个都活着 → 第 4 个必须被拒（这道防线不能被上面的修复削掉）
    expect(() => mgr.createSession('d', 'android')).toThrow(/上限/)
  })

  it('部分断开后按活跃数判定，而非总数', () => {
    const mgr = new MobileSessionManager({ maxSessions: 3 })
    const a = mgr.createSession('a', 'android')
    mgr.createSession('b', 'android')
    mgr.createSession('c', 'android')
    expect(() => mgr.createSession('d', 'android')).toThrow()

    // a 断开 → 腾出一个名额
    mgr.endSession(a.sessionId)
    expect(() => mgr.createSession('d', 'android')).not.toThrow()
  })

  it('过期会话也腾出名额', async () => {
    // cleanupExpiredSessions 用 `now - lastActivityAt > timeoutMs` 严格大于，
    // 因此 timeoutMs 需给一个正数并真正等待超过它，不能用 0
    //（0 时同一毫秒内 now-lastActivityAt===0，0 > 0 为假，不会清理）。
    const mgr = new MobileSessionManager({ maxSessions: 2, sessionTimeoutMs: 30 })
    mgr.createSession('a', 'android')
    mgr.createSession('b', 'android')
    expect(() => mgr.createSession('c', 'android')).toThrow()

    await new Promise(r => setTimeout(r, 60))
    // 两个都过期 → 名额腾出
    expect(() => mgr.createSession('c', 'android')).not.toThrow()
  })

  it('活跃会话数不因反复断开而膨胀', () => {
    const mgr = new MobileSessionManager({ maxSessions: 20 })
    for (let i = 0; i < 20; i++) {
      const s = mgr.createSession(`d${i}`, 'unknown')
      if (i % 2 === 0) mgr.endSession(s.sessionId) // 一半断开
    }
    // 只应剩 10 个活跃（奇数索引那些没断开的）
    expect(mgr.getStats().activeSessions).toBe(10)
  })
})
