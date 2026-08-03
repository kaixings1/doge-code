/**
 * 展示代理信息的共享工具函数。
 * 同时用于 CLI `claude agents` 处理器和交互式 `/agents` 命令。
 */

import { getDefaultSubagentModel } from '../../utils/model/agent.js'
import {
  getSourceDisplayName,
  type SettingSource,
} from '../../utils/settings/constants.js'
import type { AgentDefinition } from './loadAgentsDir.js'

type AgentSource = SettingSource | 'built-in' | 'plugin'

export type AgentSourceGroup = {
  label: string
  source: AgentSource
}

/**
 * 用于展示的代理来源组有序列表。
 * CLI 和交互式 UI 都应使用此列表以确保一致的排序。
 */
export const AGENT_SOURCE_GROUPS: AgentSourceGroup[] = [
  { label: '用户代理', source: 'userSettings' },
  { label: '项目代理', source: 'projectSettings' },
  { label: '本地代理', source: 'localSettings' },
  { label: '受管代理', source: 'policySettings' },
  { label: '插件代理', source: 'plugin' },
  { label: 'CLI 参数代理', source: 'flagSettings' },
  { label: '内置代理', source: 'built-in' },
]

export type ResolvedAgent = AgentDefinition & {
  overriddenBy?: AgentSource
}

/**
 * 通过与活动（胜出）代理列表比较，为代理标注覆盖信息。
 * 当来自更高优先级来源的同类型代理优先时，该代理被标记为"已覆盖"。
 *
 * 同时按 (agentType, source) 去重，以处理同一代理文件同时从
 * git worktree 和主仓库加载的重复情况。
 */
export function resolveAgentOverrides(
  allAgents: AgentDefinition[],
  activeAgents: AgentDefinition[],
): ResolvedAgent[] {
  const activeMap = new Map<string, AgentDefinition>()
  for (const agent of activeAgents) {
    activeMap.set(agent.agentType, agent)
  }

  const seen = new Set<string>()
  const resolved: ResolvedAgent[] = []

  // 遍历所有代理，使用 activeAgents 中的覆盖信息标注每个代理。
  // 按 (agentType, source) 去重，以处理 git worktree 重复。
  for (const agent of allAgents) {
    const key = `${agent.agentType}:${agent.source}`
    if (seen.has(key)) continue
    seen.add(key)

    const active = activeMap.get(agent.agentType)
    const overriddenBy =
      active && active.source !== agent.source ? active.source : undefined
    resolved.push({ ...agent, overriddenBy })
  }

  return resolved
}

/**
 * 解析代理的显示模型字符串。
 * 返回模型别名或 'inherit' 用于显示目的。
 */
export function resolveAgentModelDisplay(
  agent: AgentDefinition,
): string | undefined {
  const model = agent.model || getDefaultSubagentModel()
  if (!model) return undefined
  return model === 'inherit' ? 'inherit' : model
}

/**
 * 获取覆盖代理的来源的人类可读标签。
 * 返回小写，例如 "user"、"project"、"managed"。
 */
export function getOverrideSourceLabel(source: AgentSource): string {
  return getSourceDisplayName(source).toLowerCase()
}

/**
 * 按名称字母顺序比较代理（不区分大小写）。
 */
export function compareAgentsByName(
  a: AgentDefinition,
  b: AgentDefinition,
): number {
  return a.agentType.localeCompare(b.agentType, undefined, {
    sensitivity: 'base',
  })
}
