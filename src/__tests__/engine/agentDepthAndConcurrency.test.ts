/**
 * 回归保护：子代理并发上限与嵌套深度。
 *
 * 历史缺陷：
 * 1. SubAgentManager.spawn() 全仓无调用 → activeCount 恒为 0 → canSpawn 恒 true，
 *    并发上限形同虚设。
 * 2. `x as number ?? 0` 被解析成 `(x as number) ?? 0`，x 缺失时结果为空值，
 *    +1 得到 NaN，导致所有 `depth >= MAX` 比较为 false，嵌套上限失效。
 * 3. runAgent 把 depth 写回父级共享的 toolUseContext.options，
 *    并发兄弟代理互相覆盖。
 */
import { describe, expect, it } from 'vitest'
import { SubAgentManager } from '../../features/featureFlags.js'
// 直接导入无重型依赖的独立模块：经 agentToolUtils 导入会触发既有的
// 模块循环依赖（agentToolResultSchema is not a function），与本次修改无关。
import {
  computeNextDepth,
  resolveAgentDepth,
} from '../../tools/AgentTool/agentDepth.js'

describe('SubAgentManager 并发名额', () => {
  it('spawn 维护活跃计数，超限时排队而非直接放行', async () => {
    const mgr = new SubAgentManager(2, 10, 100)
    expect(mgr.getStats().activeSubAgents).toBe(0)

    const order: string[] = []
    const job = (name: string, ms: number) => () =>
      new Promise<void>(resolve => {
        order.push(`start:${name}`)
        setTimeout(() => {
          order.push(`end:${name}`)
          resolve()
        }, ms)
      })

    const all = Promise.all([
      mgr.spawn(job('a', 60)),
      mgr.spawn(job('b', 60)),
      mgr.spawn(job('c', 10)),
    ])

    // 上限为 2，第三个必须等前两个之一结束才开始
    await new Promise(r => setTimeout(r, 20))
    expect(order.filter(o => o.startsWith('start:'))).toHaveLength(2)
    expect(mgr.getStats().activeSubAgents).toBe(2)
    expect(mgr.getStats().waitingQueue).toBe(1)

    await all
    // 全部结束后名额必须释放干净
    expect(mgr.getStats().activeSubAgents).toBe(0)
    expect(order).toHaveLength(6)
  })

  it('canSpawn 在达到 maxDepth 时返回 false（depth 参数不能被忽略）', () => {
    const mgr = new SubAgentManager(10, 3, 100)
    expect(mgr.canSpawn(0)).toBe(true)
    expect(mgr.canSpawn(2)).toBe(true)
    expect(mgr.canSpawn(3)).toBe(false)
    expect(mgr.canSpawn(4)).toBe(false)
  })
})

describe('深度计算（直测生产函数，非复刻）', () => {
  it('根代理（无 agentDepth）的子代理深度为 1', () => {
    expect(computeNextDepth({})).toBe(1)
    expect(computeNextDepth(null)).toBe(1)
  })

  it('已有深度时正确递增', () => {
    expect(computeNextDepth({ agentDepth: 0 })).toBe(1)
    expect(computeNextDepth({ agentDepth: 4 })).toBe(5)
  })

  it('非法值不被当作有效深度', () => {
    // NaN 若被直接使用，会让所有 depth >= MAX 比较恒为 false
    expect(computeNextDepth({ agentDepth: Number.NaN })).toBe(1)
    expect(resolveAgentDepth({ agentDepth: Number.NaN })).toBe(0)
  })

  it('恢复路径沿用原深度，不做 +1', () => {
    expect(resolveAgentDepth({ agentDepth: 3 })).toBe(3)
    expect(resolveAgentDepth({})).toBe(0)
  })

  it('深度到达上限后可被正确比较', () => {
    const MAX = 5
    expect(computeNextDepth({ agentDepth: 4 }) >= MAX).toBe(true)
    expect(computeNextDepth({}) >= MAX).toBe(false)
  })
})
