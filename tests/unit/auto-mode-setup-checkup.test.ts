import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * D4：/auto-mode-setup 与 /checkup（对齐官方 v2.1.304 / v2.1.283）
 *
 * 两个命令都是 local 型，直接调用真实 call() 断言输出。
 *
 * 注意：不能对 src/commands.js 用 spyOn —— 该模块真实加载要扫描技能目录
 * （本机 20s+），会让用例超时。这里用 vi.mock 整体替换，只暴露被测命令
 * 实际用到的那一个导出。
 */

let mockSkills: Array<{ name: string; description?: string; whenToUse?: string }> = []

vi.mock('../../src/commands.js', () => ({
  getSkillToolCommands: async () => mockSkills,
}))

let mockMemory: Array<{ path: string; content: string; type: string }> = []

vi.mock('../../src/utils/claudemd.js', () => ({
  getMemoryFiles: async () => mockMemory,
}))

describe('/checkup 提示词审查', () => {
  beforeEach(() => {
    mockSkills = []
    mockMemory = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('命令已注册（含 prompt-audit 别名）', async () => {
    const { default: checkup } = await import('../../src/commands/checkup/index.js')
    expect(checkup.name).toBe('checkup')
    expect(checkup.aliases).toContain('prompt-audit')
  })

  it('抓到空泛指令（高优先级）', async () => {
    mockMemory = [
      { path: 'CLAUDE.md', type: 'project', content: '注意代码质量\n遵循最佳实践' },
    ]
    const { call } = await import('../../src/commands/checkup/index.js')
    const r = await call('', undefined)
    expect(String(r.value)).toContain('[高]')
    expect(String(r.value)).toContain('注意代码质量')
  })

  it('抓到不可证伪的形容词', async () => {
    mockMemory = [
      { path: 'CLAUDE.md', type: 'project', content: '请写出高质量的代码' },
    ]
    const { call } = await import('../../src/commands/checkup/index.js')
    const r = await call('', undefined)
    expect(String(r.value)).toContain('高质量的')
    expect(String(r.value)).toContain('[中]')
  })

  it('抓到重复行', async () => {
    const dup = '始终使用 TypeScript 严格模式进行开发'
    mockMemory = [{ path: 'CLAUDE.md', type: 'project', content: `${dup}\n\n${dup}` }]
    const { call } = await import('../../src/commands/checkup/index.js')
    const r = await call('', undefined)
    expect(String(r.value)).toContain('重复 2 次')
  })

  it('也会审查技能描述', async () => {
    mockSkills = [{ name: 'my-skill', description: '提供专业的解决方案' }]
    const { call } = await import('../../src/commands/checkup/index.js')
    const r = await call('', undefined)
    expect(String(r.value)).toContain('技能 my-skill')
  })

  it('干净提示词不报问题', async () => {
    mockMemory = [
      { path: 'CLAUDE.md', type: 'project', content: '提交前必须运行 npm test。' },
    ]
    const { call } = await import('../../src/commands/checkup/index.js')
    const r = await call('', undefined)
    expect(String(r.value)).toContain('未发现问题')
  })

  it('未知检查项给出可用列表', async () => {
    const { call } = await import('../../src/commands/checkup/index.js')
    const r = await call('security', undefined)
    expect(String(r.value)).toContain('未知的检查项')
    expect(String(r.value)).toContain('prompt-audit')
  })
})

describe('/auto-mode-setup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('命令已注册', async () => {
    const { default: cmd } = await import('../../src/commands/auto-mode-setup/index.js')
    expect(cmd.name).toBe('auto-mode-setup')
  })

  it('默认只给建议，不修改配置', async () => {
    const features = await import('../../src/features/index.js')
    const mgr = features.getAutoModeManager()
    const before = mgr.getConfig()
    const spy = vi.spyOn(mgr, 'setConfig')

    const { call } = await import('../../src/commands/auto-mode-setup/index.js')
    await call('', undefined)

    expect(spy).not.toHaveBeenCalled()
    expect(mgr.getConfig()).toEqual(before)
  })

  it('输出包含各配置项与建议值', async () => {
    const { call } = await import('../../src/commands/auto-mode-setup/index.js')
    const r = await call('', undefined)
    const text = String(r.value)
    for (const key of ['dangerousRm', 'backgroundAmpersand', 'suspiciousWindowsPaths']) {
      expect(text, key).toContain(key)
    }
    expect(text).toContain('建议')
  })

  it('--apply 时写入配置', async () => {
    const features = await import('../../src/features/index.js')
    const mgr = features.getAutoModeManager()
    mgr.setConfig({ dangerousRm: false })

    const spy = vi.spyOn(mgr, 'setConfig')
    const { call } = await import('../../src/commands/auto-mode-setup/index.js')
    const r = await call('--apply', undefined)

    expect(spy).toHaveBeenCalled()
    expect(mgr.getConfig().dangerousRm).toBe(true)
    expect(String(r.value)).toContain('已应用')

    mgr.setConfig({ dangerousRm: true })
  })
})
