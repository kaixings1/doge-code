/**
 * 回归保护：discuss 模式下所有角色发言均失败时，结果必须可辨识。
 *
 * 历史缺陷：每个角色的异常被就地 catch 吞掉，只记入 roleResults 后继续下一轮。
 * 模型持续 401/429 时，最终返回的 mergedOutput 来自 discussionHistory（空），
 * 变成「讨论未产生有效结果」，调用方无法区分「模型全挂」与「讨论没结论」。
 */
import { describe, expect, it } from 'vitest'
import { Orchestrator } from '../../engine/orchestrator/orchestrator.js'

function makeOrchestrator(executeLLM: () => Promise<string>) {
  return new Orchestrator(
    { mode: 'discuss', roles: ['pm', 'engineer'], maxDiscussionRounds: 2 },
    { executeLLM },
  )
}

describe('discuss 模式全失败', () => {
  it('所有角色每轮都失败时，错误信息要明确指出「全部失败」', async () => {
    const o = makeOrchestrator(async () => {
      throw new Error('401 Unauthorized')
    })

    const result = await o.run('some task')

    expect(result.success).toBe(false)
    // 关键：不能退化成「讨论未产生有效结果」这种无法归因的文本
    expect(result.mergedOutput).toContain('均失败')
    expect(result.mergedOutput).toContain('401 Unauthorized')
  })

  it('有角色成功发言时不误报为全失败', async () => {
    let call = 0
    const o = makeOrchestrator(async () => {
      call++
      if (call === 1) throw new Error('transient')
      return '我有观点'
    })

    const result = await o.run('some task')

    expect(result.success).toBe(false) // 未达成共识
    expect(result.mergedOutput).not.toContain('全部失败')
    expect(result.mergedOutput).toContain('我有观点')
  })

  it('达成共识时正常返回成功', async () => {
    const o = makeOrchestrator(async () => '[CONSENSUS] 就按方案 A 执行')

    const result = await o.run('some task')

    expect(result.success).toBe(true)
    expect(result.finalStage).toBe('done')
  })
})
