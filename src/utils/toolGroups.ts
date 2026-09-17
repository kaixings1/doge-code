/**
 * 工具组配置 —— 用「组」决定本次会话把哪些工具暴露给模型。
 *
 * 设计原则（与既有机制的关系）：
 *   - `process.env.CLAUDE_CODE_FEATURE_*` 等环境变量决定「编译/加载期」工具是否存在
 *     （见 src/tools.ts 顶部的 loadConditionalCommand 条件导入），不在此处改动。
 *   - 工具组是叠加在环境变量之上的「运行期可见性」过滤器：
 *     环境变量判定通过 → 再看是否属于当前激活组。
 *   - 默认处于 `global` 全局组，语义是「不过滤」，因此不改变任何已有行为。
 *
 * 立即生效：getAllBaseTools() 每次调用都重新构建工具数组，且此处每次从磁盘读取
 * 配置（loadDogeConfig 无 memoization），所以切换组后下一次获取工具列表即为新配置。
 *
 * ponytail: 组只按工具名过滤，不参与加载期条件判断；上限是「无法用组去开启一个
 * 因环境变量而未被 import 的工具」，如需该能力应在 tools.ts 的 conditionalImport 层扩展。
 */
import { loadDogeConfig, setDogeConfig } from './config/dogeConfig.js'

/** 全局组：语义为「全部工具」，不过滤 */
export const GLOBAL_GROUP_NAME = 'global'

export interface ToolGroupDef {
  /** 组名（用户可见，唯一） */
  name: string
  /** 组说明 */
  description?: string
  /** 组内工具名列表（模型可见的工具名，如 'Read' / 'Bash'） */
  tools: string[]
}

export interface ToolGroupState {
  /** 当前激活的组名 */
  active: string
  /** 自定义组；global 为内置组，不在此列表中 */
  groups: ToolGroupDef[]
}

const CONFIG_KEY = 'toolGroups'

const DEFAULT_STATE: ToolGroupState = { active: GLOBAL_GROUP_NAME, groups: [] }

function normalizeState(raw: unknown): ToolGroupState {
  if (!raw || typeof raw !== 'object') return { active: GLOBAL_GROUP_NAME, groups: [] }
  const obj = raw as Partial<ToolGroupState>
  const groups = Array.isArray(obj.groups)
    ? obj.groups
        .filter(g => g && typeof g.name === 'string' && g.name !== GLOBAL_GROUP_NAME)
        .map(g => ({
          name: g.name,
          description: typeof g.description === 'string' ? g.description : '',
          tools: Array.isArray(g.tools) ? g.tools.filter((t): t is string => typeof t === 'string') : [],
        }))
    : []
  const active = typeof obj.active === 'string' && obj.active ? obj.active : GLOBAL_GROUP_NAME
  // active 指向已删除的组时回落到全局组，避免工具列表意外清空
  const activeExists = active === GLOBAL_GROUP_NAME || groups.some(g => g.name === active)
  return { active: activeExists ? active : GLOBAL_GROUP_NAME, groups }
}

/** 读取工具组状态（每次读盘，保证运行期修改立即生效） */
export function getToolGroupState(): ToolGroupState {
  return normalizeState(loadDogeConfig()[CONFIG_KEY])
}

/** 写入工具组状态 */
export function saveToolGroupState(state: ToolGroupState): void {
  setDogeConfig(CONFIG_KEY, normalizeState(state))
}

/** 列出全部组：内置全局组排在首位 */
export function listToolGroups(): ToolGroupDef[] {
  const state = getToolGroupState()
  return [
    { name: GLOBAL_GROUP_NAME, description: '全局组：全部工具', tools: [] },
    ...state.groups,
  ]
}

export function getActiveGroupName(): string {
  return getToolGroupState().active
}

/**
 * 切换当前激活组。组不存在时抛错，避免静默写入无效配置。
 */
export function setActiveGroup(name: string): void {
  if (name !== GLOBAL_GROUP_NAME && !getToolGroupState().groups.some(g => g.name === name)) {
    throw new Error(`工具组不存在: ${name}`)
  }
  const state = getToolGroupState()
  saveToolGroupState({ ...state, active: name })
}

/**
 * 判断工具是否属于当前激活组。
 * 全局组 / 未配置 → 恒为 true（保持既有行为不变）。
 */
export function isToolInActiveGroup(toolName: string): boolean {
  const state = getToolGroupState()
  if (state.active === GLOBAL_GROUP_NAME) return true
  const group = state.groups.find(g => g.name === state.active)
  if (!group) return true
  return group.tools.includes(toolName)
}

/**
 * 把「当前工具快照」另存为一个命名组。
 * @param name 新组名
 * @param tools 组内工具名；省略时创建空组，由调用方后续增删
 */
export function saveGroupAs(name: string, tools: string[] = [], description = ''): ToolGroupDef {
  if (!name || name === GLOBAL_GROUP_NAME) {
    throw new Error(`组名无效: ${name === GLOBAL_GROUP_NAME ? 'global 为内置组名' : '空名'}`)
  }
  const state = getToolGroupState()
  const group: ToolGroupDef = { name, description, tools: [...new Set(tools)] }
  const idx = state.groups.findIndex(g => g.name === name)
  const groups = idx >= 0
    ? state.groups.map((g, i) => (i === idx ? group : g))
    : [...state.groups, group]
  saveToolGroupState({ ...state, groups })
  return group
}

function mutateGroup(name: string, fn: (g: ToolGroupDef) => ToolGroupDef): ToolGroupDef {
  const state = getToolGroupState()
  const idx = state.groups.findIndex(g => g.name === name)
  // 未显式建组时隐式创建空组，避免调用方必须先建组再增删
  if (idx < 0) {
    if (name === GLOBAL_GROUP_NAME) throw new Error('全局组不可修改，请先另存为命名组')
    saveGroupAs(name, [])
    return mutateGroup(name, fn)
  }
  const next = fn(state.groups[idx]!)
  const groups = state.groups.map((g, i) => (i === idx ? next : g))
  saveToolGroupState({ ...state, groups })
  return next
}

/** 向组内添加工具（已存在则幂等） */
export function addToolToGroup(groupName: string, toolName: string): ToolGroupDef {
  return mutateGroup(groupName, g => ({
    ...g,
    tools: g.tools.includes(toolName) ? g.tools : [...g.tools, toolName],
  }))
}

/** 从组内移除工具 */
export function removeToolFromGroup(groupName: string, toolName: string): ToolGroupDef {
  return mutateGroup(groupName, g => ({ ...g, tools: g.tools.filter(t => t !== toolName) }))
}

/** 删除组；若删除的是当前激活组，自动回到全局组 */
export function deleteToolGroup(groupName: string): void {
  if (groupName === GLOBAL_GROUP_NAME) throw new Error('global 为内置组，不可删除')
  const state = getToolGroupState()
  saveToolGroupState({
    active: state.active === groupName ? GLOBAL_GROUP_NAME : state.active,
    groups: state.groups.filter(g => g.name !== groupName),
  })
}

/**
 * 按当前激活组过滤工具列表。
 * 未被任何组约束时原样返回（等价于未启用该特性）。
 */
export function filterToolsByActiveGroup<T extends { name: string }>(tools: readonly T[]): T[] {
  const state = getToolGroupState()
  if (state.active === GLOBAL_GROUP_NAME) return [...tools]
  const group = state.groups.find(g => g.name === state.active)
  if (!group) return [...tools]
  const allow = new Set(group.tools)
  return tools.filter(t => allow.has(t.name))
}
