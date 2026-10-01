/**
 * focusTerminalWindow 契约测试。
 *
 * 覆盖的是通知链路最容易被静默破坏的三点：
 * 1. 节流生效 —— busy→idle 与随后的 waiting 常常连续触发，若不节流会
 *    连开多个 PowerShell 进程，是实打实的启动开销
 * 2. 静默失败 —— 这是通知的旁路功能，任何异常都不得冒泡到 REPL 渲染
 * 3. 平台分支 —— Windows / macOS 走 PowerShell，Linux 应当跳过而非报错
 *
 * 节流是模块级状态，跨用例共享。这里用 fake timers 把每个用例的时钟
 * 向前推进（超过 1.5s 节流窗口），保证用例之间互不干扰。
 *
 * 不测试的部分：真实的 Win32 窗口激活依赖系统前台锁，无法在单测断言，
 * 这部分由手工验证覆盖（实测 SetForegroundWindow=True、exit 0）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// execFileNoThrow 必须在被测模块导入前打桩，否则缓存的是真实实现
vi.mock('../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
}))

import { focusTerminalWindow } from '../../src/utils/focusTerminalWindow.js'
import { execFileNoThrow } from '../../src/utils/execFileNoThrow.js'

const mockedExec = vi.mocked(execFileNoThrow)

describe('focusTerminalWindow', () => {
  let origPlatform: string
  let clockBase = Date.now()

  beforeEach(() => {
    // 每个用例都比上一个晚 5 秒，跨过节流窗口（1.5s）
    clockBase += 5000
    vi.useFakeTimers()
    vi.setSystemTime(clockBase)
    mockedExec.mockClear()
    origPlatform = process.platform
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform })
    vi.useRealTimers()
  })

  const setPlatform = (p: string) => {
    Object.defineProperty(process, 'platform', { value: p })
  }

  const lastScript = (): string => {
    const args = mockedExec.mock.calls.at(-1)?.[1] as string[] | undefined
    return args?.at(-1) ?? ''
  }

  it('首次调用会发起激活尝试', async () => {
    setPlatform('win32')
    const result = await focusTerminalWindow('abc-123')
    expect(result).toBe(true)
    expect(mockedExec).toHaveBeenCalledTimes(1)
  })

  it('节流窗口内的连续调用不会重复拉起进程', async () => {
    setPlatform('win32')
    await focusTerminalWindow('abc-123')
    const first = mockedExec.mock.calls.length

    // 模拟 busy→idle 紧接着 waiting 的连发场景
    const second = await focusTerminalWindow('abc-123')
    expect(second).toBe(false)
    expect(mockedExec.mock.calls.length).toBe(first)
  })

  it('execFile 抛异常时静默失败，不向调用方冒泡', async () => {
    setPlatform('win32')
    mockedExec.mockRejectedValueOnce(new Error('powershell not found'))

    // 返回值 false 表示"没激活成功"，这是正确语义；关键是不抛异常
    await expect(focusTerminalWindow('abc-123')).resolves.toBe(false)
  })

  it('Linux 平台直接跳过，不调用任何进程', async () => {
    setPlatform('linux')
    const result = await focusTerminalWindow('abc-123')
    expect(result).toBe(false)
    expect(mockedExec).not.toHaveBeenCalled()
  })

  it('sessionId 缺省时仍可调用（走回退匹配）', async () => {
    setPlatform('win32')
    await expect(focusTerminalWindow()).resolves.toBe(true)
  })

  it('传给 PowerShell 的脚本包含 FlashWindowEx 降级分支', async () => {
    setPlatform('win32')
    await focusTerminalWindow('abc-123')

    // SetForegroundWindow 受系统前台锁限制可能失败，必须有任务栏闪烁兜底
    const script = lastScript()
    expect(script).toContain('SetForegroundWindow')
    expect(script).toContain('FlashWindowEx')
  })

  it('脚本会排除 bridge 后台窗口，避免误匹配', async () => {
    setPlatform('win32')
    await focusTerminalWindow('abc-123')
    expect(lastScript()).toContain('doge-bridge')
  })
})
