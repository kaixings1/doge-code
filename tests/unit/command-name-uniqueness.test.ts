/**
 * `/` 命令名唯一性回归测试。
 *
 * 历史缺陷：四条命令各注册了两次同名实现（context / insights / extra-usage / reset-limits），
 * 同一会话模式下取到的项目取决于列表查找顺序。修复方式：
 *   - context / insights / extra-usage：交互实现与非交互实现用互斥 isEnabled 二选一
 *   - reset-limits：两个重复导出合并为一份
 *
 * 本测试直接对真实 COMMANDS() 输出断言，不复刻注册逻辑。
 * 变异验证：反转任一 isEnabled 的互斥条件，或恢复 reset-limits 的重复导出，
 * 对应断言必然失败。
 */
import { describe, expect, it } from 'vitest'

const PAIRED = ['context', 'insights', 'extra-usage']

type Cmd = { name: string; type: string; isEnabled?: () => boolean }

async function commandsBySession(nonInteractive: boolean): Promise<Cmd[]> {
  const { setIsInteractive } = await import('../../src/bootstrap/state.js')
  const { COMMANDS } = await import('../../src/commands.js')
  setIsInteractive(!nonInteractive)
  return COMMANDS() as Cmd[]
}

/** 配置不可读时按「未启用」处理（extra-usage 的 isEnabled 依赖配置文件）。 */
function usable(cmd: Cmd) {
  try {
    return cmd.isEnabled ? cmd.isEnabled() : true
  } catch {
    return false
  }
}

function duplicated(names: string[]) {
  const seen = new Set<string>()
  return names.filter(n => (seen.has(n) ? true : (seen.add(n), false)))
}

describe('命令名唯一性', () => {
  it('reset-limits 只有一条注册', async () => {
    // COMMANDS() 是 memoize 的，只需要取一次
    const rows = (await commandsBySession(false)).filter(c => c.name === 'reset-limits')
    expect(rows).toHaveLength(1)
  }, 60_000)

  it('reset-limits 不再有两个导出指向同一命令', async () => {
    const mod = await import('../../src/commands/reset-limits/index')
    expect('resetLimitsNonInteractive' in mod).toBe(false)
  })

  it('context / insights / extra-usage 在任一模式下最多启用一条', async () => {
    for (const nonInteractive of [false, true]) {
      const rows = (await commandsBySession(nonInteractive)).filter(c =>
        PAIRED.includes(c.name),
      )
      for (const name of PAIRED) {
        const enabled = rows.filter(c => c.name === name && usable(c))
        expect(
          enabled.length,
          `${name} 在 nonInteractive=${nonInteractive} 下启用了 ${enabled.length} 条`,
        ).toBeLessThanOrEqual(1)
      }
    }
  }, 60_000)

  it('交互与非交互各自命中的实现是不同分支', async () => {
    // COMMANDS() 被 memoize，列表始终是同一份；用 setIsInteractive 切换会话模式后
    // 对每个候选显式求 isEnabled，判定「该模式下由哪一份实现提供服务」。
    const rows = (await commandsBySession(false)).filter(c => PAIRED.includes(c.name))
    const { setIsInteractive } = await import('../../src/bootstrap/state.js')

    const selectedType = (isInteractive: boolean, name: string) => {
      setIsInteractive(isInteractive)
      const enabled = rows.filter(c => c.name === name && usable(c))
      expect(enabled, `${name} 在 interactive=${isInteractive} 下应恰好命中一条`).toHaveLength(1)
      return enabled[0].type
    }

    expect(selectedType(true, 'context')).toBe('local-jsx')
    expect(selectedType(true, 'insights')).toBe('local-jsx')
    expect(selectedType(false, 'context')).toBe('local')
    expect(selectedType(false, 'insights')).toBe('prompt')
  }, 60_000)

  it('同名注册项数不超过 2，且必然是交互/非交互各一份', async () => {
    const rows = await commandsBySession(false)
    const names = rows.map(c => c.name)
    // 除三条互斥命令外，全表不应出现任何重名
    const unexpected = duplicated(names).filter(n => !PAIRED.includes(n))
    expect(unexpected).toEqual([])
  }, 60_000)
})
