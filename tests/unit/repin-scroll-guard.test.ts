/**
 * repinScroll 的「刚滚过就不打扰」守卫（含 force 逃生口）
 *
 * 背景：用户回滚一两行后，任何覆盖层开合都会把视口拽回底部 —— 表现为
 * 「稍微回滚就自动跳到最顶上」（用户报告）。根因是 repinScroll 无守卫地
 * 调 scrollToBottom，而覆盖层开合（含 Alt+J 终端面板）会触发它。
 *
 * 更隐蔽的一层：终端面板打开期间 onScroll 被传成 undefined
 * （REPL.tsx:4360 —— centeredModal 非空时），用户此时滚轮不会更新
 * lastUserScrollTsRef，所以「面板打开 → 回滚 → 关闭」这条路径上，
 * 单靠调用点的守卫会失效。修复把守卫收敛进 repinScroll 本体，
 * 并在覆盖层仍占屏时直接跳过。
 *
 * 这里复刻判定逻辑并锁死行为。复刻而非导入：repinScroll 是 REPL 组件内
 * 的 useCallback 闭包，导入需挂载整个 REPL。
 */

import { describe, expect, it, vi } from 'vitest'

const RECENT_SCROLL_REPIN_WINDOW_MS = 3000

type RepinDeps = {
  /** 上次用户发起滚动的时间戳（0 表示从未滚动） */
  lastUserScrollTsRef: { current: number }
  scrollToBottom: () => void
  onRepin: () => void
  setCursor: () => void
}

/** 复刻 src/screens/REPL.tsx:1160 的 repinScroll */
function makeRepinScroll(deps: RepinDeps) {
  return (opts?: { force?: boolean }) => {
    if (
      !opts?.force &&
      Date.now() - deps.lastUserScrollTsRef.current < RECENT_SCROLL_REPIN_WINDOW_MS
    ) {
      return
    }
    deps.scrollToBottom()
    deps.onRepin()
    deps.setCursor()
  }
}

function makeDeps(lastScrollAgoMs: number): RepinDeps & {
  counts: { scroll: number; repin: number; cursor: number }
} {
  const counts = { scroll: 0, repin: 0, cursor: 0 }
  return {
    lastUserScrollTsRef: { current: Date.now() - lastScrollAgoMs },
    scrollToBottom: () => { counts.scroll++ },
    onRepin: () => { counts.repin++ },
    setCursor: () => { counts.cursor++ },
    counts,
  }
}

describe('repinScroll 的滚动守卫', () => {
  it('刚滚过（<3s）时不 repin —— 用户正在读，不该被打断', () => {
    const d = makeDeps(500)
    makeRepinScroll(d)()
    expect(d.counts.scroll).toBe(0)
    expect(d.counts.repin).toBe(0)
    expect(d.counts.cursor).toBe(0)
  })

  it('已过豁免窗口（>3s）时正常 repin', () => {
    const d = makeDeps(5000)
    makeRepinScroll(d)()
    expect(d.counts.scroll).toBe(1)
    expect(d.counts.repin).toBe(1)
    expect(d.counts.cursor).toBe(1)
  })

  it('从未滚动（时间戳 0）时 repin —— 首次按键必须能回到底部', () => {
    const d = makeDeps(0)
    d.lastUserScrollTsRef.current = 0
    makeRepinScroll(d)()
    expect(d.counts.scroll).toBe(1)
  })

  it('force 跳过豁免 —— 提交消息必须立即生效', () => {
    const d = makeDeps(100) // 刚滚过 100ms
    makeRepinScroll(d)({ force: true })
    expect(d.counts.scroll).toBe(1)
    expect(d.counts.repin).toBe(1)
    expect(d.counts.cursor).toBe(1)
  })

  it('force 在未滚动时行为一致（无副作用差异）', () => {
    const d = makeDeps(0)
    d.lastUserScrollTsRef.current = 0
    makeRepinScroll(d)({ force: true })
    expect(d.counts.scroll).toBe(1)
  })

  it('边界：恰好 3000ms 视为已过窗口（>= 语义）', () => {
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const d = makeDeps(0)
    d.lastUserScrollTsRef.current = now - RECENT_SCROLL_REPIN_WINDOW_MS
    makeRepinScroll(d)()
    // 相等 → 差值不小于窗口 → 放行
    expect(d.counts.scroll).toBe(1)
    vi.useRealTimers()
  })
})

describe('覆盖层仍占屏时跳过 repin（终端面板路径）', () => {
  /** 复刻 REPL.tsx:1991 的 useLayoutEffect 判定 */
  function shouldRepinOnDialogChange(state: {
    wasToolPermission: boolean
    nowToolPermission: boolean
    hasLocalJSX: boolean
    pendingPermissions: number
    lastUserScrollTsRef: { current: number }
  }): boolean {
    if (state.wasToolPermission === state.nowToolPermission) return false
    // 覆盖层占屏 → 跳过
    if (state.hasLocalJSX || state.pendingPermissions > 0) return false
    // 交给 repinScroll 内部守卫
    if (Date.now() - state.lastUserScrollTsRef.current < RECENT_SCROLL_REPIN_WINDOW_MS) {
      return false
    }
    return true
  }

  it('终端面板（localJSX）占屏时不 repin —— 跳过阈值轮次', () => {
    expect(
      shouldRepinOnDialogChange({
        wasToolPermission: false,
        nowToolPermission: true,
        hasLocalJSX: true, // 面板正显示
        pendingPermissions: 0,
        lastUserScrollTsRef: { current: Date.now() - 60000 }, // 早已过窗口
      }),
    ).toBe(false)
  })

  it('权限对话框占屏时不 repin', () => {
    expect(
      shouldRepinOnDialogChange({
        wasToolPermission: false,
        nowToolPermission: true,
        hasLocalJSX: false,
        pendingPermissions: 1,
        lastUserScrollTsRef: { current: Date.now() - 60000 },
      }),
    ).toBe(false)
  })

  it('覆盖层已消失且未刚滚过 → repin（正常回到底部）', () => {
    expect(
      shouldRepinOnDialogChange({
        wasToolPermission: true,
        nowToolPermission: false,
        hasLocalJSX: false,
        pendingPermissions: 0,
        lastUserScrollTsRef: { current: Date.now() - 60000 },
      }),
    ).toBe(true)
  })

  it('dialog 状态未变化 → 不 repin（避免无谓副作用）', () => {
    expect(
      shouldRepinOnDialogChange({
        wasToolPermission: false,
        nowToolPermission: false,
        hasLocalJSX: false,
        pendingPermissions: 0,
        lastUserScrollTsRef: { current: Date.now() - 60000 },
      }),
    ).toBe(false)
  })
})
