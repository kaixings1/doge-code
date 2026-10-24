/**
 * 校验 getCommands() 的最终输出不含同名命令。
 *
 * 交互 / 非交互的两份实现（context、insights、extra-usage）用互斥 isEnabled 二选一，
 * 但注册表里两条记录都在；getCommands 必须剔除被禁用的一条，否则同模式下仍会重名。
 *
 * 变异验证：去掉 commands.ts 里的 dropDisabledDuplicates 调用，本测试会失败。
 */
import { describe, expect, it } from 'vitest'

const PAIRED = ['context', 'insights', 'extra-usage']

async function namesFor(interactive: boolean): Promise<string[]> {
  const { setIsInteractive } = await import('../../src/bootstrap/state.js')
  const { getCommands } = await import('../../src/commands.js')
  setIsInteractive(interactive)
  // 命令加载有磁盘 I/O；用 sessionId 变化无法绕过 memoize，直接调用即可。
  const commands = await getCommands(process.cwd())
  return commands.map(c => c.name)
}

function duplicated(names: string[]) {
  const seen = new Set<string>()
  return names.filter(n => (seen.has(n) ? true : (seen.add(n), false)))
}

describe('getCommands 输出唯一性', () => {
  it('交互会话下无任何重名命令', async () => {
    const names = await namesFor(true)
    expect(duplicated(names)).toEqual([])
  }, 90_000)

  it('非交互会话下无任何重名命令', async () => {
    const names = await namesFor(false)
    expect(duplicated(names)).toEqual([])
  }, 90_000)

  it('三个配对命令在最终列表中仍然存在', async () => {
    const names = await namesFor(true)
    // extra-usage 还受 isOverageProvisioningAllowed() 约束（需订阅态），
    // 测试环境读不到配置时会被正常过滤掉，这里只断言另外两个。
    for (const name of ['context', 'insights']) {
      expect(names).toContain(name)
    }
    // extra-usage 若存在，也只能有一条
    expect(names.filter(n => n === 'extra-usage').length).toBeLessThanOrEqual(1)
  }, 90_000)
})
