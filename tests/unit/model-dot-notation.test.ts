/**
 * 点号模型 ID 归一化（官方 2.1.314）。
 *
 * 官方原文：Fixed model IDs spelled with a dot behind an LLM gateway, such as
 * `claude-opus-4.8`, being treated as an older model with the wrong context
 * window, output limit, effort, thinking mode and cost.
 *
 * 本地实测确认该缺陷存在（修复前）：
 *   claude-opus-4.8   -> canonical 'claude-opus-4'
 *   claude-sonnet-4.6 -> canonical 'claude-sonnet-4'
 *   claude-haiku-4.5  -> canonical 'claude-haiku'
 * 本地主用自定义 BaseURL（网关形态），点号写法真实会出现。
 *
 * 同时守住「不误伤」：claude-3.5-sonnet 这类本就带点的名字，
 * 归一化后必须仍等于 'claude-3-5-sonnet'。
 *
 * 变异验证（必须做）：
 *   - 删掉 name.replace(/(\d)\.(\d)/g, '$1-$2') 一行
 *     → 三个点号用例失败（回到 'claude-opus-4' 等）
 *   已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import { enableConfigs } from '../../src/utils/config.js'

enableConfigs()

const { getCanonicalName } = await import('../../src/utils/model/model.js')

describe('点号模型 ID', () => {
  it('opus-4.8 等价于 opus-4-8', () => {
    expect(getCanonicalName('claude-opus-4.8' as never)).toBe('claude-opus-4-8')
  })

  it('sonnet-4.6 等价于 sonnet-4-6', () => {
    expect(getCanonicalName('claude-sonnet-4.6' as never)).toBe(
      'claude-sonnet-4-6',
    )
  })

  it('haiku-4.5 等价于 haiku-4-5', () => {
    expect(getCanonicalName('claude-haiku-4.5' as never)).toBe(
      'claude-haiku-4-5',
    )
  })

  it('不误伤：claude-3.5-sonnet 仍归到 3-5-sonnet', () => {
    expect(getCanonicalName('claude-3.5-sonnet' as never)).toBe(
      'claude-3-5-sonnet',
    )
  })

  it('不误伤：连字符写法与日期后缀不受影响', () => {
    expect(getCanonicalName('claude-opus-4-6' as never)).toBe('claude-opus-4-6')
    expect(getCanonicalName('claude-3-5-sonnet-20241022' as never)).toBe(
      'claude-3-5-sonnet',
    )
  })
})
