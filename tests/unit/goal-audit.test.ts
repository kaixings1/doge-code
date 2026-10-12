/**
 * 阶段五：审计与可见性测试
 *
 * 覆盖：
 *  - statusBadge 六状态映射
 *  - renderStatus：进度条、token、时长、裁判次数
 *  - renderHistory：事件汇总统计、token 小计、时间线、空态
 *  - progressBar 边界（0/total、total<=0）
 */

import { describe, it, expect } from 'vitest'
import { renderStatus, renderHistory, statusBadge, eventIcon } from '../../src/commands/goal/goal.tsx'
import { progressBar } from '../../src/commands/loop/progress-ui.js'
import { createGoal, recordIteration, transition } from '../../src/services/goal/goalState.js'

describe('statusBadge', () => {
  it('六种状态各有徽标', () => {
    expect(statusBadge('active')).toContain('active')
    expect(statusBadge('paused')).toContain('paused')
    expect(statusBadge('budget_limited')).toContain('budget_limited')
    expect(statusBadge('complete')).toContain('complete')
    expect(statusBadge('impossible')).toContain('impossible')
    expect(statusBadge('error')).toContain('error')
  })
})

describe('progressBar', () => {
  it('0/total → 全空', () => {
    expect(progressBar(0, 10, 10)).toBe('[' + '░'.repeat(10) + ']')
  })
  it('total → 全满', () => {
    expect(progressBar(10, 10, 10)).toBe('[' + '█'.repeat(10) + ']')
  })
  it('total<=0 容错', () => {
    expect(progressBar(5, 0, 6)).toBe('[' + '░'.repeat(6) + ']')
  })
  it('一半', () => {
    expect(progressBar(5, 10, 10)).toBe('[' + '█'.repeat(5) + '░'.repeat(5) + ']')
  })
})

describe('eventIcon', () => {
  it('关键事件有图标，未知回退 •', () => {
    expect(eventIcon('judge_ok')).toBe('✅')
    expect(eventIcon('judge_impossible')).toBe('⛔')
    expect(eventIcon('circuit_break')).toBe('🔌')
    expect(eventIcon('unknown_type')).toBe('•')
  })
})

describe('renderStatus', () => {
  it('无目标 → 提示设置', () => {
    expect(renderStatus(null)).toContain('当前无活跃目标')
  })

  it('活跃目标 → 含进度条/token/时长/裁判次数', () => {
    const g = createGoal('让测试通过', { criteria: ['0 失败'] })
    g.usage.iterations = 3
    g.usage.tokenUsed = 1234
    g.budget.maxIterations = 10
    g.lastJudge = { ok: false, impossible: false, reason: 'MISSING: 还有2个失败', at: Date.now() }
    g.history.push({ type: 'judge_not_ok', timestamp: Date.now(), detail: 'MISSING: x' })

    const out = renderStatus(g)
    expect(out).toContain('让测试通过')
    expect(out).toContain('0 失败')
    expect(out).toContain('🎯 目标状态')
    expect(out).toContain('█') // 进度条
    expect(out).toContain('3/10')
    expect(out).toContain('1234')
    expect(out).toContain('裁判次数')
    expect(out).toContain('未达成')
  })

  it('达成目标 → 显示 ✅ 与 complete 徽标', () => {
    const g = createGoal('t')
    transition(g, 'complete', 'judge_ok', '达成')
    g.lastJudge = { ok: true, impossible: false, reason: 'EVIDENCE: 通过', at: Date.now() }
    const out = renderStatus(g)
    expect(out).toContain('complete')
    expect(out).toContain('已达成')
  })

  it('budget_limited 且超限 → 显示预算告警', () => {
    const g = createGoal('t', { budget: { maxIterations: 2 } })
    g.usage.iterations = 2
    g.status = 'budget_limited'
    const out = renderStatus(g)
    expect(out).toContain('budget_limited')
    expect(out).toContain('已达迭代上限')
  })
})

describe('renderHistory', () => {
  it('无目标 → 当前无活跃目标', () => {
    expect(renderHistory(null)).toContain('当前无活跃目标')
  })

  it('空历史 → 无事件记录', () => {
    const g = createGoal('t')
    g.history = []
    expect(renderHistory(g)).toContain('无事件记录')
  })

  it('汇总统计与 token 小计', () => {
    const g = createGoal('t')
    g.history = [
      { type: 'set', timestamp: Date.now(), detail: '设置' },
      { type: 'judge_not_ok', timestamp: Date.now(), detail: 'MISSING: a' },
      { type: 'judge_not_ok', timestamp: Date.now(), detail: 'MISSING: b' },
      { type: 'judge_ok', timestamp: Date.now(), detail: 'EVIDENCE: 通过' },
      { type: 'iteration_end', timestamp: Date.now(), detail: '第1轮', tokensThisTurn: 500 },
      { type: 'iteration_end', timestamp: Date.now(), detail: '第2轮', tokensThisTurn: 300 },
    ]
    const out = renderHistory(g)
    expect(out).toContain('共 6 条')
    expect(out).toContain('judge_not_ok×2')
    expect(out).toContain('本轮累计 token**：800')
    expect(out).toContain('时间线')
  })

  it('长 detail 截断', () => {
    const g = createGoal('t')
    g.history = [{ type: 'judge_not_ok', timestamp: Date.now(), detail: 'x'.repeat(120) }]
    const out = renderHistory(g)
    expect(out).toContain('…')
  })
})
