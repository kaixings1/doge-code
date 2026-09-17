import { describe, it, expect, beforeEach, vi } from 'vitest'

// 内存模拟 ~/.doge/config.json，避免测试污染真实用户配置
const store: Record<string, unknown> = {}

vi.mock('../../utils/config/dogeConfig.js', () => ({
  loadDogeConfig: () => ({ ...store }),
  setDogeConfig: (key: string, value: unknown) => {
    store[key] = value
  },
}))

const {
  GLOBAL_GROUP_NAME,
  addToolToGroup,
  deleteToolGroup,
  filterToolsByActiveGroup,
  getActiveGroupName,
  getToolGroupState,
  isToolInActiveGroup,
  listToolGroups,
  removeToolFromGroup,
  saveGroupAs,
  setActiveGroup,
} = await import('../../utils/toolGroups.js')

const TOOLS = [{ name: 'Read' }, { name: 'Bash' }, { name: 'Write' }]

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]
})

describe('toolGroups', () => {
  it('未配置时默认处于全局组且不做任何过滤', () => {
    expect(getActiveGroupName()).toBe(GLOBAL_GROUP_NAME)
    expect(getToolGroupState().groups).toEqual([])
    expect(filterToolsByActiveGroup(TOOLS)).toEqual(TOOLS)
    expect(isToolInActiveGroup('任意工具')).toBe(true)
  })

  it('另存为命名组后可按组过滤工具', () => {
    saveGroupAs('编程', ['Read', 'Bash'])
    setActiveGroup('编程')

    expect(getActiveGroupName()).toBe('编程')
    expect(filterToolsByActiveGroup(TOOLS).map(t => t.name)).toEqual(['Read', 'Bash'])
    expect(isToolInActiveGroup('Read')).toBe(true)
    expect(isToolInActiveGroup('Write')).toBe(false)
  })

  it('组内可增删工具', () => {
    saveGroupAs('编程', ['Read'])
    addToolToGroup('编程', 'Bash')
    expect(listToolGroups().find(g => g.name === '编程')!.tools).toEqual(['Read', 'Bash'])

    addToolToGroup('编程', 'Bash') // 幂等
    expect(listToolGroups().find(g => g.name === '编程')!.tools).toEqual(['Read', 'Bash'])

    removeToolFromGroup('编程', 'Read')
    expect(listToolGroups().find(g => g.name === '编程')!.tools).toEqual(['Bash'])
  })

  it('对不存在的组增删工具时隐式建组', () => {
    addToolToGroup('新组', 'Write')
    expect(listToolGroups().map(g => g.name)).toContain('新组')
    expect(listToolGroups().find(g => g.name === '新组')!.tools).toEqual(['Write'])
  })

  it('删除当前激活组后回落到全局组，避免工具被清空', () => {
    saveGroupAs('临时', ['Read'])
    setActiveGroup('临时')
    deleteToolGroup('临时')

    expect(getActiveGroupName()).toBe(GLOBAL_GROUP_NAME)
    expect(filterToolsByActiveGroup(TOOLS)).toEqual(TOOLS)
  })

  it('全局组不可删除、不可增删工具', () => {
    expect(() => deleteToolGroup(GLOBAL_GROUP_NAME)).toThrow()
    expect(() => addToolToGroup(GLOBAL_GROUP_NAME, 'Read')).toThrow()
    expect(() => saveGroupAs(GLOBAL_GROUP_NAME, ['Read'])).toThrow()
  })

  it('切换到不存在的组时抛错，且不写入配置', () => {
    expect(() => setActiveGroup('不存在')).toThrow(/不存在/)
    expect(getActiveGroupName()).toBe(GLOBAL_GROUP_NAME)
  })

  it('组名重复时覆盖而非追加', () => {
    saveGroupAs('编程', ['Read'])
    saveGroupAs('编程', ['Bash'])
    const groups = listToolGroups().filter(g => g.name === '编程')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tools).toEqual(['Bash'])
  })

  it('配置中的 active 指向已删除组时回落全局组', () => {
    store['toolGroups'] = { active: '幽灵组', groups: [] }
    expect(getActiveGroupName()).toBe(GLOBAL_GROUP_NAME)
    expect(filterToolsByActiveGroup(TOOLS)).toEqual(TOOLS)
  })

  it('listToolGroups 始终包含内置全局组', () => {
    expect(listToolGroups()[0]!.name).toBe(GLOBAL_GROUP_NAME)
  })
})
