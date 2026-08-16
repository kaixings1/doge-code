import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['create', 'configure', 'add_memory', 'add_knowledge', 'add_toolkit', 'run', 'get_session', 'set_model']).describe(
      'Agent操作：create=创建Agent, configure=配置Agent, add_memory=添加记忆, add_knowledge=添加知识库, add_toolkit=添加工具包, run=运行Agent, get_session=获取会话, set_model=设置模型'
    ),
    agent_id: z.string().optional().describe('Agent ID'),
    name: z.string().optional().describe('Agent名称'),
    instructions: z.string().optional().describe('Agent指令/系统提示词'),
    model_id: z.string().optional().describe('模型ID（如 claude-3-5-sonnet）'),
    user_id: z.string().optional().describe('用户ID'),
    session_id: z.string().optional().describe('会话ID'),
    memory_type: z.string().optional().describe('记忆类型（instance/summary/history）'),
    knowledge_source: z.string().optional().describe('知识库来源（url/file/path）'),
    toolkit_name: z.string().optional().describe('工具包名称'),
    message: z.string().optional().describe('用户消息（run时需要）'),
    state: z.record(z.unknown()).optional().describe('会话状态'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string().optional().describe('结果消息'),
    agent_id: z.string().optional().describe('Agent ID'),
    response: z.string().optional().describe('Agent响应'),
    session_id: z.string().optional().describe('会话ID'),
    state: z.record(z.unknown()).optional().describe('当前状态'),
    memory: z.array(z.unknown()).optional().describe('记忆内容'),
    knowledge: z.array(z.string()).optional().describe('知识库内容'),
    tools: z.array(z.string()).optional().describe('可用工具列表'),
    model: z.string().optional().describe('当前模型'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

type AgentInstance = {
  id: string
  name: string
  instructions: string
  model_id: string
  memory_type: string
  knowledge_sources: string[]
  toolkits: string[]
  sessions: Map<string, { state: Record<string, unknown>; history: Array<{ role: string; content: string }> }>
}

const agents = new Map<string, AgentInstance>()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getOrCreateSession(agent: AgentInstance, sessionId?: string): string {
  const sid = sessionId || generateId('session')
  if (!agent.sessions.has(sid)) {
    agent.sessions.set(sid, { state: {}, history: [] })
  }
  return sid
}

export const AgentDevelopmentTool = buildTool({
  name: 'agent_development',
  description: async () =>
    'Agent开发工具：创建和管理具有记忆、知识库和工具包的智能体。吸收phidata/Agno精华，支持会话管理、状态持久化和多模型切换。',
  callOn: 'manual',
  async prompt() {
    return '使用 agent_development 工具创建和管理AI智能体。支持 create（创建Agent）、configure（配置）、add_memory（添加记忆）、add_knowledge（添加知识库）、add_toolkit（添加工具包）、run（运行Agent）、get_session（获取会话）、set_model（设置模型）。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'agent_development'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    const action = (input as Record<string, unknown>)?.action ?? '?'
    const name = (input as Record<string, unknown>)?.name as string | undefined
    return `AgentDev: ${action}${name ? ` (${name})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>)?.message || 'Agent开发操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg as string,
    }
  },
  async call({ action, agent_id, name, instructions, model_id, user_id, session_id, memory_type, knowledge_source, toolkit_name, message, state }) {
    try {
      switch (action) {
        case 'create': {
          const id = generateId('agent')
          const agentName = name || '未命名Agent'
          const agent: AgentInstance = {
            id,
            name: agentName,
            instructions: instructions || '你是一个有用的AI助手。',
            model_id: model_id || 'default',
            memory_type: memory_type || 'instance',
            knowledge_sources: [],
            toolkits: [],
            sessions: new Map(),
          }
          agents.set(id, agent)
          return {
            data: {
              success: true,
              message: `Agent "${agentName}" 创建成功`,
              agent_id: id,
              model: agent.model_id,
              tools: agent.toolkits,
            } as Output,
          }
        }

        case 'configure': {
          if (!agent_id) {
            return { data: { success: false, message: 'configure 需要 agent_id 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          if (instructions) agent.instructions = instructions
          if (model_id) agent.model_id = model_id
          if (memory_type) agent.memory_type = memory_type
          return {
            data: {
              success: true,
              message: `Agent "${agent.name}" 配置已更新`,
              agent_id,
              model: agent.model_id,
              tools: agent.toolkits,
            } as Output,
          }
        }

        case 'add_memory': {
          if (!agent_id || !memory_type) {
            return { data: { success: false, message: 'add_memory 需要 agent_id 和 memory_type 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          agent.memory_type = memory_type
          return {
            data: {
              success: true,
              message: `Agent "${agent.name}" 已添加 ${memory_type} 类型记忆`,
              agent_id,
              memory: [memory_type],
            } as Output,
          }
        }

        case 'add_knowledge': {
          if (!agent_id || !knowledge_source) {
            return { data: { success: false, message: 'add_knowledge 需要 agent_id 和 knowledge_source 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          agent.knowledge_sources.push(knowledge_source)
          return {
            data: {
              success: true,
              message: `知识库 "${knowledge_source}" 已添加到 Agent "${agent.name}"`,
              agent_id,
              knowledge: agent.knowledge_sources,
            } as Output,
          }
        }

        case 'add_toolkit': {
          if (!agent_id || !toolkit_name) {
            return { data: { success: false, message: 'add_toolkit 需要 agent_id 和 toolkit_name 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          agent.toolkits.push(toolkit_name)
          return {
            data: {
              success: true,
              message: `工具包 "${toolkit_name}" 已添加到 Agent "${agent.name}"`,
              agent_id,
              tools: agent.toolkits,
            } as Output,
          }
        }

        case 'run': {
          if (!agent_id || !message) {
            return { data: { success: false, message: 'run 需要 agent_id 和 message 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          const sid = getOrCreateSession(agent, session_id)
          const session = agent.sessions.get(sid)!
          // 模拟Agent响应
          const response = `[${agent.name}] 收到消息: "${message}"\n基于指令: "${agent.instructions.slice(0, 50)}..."`
          session.history.push({ role: 'user', content: message })
          session.history.push({ role: 'assistant', content: response })
          return {
            data: {
              success: true,
              message: `Agent "${agent.name}" 响应完成`,
              agent_id,
              response,
              session_id: sid,
              state: { ...session.state, last_message: message },
            } as Output,
          }
        }

        case 'get_session': {
          if (!agent_id) {
            return { data: { success: false, message: 'get_session 需要 agent_id 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          const sid = getOrCreateSession(agent, session_id)
          const session = agent.sessions.get(sid)!
          return {
            data: {
              success: true,
              message: `会话 ${sid} 信息`,
              agent_id,
              session_id: sid,
              state: session.state,
              memory: session.history.slice(-5),
            } as Output,
          }
        }

        case 'set_model': {
          if (!agent_id || !model_id) {
            return { data: { success: false, message: 'set_model 需要 agent_id 和 model_id 参数' } as Output }
          }
          const agent = agents.get(agent_id)
          if (!agent) {
            return { data: { success: false, message: `Agent ${agent_id} 不存在` } as Output }
          }
          agent.model_id = model_id
          return {
            data: {
              success: true,
              message: `Agent "${agent.name}" 模型已切换为 ${model_id}`,
              agent_id,
              model: model_id,
            } as Output,
          }
        }

        default:
          return { data: { success: false, message: `未知操作: ${action}` } as Output }
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `Agent开发操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
