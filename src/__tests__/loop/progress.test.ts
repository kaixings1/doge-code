import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildProgressSummary,
  shouldAskUser,
  buildAskQuestion,
  summarizeSubtasks,
  createProgressReporter,
} from '../../commands/loop/progress.js'
import type { SubTask } from '../../commands/loop/types.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildProgressSummary', () => {
  it('包含迭代/任务/耗时信息', () => {
    const summary = buildProgressSummary({
      iteration: 3,
      maxIterations: 10,
      totalTasks: 5,
      completed: 2,
      failed: 1,
      currentTask: '实现功能',
      elapsedMs: 120_000,
    })
    expect(summary).toContain('3/10')
    expect(summary).toContain('2/5')
    expect(summary).toContain('1 失败')
    expect(summary).toContain('120')
  })

  it('空当前任务时不显示当前', () => {
    const summary = buildProgressSummary({
      iteration: 1,
      maxIterations: 10,
      totalTasks: 3,
      completed: 0,
      failed: 0,
      currentTask: '',
      elapsedMs: 1000,
    })
    expect(summary).not.toContain('当前')
  })
})

describe('shouldAskUser', () => {
  const base = {
    iteration: 1,
    maxIterations: 10,
    totalTasks: 4,
    completed: 0,
    failed: 1,
    elapsedMs: 10_000,
  }

  it('迭代不足时不触发', () => {
    expect(shouldAskUser([], base)).toBe(false)
  })

  it('连续无进展且存在失败时触发', () => {
    const history = [
      { iteration: 1, event: 'iteration_complete', completedDelta: 0 },
      { iteration: 2, event: 'iteration_complete', completedDelta: 0 },
      { iteration: 3, event: 'iteration_complete', completedDelta: 0 },
    ]
    expect(
      shouldAskUser(history, { ...base, iteration: 3, failed: 2 }),
    ).toBe(true)
  })

  it('有进展时不触发', () => {
    const history = [
      { iteration: 1, event: 'iteration_complete', completedDelta: 1 },
      { iteration: 2, event: 'iteration_complete', completedDelta: 1 },
      { iteration: 3, event: 'iteration_complete', completedDelta: 1 },
    ]
    expect(shouldAskUser(history, { ...base, iteration: 3 })).toBe(false)
  })

  it('过半仍未达标且存在失败时触发', () => {
    expect(
      shouldAskUser([], { ...base, iteration: 6, maxIterations: 10, failed: 1 }),
    ).toBe(true)
  })

  it('预算使用超过 80% 时触发', () => {
    expect(
      shouldAskUser([], { ...base, iteration: 2, elapsedMs: 90_000, budgetMs: 100_000 }),
    ).toBe(true)
  })
})

describe('buildAskQuestion', () => {
  it('包含目标/进度/选项提示', () => {
    const q = buildAskQuestion('重构 utils', {
      iteration: 5,
      maxIterations: 10,
      completed: 2,
      failed: 1,
      currentTask: '实现',
    })
    expect(q).toContain('重构 utils')
    expect(q).toContain('5/10')
    expect(q).toContain('2 完成')
  })
})

describe('summarizeSubtasks', () => {
  it('统计各状态数量', () => {
    const subTasks: SubTask[] = [
      { id: 'a', description: 'A', status: 'completed' },
      { id: 'b', description: 'B', status: 'failed' },
      { id: 'c', description: 'C', status: 'running' },
      { id: 'd', description: 'D', status: 'pending' },
    ]
    const s = summarizeSubtasks(subTasks)
    expect(s.total).toBe(4)
    expect(s.completed).toBe(1)
    expect(s.failed).toBe(1)
    expect(s.running).toBe(1)
    expect(s.pending).toBe(1)
    expect(s.currentTask).toBe('C')
  })
})

describe('createProgressReporter', () => {
  it('定时汇报并正确停止', () => {
    vi.useFakeTimers()
    const onReport = vi.fn()
    const reporter = createProgressReporter({
      intervalMs: 1000,
      getState: () => ({
        iteration: 1,
        maxIterations: 5,
        totalTasks: 3,
        completed: 1,
        failed: 0,
        currentTask: '',
        elapsedMs: 1000,
      }),
      onReport,
    })

    reporter.start()
    vi.advanceTimersByTime(3500)
    expect(onReport).toHaveBeenCalled()

    const calls = onReport.mock.calls.length
    reporter.stop()
    vi.advanceTimersByTime(5000)
    expect(onReport.mock.calls.length).toBe(calls)

    vi.useRealTimers()
  })
})
