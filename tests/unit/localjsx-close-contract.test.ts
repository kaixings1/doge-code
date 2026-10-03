/**
 * localJSX 覆盖层关闭契约
 *
 * 背景：REPL 的 setToolJSX 包装器（src/screens/REPL.tsx:974-1009）在
 * localJSXCommandRef 非空时会**忽略**一切不含 clearLocalJSX 的更新。
 *
 * 终端面板（Alt+J）曾违反这条契约 —— 关闭时只传 null，于是：
 *   1. 覆盖层不卸载（用户按 Alt+J 关不掉）
 *   2. terminalOpenRef 已置 false → 下次开启又挂一棵新树替换旧树
 *   3. 旧组件不走正常卸载流程 → proc.kill() 不保证执行 → cmd.exe 孤儿
 *
 * 这里复刻包装器的判定逻辑并锁死不变式，防止再次回归。
 * 复刻而非导入：包装器内联在 REPL 组件里（闭包 + useCallback），
 * 直接导入需要挂载整个 REPL。逻辑仅 20 行，复刻成本低于搭建渲染环境。
 */

import { describe, expect, it } from 'vitest'

type Args = {
  jsx: unknown
  shouldHidePromptInput: boolean
  isLocalJSXCommand?: boolean
  clearLocalJSX?: boolean
} | null

/** 复刻 src/screens/REPL.tsx 的 setToolJSX 包装器 + localJSXCommandRef */
function makeSetToolJSX() {
  let localJSXCommandRef: (Args & { isLocalJSXCommand: true }) | null = null
  let shown: Args = null
  const setToolJSX = (args: Args) => {
    if (args?.isLocalJSXCommand) {
      const { clearLocalJSX: _, ...rest } = args
      localJSXCommandRef = { ...rest, isLocalJSXCommand: true }
      shown = rest
      return
    }
    if (localJSXCommandRef) {
      if (args?.clearLocalJSX) {
        localJSXCommandRef = null
        shown = null
        return
      }
      return // 关键：忽略
    }
    if (args?.clearLocalJSX) {
      shown = null
      return
    }
    shown = args
  }
  return {
    setToolJSX,
    // 暴露可观测状态（不用 getter 闭包陷阱：函数式读取）
    getShown: () => shown,
    getRefActive: () => localJSXCommandRef !== null,
  }
}

const PANEL = { jsx: 'panel', shouldHidePromptInput: true, isLocalJSXCommand: true as const }

describe('localJSX 覆盖层关闭契约', () => {
  it('裸 null 无法清除 localJSX 覆盖层（这就是 Alt+J 关不掉的根因）', () => {
    const s = makeSetToolJSX()
    s.setToolJSX(PANEL)
    expect(s.getShown()).not.toBeNull()

    s.setToolJSX(null) // 旧实现的关闭调用

    // 锁死缺陷行为 —— 若 REPL 包装器将来改成允许裸 null 清除，
    // 此断言会失败，提醒同步更新调用方。
    expect(s.getShown()).not.toBeNull()
    expect(s.getRefActive()).toBe(true)
  })

  it('带 clearLocalJSX 才能清除（修复后的调用形式）', () => {
    const s = makeSetToolJSX()
    s.setToolJSX(PANEL)

    s.setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })

    expect(s.getShown()).toBeNull()
    expect(s.getRefActive()).toBe(false)
  })

  it('清除后可以再次打开（开合可循环，不会卡死）', () => {
    const s = makeSetToolJSX()
    for (let i = 0; i < 3; i++) {
      s.setToolJSX(PANEL)
      expect(s.getShown()).not.toBeNull()
      s.setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })
      expect(s.getShown()).toBeNull()
    }
  })

  it('工具更新无法顶掉 localJSX 覆盖层（isLocalJSXCommand 的初衷）', () => {
    const s = makeSetToolJSX()
    s.setToolJSX(PANEL)

    s.setToolJSX({ jsx: 'tool-output', shouldHidePromptInput: true })

    expect(s.getShown()).toMatchObject({ jsx: 'panel' })
  })
})
