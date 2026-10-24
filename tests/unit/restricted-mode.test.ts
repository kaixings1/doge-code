/**
 * `--restricted` 受限模式纯逻辑回归测试（对应 diff_with_claude.md §2.1 / §7.4）。
 *
 * 变异验证：
 *   - 去掉 computeRestrictedDisallowed 的 explicit 豁免分支 → "显式放行"用例失败
 *   - 让 shouldRejectBypassPermissions 恒返回 false → bypass 用例失败
 */
import { describe, expect, it } from 'vitest'
import {
  RESTRICTED_BLOCKED_TOOLS,
  RESTRICTED_BYPASS_ERROR,
  computeRestrictedDisallowed,
  restrictedSettingSources,
  shouldRejectBypassPermissions,
} from '../../src/utils/restrictedMode.js'

describe('受限模式', () => {
  it('默认禁止执行类工具与 WebFetch', () => {
    const { disallowed, exempted } = computeRestrictedDisallowed([])
    expect(disallowed).toEqual([...RESTRICTED_BLOCKED_TOOLS])
    expect(exempted).toEqual([])
    expect(disallowed).toContain('Bash')
    expect(disallowed).toContain('PowerShell')
    expect(disallowed).toContain('WebFetch')
  })

  it('--tools 显式点名的执行类工具被豁免', () => {
    const { disallowed, exempted } = computeRestrictedDisallowed(['Bash', 'Read'])
    expect(exempted).toEqual(['Bash'])
    expect(disallowed).not.toContain('Bash')
    // 未点名的仍然禁止
    expect(disallowed).toContain('PowerShell')
    expect(disallowed).toContain('WebFetch')
  })

  it('只读工具不受影响', () => {
    const { disallowed } = computeRestrictedDisallowed(['Read', 'Grep', 'Glob'])
    expect(disallowed).not.toContain('Read')
    expect(disallowed).not.toContain('Grep')
    expect(disallowed).not.toContain('Glob')
  })

  it('空字符串与空白项被忽略', () => {
    const { disallowed, exempted } = computeRestrictedDisallowed(['', '  '])
    expect(exempted).toEqual([])
    expect(disallowed).toEqual([...RESTRICTED_BLOCKED_TOOLS])
  })

  it('拒绝 bypassPermissions 与 --dangerously-skip-permissions', () => {
    expect(shouldRejectBypassPermissions('bypassPermissions', false)).toBe(true)
    expect(shouldRejectBypassPermissions('default', true)).toBe(true)
    expect(shouldRejectBypassPermissions('acceptEdits', false)).toBe(false)
    expect(shouldRejectBypassPermissions(undefined, undefined)).toBe(false)
    expect(RESTRICTED_BYPASS_ERROR).toContain('--restricted')
  })

  it('设置源只保留 policy（flag 由调用方自动补）', () => {
    expect(restrictedSettingSources()).toEqual([])
  })
})
