import { roughTokenCountEstimation } from '../services/tokenEstimation.js'
import type { AgentDefinitionsResult } from '../tools/AgentTool/loadAgentsDir.js'

export const AGENT_DESCRIPTIONS_THRESHOLD = 15_000

/**
 * 计算智能体描述的总体 token 估计值
 */
export function getAgentDescriptionsTotalTokens(
  agentDefinitions?: AgentDefinitionsResult,
): number {
  if (!agentDefinitions) return 0 // 没有智能体定义时返回 0

  return agentDefinitions.activeAgents
    .filter(a => a.source !== 'built-in') // 过滤掉内置智能体
    .reduce((total, agent) => {
      const description = `${agent.agentType}: ${agent.whenToUse}`
      return total + roughTokenCountEstimation(description) // 累加 token 估计值
    }, 0)
}
