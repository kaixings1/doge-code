/**
 * 回归保护：工具执行的 timeout 必须真正生效。
 *
 * 历史缺陷：engine/index.ts 的 rawExecutor 忽略 ToolScheduler 传入的 timeout
 * （形参名 _o），工具一旦卡住就永久挂起，占满并发配额、拖死整个编排。
 */
import { describe, expect, it } from 'vitest'
import { runWithTimeout } from '../../engine/index.js'

const hangTool = {
  name: 'Hang',
  // 永远不 resolve，模拟 MCP 无响应 / Bash 卡在交互提示
  execute: () => new Promise<{ content: unknown }>(() => {}),
}

const fastTool = {
  name: 'Fast',
  execute: async () => ({ content: 'ok' }),
}

describe('runWithTimeout', () => {
  it('卡住的工具会在超时后失败，而不是永久挂起', async () => {
    const started = Date.now()
    const err = await runWithTimeout(hangTool, {}, { timeout: 300 }).catch(e => e)
    const elapsed = Date.now() - started

    expect(err).toBeInstanceOf(Error)
    expect(String(err.message)).toContain('超时')
    // 300ms 的超时应远早于默认 10 分钟返回
    expect(elapsed).toBeLessThan(10_000)
  }, 20_000)

  it('未指定超时时不引入额外计时器，正常返回', async () => {
    const r = await runWithTimeout(fastTool, {})
    expect(r.content).toBe('ok')
  }, 10_000)

  it('超时为 0 / 非法值时退化为无超时（不误杀）', async () => {
    const r1 = await runWithTimeout(fastTool, {}, { timeout: 0 })
    expect(r1.content).toBe('ok')

    const r2 = await runWithTimeout(fastTool, {}, { timeout: Number.NaN })
    expect(r2.content).toBe('ok')
  }, 10_000)

  it('超时不影响正常耗时内的工具', async () => {
    const r = await runWithTimeout(fastTool, {}, { timeout: 5_000 })
    expect(r.content).toBe('ok')
  }, 10_000)
})
