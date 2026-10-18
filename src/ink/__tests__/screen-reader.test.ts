import { describe, it, expect } from 'vitest'
import { screenReaderOptionsForTest } from '../../ink.js'

// 屏幕阅读器模式（对齐官方 W29）：env CLAUDE_CODE_SCREEN_READER=1 时返回
// patchConsole:false，否则返回空对象。alt-screen 禁用在 ink.tsx 守卫里按同一 env。
// 每个用例手动恢复 env（本仓库 vitest 全局 afterEach 不可用）。
describe('screen reader mode — 对齐官方 W29', () => {
  const prev = process.env.CLAUDE_CODE_SCREEN_READER

  it('env 未设置时返回空对象（普通 TUI 模式）', () => {
    delete process.env.CLAUDE_CODE_SCREEN_READER
    try {
      expect(screenReaderOptionsForTest()).toEqual({})
    } finally {
      restoreEnv(prev)
    }
  })

  it('env=1 时返回 patchConsole:false（屏幕阅读器读取 console）', () => {
    process.env.CLAUDE_CODE_SCREEN_READER = '1'
    try {
      expect(screenReaderOptionsForTest()).toEqual({ patchConsole: false })
    } finally {
      restoreEnv(prev)
    }
  })

  // 变异测试：若把 env===1 分支改成也返回空对象（即屏幕阅读器失效），
  // 第 2 用例会失败，证明测试非复刻、能抓真实回归。
})

function restoreEnv(prev: string | undefined) {
  if (prev === undefined) delete process.env.CLAUDE_CODE_SCREEN_READER
  else process.env.CLAUDE_CODE_SCREEN_READER = prev
}
