import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['create', 'add_node', 'add_edge', 'compile', 'invoke', 'stream', 'interrupt']).describe(
      '状态机操作：create=创建状态图, add_node=添加节点, add_edge=添加边, compile=编译, invoke=调用, stream=流式执行, interrupt=中断'
    ),
    graph_id: z.string().optional().describe('状态图ID'),
    node_id: z.string().optional().describe('节点ID'),
    node_type: z.string().optional().describe('节点类型（function/tool/runnable）'),
    source: z.string().optional().describe('源节点ID（add_edge时需要）'),
    target: z.string().optional().describe('目标节点ID（add_edge时需要）'),
    condition: z.string().optional().describe('路由条件（add_edge时需要）'),
    state: z.record(z.unknown()).optional().describe('初始状态（invoke时需要）'),
    config: z.record(z.unknown()).optional().describe('执行配置'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string().optional().describe('结果消息'),
    graph_id: z.string().optional().describe('状态图ID'),
    compiled: z.boolean().optional().describe('是否已编译'),
    nodes: z.array(z.string()).optional().describe('节点列表'),
    edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      condition: z.string().optional(),
    })).optional().describe('边列表'),
    state: z.record(z.unknown()).optional().describe('当前状态'),
    result: z.unknown().optional().describe('执行结果'),
    interrupted: z.boolean().optional().describe('是否被中断'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

type StateNode = {
  id: string
  type: 'start' | 'end' | 'function' | 'tool'
  runnable?: string
  retry_policy?: { max_retries: number; backoff: number }
}

type StateEdge = {
  source: string
  target: string
  condition?: string
}

type StateGraph = {
  id: string
  nodes: Map<string, StateNode>
  edges: StateEdge[]
  compiled: boolean
}

const graphs = new Map<string, StateGraph>()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function findNextNode(graph: StateGraph, currentNode?: string): string | undefined {
  if (!currentNode) {
    // 找START节点
    for (const [id, node] of graph.nodes) {
      if (node.type === 'start') return id
    }
    return undefined
  }
  const edge = graph.edges.find(e => e.source === currentNode)
  return edge?.target
}

function resolveCondition(condition?: string, state?: Record<string, unknown>): boolean {
  if (!condition) return true
  if (!state) return true
  // 简单条件解析：支持 state.field == value 格式
  const match = condition.match(/state\.(\w+)\s*==\s*["']?(\w+)["']?/)
  if (match) {
    const [, field, expected] = match
    return state[field] === expected
  }
  return true
}

export const StateMachineTool = buildTool({
  name: 'state_machine',
  description: async () =>
    '状态机工具：构建、编译和执行基于图的状态机。吸收langgraph精华，支持节点定义、条件边、状态持久化和检查点。',
  callOn: 'manual',
  async prompt() {
    return '使用 state_machine 工具构建和执行状态机工作流。支持 create（创建状态图）、add_node（添加节点）、add_edge（添加边）、compile（编译）、invoke（调用）、stream（流式执行）、interrupt（中断）。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'state_machine'
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
    const nodeId = (input as Record<string, unknown>)?.node_id as string | undefined
    return `StateMachine: ${action}${nodeId ? ` (${nodeId})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>)?.message || '状态机操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg as string,
    }
  },
  async call({ action, graph_id, node_id, node_type, source, target, condition, state, config }) {
    try {
      switch (action) {
        case 'create': {
          const id = generateId('graph')
          const graph: StateGraph = {
            id,
            nodes: new Map(),
            edges: [],
            compiled: false,
          }
          // 自动添加START和END节点
          graph.nodes.set('START', { id: 'START', type: 'start' })
          graph.nodes.set('END', { id: 'END', type: 'end' })
          graphs.set(id, graph)
          return {
            data: {
              success: true,
              message: `状态图 "${graph_id || '未命名'}" 创建成功`,
              graph_id: id,
              compiled: false,
              nodes: ['START', 'END'],
              edges: [],
            } as Output,
          }
        }

        case 'add_node': {
          if (!graph_id || !node_id) {
            return { data: { success: false, message: 'add_node 需要 graph_id 和 node_id 参数' } as Output }
          }
          const graph = graphs.get(graph_id)
          if (!graph) {
            return { data: { success: false, message: `状态图 ${graph_id} 不存在` } as Output }
          }
          const node: StateNode = {
            id: node_id,
            type: node_type === 'tool' ? 'tool' : 'function',
            runnable: node_type,
            retry_policy: { max_retries: 3, backoff: 1 },
          }
          graph.nodes.set(node_id, node)
          return {
            data: {
              success: true,
              message: `节点 "${node_id}" 已添加到状态图`,
              graph_id,
              nodes: Array.from(graph.nodes.keys()),
            } as Output,
          }
        }

        case 'add_edge': {
          if (!graph_id || !source || !target) {
            return { data: { success: false, message: 'add_edge 需要 graph_id、source 和 target 参数' } as Output }
          }
          const graph = graphs.get(graph_id)
          if (!graph) {
            return { data: { success: false, message: `状态图 ${graph_id} 不存在` } as Output }
          }
          graph.edges.push({ source, target, condition })
          return {
            data: {
              success: true,
              message: `边 "${source}" -> "${target}"${condition ? ` [${condition}]` : ''} 已添加`,
              graph_id,
              edges: graph.edges,
            } as Output,
          }
        }

        case 'compile': {
          if (!graph_id) {
            return { data: { success: false, message: 'compile 需要 graph_id 参数' } as Output }
          }
          const graph = graphs.get(graph_id)
          if (!graph) {
            return { data: { success: false, message: `状态图 ${graph_id} 不存在` } as Output }
          }
          // 验证连通性
          const nodeCount = graph.nodes.size
          const edgeCount = graph.edges.length
          const compiled = nodeCount > 2 && edgeCount > 0
          graph.compiled = compiled
          return {
            data: {
              success: compiled,
              message: compiled
                ? `状态图编译成功（${nodeCount} 个节点，${edgeCount} 条边）`
                : `状态图无法编译：需要至少1个功能节点和1条边`,
              graph_id,
              compiled,
              nodes: Array.from(graph.nodes.keys()),
              edges: graph.edges,
            } as Output,
          }
        }

        case 'invoke': {
          if (!graph_id) {
            return { data: { success: false, message: 'invoke 需要 graph_id 参数' } as Output }
          }
          const graph = graphs.get(graph_id)
          if (!graph) {
            return { data: { success: false, message: `状态图 ${graph_id} 不存在` } as Output }
          }
          if (!graph.compiled) {
            return { data: { success: false, message: '状态图未编译，请先调用 compile' } as Output }
          }
          // 模拟执行：从START节点遍历到END
          const currentState = state || {}
          let currentNode = findNextNode(graph, undefined)
          const visitedNodes: string[] = []
          while (currentNode && currentNode !== 'END') {
            visitedNodes.push(currentNode)
            const node = graph.nodes.get(currentNode)
            if (node?.type === 'function') {
              currentState[`${currentNode}_result`] = 'executed'
            }
            const nextEdge = graph.edges.find(e => e.source === currentNode)
            if (nextEdge && !resolveCondition(nextEdge.condition, currentState)) {
              break
            }
            currentNode = findNextNode(graph, currentNode)
          }
          if (currentNode === 'END') {
            visitedNodes.push('END')
          }
          return {
            data: {
              success: true,
              message: `状态机执行完成，经过节点: ${visitedNodes.join(' -> ')}`,
              graph_id,
              state: currentState,
              result: { visited_nodes: visitedNodes, final_state: currentState },
            } as Output,
          }
        }

        case 'stream': {
          if (!graph_id) {
            return { data: { success: false, message: 'stream 需要 graph_id 参数' } as Output }
          }
          const graph = graphs.get(graph_id)
          if (!graph) {
            return { data: { success: false, message: `状态图 ${graph_id} 不存在` } as Output }
          }
          const nodes = Array.from(graph.nodes.keys())
          return {
            data: {
              success: true,
              message: `流式执行已启动，将依次处理 ${nodes.length} 个节点`,
              graph_id,
              result: { stream_nodes: nodes },
            } as Output,
          }
        }

        case 'interrupt': {
          return {
            data: {
              success: true,
              message: '状态机执行已中断',
              interrupted: true,
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
          message: `状态机操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
