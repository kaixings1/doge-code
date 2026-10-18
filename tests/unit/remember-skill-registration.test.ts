/**
 * registerRememberSkill 注册门控单测。
 *
 * 背景：原门控 `process.env.USER_TYPE !== 'ant'` 在 doge 本地（未设置
 * USER_TYPE，且本 fork 内部标识为 ant0/n）恒为 true，导致记忆审查技能
 * 永不注册。修复后改用 isAutoMemoryEnabled()（记忆基础设施可用即注册，
 * 与 memoryManager 等兄弟技能一致）。
 *
 * 测试方法：mock bundledSkills.js 的 registerBundledSkill 与
 * paths.js 的 isAutoMemoryEnabled，分离门控逻辑与 settings 解析。
 *
 * 变异验证：若把 `if (!isAutoMemoryEnabled()) return` 改回
 * `if (process.env.USER_TYPE !== 'ant') return`，本地默认用例（无 USER_TYPE）
 * 将不再调用 registerBundledSkill → 测试失败。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 拦截注册函数，避免污染全局 bundledSkills 注册表
const registerBundledSkillMock = vi.fn()
const isAutoMemoryEnabledMock = vi.fn(() => true)

vi.mock('../../src/skills/bundledSkills.js', () => ({
  registerBundledSkill: (def: { name: string }) => registerBundledSkillMock(def),
}))

vi.mock('../../src/memdir/paths.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/memdir/paths.js')>()
  return {
    ...actual,
    isAutoMemoryEnabled: () => isAutoMemoryEnabledMock(),
  }
})

const { registerRememberSkill } = await import(
  '../../src/skills/bundled/remember.ts'
)

describe('registerRememberSkill 注册门控', () => {
  const hadDisable = 'CLAUDE_CODE_DISABLE_AUTO_MEMORY' in process.env
  const savedDisable = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY

  beforeEach(() => {
    registerBundledSkillMock.mockClear()
    isAutoMemoryEnabledMock.mockReturnValue(true)
    delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
  })

  afterEach(() => {
    if (hadDisable) process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = savedDisable
    else delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
  })

  it('记忆系统可用（isAutoMemoryEnabled=true）时应注册 remember 技能', () => {
    registerRememberSkill()
    expect(registerBundledSkillMock).toHaveBeenCalledTimes(1)
    expect(registerBundledSkillMock.mock.calls[0][0].name).toBe('remember')
  })

  it('记忆系统整体关闭（isAutoMemoryEnabled=false）时不注册', () => {
    isAutoMemoryEnabledMock.mockReturnValue(false)
    registerRememberSkill()
    expect(registerBundledSkillMock).not.toHaveBeenCalled()
  })

  it('CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 时 isAutoMemoryEnabled 返回 false 不注册', () => {
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
    isAutoMemoryEnabledMock.mockReturnValue(false)
    registerRememberSkill()
    expect(registerBundledSkillMock).not.toHaveBeenCalled()
  })
})
