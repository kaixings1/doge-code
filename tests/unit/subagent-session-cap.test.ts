import { describe, it, expect } from 'vitest'
import { SubAgentManager } from '../../src/features/featureFlags.js'

/**
 * CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION（对齐官方 v2.1.212）
 *
 * 会话累计上限与并发上限是两个独立维度：
 * - maxConcurrent 限制「同时跑几个」
 * - maxTotalSpawns 限制「一共跑过几个」
 *
 * 测试直接使用生产类 SubAgentManager，不复制计数逻辑。
 */
describe('SubAgentManager 会话累计上限', () => {
  it('达到累计上限后 canSpawn 返回 false', async () => {
    const mgr = new SubAgentManager(20, 3, 200, 2)
    expect(mgr.canSpawn()).toBe(true)

    await mgr.spawn(async () => 'a')
    expect(mgr.getStats().totalSpawned).toBe(1)
    expect(mgr.canSpawn()).toBe(true)

    await mgr.spawn(async () => 'b')
    expect(mgr.getStats().totalSpawned).toBe(2)
    expect(mgr.canSpawn()).toBe(false)
  })

  it('累计计数只增不减（并发槽位释放后仍受限）', async () => {
    const mgr = new SubAgentManager(20, 3, 200, 2)
    await mgr.spawn(async () => 'a')
    await mgr.spawn(async () => 'b')

    // 全部执行完毕后 activeCount 归零，但累计仍有 2 个
    expect(mgr.getStats().activeSubAgents).toBe(0)
    expect(mgr.getStats().totalSpawned).toBe(2)
    expect(mgr.canSpawn()).toBe(false)
  })

  it('累计上限与并发上限相互独立', async () => {
    // 并发 2、累计 5：可以跑 5 次，但同一时刻最多 2 个
    const mgr = new SubAgentManager(2, 3, 200, 5)
    for (let i = 0; i < 5; i++) {
      expect(mgr.canSpawn(), 'before spawn ' + i).toBe(true)
      await mgr.spawn(async () => i)
    }
    expect(mgr.getStats().totalSpawned).toBe(5)
    expect(mgr.canSpawn()).toBe(false)
  })

  it('超过累计上限的调用在 canSpawn 阶段就被拒绝，不消耗计数', () => {
    const mgr = new SubAgentManager(20, 3, 200, 0)
    // maxTotalSpawns=0 表示立即拒绝
    expect(mgr.canSpawn()).toBe(false)
    // 只做预检不应改变累计值
    expect(mgr.getStats().totalSpawned).toBe(0)
  })

  it('深度超限优先于累计上限判断', () => {
    const mgr = new SubAgentManager(20, 2, 200, 100)
    expect(mgr.canSpawn(2)).toBe(false)
    expect(mgr.canSpawn(1)).toBe(true)
  })

  it('getStats 暴露累计上限与已用量', () => {
    const mgr = new SubAgentManager(20, 3, 200, 42)
    const stats = mgr.getStats()
    expect(stats.maxTotalSpawns).toBe(42)
    expect(stats.totalSpawned).toBe(0)
  })
})
