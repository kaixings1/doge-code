/**
 * 分层模型路由 / 请求去重 守卫。
 *
 * 覆盖：
 * 1. classify：强信号（架构/并发/安全）直接判 strong
 * 2. classify：机械型任务（格式/重命名/解释）判 cheap
 * 3. classify：常规实现 + 测试 → standard
 * 4. requireStrong 覆盖一切
 * 5. estimateTiers：cheap < standard < strong，且 savings 与成本互补
 * 6. RequestDeduper：并发同 key 只执行一次；完成后 TTL 内直接复用；不同 key 互不影响
 * 7. fingerprint：对象键顺序不影响指纹（稳定序列化）
 *
 * 变异验证：把 classify 的 STRONG_PATTERNS 循环删掉 → 用例 1 失败；
 *          run() 去掉 inflight 复用 → 用例 6 的并发计数断言失败。
 */
import { describe, it, expect } from 'vitest'
import { RequestDeduper, classify, estimateTiers } from '../../src/utils/modelRouter.js'

describe('classify — 强信号', () => {
  it.each([
    '帮我重构整个认证模块的架构',
    '排查这个死锁的根因',
    '做一次安全审计，找出注入风险',
    '把整个 codebase 的性能优化到 O(n)',
  ])('%s → strong', text => {
    expect(classify({ text }).tier).toBe('strong')
  })
})

describe('classify — 机械型任务', () => {
  it('纯格式/改名/解释 → cheap', () => {
    expect(classify({ text: '把这个文件按格式重命名一下，顺便润色注释' }).tier).toBe('cheap')
    expect(classify({ text: '解释一下这个函数是做什么的' }).tier).toBe('cheap')
  })
})

describe('classify — 常规实现', () => {
  it('实现功能 + 写测试 → standard 或以上，且不是 cheap', () => {
    const r = classify({ text: '实现用户导出 CSV 的功能，并补充单元测试' })
    expect(r.tier).not.toBe('cheap')
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('requireStrong 强制 strong', () => {
    expect(classify({ text: '改个注释', requireStrong: true }).tier).toBe('strong')
  })
})

describe('estimateTiers', () => {
  it('成本排序与节省额互补', () => {
    const rows = estimateTiers({ requests: 100, currentCostUSD: 10 })
    const by = Object.fromEntries(rows.map(r => [r.tier, r]))
    expect(by.cheap.estimatedCostUSD).toBeLessThan(by.standard.estimatedCostUSD)
    expect(by.standard.estimatedCostUSD).toBeLessThan(by.strong.estimatedCostUSD)
    for (const r of rows) {
      expect(r.estimatedCostUSD + r.savingsVsStrong).toBeCloseTo(10, 10)
    }
  })
})

describe('RequestDeduper', () => {
  it('并发同 key 只执行一次', async () => {
    const d = new RequestDeduper()
    let calls = 0
    const fn = async () => {
      calls++
      await new Promise(r => setTimeout(r, 20))
      return 'result'
    }
    const [a, b, c] = await Promise.all([
      d.run('k', fn),
      d.run('k', fn),
      d.run('k', fn),
    ])
    expect(calls).toBe(1)
    expect(a).toBe('result')
    expect(b).toBe('result')
    expect(c).toBe('result')
  })

  it('完成后 TTL 内复用结果', async () => {
    const d = new RequestDeduper()
    let calls = 0
    const fn = async () => {
      calls++
      return calls
    }
    await d.run('k', fn)
    await d.run('k', fn)
    expect(calls).toBe(1)
    expect(d.getCached('k')).toBe(1)
  })

  it('不同 key 互不影响', async () => {
    const d = new RequestDeduper()
    let calls = 0
    const fn = async () => ++calls
    await d.run('a', fn)
    await d.run('b', fn)
    expect(calls).toBe(2)
    expect(d.size).toBe(2)
  })

  it('TTL 过期后重新执行', async () => {
    const d = new RequestDeduper(10)
    let calls = 0
    const fn = async () => ++calls
    await d.run('k', fn)
    await new Promise(r => setTimeout(r, 20))
    await d.run('k', fn)
    expect(calls).toBe(2)
  })

  it('fingerprint 对对象键顺序不敏感', () => {
    const a = RequestDeduper.fingerprint({ text: 'x', model: 'm', extra: { a: 1, b: 2 } })
    const b = RequestDeduper.fingerprint({ text: 'x', model: 'm', extra: { b: 2, a: 1 } })
    expect(a).toBe(b)
    const c = RequestDeduper.fingerprint({ text: 'x', model: 'm', extra: { a: 2, b: 1 } })
    expect(c).not.toBe(a)
  })
})
