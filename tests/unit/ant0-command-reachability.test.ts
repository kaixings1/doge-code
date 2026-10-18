/**
 * A1 守卫：ant0 下 INTERNAL_ONLY_COMMANDS 必须可达（A1 解锁的回归防线）。
 *
 * 背景：INTERNAL_ONLY_COMMANDS 历史上被 USER_TYPE==='ant' 硬门控，
 * 本 fork 标识是 ant0 → 一整批已实现的官方命令（teleport/issue/autofix-pr
 * 等）静默不可达。A1 改用 isInternalUserType()（ant || ant0）。
 *
 * 陷阱说明（写这个测试踩到的）：
 * - commands.ts 的 COMMANDS 是 memoize 的 → 必须先设 env 再动态 import，
 *   且每个 case 都要 vi.resetModules() 清掉 memoize 缓存，否则会串扰。
 * - agents-platform / ultraplan 用 safeRequire 真实文件加载，测试环境
 *   （.tsx 解析回退）下常返回 null 被 filter 掉，其可见性由文件加载决定、
 *   与 USER_TYPE 门控无关 → 不纳入「仅门控解锁」断言目标集，改为直接断言
 *   INTERNAL_ONLY_COMMANDS 数组本身含这些项（证明它们属于内部集）。
 *
 * 变异验证：把 commands.ts 门控还原为 USER_TYPE==='ant'，ant0 用例应全失败。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

async function commandNamesUnder(userType: string): Promise<string[]> {
  vi.resetModules()
  const saved = { ...process.env }
  try {
    process.env.USER_TYPE = userType
    delete process.env.IS_DEMO
    const { COMMANDS } = await import('../../src/commands.js')
    return COMMANDS().map(c => c.name)
  } finally {
    process.env = saved
  }
}

// A1 解锁的目标命令（纯命令对象，不依赖 safeRequire 文件加载，可稳定断言）。
// 这些项在 INTERNAL_ONLY_COMMANDS 中始终为 truthy，能可靠反映门控是否生效。
const UNLOCKED_TARGETS = ['teleport', 'issue', 'oauth-refresh', 'good-claude', 'break-cache', 'autofix-pr']

describe('ant0 内部用户命令可达性（A1 守卫）', () => {
  // commands.ts 是重量级模块（数百 import），vi.resetModules 后重加载
  // 单次 import 需 5-10s，远超 vitest 默认 5s 单测超时，必须放宽。
  vi.setConfig({ testTimeout: 60000 })
  afterEach(() => {
    vi.resetModules()
  })

  it('ant0：INTERNAL_ONLY 命令可达', async () => {
    const names = await commandNamesUnder('ant0')
    for (const t of UNLOCKED_TARGETS) {
      expect(names, `ant0 应能看到 /${t}`).toContain(t)
    }
  })

  it('ant（上游员工）同样可达（向后兼容）', async () => {
    const names = await commandNamesUnder('ant')
    for (const t of UNLOCKED_TARGETS) {
      expect(names, `ant 应能看到 /${t}`).toContain(t)
    }
  })

  it('外部用户：这些命令不可见（门控仍生效）', async () => {
    const names = await commandNamesUnder('external')
    for (const t of UNLOCKED_TARGETS) {
      expect(names, `external 不应能看到 /${t}`).not.toContain(t)
    }
  })

  it('IS_DEMO=1：ant0 也不注入 INTERNAL_ONLY（演示模式保护不变）', async () => {
    vi.resetModules()
    const saved = { ...process.env }
    try {
      process.env.USER_TYPE = 'ant0'
      process.env.IS_DEMO = '1'
      const { COMMANDS } = await import('../../src/commands.js')
      const names = COMMANDS().map(c => c.name)
      expect(names).not.toContain('teleport')
      expect(names).not.toContain('issue')
    } finally {
      process.env = saved
    }
  })

  it('env 仅在内部用户可见（修复 632 行无条件注册泄漏）', async () => {
    const internal = await commandNamesUnder('ant0')
    expect(internal, 'ant0 应能看到 /env').toContain('env')
    const external = await commandNamesUnder('external')
    expect(external, 'external 不应能看到 /env').not.toContain('env')
  })

  it('INTERNAL_ONLY_COMMANDS 集合在内部用户下被 COMMANDS 展开', async () => {
    vi.resetModules()
    const { INTERNAL_ONLY_COMMANDS, COMMANDS } = await import('../../src/commands.js')
    // INTERNAL_ONLY_COMMANDS 含 teleport/issue 等稳定项，内部用户下应整体展开。
    const internalOnlyNames = INTERNAL_ONLY_COMMANDS.map(c => c?.name).filter(Boolean)
    expect(internalOnlyNames).toContain('teleport')
    const cmdNames = COMMANDS().map(c => c.name)
    expect(cmdNames).toContain('teleport')
  })
})
