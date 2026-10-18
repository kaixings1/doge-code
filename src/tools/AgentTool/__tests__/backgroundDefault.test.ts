import { describe, it, expect } from 'vitest'
import { resolveBackgroundDefault } from '../AgentTool.js'

// W27 对齐：子代理默认后台。纯函数行为验证 + 变异测试（反转默认即失败）。
describe('resolveBackgroundDefault — 子代理默认后台（W27）', () => {
  it('未传时默认后台（non-disabled）', () => {
    expect(resolveBackgroundDefault(undefined, false)).toBe(true)
  })

  it('未传且全局禁用后台时回落 undefined', () => {
    expect(resolveBackgroundDefault(undefined, true)).toBe(undefined)
  })

  it('显式 true 保持 true', () => {
    expect(resolveBackgroundDefault(true, false)).toBe(true)
    expect(resolveBackgroundDefault(true, true)).toBe(true)
  })

  it('显式 false 保持 false（前台逃生口）', () => {
    expect(resolveBackgroundDefault(false, false)).toBe(false)
    expect(resolveBackgroundDefault(false, true)).toBe(false)
  })

  // 变异测试：若把默认分支 `backgroundDisabled ? undefined : true` 改为恒 true，
  // 第 2 用例（disabled 应回落 undefined）会失败 —— 证明测试非复刻、抓真实回归。
})
