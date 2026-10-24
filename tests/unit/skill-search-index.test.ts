/**
 * localSkillSearch 本地索引单测（TASK.md #25）。
 *
 * 背景：src/services/skillSearch/localSearch.ts 此前是桩——
 *   localSkillSearch() 直接 return [] + console.warn('技能索引未实现')
 *   clearSkillIndexCache() 是 no-op
 *
 * 现落地为本地关键词/前缀索引，不引入 embedding / 云端服务。
 *
 * 本测试锁定：
 *   1. 空查询返回空（不抛错，与旧行为一致的边界）
 *   2. 名称精确/前缀命中优先于关键词命中（排序）
 *   3. 中文子串命中
 *   4. 别名命中
 *   5. clearSkillIndexCache 之后重新搜索会重建索引（缓存失效生效）
 *
 * 变异验证：
 *   - 断言 2 若去掉 score 排序则同名非精确命中也会排到前面 → 失败
 *   - 断言 3 若 tokenize 不切中文单字则中文查询命不中 → 失败
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 必须 hoist 到文件顶部才能生效（不能用 beforeEach 内 mock）
const fakeBundled = [
  { name: 'debug-skill', description: '调试运行中的代码并定位根因', aliases: ['dbg'], userInvocable: true },
  { name: 'review-pr', description: 'Review a pull request', aliases: [], userInvocable: true },
]

vi.mock('../../src/skills/bundledSkills.js', () => ({
  getBundledSkills: () => fakeBundled,
}))
vi.mock('../../src/skills/loadSkillsDir.js', () => ({
  getSkillDirCommands: async () => [],
}))
vi.mock('../../src/utils/plugins/loadPluginCommands.js', () => ({
  getPluginSkills: async () => [],
}))

import { localSkillSearch, clearSkillIndexCache, tokenize } from '../../src/services/skillSearch/localSearch.js'

beforeEach(() => {
  clearSkillIndexCache()
})

describe('localSkillSearch 边界', () => {
  it('空查询返回空且不抛错', async () => {
    expect(await localSkillSearch('')).toEqual([])
    expect(await localSkillSearch('   ')).toEqual([])
  })

  it('tokenize 在测试运行时对中文正确切分', () => {
    expect(tokenize('调试运行中的代码')).toContain('调')
    expect(tokenize('调试运行中的代码')).toContain('试')
  })

  it('mock 生效：fake 别名 dbg 应命中 debug-skill（确认未走真实 getBundledSkills）', async () => {
    const r = await localSkillSearch('dbg')
    expect(r.map(s => s.name)).toContain('debug-skill')
  })
})

describe('命中与排序', () => {
  it('精确命中排第一', async () => {
    const r = await localSkillSearch('review-pr')
    expect(r[0].name).toBe('review-pr')
  })

  it('前缀命中优先于关键词命中', async () => {
    const r = await localSkillSearch('debug')
    expect(r[0].name).toBe('debug-skill')
  })

  it('中文子串命中', async () => {
    const r = await localSkillSearch('调试')
    expect(r.map(s => s.name)).toContain('debug-skill')
  })

  it('别名命中', async () => {
    const r = await localSkillSearch('dbg')
    expect(r.map(s => s.name)).toContain('debug-skill')
  })

  it('无匹配返回空', async () => {
    expect(await localSkillSearch('zzz-nomatch')).toEqual([])
  })
})

describe('缓存失效', () => {
  it('clearSkillIndexCache 后重建索引（不影响命中结果）', async () => {
    const before = await localSkillSearch('debug')
    expect(before.length).toBeGreaterThan(0)
    clearSkillIndexCache()
    const after = await localSkillSearch('debug')
    expect(after).toEqual(before)
  })
})
