/**
 * 声音去重契约测试。
 *
 * 背景：完成音有两条独立触发路径——query.ts 在 return {reason:'completed'}
 * 前播一次，REPL.tsx 在 busy→idle 时再播一次。查询正常结束时两者必然先后
 * 触发，造成双响。去重放在模块层，两条路径都受益。
 *
 * 但要保证不能「一刀切」：自动继续模式（AUTO_CONTINUE_ON_COMPLETE=true）下
 * query.ts 循环 continue、状态不转 idle，REPL 那一路根本不触发——此时若因
 * 去重把 query.ts 的声音也吃掉，用户就完全听不到提示了。因此去重的正确性
 * 依赖「抑制重复、但保留首次」，这两点都要断言。
 *
 * 打桩方式：soundNotification.ts 在函数内用 require('child_process') 延迟
 * 加载（为了打包时不被 tree-shake），因此 vi.mock 的静态拦截对 import 生效、
 * 对 require 不生效。这里直接改 CJS 模块对象上的 execFileSync。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const require_ = createRequire(import.meta.url)
const cp = require_('child_process')
const origExecFileSync = cp.execFileSync

const beepSpy = vi.fn(() => Buffer.from(''))

import {
  playTaskCompleteSound,
  playInterventionSound,
  playErrorSound,
} from '../../src/utils/soundNotification.js'

describe('声音去重', () => {
  // 每个用例把时钟前进 10 秒，跨过 2.5s 去重窗口
  let clock = Date.now()

  beforeEach(() => {
    clock += 10_000
    vi.useFakeTimers()
    vi.setSystemTime(clock)
    beepSpy.mockClear()
    cp.execFileSync = beepSpy as unknown as typeof cp.execFileSync
  })

  afterEach(() => {
    cp.execFileSync = origExecFileSync
    vi.useRealTimers()
  })

  it('首次调用会发声', () => {
    playTaskCompleteSound()
    expect(beepSpy).toHaveBeenCalled()
  })

  it('窗口期内的重复调用被抑制（消除双响）', () => {
    playTaskCompleteSound()
    const first = beepSpy.mock.calls.length
    expect(first).toBeGreaterThan(0)

    // 模拟 query.ts 播完、REPL.tsx busy→idle 紧接着再播
    playTaskCompleteSound()
    expect(beepSpy.mock.calls.length).toBe(first)
  })

  it('不同声音类型互不抑制', () => {
    playTaskCompleteSound()
    const afterComplete = beepSpy.mock.calls.length

    playInterventionSound()
    expect(beepSpy.mock.calls.length).toBeGreaterThan(afterComplete)

    const afterIntervention = beepSpy.mock.calls.length
    playErrorSound()
    expect(beepSpy.mock.calls.length).toBeGreaterThan(afterIntervention)
  })
})
