/**
 * localJSX 覆盖层的更新契约
 *
 * 测试对象：src/utils/localJSXOverlay.ts 的 resolveToolJSXUpdate
 * （上一版本文件复刻了 REPL 内的判定逻辑 —— 那种测试在生产代码改变时
 * 不会失败，等于没有保护。现改为直接导入生产函数。）
 *
 * 背景：REPL 的 setToolJSX 包装器有一条容易被静默违反的契约 ——
 * localJSX 命令激活期间，一切不带 clearLocalJSX 的更新被忽略。
 * Alt+J 终端面板曾因关闭时漏传该标志而关不掉（覆盖层不卸载），
 * 同时 terminalOpenRef 已复位 → 下次按键再挂一棵新树 → cmd.exe 孤儿。
 */

import { describe, expect, it } from 'vitest'
import { resolveToolJSXUpdate } from '../../src/utils/localJSXOverlay.js'

const PANEL = {
  jsx: 'panel',
  shouldHidePromptInput: true,
  isLocalJSXCommand: true as const,
}

describe('resolveToolJSXUpdate', () => {
  describe('开启/更新 localJSX 命令', () => {
    it('无活动覆盖层时开启 → set 并记录状态', () => {
      const d = resolveToolJSXUpdate(PANEL, false)
      expect(d.kind).toBe('set')
      if (d.kind !== 'set') throw new Error('unreachable')
      expect(d.state).toMatchObject({ jsx: 'panel', isLocalJSXCommand: true })
      expect(d.emit).toMatchObject({ jsx: 'panel' })
    })

    it('clearLocalJSX 是「指令」不进状态 —— 否则一次性的清除标志会被当成持续状态', () => {
      const d = resolveToolJSXUpdate({ ...PANEL, clearLocalJSX: true }, false)
      if (d.kind !== 'set') throw new Error('unreachable')
      expect(d.state).not.toHaveProperty('clearLocalJSX')
      expect(d.emit).not.toHaveProperty('clearLocalJSX')
    })

    it('state 与 emit 都必须带 isLocalJSXCommand —— 渲染层靠它决定走 centeredModal', () => {
      // REPL.tsx 有 5 处读 toolJSX.isLocalJSXCommand（1022/2079/4261/4262/4340），
      // 其中 toolJsxCentered 决定覆盖层是否居中。emit 若剥离该字段，
      // 终端面板会退回非居中渲染路径 —— 这是真实的回归点。
      const d = resolveToolJSXUpdate(PANEL, false)
      if (d.kind !== 'set') throw new Error('unreachable')
      expect(d.state).toMatchObject({ isLocalJSXCommand: true })
      expect(d.emit).toMatchObject({ isLocalJSXCommand: true })
      expect(d.emit).toMatchObject({ jsx: 'panel', shouldHidePromptInput: true })
    })
  })

  describe('已有 localJSX 激活时（工具输出不得顶掉它）', () => {
    it('裸 null 被忽略 —— 这就是 Alt+J 关不掉的根因形态', () => {
      expect(resolveToolJSXUpdate(null, true).kind).toBe('ignore')
    })

    it('工具输出被忽略', () => {
      const d = resolveToolJSXUpdate(
        { jsx: 'tool-output', shouldHidePromptInput: true },
        true,
      )
      expect(d.kind).toBe('ignore')
    })

    it('带 clearLocalJSX 才能清除', () => {
      const d = resolveToolJSXUpdate(
        { jsx: null, shouldHidePromptInput: false, clearLocalJSX: true },
        true,
      )
      expect(d.kind).toBe('clear')
    })

    it('ignore 与 clear 的区分只取决于 clearLocalJSX —— 与 jsx 是否为 null 无关', () => {
      // jsx 非 null 但带 clearLocalJSX → 仍是清除（标志优先）
      expect(
        resolveToolJSXUpdate({ jsx: 'x', shouldHidePromptInput: false, clearLocalJSX: true }, true)
          .kind,
      ).toBe('clear')
      // jsx 为 null 但不带标志 → 仍被忽略
      expect(
        resolveToolJSXUpdate({ jsx: null, shouldHidePromptInput: false }, true).kind,
      ).toBe('ignore')
    })
  })

  describe('无活动 localJSX 时', () => {
    it('普通更新直接 set（state 为 null，因为不是 localJSX 命令）', () => {
      const d = resolveToolJSXUpdate(
        { jsx: 'tool', shouldHidePromptInput: true },
        false,
      )
      if (d.kind !== 'set') throw new Error('unreachable')
      expect(d.state).toBeNull()
      expect(d.emit).toMatchObject({ jsx: 'tool' })
    })

    it('带 clearLocalJSX → clear（幂等清除不报错）', () => {
      expect(
        resolveToolJSXUpdate({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true }, false)
          .kind,
      ).toBe('clear')
    })

    it('null 更新无活动覆盖层 → set 且 emit 为 null（交给渲染层清空）', () => {
      const d = resolveToolJSXUpdate(null, false)
      if (d.kind !== 'set') throw new Error('unreachable')
      expect(d.emit).toBeNull()
    })
  })

  describe('开合可循环（不卡死）', () => {
    it('连续 3 轮开 → 关，每轮都回到可开启状态', () => {
      let hasActive = false
      for (let i = 0; i < 3; i++) {
        const open = resolveToolJSXUpdate(PANEL, hasActive)
        expect(open.kind).toBe('set')
        hasActive = open.kind === 'set' && open.state !== null

        const close = resolveToolJSXUpdate(
          { jsx: null, shouldHidePromptInput: false, clearLocalJSX: true },
          hasActive,
        )
        expect(close.kind).toBe('clear')
        hasActive = false
      }
    })
  })
})
