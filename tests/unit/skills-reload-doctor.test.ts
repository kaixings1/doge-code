import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * /reload-skills 与 /skill-doctor（对齐官方 v2.1.304 / v2.1.261）
 *
 * 断言方式：对真实 COMMANDS() 与真实 call() 断言，不复刻调用序列。
 * - 注册：两条命令确实出现在 COMMANDS() 中，且类型/描述正确
 * - /reload-skills：确实调用了三个清理入口（用 spy 观察真实模块）
 * - /skill-doctor：确实读取技能列表并区分「用过 / 没用过」
 */

type Cmd = { name: string; type: string; description?: string; load?: () => Promise<{ call: unknown }> }

// COMMANDS() 首次调用会真实扫描技能目录（本机约 2s），给足超时并用单例避免重复扫描。
const SLOW = 30_000
const cmdCache = new Map<string, Promise<Cmd[]>>()

function allCommands(): Promise<Cmd[]> {
  const hit = cmdCache.get('all')
  if (hit) return hit
  const p = import('../../src/commands.js').then(m => m.COMMANDS() as Cmd[])
  cmdCache.set('all', p)
  return p
}

describe('命令注册', () => {
  // 只取一次 COMMANDS()，避免每个用例都付一次目录扫描成本。
  let cmds: Cmd[]
  beforeEach(async () => {
    cmds = await allCommands()
  }, SLOW)

  it('/reload-skills 已注册', () => {
    const c = cmds.find(x => x.name === 'reload-skills')
    expect(c).toBeTruthy()
    expect(c?.type).toBe('local')
    expect(c?.description).toContain('技能')
  })

  it('/skill-doctor 已注册', () => {
    const c = cmds.find(x => x.name === 'skill-doctor')
    expect(c).toBeTruthy()
    expect(c?.type).toBe('local')
    expect(c?.description).toContain('技能')
  })

  it('两者名称唯一（不与既有命令重名）', () => {
    for (const name of ['reload-skills', 'skill-doctor']) {
      expect(cmds.filter(c => c.name === name).length, name).toBe(1)
    }
  })
})

describe('/reload-skills 执行', () => {
  let spySkill: ReturnType<typeof vi.spyOn>
  let spyReset: ReturnType<typeof vi.spyOn>
  let spyCmdCache: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    // 对真实模块的导出打 spy：能观察到 call() 是否真的走了清理序列，
    // 且不会因为复刻逻辑而在实现变更时假通过。
    const loadSkills = await import('../../src/skills/loadSkillsDir.js')
    const attachments = await import('../../src/utils/attachments.js')
    const commandsModule = await import('../../src/commands.js')
    spySkill = vi.spyOn(loadSkills, 'clearSkillCaches').mockImplementation(() => {})
    spyReset = vi.spyOn(attachments, 'resetSentSkillNames').mockImplementation(() => {})
    spyCmdCache = vi.spyOn(commandsModule, 'clearCommandsCache').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('调用了 clearSkillCaches / clearCommandsCache / resetSentSkillNames', async () => {
    const mod = await import('../../src/commands/reload-skills/index.js')
    const result = await mod.call('', undefined)
    expect(spySkill).toHaveBeenCalled()
    expect(spyCmdCache).toHaveBeenCalled()
    expect(spyReset).toHaveBeenCalled()
    expect(result.type).toBe('text')
    expect(String(result.value)).toContain('技能已重载')
  })

  it('输出说明会把完整技能列表重新发送给模型', async () => {
    const mod = await import('../../src/commands/reload-skills/index.js')
    const result = await mod.call('', undefined)
    expect(String(result.value)).toContain('完整技能列表')
  })
})

describe('/skill-doctor 执行', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('区分已使用与未使用的技能', async () => {
    const loadSkills = await import('../../src/skills/loadSkillsDir.js')
    const commandsModule = await import('../../src/commands.js')
    vi.spyOn(commandsModule, 'getSkillToolCommands').mockResolvedValue([
      { name: 'used-skill', description: 'x', whenToUse: 'y' },
      { name: 'idle-skill', description: 'a', whenToUse: 'b' },
    ] as never)
    vi.spyOn(loadSkills, 'estimateSkillFrontmatterTokens').mockReturnValue(120)

    const context = {
      messages: [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'Skill', input: { skill: 'used-skill' } },
            ],
          },
        },
      ],
    } as never

    const mod = await import('../../src/commands/skill-doctor/index.js')
    const result = await mod.call('', context)
    const text = String(result.value)

    expect(text).toContain('已加载 2 个')
    expect(text).toContain('使用过 1 个')
    expect(text).toContain('idle-skill')
    expect(text).not.toContain('used-skill')
  })

  it('全部使用过时明确说明无需裁剪', async () => {
    const loadSkills = await import('../../src/skills/loadSkillsDir.js')
    const commandsModule = await import('../../src/commands.js')
    vi.spyOn(commandsModule, 'getSkillToolCommands').mockResolvedValue([
      { name: 'only-skill', description: 'x', whenToUse: 'y' },
    ] as never)
    vi.spyOn(loadSkills, 'estimateSkillFrontmatterTokens').mockReturnValue(10)

    const context = {
      messages: [
        { type: 'assistant', message: { content: [{ type: 'tool_use', input: { skill: 'only-skill' } }] } },
      ],
    } as never

    const mod = await import('../../src/commands/skill-doctor/index.js')
    const result = await mod.call('', context)
    expect(String(result.value)).toContain('无需裁剪')
  })

  it('没有技能时给出明确提示', async () => {
    const commandsModule = await import('../../src/commands.js')
    vi.spyOn(commandsModule, 'getSkillToolCommands').mockResolvedValue([] as never)

    const mod = await import('../../src/commands/skill-doctor/index.js')
    const result = await mod.call('', { messages: [] } as never)
    expect(String(result.value)).toContain('没有已加载的技能')
  })
})
