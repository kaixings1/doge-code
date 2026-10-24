import { describe, it, expect, afterEach } from 'vitest'
import { WebFetchTool } from '../../src/tools/WebFetchTool/WebFetchTool.js'

/**
 * CLAUDE_CODE_DISABLE_WEB_FETCH（对齐官方 v2.1.285）
 *
 * 验证两件事：
 * 1. WebFetchTool.isEnabled() 直接反映环境变量
 * 2. 按 src/tools.ts 的过滤契约，停用后该工具会从工具池移除
 */
function setFlag(value: string | undefined) {
  if (value === undefined) {
    delete process.env.CLAUDE_CODE_DISABLE_WEB_FETCH
  } else {
    process.env.CLAUDE_CODE_DISABLE_WEB_FETCH = value
  }
}

// src/tools.ts 的过滤逻辑形状。这里直接调用真实 isEnabled()，不复制判断条件。
function applyToolFilter(tools: Array<typeof WebFetchTool>) {
  return tools.filter(t =>
    typeof t.isEnabled === 'function' ? t.isEnabled() : true,
  )
}

describe('CLAUDE_CODE_DISABLE_WEB_FETCH', () => {
  afterEach(() => {
    setFlag(undefined)
  })

  it('未设置时 WebFetch 启用', () => {
    setFlag(undefined)
    expect(WebFetchTool.isEnabled()).toBe(true)
  })

  it('设为 1 时 WebFetch 停用', () => {
    setFlag('1')
    expect(WebFetchTool.isEnabled()).toBe(false)
  })

  it('设为 true / yes / on 时同样停用', () => {
    for (const v of ['true', 'TRUE', 'yes', 'on', ' 1 ']) {
      setFlag(v)
      expect(WebFetchTool.isEnabled(), 'value=' + v).toBe(false)
    }
  })

  it('设为 0 / false 时仍启用（对齐 isEnvTruthy 语义）', () => {
    for (const v of ['0', 'false', 'no', 'off', '']) {
      setFlag(v)
      expect(WebFetchTool.isEnabled(), 'value=' + v).toBe(true)
    }
  })

  it('停用后按 tools.ts 的过滤契约 WebFetchTool 会被移除', () => {
    setFlag(undefined)
    expect(applyToolFilter([WebFetchTool]).length).toBe(1)

    setFlag('1')
    expect(applyToolFilter([WebFetchTool]).length).toBe(0)
  })
})
