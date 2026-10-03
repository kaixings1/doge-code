import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * consoleOverride 是模块级副作用：import 的瞬间就会改写全局 console。
 * 因此必须用 vi.resetModules() + 动态 import 来在受控的 process 状态下观测它。
 *
 * 这些用例防止回归：`--debug-file` 曾经让闸门整体失效，导致后台任务的
 * console.log 直接泄漏进 Ink 的 alt screen（"后台输出闪现到界面"）。
 */
describe('consoleOverride 闸门', () => {
  const originalArgv = process.argv
  const originalEnv = {
    CLAUDE_CODE_CONSOLE_DEBUG: process.env.CLAUDE_CODE_CONSOLE_DEBUG,
    DEBUG: process.env.DEBUG,
  }

  beforeEach(() => {
    vi.resetModules()
    delete process.env.CLAUDE_CODE_CONSOLE_DEBUG
    delete process.env.DEBUG
  })

  afterEach(() => {
    process.argv = originalArgv
    if (originalEnv.CLAUDE_CODE_CONSOLE_DEBUG === undefined) {
      delete process.env.CLAUDE_CODE_CONSOLE_DEBUG
    } else {
      process.env.CLAUDE_CODE_CONSOLE_DEBUG = originalEnv.CLAUDE_CODE_CONSOLE_DEBUG
    }
    if (originalEnv.DEBUG === undefined) {
      delete process.env.DEBUG
    } else {
      process.env.DEBUG = originalEnv.DEBUG
    }
    vi.resetModules()
  })

  it('--debug-file 存在时必须仍然拦截 console.log（回归守卫）', async () => {
    // 模拟 d.bat 的启动参数：--debug-file 会让 isDebugMode() 返回 true
    process.argv = ['bun', 'src/bootstrap-entry.ts', '--debug-file', './debug2.txt']

    const before = console.log
    await import('../consoleOverride.js')
    const after = console.log

    // 闸门必须生效：console.log 被替换为 noop
    expect(after).not.toBe(before)
    // 调用它不应产生任何输出（noop 返回 undefined）
    expect(after('should not leak to terminal')).toBeUndefined()
    // noop 本身不应抛出
    expect(() => after('x')).not.toThrow()
  })

  it('--debug-file 存在时必须仍然拦截 console.warn/info/debug', async () => {
    process.argv = ['bun', 'src/bootstrap-entry.ts', '--debug-file=./debug2.txt']

    const beforeWarn = console.warn
    const beforeInfo = console.info
    const beforeDebug = console.debug

    await import('../consoleOverride.js')

    expect(console.warn).not.toBe(beforeWarn)
    expect(console.info).not.toBe(beforeInfo)
    expect(console.debug).not.toBe(beforeDebug)
    expect(console.warn('nope')).toBeUndefined()
  })

  it('显式 CLAUDE_CODE_CONSOLE_DEBUG=1 时放行（闸门确实可被有意打开）', async () => {
    process.argv = ['bun', 'src/bootstrap-entry.ts', '--debug-file', './debug2.txt']
    process.env.CLAUDE_CODE_CONSOLE_DEBUG = '1'

    const before = console.log
    await import('../consoleOverride.js')

    // 显式开关下不替换 —— 这是唯一合法的直通入口
    expect(console.log).toBe(before)
  })

  it('DEBUG=1 时放行', async () => {
    process.argv = ['bun', 'src/bootstrap-entry.ts']
    process.env.DEBUG = '1'

    const before = console.log
    await import('../consoleOverride.js')

    expect(console.log).toBe(before)
  })

  it('console.error 始终不被替换（用户可见错误必须保留）', async () => {
    process.argv = ['bun', 'src/bootstrap-entry.ts', '--debug-file', './debug2.txt']

    const before = console.error
    await import('../consoleOverride.js')

    expect(console.error).toBe(before)
  })
})
