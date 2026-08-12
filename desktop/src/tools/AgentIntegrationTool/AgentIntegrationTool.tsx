// ============================================================================
// AgentIntegrationTool — 20大代理功能集成工具
// 将 Claude Code CLI 的专业代理能力集成到桌面应用
// ============================================================================

import type { Tool, ToolUseContext } from '../../Tool.js'
import { z } from 'zod/v4'
import { AGENT_CAPABILITIES, CATEGORY_NAMES, getAllAgentCapabilities, getAllCategories, getAgentCapability, getAgentsByCategory } from './agentRegistry.js'

const AgentIntegrationInputSchema = z.object({
  action: z.enum(['list', 'listByCategory', 'get', 'spawn', 'search']).describe('操作类型：list=列出所有代理，listByCategory=按分类列出，get=获取代理详情，spawn=启动代理，search=搜索代理'),
  agentType: z.string().optional().describe('代理类型（用于 get/spawn 操作）'),
  category: z.enum(['development', 'architecture', 'security', 'devops', 'data', 'design', 'testing', 'documentation']).optional().describe('代理分类（用于 listByCategory 操作）'),
  query: z.string().optional().describe('搜索关键词（用于 search 操作）'),
  task: z.string().optional().describe('任务描述（用于 spawn 操作）'),
})

type AgentIntegrationInput = z.infer<typeof AgentIntegrationInputSchema>

export const AgentIntegrationTool: Tool = {
  name: 'AgentIntegration',
  description: `集成 20 大专业代理能力到桌面应用。支持：
- list: 列出所有可用的专业代理
- listByCategory: 按分类列出代理（开发/架构/安全/DevOps/数据/设计/测试/文档）
- get: 获取特定代理的详细信息
- spawn: 启动特定代理执行任务
- search: 搜索代理

可用代理类型：android-developer, frontend-developer, backend-architect, fullstack-engineer, mobile-developer, software-architect, c4-architect, security-engineer, security-architect, devops-automation, deployment-expert, site-reliability-engineer, data-analyst, data-engineer, machine-learning-engineer, ui-designer, designer, qa-engineer, test-engineer, documentation-writer, api-documentation, build-error-resolver, code-reviewer`,

  inputSchema: AgentIntegrationInputSchema,

  async call(input: AgentIntegrationInput, ctx: ToolUseContext) {
    const { action, agentType, category, query, task } = input

    try {
      switch (action) {
        case 'list':
          return listAllAgents()
        case 'listByCategory':
          if (!category) return { type: 'text', value: ' 缺少 category 参数' }
          return listAgentsByCategory(category)
        case 'get':
          if (!agentType) return { type: 'text', value: ' 缺少 agentType 参数' }
          return getAgentInfo(agentType)
        case 'spawn':
          if (!agentType) return { type: 'text', value: ' 缺少 agentType 参数' }
          if (!task) return { type: 'text', value: ' 缺少 task 参数' }
          return spawnAgent(agentType, task, ctx)
        case 'search':
          if (!query) return { type: 'text', value: ' 缺少 query 参数' }
          return searchAgents(query)
        default:
          return { type: 'text', value: ` 未知操作: ${action}` }
      }
    } catch (err) {
      return { type: 'text', value: ` AgentIntegration 错误: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

function listAllAgents() {
  const agents = getAllAgentCapabilities()
  const lines: string[] = ['# 🤖 可用专业代理列表\n']
  lines.push(`共 ${agents.length} 个专业代理：\n`)

  for (const agent of agents) {
    lines.push(`## ${agent.icon} ${agent.name} (${agent.type})`)
    lines.push(`- 分类: ${CATEGORY_NAMES[agent.category]}`)
    lines.push(`- 描述: ${agent.description}`)
    lines.push(`- 工具权限: ${agent.allowedTools.join(', ')}`)
    lines.push('')
  }

  return { type: 'text', value: lines.join('\n') }
}

function listAgentsByCategory(category: string) {
  const agents = getAgentsByCategory(category as any)
  if (agents.length === 0) {
    return { type: 'text', value: ` 分类 "${category}" 下没有代理` }
  }

  const lines: string[] = [`# 📂 ${CATEGORY_NAMES[category as keyof typeof CATEGORY_NAMES]} 类代理\n`]
  lines.push(`共 ${agents.length} 个代理：\n`)

  for (const agent of agents) {
    lines.push(`- ${agent.icon} **${agent.name}** (${agent.type})`)
    lines.push(`  ${agent.description}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

function getAgentInfo(agentType: string) {
  const agent = getAgentCapability(agentType)
  if (!agent) {
    return { type: 'text', value: ` 代理类型 "${agentType}" 不存在` }
  }

  const lines: string[] = [
    `# ${agent.icon} ${agent.name}`,
    '',
    `- 类型: ${agent.type}`,
    `- 分类: ${CATEGORY_NAMES[agent.category]}`,
    `- 描述: ${agent.description}`,
    `- 工具权限: ${agent.allowedTools.join(', ')}`,
    '',
    '## 系统提示词',
    agent.systemPrompt,
  ]

  return { type: 'text', value: lines.join('\n') }
}

function spawnAgent(agentType: string, task: string, ctx: ToolUseContext) {
  const agent = getAgentCapability(agentType)
  if (!agent) {
    return { type: 'text', value: ` 代理类型 "${agentType}" 不存在` }
  }

  // 构建代理启动信息
  const lines: string[] = [
    `# 🚀 启动代理: ${agent.icon} ${agent.name}`,
    '',
    `## 任务`,
    task,
    '',
    `## 代理配置`,
    `- 类型: ${agent.type}`,
    `- 分类: ${CATEGORY_NAMES[agent.category]}`,
    `- 工具权限: ${agent.allowedTools.join(', ')}`,
    '',
    '## 系统提示词',
    agent.systemPrompt,
    '',
    '---',
    '💡 代理已准备就绪。在实际执行时，代理将使用 QueryEngine 执行任务。',
  ]

  return { type: 'text', value: lines.join('\n') }
}

function searchAgents(query: string) {
  const allAgents = getAllAgentCapabilities()
  const results = allAgents.filter(a =>
    a.name.toLowerCase().includes(query.toLowerCase()) ||
    a.description.toLowerCase().includes(query.toLowerCase()) ||
    a.type.toLowerCase().includes(query.toLowerCase())
  )

  if (results.length === 0) {
    return { type: 'text', value: ` 没有找到匹配 "${query}" 的代理` }
  }

  const lines: string[] = [`#  搜索 "${query}" 的结果\n`]
  lines.push(`找到 ${results.length} 个匹配的代理：\n`)

  for (const agent of results) {
    lines.push(`- ${agent.icon} **${agent.name}** (${agent.type}) [${CATEGORY_NAMES[agent.category]}]`)
    lines.push(`  ${agent.description}`)
  }

  return { type: 'text', value: lines.join('\n') }
}
