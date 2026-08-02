/**
 * LangGraph 风格的状态机循环图策略
 *
 * 移植自 LangGraph Python 版（https://github.com/langchain-ai/langgraph）
 *
 * 核心架构：
 * - StateGraph：有向图，节点是处理函数，边是状态转换
 * - Annotation.Root：定义状态 Schema，支持 reducer 合并
 * - addNode(name, fn)：注册节点函数
 * - addEdge(from, to)：注册无条件边
 * - addConditionalEdges(from, condition, mapping)：注册条件边
 * - compile()：编译图为可执行 Pregel 对象
 *
 * 执行循环：
 *   从 START 开始 → 执行节点函数 → 根据边跳转到下一节点 → 直到 END
 *
 * 条件跳转逻辑：
 *   verify 成功 + 目标达成 → END
 *   verify 成功 + 目标未达成 → plan（继续下一轮）
 *   verify 失败 + 重试次数 < 3 → plan（重新计划）
 *   verify 失败 + 重试次数 >= 3 → END（放弃）
 *
 * 节点类型：
 *   analyze  — 分析当前状态和目标差距
 *   plan     — 制定下一步计划
 *   execute  — 执行计划
 *   verify   — 验证执行结果
 *   route    — 条件路由（决定下一步去哪个节点）
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

// ============================================================================
// 类型定义
// ============================================================================

/** LangGraph 节点标识 */
type LangGraphNode = 'analyze' | 'plan' | 'execute' | 'verify' | 'route'

/** 图终止标记 */
const END = '__END__' as const
const START = '__START__' as const

/** 节点处理函数类型 */
type NodeFunction<S> = (state: S) => S | Promise<S>

/** 条件路由函数类型 */
type ConditionFunction<S> = (state: S) => string

/** Reducer 函数类型 — 合并新旧状态 */
type Reducer<A, B> = (current: A, update: B) => A

/** 状态字段注解 */
interface AnnotationSpec<T> {
  /** 初始值工厂 */
  default: () => T
  /** 合并 reducer（可选） */
  reducer?: Reducer<T, T>
}

/** 节点执行结果 */
interface NodeExecutionResult {
  node: LangGraphNode
  success: boolean
  output: string
  nextNode: typeof END | LangGraphNode
  timestamp: number
}

/** 图执行结果 */
interface GraphExecutionResult {
  success: boolean
  reason: string
  iterations: number
  nodeHistory: NodeExecutionResult[]
  finalState: LangGraphState
}

/** LangGraph 执行状态 */
interface LangGraphState {
  /** 原始目标描述 */
  goal: string
  /** 成功标准列表 */
  successCriteria: string[]
  /** 当前迭代轮次 */
  iteration: number
  /** 最大迭代次数 */
  maxIterations: number
  /** 当前节点执行结果文本 */
  currentNodeResult: string
  /** 各节点输出历史 */
  nodeOutputs: Record<string, string[]>
  /** 验证是否通过 */
  verifyPassed: boolean
  /** 目标是否达成 */
  goalAchieved: boolean
  /** 连续验证失败次数 */
  verifyFailCount: number
  /** 节点执行历史 */
  executionHistory: NodeExecutionResult[]
  /** 是否已结束 */
  ended: boolean
  /** 结束原因 */
  endReason: string
}

// ============================================================================
// Annotation.Root — 状态 Schema 定义
// ============================================================================

/**
 * 创建状态 Schema 定义
 *
 * 每个字段包含：
 * - default: 初始值工厂函数
 * - reducer: 可选的合并函数（新值合并到旧值）
 *
 * 这是 LangGraph 的核心设计：状态更新通过 reducer 合并，
 * 而非直接替换，从而实现增量状态累积。
 */
function createAnnotationRoot(): Record<string, AnnotationSpec<unknown>> {
  return {
    goal: {
      default: () => '',
      reducer: (current: unknown, update: unknown) => update ?? current,
    },
    successCriteria: {
      default: () => [] as string[],
      reducer: (_current: unknown, update: unknown) => update as string[],
    },
    iteration: {
      default: () => 0,
      reducer: (_current: unknown, update: unknown) => update as number,
    },
    maxIterations: {
      default: () => 20,
      reducer: (_current: unknown, update: unknown) => update as number,
    },
    currentNodeResult: {
      default: () => '',
      reducer: (_current: unknown, update: unknown) => update as string,
    },
    nodeOutputs: {
      default: () => ({}) as Record<string, string[]>,
      reducer: (current: unknown, update: unknown) => {
        const c = current as Record<string, string[]>
        const u = update as Record<string, string[]>
        const merged: Record<string, string[]> = { ...c }
        for (const [key, vals] of Object.entries(u)) {
          merged[key] = [...(merged[key] ?? []), ...vals]
        }
        return merged
      },
    },
    verifyPassed: {
      default: () => false,
      reducer: (_current: unknown, update: unknown) => update as boolean,
    },
    goalAchieved: {
      default: () => false,
      reducer: (_current: unknown, update: unknown) => update as boolean,
    },
    verifyFailCount: {
      default: () => 0,
      reducer: (_current: unknown, update: unknown) => update as number,
    },
    executionHistory: {
      default: () => [] as NodeExecutionResult[],
      reducer: (_current: unknown, update: unknown) => update as NodeExecutionResult[],
    },
    ended: {
      default: () => false,
      reducer: (_current: unknown, update: unknown) => update as boolean,
    },
    endReason: {
      default: () => '',
      reducer: (_current: unknown, update: unknown) => update as string,
    },
  }
}

// ============================================================================
// StateGraph — 有向状态图引擎
// ============================================================================

/**
 * StateGraph — LangGraph 的核心图引擎
 *
 * 负责：
 * 1. 注册节点（addNode）
 * 2. 注册无条件边（addEdge）
 * 3. 注册条件边（addConditionalEdges）
 * 4. 编译为可执行对象（compile）
 * 5. 执行图直到 END
 *
 * 类型参数 S 是状态类型，必须与 Annotation.Root 定义匹配。
 */
class StateGraph<S extends Record<string, unknown>> {
  /** 状态 Schema 定义 */
  private readonly annotations: Record<string, AnnotationSpec<unknown>>

  /** 节点注册表：节点名 → 处理函数 */
  private readonly nodes: Map<string, NodeFunction<S>> = new Map()

  /** 无条件边邻接表：源节点 → 目标节点 */
  private readonly edges: Map<string, string> = new Map()

  /** 条件边注册表：源节点 → { 条件函数, 目标映射 } */
  private readonly conditionalEdges: Map<
    string,
    { condition: ConditionFunction<S>; mapping: Record<string, string> }
  > = new Map()

  /** 入口节点（addEdge 的 from 为 START 时记录） */
  private entryPoint: string | null = null

  constructor(annotations: Record<string, AnnotationSpec<unknown>>) {
    this.annotations = annotations
  }

  /**
   * 注册节点函数
   *
   * @param name 节点名称
   * @param fn 节点处理函数（接收状态，返回更新后的状态）
   */
  addNode(name: string, fn: NodeFunction<S>): this {
    if (name === END || name === START) {
      throw new Error(`节点名称不能使用保留字: ${name}`)
    }
    this.nodes.set(name, fn)
    return this
  }

  /**
   * 注册无条件边
   *
   * 当源节点执行完成后，无条件跳转到目标节点。
   * 如果 from 为 START，则设置入口节点。
   *
   * @param from 源节点（或 START）
   * @param to 目标节点（或 END）
   */
  addEdge(from: string, to: string): this {
    if (from === START) {
      this.entryPoint = to
      return this
    }
    this.edges.set(from, to)
    return this
  }

  /**
   * 注册条件边
   *
   * 当源节点执行完成后，调用 condition 函数，
   * 根据返回值在 mapping 中查找目标节点。
   *
   * @param from 源节点
   * @param condition 条件路由函数（返回目标节点名称）
   * @param mapping 条件值 → 目标节点映射
   */
  addConditionalEdges(
    from: string,
    condition: ConditionFunction<S>,
    mapping: Record<string, string>,
  ): this {
    this.conditionalEdges.set(from, { condition, mapping })
    return this
  }

  /**
   * 编译图为可执行 Pregel 对象
   *
   * 编译过程：
   * 1. 验证入口节点存在
   * 2. 验证所有边引用的节点已注册
   * 3. 返回 CompiledGraph 可执行对象
   *
   * @returns 编译后的可执行图
   */
  compile(): CompiledGraph<S> {
    if (!this.entryPoint) {
      throw new Error('编译失败：未设置入口节点（缺少 START → node 的边）')
    }
    if (!this.nodes.has(this.entryPoint)) {
      throw new Error(`编译失败：入口节点 "${this.entryPoint}" 未注册`)
    }

    // 验证所有无条件边的目标节点存在
    for (const [from, to] of this.edges) {
      if (to !== END && !this.nodes.has(to)) {
        throw new Error(`编译失败：边 "${from} -> ${to}" 的目标节点未注册`)
      }
      if (!this.nodes.has(from)) {
        throw new Error(`编译失败：边 "${from} -> ${to}" 的源节点未注册`)
      }
    }

    // 验证所有条件边的目标节点存在
    for (const [from, { mapping }] of this.conditionalEdges) {
      if (!this.nodes.has(from)) {
        throw new Error(`编译失败：条件边源节点 "${from}" 未注册`)
      }
      for (const [cond, target] of Object.entries(mapping)) {
        if (target !== END && !this.nodes.has(target)) {
          throw new Error(`编译失败：条件边 "${from}" [${cond}] -> "${target}" 的目标节点未注册`)
        }
      }
    }

    return new CompiledGraph<S>({
      annotations: this.annotations,
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      conditionalEdges: new Map(this.conditionalEdges),
      entryPoint: this.entryPoint,
    })
  }
}

// ============================================================================
// CompiledGraph — 编译后的可执行图（Pregel 执行器）
// ============================================================================

/** 编译后的图配置 */
interface CompiledGraphConfig<S> {
  annotations: Record<string, AnnotationSpec<unknown>>
  nodes: Map<string, NodeFunction<S>>
  edges: Map<string, string>
  conditionalEdges: Map<string, { condition: ConditionFunction<S>; mapping: Record<string, string> }>
  entryPoint: string
}

/**
 * CompiledGraph — Pregel 执行器
 *
 * 执行循环：
 * 1. 从 entryPoint 开始
 * 2. 执行当前节点函数
 * 3. 检查是否有条件边 → 调用条件函数确定下一节点
 * 4. 检查是否有无条件边 → 跳转到目标节点
 * 5. 如果到达 END 或节点无出边 → 结束
 */
class CompiledGraph<S extends Record<string, unknown>> {
  private readonly config: CompiledGraphConfig<S>

  constructor(config: CompiledGraphConfig<S>) {
    this.config = config
  }

  /**
   * 创建初始状态
   *
   * 根据 Annotation.Root 定义生成初始状态对象
   */
  createInitialState(overrides: Partial<S> = {}): S {
    const state: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(this.config.annotations)) {
      state[key] = overrides[key as keyof S] !== undefined
        ? overrides[key as keyof S]
        : spec.default()
    }
    return state as S
  }

  /**
   * 执行图直到结束
   *
   * @param initialState 初始状态
   * @returns 执行结果（包含最终状态和历史）
   */
  async execute(initialState: S): Promise<{
    finalState: S
    history: Array<{ node: string; state: S }>
    iterations: number
  }> {
    let state = { ...initialState }
    const history: Array<{ node: string; state: S }> = []
    let currentNode: string | typeof END = this.config.entryPoint!
    let iterations = 0

    while (currentNode !== END) {
      iterations++

      // 安全检查：防止无限循环
      if (iterations > 1000) {
        break
      }

      // 执行当前节点
      const nodeFn = this.config.nodes.get(currentNode)
      if (!nodeFn) {
        break
      }

      state = { ...(await nodeFn(state)) }
      history.push({ node: currentNode, state: { ...state } })

      // 检查状态是否标记结束
      const s = state as Record<string, unknown>
      if (s['ended'] === true) {
        break
      }

      // 确定下一节点（优先条件边）
      const nextNode = this.determineNextNode(currentNode, state)

      if (nextNode === null || nextNode === END) {
        break
      }

      currentNode = nextNode
    }

    return { finalState: state, history, iterations }
  }

  /**
   * 确定下一节点
   *
   * 优先级：
   * 1. 条件边（调用条件函数）
   * 2. 无条件边
   * 3. 无出边 → 返回 null（结束）
   */
  private determineNextNode(currentNode: string, state: S): string | typeof END | null {
    // 1. 检查条件边
    const condEdge = this.config.conditionalEdges.get(currentNode)
    if (condEdge) {
      const condResult = condEdge.condition(state)
      const target = condEdge.mapping[condResult]
      if (target !== undefined) {
        return target
      }
      // 条件结果不在映射中，检查是否有通配符
      const wildcardTarget = condEdge.mapping['*']
      if (wildcardTarget !== undefined) {
        return wildcardTarget
      }
    }

    // 2. 检查无条件边
    const edgeTarget = this.config.edges.get(currentNode)
    if (edgeTarget !== undefined) {
      return edgeTarget
    }

    // 3. 无出边 → 结束
    return null
  }
}

// ============================================================================
// LangGraphStrategy — 循环策略实现
// ============================================================================

export class LangGraphStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'langgraph'
  readonly displayName = 'LangGraph 状态机循环图'
  readonly description = '基于有向状态机图的循环引擎，移植自 LangGraph。支持节点注册、条件边跳转、reducer 状态合并。'

  /** 内部 StateGraph 实例 */
  private readonly graph: StateGraph<LangGraphState>

  /** 编译后的 Pregel 执行器 */
  private compiledGraph: CompiledGraph<LangGraphState> | null = null

  /** 当前图状态 */
  private graphState: LangGraphState

  /** 节点执行历史 */
  private nodeHistory: NodeExecutionResult[] = []

  /** 最大验证失败次数 */
  private readonly maxVerifyFailCount = 3

  constructor() {
    super()

    // 创建 StateGraph 并配置节点和边
    this.graph = new StateGraph<LangGraphState>(createAnnotationRoot() as Record<string, AnnotationSpec<unknown>>)

    // 注册节点
    this.graph.addNode('analyze', this.analyzeNode.bind(this))
    this.graph.addNode('plan', this.planNode.bind(this))
    this.graph.addNode('execute', this.executeNode.bind(this))
    this.graph.addNode('verify', this.verifyNode.bind(this))
    this.graph.addNode('route', this.routeNode.bind(this))

    // 注册无条件边
    this.graph.addEdge(START, 'analyze')
    this.graph.addEdge('analyze', 'plan')
    this.graph.addEdge('plan', 'execute')
    this.graph.addEdge('execute', 'verify')

    // 注册条件边：verify → route（根据验证结果决定下一步）
    this.graph.addConditionalEdges(
      'verify',
      (state: LangGraphState): string => {
        if (state.verifyPassed && state.goalAchieved) return 'success_done'
        if (state.verifyPassed && !state.goalAchieved) return 'success_continue'
        if (!state.verifyPassed && state.verifyFailCount < this.maxVerifyFailCount) return 'fail_retry'
        return 'fail_giveup'
      },
      {
        success_done: END,
        success_continue: 'plan',
        fail_retry: 'plan',
        fail_giveup: END,
      },
    )

    // 注册条件边：route → 下一节点（route 是辅助节点，直接透传）
    this.graph.addConditionalEdges(
      'route',
      (_state: LangGraphState): string => 'route_next',
      { route_next: END },
    )

    // 编译图
    this.compiledGraph = this.graph.compile()

    // 初始化状态
    this.graphState = this.compiledGraph.createInitialState({
      goal: '',
      successCriteria: [],
      iteration: 0,
      maxIterations: 20,
      currentNodeResult: '',
      nodeOutputs: {},
      verifyPassed: false,
      goalAchieved: false,
      verifyFailCount: 0,
      executionHistory: [],
      ended: false,
      endReason: '',
    })
  }

  // ─── 节点实现 ───────────────────────────────────────────────

  /**
   * analyze 节点：分析当前状态和目标差距
   */
  private analyzeNode(state: LangGraphState): LangGraphState {
    const analysis = [
      `[analyze] 目标分析`,
      `  目标: "${state.goal}"`,
      `  当前迭代: ${state.iteration}`,
      `  成功标准: ${state.successCriteria.length > 0 ? state.successCriteria.join(', ') : '未定义'}`,
      `  验证失败计数: ${state.verifyFailCount}/${this.maxVerifyFailCount}`,
    ].join('\n')

    return {
      ...state,
      currentNodeResult: analysis,
      nodeOutputs: {
        ...state.nodeOutputs,
        analyze: [...(state.nodeOutputs['analyze'] ?? []), analysis],
      },
    }
  }

  /**
   * plan 节点：制定下一步计划
   */
  private planNode(state: LangGraphState): LangGraphState {
    const prevResults = state.nodeOutputs['execute'] ?? []
    const prevVerify = state.nodeOutputs['verify'] ?? []

    const plan = [
      `[plan] 制定计划`,
      `  基于分析结果，制定第 ${state.iteration + 1} 轮执行计划`,
      `  历史执行记录: ${prevResults.length} 条`,
      `  历史验证记录: ${prevVerify.length} 条`,
      state.verifyFailCount > 0
        ? `  注意：上轮验证失败（第 ${state.verifyFailCount} 次），需要调整策略`
        : `  上轮验证通过，继续推进`,
    ].join('\n')

    return {
      ...state,
      currentNodeResult: plan,
      iteration: state.iteration + 1,
      nodeOutputs: {
        ...state.nodeOutputs,
        plan: [...(state.nodeOutputs['plan'] ?? []), plan],
      },
    }
  }

  /**
   * execute 节点：执行计划
   */
  private executeNode(state: LangGraphState): LangGraphState {
    const planOutput = (state.nodeOutputs['plan'] ?? []).slice(-1)[0] ?? '无计划'

    const execution = [
      `[execute] 执行计划`,
      `  执行轮次: ${state.iteration}`,
      `  执行计划摘要: ${planOutput.slice(0, 100)}`,
      `  状态: 执行完成`,
    ].join('\n')

    return {
      ...state,
      currentNodeResult: execution,
      nodeOutputs: {
        ...state.nodeOutputs,
        execute: [...(state.nodeOutputs['execute'] ?? []), execution],
      },
    }
  }

  /**
   * verify 节点：验证执行结果
   */
  private verifyNode(state: LangGraphState): LangGraphState {
    // 验证逻辑：检查成功标准是否满足
    const allOutputs = Object.values(state.nodeOutputs).flat().join('\n')
    const criteriaMet = state.successCriteria.every(
      (c) => allOutputs.toLowerCase().includes(c.toLowerCase()),
    )

    // 如果没有自定义标准，检查是否至少执行了一轮
    const passed = state.successCriteria.length === 0
      ? state.iteration >= 1
      : criteriaMet

    const newFailCount = passed ? 0 : state.verifyFailCount + 1

    const verification = [
      `[verify] 验证结果`,
      `  验证状态: ${passed ? '通过' : '未通过'}`,
      `  成功标准满足: ${state.successCriteria.length > 0 ? (criteriaMet ? '是' : '否') : '无自定义标准'}`,
      `  验证失败计数: ${newFailCount}/${this.maxVerifyFailCount}`,
      `  迭代轮次: ${state.iteration}`,
    ].join('\n')

    return {
      ...state,
      currentNodeResult: verification,
      verifyPassed: passed,
      verifyFailCount: newFailCount,
      nodeOutputs: {
        ...state.nodeOutputs,
        verify: [...(state.nodeOutputs['verify'] ?? []), verification],
      },
    }
  }

  /**
   * route 节点：条件路由（记录路由决策）
   */
  private routeNode(state: LangGraphState): LangGraphState {
    let routeDecision: string

    if (state.verifyPassed && state.goalAchieved) {
      routeDecision = 'success_done → END'
    } else if (state.verifyPassed && !state.goalAchieved) {
      routeDecision = 'success_continue → plan'
    } else if (!state.verifyPassed && state.verifyFailCount < this.maxVerifyFailCount) {
      routeDecision = 'fail_retry → plan'
    } else {
      routeDecision = 'fail_giveup → END'
    }

    const routing = [
      `[route] 条件路由`,
      `  路由决策: ${routeDecision}`,
      `  verifyPassed: ${state.verifyPassed}`,
      `  goalAchieved: ${state.goalAchieved}`,
      `  verifyFailCount: ${state.verifyFailCount}`,
    ].join('\n')

    return {
      ...state,
      currentNodeResult: routing,
      nodeOutputs: {
        ...state.nodeOutputs,
        route: [...(state.nodeOutputs['route'] ?? []), routing],
      },
    }
  }

  // ─── LoopStrategy 接口实现 ─────────────────────────────────

  /**
   * 将目标分解为 5 个图节点对应的子任务
   */
  decompose(goal: LoopGoal): SubTask[] {
    const nodeDescriptions: Record<LangGraphNode, string> = {
      analyze: `[analyze] 分析目标 "${goal.description}"，识别关键约束、已知信息和未知信息，评估复杂度`,
      plan: '[plan] 基于分析结果，将目标分解为具体可执行的步骤，确定优先级和依赖关系',
      execute: '[execute] 按计划执行当前步骤，记录执行过程和中间结果',
      verify: `[verify] 对照成功标准检查执行结果：${goal.successCriteria?.join(', ') ?? '完成所有步骤'}，判断是否达成目标`,
      route: '[route] 条件路由：根据 verify 结果决定跳转到 plan（继续）还是 END（完成/放弃）',
    }

    const nodes: LangGraphNode[] = ['analyze', 'plan', 'execute', 'verify', 'route']
    return nodes.map((node) => ({
      id: `langgraph-${node}`,
      description: nodeDescriptions[node],
      status: 'pending' as const,
      assignedTo: node,
    }))
  }

  /**
   * 基于图执行状态的目标达成评估
   *
   * 判定逻辑：
   * - 图已结束 + 验证通过 + 目标达成 → 达成
   * - 图已结束 + 验证失败超限 → 失败
   * - 图未结束 → 继续
   */
  evaluate(_goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    if (this.graphState.ended) {
      if (this.graphState.verifyPassed && this.graphState.goalAchieved) {
        return {
          achieved: true,
          reason: `状态机图正常结束：${this.graphState.endReason}`,
        }
      }
      return {
        achieved: false,
        reason: `状态机图终止：${this.graphState.endReason}`,
      }
    }

    // 检查子任务完成状态
    const completedCount = subTasks.filter((t) => t.status === 'completed').length
    const totalCount = subTasks.length

    if (totalCount > 0 && completedCount === totalCount) {
      return {
        achieved: true,
        reason: `所有 ${totalCount} 个状态机节点已完成`,
      }
    }

    return {
      achieved: false,
      reason: `状态机运行中，已完成 ${completedCount}/${totalCount} 个节点，当前迭代: ${this.graphState.iteration}`,
    }
  }

  /**
   * 返回 LangGraph 风格的系统提示词
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    return `你是 LangGraph 状态机引擎的执行者。你需要按照有向状态机图的方式处理以下目标。

## 目标
${goal.description}${criteria}

## 状态机图定义

\`\`\`
START → analyze → plan → execute → verify
                                       │
                                 ┌─────┴─────┐
                                 │ 条件路由   │
                                 └─────┬─────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
             成功+达成目标       成功+未达成          失败+可重试
                    │                  │                  │
                   END               plan              plan
                                       │
                                 失败+不可重试
                                       │
                                      END
\`\`\`

## 条件跳转规则

| 条件 | 下一节点 | 说明 |
|------|----------|------|
| verify 通过 + 目标达成 | END | 循环结束，目标完成 |
| verify 通过 + 目标未达成 | plan | 继续下一轮迭代 |
| verify 失败 + 重试 < 3 | plan | 重新计划并执行 |
| verify 失败 + 重试 >= 3 | END | 放弃，目标不可达 |

## 节点职责

### 1. analyze（分析节点）
- 理解目标的完整含义和范围
- 识别已知信息、未知信息和约束条件
- 评估目标的复杂度和潜在风险
- 输出：结构化分析报告

### 2. plan（计划节点）
- 基于分析结果，将目标分解为可执行的步骤
- 确定步骤优先级和依赖关系
- 如果之前验证失败，调整策略避免重复失败
- 输出：具体执行计划

### 3. execute（执行节点）
- 按计划执行当前步骤
- 记录执行过程、中间结果和关键决策
- 遇到障碍时记录详细原因
- 输出：执行结果

### 4. verify（验证节点）
- 对照成功标准逐项检查执行结果
- 判断目标是否已经达成
- 如果未通过，分析失败原因
- 输出：验证结论（通过/失败 + 详细原因）

### 5. route（条件路由节点）
- 根据 verify 结果和当前状态决定下一节点
- 实现条件跳转逻辑（见上表）
- 输出：路由决策和理由

## 执行规则
1. 从 analyze 节点开始，每个迭代专注一个节点
2. 节点执行结果通过 reducer 合并到状态中（增量累积）
3. 根据 route 节点的跳转指令选择下一个节点
4. 任何节点连续失败 ${this.maxVerifyFailCount} 次将终止整个状态机
5. 每次只处理一个节点，不要跳过节点
6. 状态通过 reducer 合并更新，而非直接替换
`
  }

  /**
   * LangGraph 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 验证失败次数达到上限
   * 3. 图已结束（ENDED）
   * 4. 所有子任务完成
   */
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    if (iteration >= maxIterations) return false
    if (this.graphState.ended) return false
    if (this.graphState.verifyFailCount >= this.maxVerifyFailCount) return false

    const allCompleted = subTasks.length > 0 && subTasks.every((t) => t.status === 'completed')
    if (allCompleted) return false

    return true
  }

  // ─── LangGraph 特色方法 ────────────────────────────────────

  /**
   * 执行单步图节点
   *
   * 由外部循环引擎调用，每次执行一个节点。
   * 更新内部图状态并返回执行结果。
   *
   * @param nodeName 要执行的节点名称
   * @param output 节点输出（由外部 AI 执行产生）
   * @returns 下一节点名称（或 END）
   */
  executeNodeStep(nodeName: LangGraphNode, output: string): typeof END | LangGraphNode | null {
    const nodeResult: NodeExecutionResult = {
      node: nodeName,
      success: output.length > 0,
      output,
      nextNode: END,
      timestamp: Date.now(),
    }

    this.nodeHistory.push(nodeResult)

    // 更新图状态
    this.graphState = {
      ...this.graphState,
      currentNodeResult: output,
      nodeOutputs: {
        ...this.graphState.nodeOutputs,
        [nodeName]: [...(this.graphState.nodeOutputs[nodeName] ?? []), output],
      },
    }

    // 根据节点类型更新状态
    if (nodeName === 'verify') {
      const passed = !output.includes('失败') && !output.includes('未通过') && !output.includes('fail')
      this.graphState = {
        ...this.graphState,
        verifyPassed: passed,
        verifyFailCount: passed ? 0 : this.graphState.verifyFailCount + 1,
      }
    }

    if (nodeName === 'route') {
      // route 节点标记结束
      this.graphState = {
        ...this.graphState,
        ended: true,
        endReason: output,
      }
    }

    // 确定下一节点
    const nextNode = this.getNextNode(nodeName, this.graphState)
    nodeResult.nextNode = nextNode ?? END

    return nextNode
  }

  /**
   * 获取当前图状态的快照
   */
  getStateSnapshot(): {
    graphState: LangGraphState
    nodeHistory: NodeExecutionResult[]
    compiled: boolean
    maxVerifyFailCount: number
  } {
    return {
      graphState: { ...this.graphState },
      nodeHistory: [...this.nodeHistory],
      compiled: this.compiledGraph !== null,
      maxVerifyFailCount: this.maxVerifyFailCount,
    }
  }

  /**
   * 获取内部 StateGraph 实例（用于高级操作）
   */
  getGraph(): StateGraph<LangGraphState> {
    return this.graph
  }

  /**
   * 重置策略到初始状态
   */
  reset(): void {
    this.nodeHistory = []
    this.compiledGraph = this.graph.compile()
    this.graphState = this.compiledGraph.createInitialState({
      goal: '',
      successCriteria: [],
      iteration: 0,
      maxIterations: 20,
      currentNodeResult: '',
      nodeOutputs: {},
      verifyPassed: false,
      goalAchieved: false,
      verifyFailCount: 0,
      executionHistory: [],
      ended: false,
      endReason: '',
    })
  }

  // ─── 私有辅助方法 ───────────────────────────────────────────

  /**
   * 根据当前节点和状态确定下一节点
   */
  private getNextNode(
    currentNode: LangGraphNode,
    state: LangGraphState,
  ): typeof END | LangGraphNode | null {
    switch (currentNode) {
      case 'analyze':
        return 'plan'
      case 'plan':
        return 'execute'
      case 'execute':
        return 'verify'
      case 'verify':
        // 条件跳转
        if (state.verifyPassed && state.goalAchieved) return END
        if (state.verifyPassed && !state.goalAchieved) return 'plan'
        if (!state.verifyPassed && state.verifyFailCount < this.maxVerifyFailCount) return 'plan'
        return END
      case 'route':
        return END
      default:
        return null
    }
  }
}
