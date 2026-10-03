/**
 * 视口重新固定（repin）的守卫判定
 *
 * 测试对象：src/utils/scrollRepin.ts 的 shouldRepinScroll /
 * shouldRepinOnOverlayChange（上一版本文件复刻了 REPL 内的判定逻辑 ——
 * 那种测试在生产代码改变时不会失败，等于没有保护。现直接导入生产函数。）
 *
 * 背景：用户回滚一两行后，任何覆盖层开合都会把视口拽回底部，表现为
 * 「稍微回滚就自动跳到最顶上」。修复要点：
 *  - 默认 3 秒豁免（刚滚过说明用户在读，不打扰）
 *  - force 用于用户显式要求（提交消息、点药丸），必须立即生效
 *  - 终端面板打开期间 onScroll 被传成 undefined（REPL 的 centeredModal
 *    分支），用户此时滚轮不更新 lastUserScrollTs —— 故覆盖层占屏时
 *    必须直接跳过 repin，而非依赖时间戳
 */

import { describe, expect, it } from 'vitest'
import {
  RECENT_SCROLL_REPIN_WINDOW_MS,
  shouldRepinOnOverlayChange,
  shouldRepinScroll,
} from '../../src/utils/scrollRepin.js'

const NOW = 1_700_000_000_000

describe('shouldRepinScroll', () => {
  it('刚滚过（<3s）不 repin —— 用户正在读，不该被打断', () => {
    expect(shouldRepinScroll(undefined, NOW - 500, NOW)).toBe(false)
    expect(shouldRepinScroll(undefined, NOW - 2999, NOW)).toBe(false)
  })

  it('已过豁免窗口（>=3s）正常 repin', () => {
    expect(shouldRepinScroll(undefined, NOW - 3000, NOW)).toBe(true)
    expect(shouldRepinScroll(undefined, NOW - 60000, NOW)).toBe(true)
  })

  it('从未滚动（时间戳 0）必须 repin —— 首次按键要能回到底部', () => {
    expect(shouldRepinScroll(undefined, 0, NOW)).toBe(true)
  })

  it('force 跳过豁免 —— 提交消息必须立即生效', () => {
    expect(shouldRepinScroll(true, NOW - 100, NOW)).toBe(true)
    expect(shouldRepinScroll(true, NOW, NOW)).toBe(true)
  })

  it('边界：恰好等于窗口视为已过（>= 语义，不是 >）', () => {
    expect(shouldRepinScroll(undefined, NOW - RECENT_SCROLL_REPIN_WINDOW_MS, NOW)).toBe(true)
    expect(shouldRepinScroll(undefined, NOW - RECENT_SCROLL_REPIN_WINDOW_MS + 1, NOW)).toBe(false)
  })
})

describe('shouldRepinOnOverlayChange', () => {
  const pan = (over: Partial<Parameters<typeof shouldRepinOnOverlayChange>[0]> = {}) => ({
    dialogChanged: true,
    overlayOnScreen: false,
    lastUserScrollTs: NOW - 60000, // 早已过窗口
    now: NOW,
    ...over,
  })

  it('终端面板（localJSX）占屏时不 repin —— 用户看不到底部，跳转纯属干扰', () => {
    expect(shouldRepinOnOverlayChange(pan({ overlayOnScreen: true }))).toBe(false)
  })

  it('权限对话框占屏时不 repin', () => {
    expect(shouldRepinOnOverlayChange(pan({ overlayOnScreen: true }))).toBe(false)
  })

  it('覆盖层已消失且未刚滚过 → repin', () => {
    expect(shouldRepinOnOverlayChange(pan())).toBe(true)
  })

  it('对话框状态未变化 → 不 repin（避免无谓副作用）', () => {
    expect(shouldRepinOnOverlayChange(pan({ dialogChanged: false }))).toBe(false)
  })

  it('覆盖层已消失但刚滚过 → 不 repin（豁免优先于回底）', () => {
    expect(
      shouldRepinOnOverlayChange(pan({ lastUserScrollTs: NOW - 100 })),
    ).toBe(false)
  })

  it('占屏判定优先于豁免：即使已过窗口也不 repin', () => {
    // 这正是终端面板路径的关键 —— 面板打开期间时间戳不更新，
    // 若只看时间戳会误判成「早已过窗口」而错误 repin。
    expect(
      shouldRepinOnOverlayChange(
        pan({ overlayOnScreen: true, lastUserScrollTs: NOW - 999999 }),
      ),
    ).toBe(false)
  })
})
