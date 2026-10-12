/**
 * /goal 状态层与预算熔断单元测试
 *
 * 覆盖：
 * - 状态转换矩阵（合法/非法迁移）
 * - 三级预算边界（恰好等于 / 超过阈值）
 * - 两级熔断（快速循环、进度停滞）
 * - 裁判三态解析（EVIDENCE / MISSING / IMPOSSIBLE 前缀）
 */

import { describe, it, expect } from 'vitest'
import { createGoal, transition, recordIteration } from '../../src/services/goal/goalState.js'
import {
  checkBudget,
  detectFastLoop,
  detectStagnation,
  reasonsSimilar,
  evaluateGate,
} from '../../src/services/goal/budget.js'
import { parseJudgeVerdict, DEFAULT_BUDGET } from '../../src/services/goal/types.js'

describe('goal 状态层', () => {
  it('createGoal 生成 active 状态并记录 set 事件', () => {
    const g = createGoal('让测试通过', { criteria: ['0 失败'] })
    expect(g.status).toBe('active')
    expect(g.objective).toBe('让测试通过')
    expect(g.criteria).toEqual(['0 失败'])
    expect(g.history[0]!.type).toBe('set')
    expect(g.budget.maxIterations).toBe(DEFAULT_BUDGET.maxIterations)
  })

  it('合法迁移：active → paused → active', () => {
    const g = createGoal('t')
    expect(transition(g, 'paused', 'pause', '暂停')).toBe(true)
    expect(g.status).toBe('paused')
    expect(transition(g, 'active', 'resume', '恢复')).toBe(true)
    expect(g.status).toBe('active')
  })

  it('非法迁移被拒绝：complete 后不可再激活', () => {
    const g = createGoal('t')
    expect(transition(g, 'complete', 'judge_ok', '达成')).toBe(true)
    expect(g.status).toBe('complete')
    expect(transition(g, 'active', 'resume', '恢复')).toBe(false)
    expect(g.status).toBe('complete')
  })

  it('非法迁移被拒绝：paused 不可直接 complete（须先 active）', () => {
    const g = createGoal('t')
    transition(g, 'paused', 'pause', '暂停')
    expect(transition(g, 'complete', 'judge_ok', '达成')).toBe(false)
  })

  it('recordIteration 累积迭代与 token', () => {
    const g = createGoal('t')
    recordIteration(g, 100, '第 1 轮')
    recordIteration(g, 250, '第 2 轮')
    expect(g.usage.iterations).toBe(2)
    expect(g.usage.tokenUsed).toBe(350)
  })
})

describe('三级预算', () => {
  it('未超预算', () => {
    const g = createGoal('t')
    expect(checkBudget(g).exceeded).toBe(false)
  })

  it('迭代恰好等于上限即触发（边界）', () => {
    const g = createGoal('t', { budget: { maxIterations: 2 } })
    g.usage.iterations = 1
    expect(checkBudget(g).exceeded).toBe(false)
    g.usage.iterations = 2
    expect(checkBudget(g).exceeded).toBe(true)
  })

  it('token 恰好等于预算即触发，且 tokenBudget=0 时永不触发', () => {
    const g = createGoal('t', { budget: { tokenBudget: 100 } })
    g.usage.tokenUsed = 99
    expect(checkBudget(g).exceeded).toBe(false)
    g.usage.tokenUsed = 100
    expect(checkBudget(g).exceeded).toBe(true)

    const g2 = createGoal('t', { budget: { tokenBudget: 0 } })
    g2.usage.tokenUsed = 9_999_999
    expect(checkBudget(g2).exceeded).toBe(false)
  })

  it('墙钟超时按 now 判定', () => {
    const g = createGoal('t', { budget: { wallClockMs: 1000 } })
    expect(checkBudget(g, g.usage.startedAt + 999).exceeded).toBe(false)
    expect(checkBudget(g, g.usage.startedAt + 1000).exceeded).toBe(true)
  })
})

describe('两级熔断', () => {
  it('一级：窗口内触发 4 次且 token 极低 → 空转', () => {
    const now = Date.now()
    const hb = {
      timestamps: [now - 1000, now - 2000, now - 3000, now - 4000],
      tokens: [10, 20, 30, 40],
    }
    expect(detectFastLoop(hb, now)).toBe(true)
  })

  it('一级：触发次数够但 token 不低 → 不算空转', () => {
    const now = Date.now()
    const hb = {
      timestamps: [now - 1000, now - 2000, now - 3000, now - 4000],
      tokens: [5000, 5000, 5000, 5000],
    }
    expect(detectFastLoop(hb, now)).toBe(false)
  })

  it('二级：连续 3 条相似 reason → 停滞', () => {
    const reasons = [
      'MISSING: 测试尚未全部通过 还有 3 个失败',
      'MISSING: 测试尚未全部通过 还有 3 个失败',
      'MISSING: 测试尚未全部通过 还有 3 个失败',
    ]
    expect(detectStagnation(reasons)).toBe(true)
  })

  it('二级：reason 有实质变化 → 不判停滞', () => {
    const reasons = [
      'MISSING: 测试还有 5 个失败',
      'MISSING: 测试还有 2 个失败',
      'MISSING: 只剩 1 个失败',
    ]
    expect(detectStagnation(reasons)).toBe(false)
  })

  it('reasonsSimilar 空串处理', () => {
    expect(reasonsSimilar('', '')).toBe(true)
    expect(reasonsSimilar('a b c', 'x y z')).toBe(false)
  })

  it('evaluateGate 归一：预算优先于熔断', () => {
    const g = createGoal('t', { budget: { maxIterations: 1 } })
    g.usage.iterations = 1
    const d = evaluateGate(g, { timestamps: [], tokens: [] }, [])
    expect(d.allow).toBe(false)
    expect(d.kind).toBe('budget')
  })
})

describe('裁判三态解析', () => {
  it('ok:true → 达成', () => {
    const v = parseJudgeVerdict({ ok: true, reason: 'EVIDENCE: 测试输出 0 failed' })
    expect(v.ok).toBe(true)
    expect(v.impossible).toBe(false)
  })

  it('MISSING 前缀 → 未达成', () => {
    const v = parseJudgeVerdict({ ok: false, reason: 'MISSING: 还有 2 个失败' })
    expect(v.ok).toBe(false)
    expect(v.impossible).toBe(false)
  })

  it('IMPOSSIBLE 前缀 → 不可能', () => {
    const v = parseJudgeVerdict({
      ok: false,
      reason: 'IMPOSSIBLE: 目标引用的文件不存在且无法创建',
    })
    expect(v.ok).toBe(false)
    expect(v.impossible).toBe(true)
  })

  it('无 reason 容错', () => {
    const v = parseJudgeVerdict({ ok: false })
    expect(v.ok).toBe(false)
    expect(v.impossible).toBe(false)
  })
})
