/**
 * `CLAUDE_CODE_SUBAGENT_EFFORT`（官方 2.1.316）。
 *
 * 官方描述：set the effort level subagents run at **when nothing else names
 * one**, instead of inheriting the session's.
 *
 * 三个最容易实现错的点，逐一覆盖：
 * 1. 子代理显式指定了 effort → 环境变量**不得**覆盖（"when nothing else
 *    names one"）
 * 2. 没有显式指定 → 环境变量替代「继承会话 effort」
 * 3. 未设置 → 行为完全不变（仍继承会话）
 *
 * 另覆盖取值范围（与 parseEffortValue 一致：low/medium/high/max 或数字）。
 *
 * 变异验证（必须做）：
 *   - 把 explicitlySet 判断去掉 → 用例 1 失败
 *   - 把 override 与 sessionEffort 优先级对调 → 用例 2 失败
 *   - 未设置时直接返回 undefined 而非 sessionEffort → 用例 3 失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import {
  getSubagentEffortOverride,
  resolveSubagentEffort,
} from '../../src/utils/subagentEffort.js'

describe('getSubagentEffortOverride', () => {
  it('解析合法取值', () => {
    expect(getSubagentEffortOverride({ CLAUDE_CODE_SUBAGENT_EFFORT: 'low' } as never)).toBe('low')
    expect(getSubagentEffortOverride({ CLAUDE_CODE_SUBAGENT_EFFORT: 'HIGH' } as never)).toBe('high')
    expect(getSubagentEffortOverride({ CLAUDE_CODE_SUBAGENT_EFFORT: 'max' } as never)).toBe('max')
  })

  it('未设置或空串返回 undefined', () => {
    expect(getSubagentEffortOverride({} as never)).toBeUndefined()
    expect(getSubagentEffortOverride({ CLAUDE_CODE_SUBAGENT_EFFORT: '' } as never)).toBeUndefined()
    expect(getSubagentEffortOverride({ CLAUDE_CODE_SUBAGENT_EFFORT: '   ' } as never)).toBeUndefined()
  })
})

describe('resolveSubagentEffort', () => {
  const env = (v: string) => ({ CLAUDE_CODE_SUBAGENT_EFFORT: v }) as never

  it('子代理显式指定时，环境变量不覆盖', () => {
    expect(
      resolveSubagentEffort({
        explicitlySet: 'high',
        sessionEffort: 'medium',
        env: env('low'),
      }),
    ).toBe('high')
  })

  it('未显式指定时，环境变量替代继承的会话 effort', () => {
    expect(
      resolveSubagentEffort({
        explicitlySet: undefined,
        sessionEffort: 'high',
        env: env('low'),
      }),
    ).toBe('low')
  })

  it('未设置环境变量时，行为不变（继承会话）', () => {
    expect(
      resolveSubagentEffort({
        explicitlySet: undefined,
        sessionEffort: 'medium',
        env: {} as never,
      }),
    ).toBe('medium')
  })

  it('环境变量非法时忽略，仍继承会话', () => {
    expect(
      resolveSubagentEffort({
        explicitlySet: undefined,
        sessionEffort: 'medium',
        env: env('bogus'),
      }),
    ).toBe('medium')
  })

  it('全部缺失时返回 undefined', () => {
    expect(
      resolveSubagentEffort({
        explicitlySet: undefined,
        sessionEffort: undefined,
        env: {} as never,
      }),
    ).toBeUndefined()
  })
})
