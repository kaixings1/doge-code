import { describe, it, expect } from 'vitest'
import { ActionSamplerTool, type Action } from '../../tools/ActionSamplerTool/ActionSamplerTool.js'

describe('ActionSamplerTool', () => {
  const makeActions = (count: number): Action[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `a${i}`,
      name: `action_${i}`,
      confidence: 1 - i * 0.1,
      metadata: {},
    }))

  it('greedy 选择置信度最高的动作', async () => {
    const actions = makeActions(3)
    const result = await ActionSamplerTool.call({
      actions,
      strategy: 'greedy',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.selected).toHaveLength(1)
    expect(result.data.selected?.[0].id).toBe('a0')
  })

  it('top_k 返回前K个动作', async () => {
    const actions = makeActions(5)
    const result = await ActionSamplerTool.call({
      actions,
      strategy: 'top_k',
      top_k: 3,
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.selected).toHaveLength(3)
    expect(result.data.selected?.map(s => s.id)).toEqual(['a0', 'a1', 'a2'])
  })

  it('weighted 按置信度排序返回', async () => {
    const actions = makeActions(4)
    const result = await ActionSamplerTool.call({
      actions,
      strategy: 'weighted',
      top_k: 2,
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.selected).toHaveLength(2)
    expect(result.data.selected?.[0].id).toBe('a0')
  })

  it('空 actions 返回错误', async () => {
    const result = await ActionSamplerTool.call({
      actions: [],
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('不能为空')
  })

  it('epsilon_greedy 返回一个动作', async () => {
    const actions = makeActions(3)
    const result = await ActionSamplerTool.call({
      actions,
      strategy: 'epsilon_greedy',
      epsilon: 0.5,
      seed: 42,
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.selected).toHaveLength(1)
    expect(result.data.strategy_used).toBe('epsilon_greedy')
  })

  it('返回总候选数', async () => {
    const actions = makeActions(5)
    const result = await ActionSamplerTool.call({
      actions,
      strategy: 'greedy',
    } as any)
    expect(result.data.total_candidates).toBe(5)
  })
})
