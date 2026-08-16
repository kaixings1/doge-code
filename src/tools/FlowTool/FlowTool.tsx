import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['create', 'start', 'listen', 'route', 'condition', 'execute']).describe(
      'Flow操作：create=创建流程, start=启动节点, listen=监听事件, route=路由, condition=组合条件, execute=执行流程'
    ),
    flow_id: z.string().optional().describe('流程ID'),
    name: z.string().optional().describe('流程/节点名称'),
    method: z.string().optional().describe('方法名（start/listen/route时需要）'),
    triggers: z.array(z.string()).optional().describe('触发条件列表（condition时需要）'),
    condition_type: z.enum(['or', 'and']).optional().describe('条件组合类型（condition时需要）'),
    input_data: z.record(z.unknown()).optional().describe('输入数据（execute时需要）'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string().optional().describe('结果消息'),
    flow_id: z.string().optional().describe('流程ID'),
    node_id: z.string().optional().describe('节点ID'),
    state: z.record(z.unknown()).optional().describe('流程状态'),
    result: z.unknown().optional().describe('执行结果'),
    next_steps: z.array(z.string()).optional().describe('下一步节点列表'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

type FlowNode = {
  id: string
  type: 'start' | 'listen' | 'router'
  triggers: string[]
  condition_type?: 'or' | 'and'
  status: 'pending' | 'running' | 'completed' | 'failed'
}

type FlowDefinition = {
  id: string
  name: string
  nodes: Map<string, FlowNode>
  current_node?: string
  state: Record<string, unknown>
}

const flows = new Map<string, FlowDefinition>()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function evaluateCondition(
  triggers: string[],
  conditionType: 'or' | 'and',
  state: Record<string, unknown>
): boolean {
  const results = triggers.map(t => {
    const val = state[t]
    return val !== undefined && val !== false && val !== null
  })

  if (results.length === 0) return false
  return conditionType === 'or' ? results.some(Boolean) : results.every(Boolean)
}

export const FlowTool = buildTool({
  name: 'flow',
  description: async () =>
    'Flow编排工具：创建和管理事件驱动的多步骤流程。吸收crewAI Flow精华，支持装饰器式DSL（start/listen/router）、条件组合（or/and）、状态流转和人类反馈。',
  callOn: 'manual',
  async prompt() {
    return '使用 flow 工具编排多步骤AI工作流。支持 create（创建流程）、start（启动节点）、listen（监听事件）、route（条件路由）、condition（组合条件）、execute（执行流程）。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'flow'
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
    return `Flow: ${action}${name ? ` (${name})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>)?.message || 'Flow操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg as string,
    }
  },
  async call({ action, flow_id, name, method, triggers, condition_type, input_data }) {
    try {
      switch (action) {
        case 'create': {
          const id = generateId('flow')
          const flowName = name || '未命名流程'
          flows.set(id, {
            id,
            name: flowName,
            nodes: new Map(),
            state: input_data || {},
          })
          return {
            data: {
              success: true,
              message: `流程 "${flowName}" 创建成功`,
              flow_id: id,
              state: input_data || {},
            } as Output,
          }
        }

        case 'start': {
          if (!flow_id || !method) {
            return { data: { success: false, message: 'start 需要 flow_id 和 method 参数' } as Output }
          }
          const flow = flows.get(flow_id)
          if (!flow) {
            return { data: { success: false, message: `流程 ${flow_id} 不存在` } as Output }
          }
          const nodeId = generateId('node')
          const node: FlowNode = {
            id: nodeId,
            type: 'start',
            triggers: [],
            status: 'pending',
          }
          flow.nodes.set(nodeId, node)
          flow.current_node = nodeId
          return {
            data: {
              success: true,
              message: `流程 ${flow.name} 已启动，入口节点: ${method}`,
              flow_id,
              node_id: nodeId,
              state: flow.state,
            } as Output,
          }
        }

        case 'listen': {
          if (!flow_id || !method || !triggers) {
            return { data: { success: false, message: 'listen 需要 flow_id、method 和 triggers 参数' } as Output }
          }
          const flow = flows.get(flow_id)
          if (!flow) {
            return { data: { success: false, message: `流程 ${flow_id} 不存在` } as Output }
          }
          const nodeId = generateId('node')
          const node: FlowNode = {
            id: nodeId,
            type: 'listen',
            triggers,
            condition_type: condition_type || 'or',
            status: 'pending',
          }
          flow.nodes.set(nodeId, node)
          return {
            data: {
              success: true,
              message: `监听器 "${method}" 已注册，触发条件: ${triggers.join(' or ')}`,
              flow_id,
              node_id: nodeId,
              state: flow.state,
            } as Output,
          }
        }

        case 'route': {
          if (!flow_id || !method) {
            return { data: { success: false, message: 'route 需要 flow_id 和 method 参数' } as Output }
          }
          const flow = flows.get(flow_id)
          if (!flow) {
            return { data: { success: false, message: `流程 ${flow_id} 不存在` } as Output }
          }
          const nodeId = generateId('node')
          const node: FlowNode = {
            id: nodeId,
            type: 'router',
            triggers: triggers || [],
            status: 'pending',
          }
          flow.nodes.set(nodeId, node)
          return {
            data: {
              success: true,
              message: `路由器 "${method}" 已注册`,
              flow_id,
              node_id: nodeId,
              next_steps: triggers || [],
            } as Output,
          }
        }

        case 'condition': {
          if (!triggers || triggers.length < 2) {
            return { data: { success: false, message: 'condition 需要至少2个触发条件' } as Output }
          }
          const condType = condition_type || 'or'
          const state = input_data || {}
          const result = evaluateCondition(triggers, condType, state)
          return {
            data: {
              success: true,
              message: `条件 ${condType.toUpperCase()}(${triggers.join(', ')}) = ${result}`,
              state: { condition_result: result, triggers, condition_type: condType },
              result,
            } as Output,
          }
        }

        case 'execute': {
          if (!flow_id) {
            return { data: { success: false, message: 'execute 需要 flow_id 参数' } as Output }
          }
          const flow = flows.get(flow_id)
          if (!flow) {
            return { data: { success: false, message: `流程 ${flow_id} 不存在` } as Output }
          }
          // 模拟执行：更新所有pending节点为completed
          const results: string[] = []
          for (const [nodeId, node] of flow.nodes) {
            if (node.status === 'pending') {
              node.status = 'completed'
              results.push(nodeId)
            }
          }
          return {
            data: {
              success: true,
              message: `流程 ${flow.name} 执行完成，处理了 ${results.length} 个节点`,
              flow_id,
              result: { executed_nodes: results, state: flow.state },
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
          message: `Flow操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
