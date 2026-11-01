/**
 * 新模型定价（对齐官方模型目录的 pricing_tiers 表）。
 *
 * 修复前实测：claude-opus-4-7 / 4-8 / opus-5 没有 MODEL_COSTS 条目，
 * getModelCosts() 回落到默认档 COST_TIER_3_15（$3/$15），而它们实际是
 * Opus 档 $5/$25 —— **成本被低估 40%**。
 *
 * 数据来源（权威、非推测）：官方二进制中的模型目录同时包含
 *   pricing_tiers:{tier_5_25:{input:5,output:25,cache_read:0.5,...}, ...}
 * 与每个模型条目的 pricing:"tier_5_25" 归属。已与本地既有档位交叉校验一致
 * （tier_3_15 / tier_5_25 / tier_15_75 三项全对）。
 *
 * 变异验证（必须做）：
 *   - 删掉 MODEL_COSTS 里 'claude-opus-4-8' 条目 → 该模型用例失败（回落到 3/15）
 *   - 把 'claude-sonnet-5' 映射到 COST_TIER_3_15 → 该模型用例失败
 *   - 删掉 firstPartyNameToCanonical 的 mythos 分支 → mythos 用例失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import { enableConfigs } from '../../src/utils/config.js'

enableConfigs()

const { getModelCosts } = await import('../../src/utils/modelCost.js')

const USAGE = {
  input_tokens: 1_000_000,
  output_tokens: 1_000_000,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
} as never

function costsFor(model: string): {
  input: number
  output: number
  cacheRead: number
} {
  const c = (getModelCosts as never as (m: string, u: never) => any)(model, USAGE)
  return {
    input: c.inputTokens,
    output: c.outputTokens,
    cacheRead: c.promptCacheReadTokens,
  }
}

/** 期望值 = 官方 pricing_tiers 表的 input / output / cache_read。 */
const EXPECTED: Record<string, [number, number, number]> = {
  'claude-opus-4-6': [5, 25, 0.5],
  'claude-opus-4-7': [5, 25, 0.5],
  'claude-opus-4-8': [5, 25, 0.5],
  'claude-opus-5': [5, 25, 0.5],
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5': [2, 10, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.1],
  'claude-fable-5': [10, 50, 1],
  'claude-fable-5-1': [10, 50, 0.25],
  'claude-mythos-5': [10, 50, 1],
  'claude-mythos-5-1': [10, 50, 0.25],
}

describe('新模型定价对齐官方 pricing_tiers', () => {
  for (const [model, [input, output, cacheRead]] of Object.entries(EXPECTED)) {
    it(`${model} → $${input}/$${output}`, () => {
      const c = costsFor(model)
      expect(c.input).toBe(input)
      expect(c.output).toBe(output)
      expect(c.cacheRead).toBe(cacheRead)
    })
  }

  it('Opus 档不再回落到 Sonnet 档（$3/$15）', () => {
    // 这条是本轮修的核心 bug：缺失条目会静默回落到默认档位
    for (const model of ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5']) {
      const c = costsFor(model)
      expect(c.input).not.toBe(3)
      expect(c.output).not.toBe(15)
    }
  })
})
