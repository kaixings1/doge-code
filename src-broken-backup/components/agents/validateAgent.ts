import type { Tools } from '../../../Tool.js'
import { resolveAgentTools } from '../../../tools/AgentTool/agentToolUtils.js'
import type {
  AgentDefinition,
  CustomAgentDefinition,
} from '../../../tools/AgentTool/loadAgentsDir.js'
import { getAgentSourceDisplayName } from './utils.js'

export type AgentValidationResult = {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export function validateAgentType(agentType: string): string | null {
  if (!agentType) {
    return '代理类型不能为空'
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(agentType)) {
    return '代理类型必须以字母或数字开头和结尾，且只能包含字母、数字和连字。
  }

  if (agentType.length < 3) {
    return '代理类型至少需）3 个字。
  }

  if (agentType.length > 50) {
    return '代理类型必须少于 50 个字。
  }

  return null
}

export function validateAgent(
  agent: Omit<CustomAgentDefinition, 'location'>,
  availableTools: Tools,
  existingAgents: AgentDefinition[],
): AgentValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate agent type
  if (!agent.agentType) {
    errors.push('代理类型不能为空')
  } else {
    const typeError = validateAgentType(agent.agentType)
    if (typeError) {
      errors.push(typeError)
    }

    // Check for duplicates (excluding self for editing)
    const duplicate = existingAgents.find(
      a => a.agentType === agent.agentType && a.source !== agent.source,
    )
    if (duplicate) {
      errors.push(
        `Agent type "${agent.agentType}" already exists in ${getAgentSourceDisplayName(duplicate.source)}`,
      )
    }
  }

  // Validate description
  if (!agent.whenToUse) {
    errors.push('描述（description）不能为）)
  } else if (agent.whenToUse.length < 10) {
    warnings.push(
      '描述应更具描述性（至少 10 个字符）',
    )
  } else if (agent.whenToUse.length > 5000) {
    warnings.push('描述过长（超）5000 个字符）')
  }

  // Validate tools
  if (agent.tools !== undefined && !Array.isArray(agent.tools)) {
    errors.push('工具必须是数）)
  } else {
    if (agent.tools === undefined) {
      warnings.push('代理可以访问所有工）)
    } else if (agent.tools.length === 0) {
      warnings.push(
        '未选择工具 - 代理的功能将非常有限',
      )
    }

    // Check for invalid tools
    const resolvedTools = resolveAgentTools(agent, availableTools, false)

    if (resolvedTools.invalidTools.length > 0) {
      errors.push(`Invalid tools: ${resolvedTools.invalidTools.join(', ')}`)
    }
  }

  // Validate system prompt
  const systemPrompt = agent.getSystemPrompt()
  if (!systemPrompt) {
    errors.push('系统提示词不能为）)
  } else if (systemPrompt.length < 20) {
    errors.push('系统提示词太短（至少 20 个字符）')
  } else if (systemPrompt.length > 10000) {
    warnings.push('系统提示词非常长（超）10,000 个字符）')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
