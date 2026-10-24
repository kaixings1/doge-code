/**
 * `--autocompact` 解析回归测试（对应 diff_with_claude.md §2.1 / §7.4）。
 *
 * 变异验证：把下限判断去掉 → "低于 100k 被拒"用例失败；
 * 把 k/m 换算写反 → 单位换算用例失败。
 */
import { describe, expect, it } from 'vitest'
import {
  AUTOCOMPACT_MAX_TOKENS,
  AUTOCOMPACT_MIN_TOKENS,
  applyAutoCompactFlag,
  parseAutoCompactFlag,
} from '../../src/utils/autocompactFlag.js'

describe('--autocompact 解析', () => {
  it('auto 表示沿用模型默认', () => {
    expect(parseAutoCompactFlag('auto')).toEqual({ kind: 'auto' })
    expect(parseAutoCompactFlag('  AUTO ')).toEqual({ kind: 'auto' })
  })

  it('支持 k / m 单位与裸数字', () => {
    expect(parseAutoCompactFlag('100k')).toEqual({ kind: 'tokens', tokens: 100_000 })
    expect(parseAutoCompactFlag('200K')).toEqual({ kind: 'tokens', tokens: 200_000 })
    expect(parseAutoCompactFlag('1m')).toEqual({ kind: 'tokens', tokens: 1_000_000 })
    expect(parseAutoCompactFlag('500000')).toEqual({ kind: 'tokens', tokens: 500_000 })
  })

  it('低于 100k 或高于 1M 被拒', () => {
    expect(() => parseAutoCompactFlag('50k')).toThrow(/100000–1000000/)
    expect(() => parseAutoCompactFlag('99k')).toThrow()
    expect(() => parseAutoCompactFlag('2m')).toThrow()
    expect(AUTOCOMPACT_MIN_TOKENS).toBe(100_000)
    expect(AUTOCOMPACT_MAX_TOKENS).toBe(1_000_000)
  })

  it('非数字输入被拒', () => {
    expect(() => parseAutoCompactFlag('lots')).toThrow(/取值范围无效/)
    expect(() => parseAutoCompactFlag('100kt')).toThrow()
  })

  it('applyAutoCompactFlag 写入 / 清除环境变量', () => {
    const env: Record<string, string | undefined> = {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '123',
    }
    applyAutoCompactFlag({ kind: 'tokens', tokens: 250_000 }, env)
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('250000')

    applyAutoCompactFlag({ kind: 'auto' }, env)
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBeUndefined()
  })
})
