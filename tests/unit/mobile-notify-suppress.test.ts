/**
 * 通知抑制判据的测试。
 *
 * 背景（对照 Claude 官方移动端）：官方设计是「用户正在电脑终端输入时，
 * 手机不推送通知」。不做的后果不是「少了个功能」，而是**通知渠道被整体关闭**
 * —— 开发者手机电脑常都在手边，AI 每轮震一下，人会烦到关掉通知权限，
 * 连真正需要介入的权限请求也一并静音。
 *
 * 判据来自 DECSET 1004 终端焦点状态，三种取值：
 *   focused → 抑制（用户就在电脑前）
 *   blurred → 不抑制（用户切走了，可能在用手机）
 *   unknown → **不抑制**（不支持焦点上报的终端恒为此值）
 *
 * `unknown` 的处理是最关键的取舍：若当作「抑制」，那些终端（老终端、
 * 部分 Windows 终端）的用户会**完全收不到通知** —— 静默失效。
 * 而当作「不抑制」只是偶尔多提醒一次。后者代价小得多。
 *
 * 变异验证：把判据从 `=== 'focused'` 改成 `!== 'blurred'`，
 * 「unknown 不抑制」用例必然失败。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { shouldSuppressMobileNotification } from '../../src/bridge/mobileBridge.js'
import {
  setTerminalFocused,
  resetTerminalFocusState,
} from '../../src/ink/terminal-focus-state.js'

afterEach(() => {
  resetTerminalFocusState()
})

describe('shouldSuppressMobileNotification', () => {
  it('终端在前台时抑制（用户就在电脑前）', () => {
    setTerminalFocused(true)
    expect(shouldSuppressMobileNotification()).toBe(true)
  })

  it('终端失焦时不抑制（用户切走了，可能在用手机）', () => {
    setTerminalFocused(true)
    setTerminalFocused(false)
    expect(shouldSuppressMobileNotification()).toBe(false)
  })

  it('unknown 状态不抑制（关键取舍）', () => {
    // 默认即 unknown —— 不支持 DECSET 1004 的终端恒为此值。
    // 若这里返回 true，这些用户的手机将完全收不到通知。
    resetTerminalFocusState()
    expect(
      shouldSuppressMobileNotification(),
      'unknown 必须当作「不抑制」，否则老终端用户静默失联',
    ).toBe(false)
  })

  it('连续切换后判据跟随最新状态', () => {
    setTerminalFocused(true)
    expect(shouldSuppressMobileNotification()).toBe(true)
    setTerminalFocused(false)
    expect(shouldSuppressMobileNotification()).toBe(false)
    setTerminalFocused(true)
    expect(shouldSuppressMobileNotification()).toBe(true)
  })
})
