/**
 * discover_skills 工具契约单测（TASK.md #24）。
 *
 * 背景：src/tools/DiscoverSkillsTool/ 此前只有 59 字节的 prompt.ts，
 * 仅导出常量 DISCOVER_SKILLS_TOOL_NAME，目录下无实现文件。
 *
 * 本测试锁定：
 *   1. collectSkills 能从三类来源聚合并去重（bundled / dir / plugin）
 *   2. 关键词过滤（名称/描述/别名，大小写不敏感）
 *   3. source 过滤开关（bundled | dir | plugin）
 *   4. 空环境返回空列表（不抛错）
 *
 * 变异验证：
 *   - 断言 2 若去掉大小写 toLowerCase 则「大写查询命中小写名称」失败
 *   - 断言 1 若去掉去重则同名出现两次
 */
import { describe, it, expect, vi } from 'vitest'

const fakeBundled = [
  { name: 'debug', description: '调试代码', aliases: ['dbg'], userInvocable: true, loadedFrom: 'bundled' },
  { name: 'hidden', description: '内部', aliases: [], userInvocable: false, loadedFrom: 'bundled' },
]
const fakeDir = [
  { name: 'code-review', description: 'Review PR', aliases: ['cr'], userInvocable: true, loadedFrom: 'dir' },
  { name: 'debug', description: '副本', aliases: [], userInvocable: true, loadedFrom: 'dir' },
]
const fakePlugin = [
  { name: 'deploy', description: '部署', aliases: [], userInvocable: true, loadedFrom: 'plugin' },
]

// vi.mock 必须 hoist 到文件顶部才能生效
vi.mock('../../src/skills/bundledSkills.js', () => ({
  getBundledSkills: () => fakeBundled,
}))
vi.mock('../../src/skills/loadSkillsDir.js', () => ({
  getSkillDirCommands: async () => fakeDir,
}))
vi.mock('../../src/utils/plugins/loadPluginCommands.js', () => ({
  getPluginSkills: async () => fakePlugin,
}))

import { collectSkills } from '../../src/tools/DiscoverSkillsTool/DiscoverSkillsTool.js'

describe('collectSkills 聚合与去重', () => {
  it('合并三类来源并按名称去重（bundled 优先）', async () => {
    const skills = await collectSkills('/tmp', undefined, 'all')
    const names = skills.map(s => s.name)
    expect(names).toContain('debug')
    expect(names).toContain('code-review')
    expect(names).toContain('deploy')
    expect(names.filter(n => n === 'debug')).toHaveLength(1)
    const debug = skills.find(s => s.name === 'debug')!
    expect(debug.source).toBe('bundled')
  })

  it('userInvocable=false 的技能被过滤掉', async () => {
    const skills = await collectSkills('/tmp', undefined, 'all')
    expect(skills.find(s => s.name === 'hidden')).toBeUndefined()
  })

  it('空环境（三类都返回空）返回空列表且不抛错', async () => {
    vi.resetModules()
    vi.doMock('../../src/skills/bundledSkills.js', () => ({ getBundledSkills: () => [] }))
    vi.doMock('../../src/skills/loadSkillsDir.js', () => ({ getSkillDirCommands: async () => [] }))
    vi.doMock('../../src/utils/plugins/loadPluginCommands.js', () => ({ getPluginSkills: async () => [] }))
    const mod = await import('../../src/tools/DiscoverSkillsTool/DiscoverSkillsTool.js')
    const skills = await mod.collectSkills('/tmp', undefined, 'all')
    expect(skills).toEqual([])
  })
})

describe('关键词过滤', () => {
  it('按名称命中（大小写不敏感）', async () => {
    const skills = await collectSkills('/tmp', 'DEBUG', 'all')
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('debug')
  })

  it('按描述命中', async () => {
    const skills = await collectSkills('/tmp', 'review', 'all')
    expect(skills.map(s => s.name)).toContain('code-review')
  })

  it('按别名命中', async () => {
    const skills = await collectSkills('/tmp', 'dbg', 'all')
    expect(skills.map(s => s.name)).toContain('debug')
  })

  it('无匹配返回空', async () => {
    const skills = await collectSkills('/tmp', 'zzz-nomatch', 'all')
    expect(skills).toEqual([])
  })
})

describe('source 过滤', () => {
  it('source=bundled 仅含内置技能', async () => {
    const skills = await collectSkills('/tmp', undefined, 'bundled')
    expect(skills.every(s => s.source === 'bundled')).toBe(true)
    expect(skills.map(s => s.name)).toEqual(['debug'])
  })

  it('source=plugin 仅含插件技能', async () => {
    const skills = await collectSkills('/tmp', undefined, 'plugin')
    expect(skills.every(s => s.source === 'plugin')).toBe(true)
    expect(skills.map(s => s.name)).toEqual(['deploy'])
  })

  it('source=dir 仅含磁盘目录技能', async () => {
    const skills = await collectSkills('/tmp', undefined, 'dir')
    const names = skills.map(s => s.name)
    expect(names).toContain('code-review')
    expect(names).toContain('debug')
  })
})
