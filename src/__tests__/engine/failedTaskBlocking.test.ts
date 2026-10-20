/**
 * 回归保护：失败的阻塞者不得让下游永久卡死。
 *
 * 背景：引入 'failed' 终态后，多处「阻塞判定」仍写成 `status !== 'completed'`，
 * 于是失败任务被当成「未解决」，其 blockedBy 下游永远无法被选中，
 * 且没有任何清理路径会解除阻塞。
 *
 * 语义区分：
 *   - 是否已结束 → completed 或 failed（isTerminalStatus）
 *   - 是否成功   → 仅 completed（isSuccessfulStatus）
 */
import { describe, expect, it } from 'vitest'
import { isSuccessfulStatus, isTerminalStatus } from '../../utils/tasks.js'

describe('任务状态语义', () => {
  it('completed 与 failed 都是终态', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
  })

  it('pending 与 in_progress 未终结', () => {
    expect(isTerminalStatus('pending')).toBe(false)
    expect(isTerminalStatus('in_progress')).toBe(false)
  })

  it('只有 completed 算成功，failed 不算', () => {
    expect(isSuccessfulStatus('completed')).toBe(true)
    expect(isSuccessfulStatus('failed')).toBe(false)
    expect(isSuccessfulStatus('pending')).toBe(false)
  })

  it('失败的上游不再阻塞下游（复现原缺陷的核心判定）', () => {
    const tasks = [
      { id: 'A', status: 'failed' as const, blockedBy: [] as string[] },
      { id: 'B', status: 'pending' as const, blockedBy: ['A'] },
    ]

    // 阻塞集合必须只包含「未终结」的任务
    const unresolvedIds = new Set(
      tasks.filter(t => !isTerminalStatus(t.status)).map(t => t.id),
    )
    expect(unresolvedIds.has('A')).toBe(false)

    // 因此 B 应可被选中
    const available = tasks.filter(
      task =>
        task.status === 'pending' && task.blockedBy.every(id => !unresolvedIds.has(id)),
    )
    expect(available.map(t => t.id)).toEqual(['B'])
  })

  it('未终结的上游仍然阻塞下游', () => {
    const tasks = [
      { id: 'A', status: 'in_progress' as const, blockedBy: [] as string[] },
      { id: 'B', status: 'pending' as const, blockedBy: ['A'] },
    ]
    const unresolvedIds = new Set(
      tasks.filter(t => !isTerminalStatus(t.status)).map(t => t.id),
    )
    expect(unresolvedIds.has('A')).toBe(true)
  })
})
