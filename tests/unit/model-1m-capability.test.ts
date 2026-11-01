/**
 * 新模型的上下文能力判定（对齐官方模型表）。
 *
 * 修复前实测：
 *   getCanonicalName('claude-opus-4-7') -> 'claude-opus-4'   ← 被旧条目吃掉
 *   getCanonicalName('claude-opus-5')   -> 'claude-opus'
 *   于是 opus-4-7 / opus-4-8 / opus-5 / sonnet-5 的 supports1M 全为 false，
 *   与官方模型表中这些条目 context.native_1m:true 相反。
 *
 * 数据来源：官方二进制中每个模型条目的结构化定义
 *   context:{window:1e6, native_1m:true, supports_1m_beta:true}
 *   max_output_tokens:{default,upper}
 * 并与本地既有硬编码值交叉校验一致（opus-4-6 / sonnet-4-6 / opus-4-5），
 * 因此不是推测值。
 *
 * 变异验证（必须做）：
 *   - 删掉 firstPartyNameToCanonical 里新增的 opus-4-8 分支
 *     → 「opus-4-8 支持 1M」用例失败
 *   - 把 haiku-4-5 加进 MODELS_WITH_1M_CONTEXT
 *     → 「haiku-4-5 不支持 1M」用例失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import { modelSupports1M } from '../../src/utils/context.js'

/** 官方模型表中 context.window 为 1M（native_1m 或 supports_1m_beta）的模型。 */
const SUPPORTS_1M = [
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5',
]

/** 官方模型表中 window 为 200k 的模型，不得误判为支持 1M。 */
const NOT_1M = ['claude-haiku-4-5', 'claude-opus-4-5', 'claude-sonnet-4-5']

describe('modelSupports1M 对齐官方模型表', () => {
  for (const model of SUPPORTS_1M) {
    it(`${model} 支持 1M`, () => {
      expect(modelSupports1M(model)).toBe(true)
    })
  }

  for (const model of NOT_1M) {
    it(`${model} 不支持 1M`, () => {
      expect(modelSupports1M(model)).toBe(false)
    })
  }

  it('环境开关可整体关闭', () => {
    const prev = process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
    process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT = '1'
    try {
      expect(modelSupports1M('claude-opus-4-8')).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
      else process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT = prev
    }
  })
})
