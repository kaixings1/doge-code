/**
 * LangGraph 风格的状态机循环图策略
 *
 * 纯 TypeScript 实现（无外部 npm 依赖）
 * 参考：https://github.com/langchain-ai/langgraph
 *
 * 核心架构：
 * - StateGraph：有向图，节点是处理函数，边是状态转换
 * - addNode(name, fn)：注册节点函数
 * - addEdge(from, to)：注册无条件边
 * - addConditionalEdges(from, condition)：注册条件边（根据条件跳转到不同节点）
 * - compile()：编译图为可执行对象
 *
 * 执行循环：
 *   从 START 开始 → 执行节点函数 → 根据边跳转到下一节点 → 直到 END
 *
 * 条件跳转逻辑：
 *   verify 成功 + 目标达成 → END
 *   verify 成功 + 目标未达成 → plan（继续下一轮）
 *   verify 失败 + 重试次数 < 3 → plan（重新计划）
 *   verify 失败 + 重试次数 >= 3 → END（放弃）
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

// 纯 TypeScript 实现（无外部依赖）
// StateGraph 内部类
class StateGraph<S extends object> {
  private nodes = new Map<string, NodeFunction<S>>()
  private edges: Array<{ from: string; to: string }> = []
  private conditionalEdges: Array<{ from: string; condition: ConditionFunction<S> }> = []
  private stateFactory: () => S
  constructor(stateFactory: () => S) { this.stateFactory = stateFactory }
  addNode(name: string, fn: NodeFunction<S>): this { this.nodes.set(name, fn); return this }
  addEdge(from: string, to: string): this { this.edges.push({ from, to }); return this }
  addConditionalEdges(from: string, condition: ConditionFunction<S>): this { this.conditionalEdges.push({ from, condition }); return this }
  compile(): CompiledGraph<S> { return new CompiledGraph(this.nodes, this.edges, this.conditionalEdges, this.stateFactory) }
}
class CompiledGraph<S extends object> {
  constructor(
    private nodes: Map<string, NodeFunction<S>>,
    private edges: Array<{ from: string; to: string }>,
    private conditionalEdges: Array<{ from: string; condition: ConditionFunction<S> }>,
    private stateFactory: () => S,
  ) {}
  async invoke(initialState?: Partial<S>): Promise<S> {
    const state = { ...this.stateFactory(), ...initialState } as S
    let current: string = START
    const visited = new Set<string>()
    while (current !== END) {
      const key = `${current}_${JSON.stringify(state)}`
      if (visited.has(key) || visited.size > 100) break
      visited.add(key)
      if (current !== START) {
        const fn = this.nodes.get(current)
        if (fn) Object.assign(state, await fn(state))
      }
      const next = this.findNext(current, state)
      if (!next || next === current) break
      current = next
    }
    return state
  }
  private findNext(current: string, state: S): string | null {
    for (const ce of this.conditionalEdges) { if (ce.from === current) return ce.condition(state) }
    for (const e of this.edges) { if (e.from === current) return e.to }
    return null
  }
}

/** LangGraph 状态接口 */
interface LangGraphLoopState {
  /** 当前步骤计数 */
  step: number
  /** 当前状态描述 */
  status: string
  /** 连续失败次数 */
  retries: number
  /** 子任务列表 */
  subTasks: SubTask[]
  /** 当前子任务索引 */
  currentTaskIndex: number
  /** 执行结果 */
  result: string
  /** 是否完成 */
  done: boolean
  /** 执行历史 */
  history: Array<{ step: number; action: string; result: string }>
}

/** 策略名称 */
const STRATEGY_NAME: LoopStrategyName = 'langgraph'

// ============================================================================
// LangGraph 循环策略
// ============================================================================

export class LangGraphStrategy extends BaseLoopStrategy {
  readonly name = STRATEGY_NAME
  readonly displayName = 'LangGraph 状态机循环'
  readonly description = '基于状态机图引擎，支持节点/边/条件跳转。纯 TypeScript 实现。'

  /** LangGraph StateGraph 实例（延迟初始化） */
  private graph: StateGraph<LangGraphLoopState> | null = null
  /** 编译后的图实例 */
  private compiled: CompiledGraph<LangGraphLoopState> | null = null

  /**
   * 初始化 LangGraph 图（纯 TypeScript 实现）
   */
  private initGraph(goal: LoopGoal): void {
    if (this.graph) return

    const stateFactory = (): LangGraphLoopState => ({
      step: 0, status: 'start', retries: 0,
      subTasks: goal.subTasks || [], currentTaskIndex: 0,
      result: '', done: false, history: [],
    })

    const graph = new StateGraph<LangGraphLoopState>(stateFactory)

    // 添加节点
    graph.addNode('analyze', (state) => this.analyzeNode(state, goal))
    graph.addNode('plan', (state) => this.planNode(state, goal))
    graph.addNode('execute', (state) => this.executeNode(state, goal))
    graph.addNode('verify', (state) => this.verifyNode(state, goal))

    // 添加边
    graph.addEdge(START, 'analyze')
    graph.addEdge('analyze', 'plan')
    graph.addEdge('plan', 'execute')
    graph.addEdge('execute', 'verify')

    // 添加条件边（LangGraph 的核心特性）
    graph.addConditionalEdges('verify', (state) => {
      // 条件路由：根据验证结果决定下一步
      if (state.done || state.status === 'completed') {
        return END  // 目标达成 → 结束
      }
      if (state.retries >= 3) {
        return END  // 重试次数用尽 → 结束
      }
      return 'plan'  // 继续下一轮 → 回到 plan
    })

    // 编译图
    this.compiled = graph.compile() as { invoke: (state: Partial<LangGraphLoopState>) => Promise<LangGraphLoopState> }
    this.graph = graph
  }

  /**
   * analyze 节点：分析当前状态和目标差距
   */
  private analyzeNode(state: LangGraphLoopState, goal: LoopGoal): Partial<LangGraphLoopState> {
    return {
      step: state.step + 1,
      status: 'analyzed',
      history: [
        ...state.history,
        { step: state.step, action: 'analyze', result: `分析目标: ${goal.description}` },
      ],
    }
  }

  /**
   * plan 节点：制定下一步计划
   */
  private planNode(state: LangGraphLoopState, _goal: LoopGoal): Partial<LangGraphLoopState> {
    const nextTask = state.subTasks[state.currentTaskIndex]
    return {
      step: state.step + 1,
      status: 'planned',
      history: [
        ...state.history,
        {
          step: state.step,
          action: 'plan',
          result: nextTask ? `计划执行: ${nextTask.description}` : '无待执行任务',
        },
      ],
    }
  }

  /**
   * execute 节点：执行当前子任务
   */
  private executeNode(state: LangGraphLoopState, _goal: LoopGoal): Partial<LangGraphLoopState> {
    const nextTask = state.subTasks[state.currentTaskIndex]
    if (!nextTask) {
      return { step: state.step + 1, status: 'no_task', done: true }
    }

    // 标记任务为运行中
    const updatedTasks = [...state.subTasks]
    if (updatedTasks[state.currentTaskIndex]) {
      updatedTasks[state.currentTaskIndex] = { ...updatedTasks[state.currentTaskIndex], status: 'running' }
    }

    return {
      step: state.step + 1,
      status: 'executing',
      subTasks: updatedTasks,
      history: [
        ...state.history,
        { step: state.step, action: 'execute', result: `执行: ${nextTask.description}` },
      ],
    }
  }

  /**
   * verify 节点：验证执行结果
   */
  private verifyNode(state: LangGraphLoopState, goal: LoopGoal): Partial<LangGraphLoopState> {
    const currentTask = state.subTasks[state.currentTaskIndex]
    if (!currentTask) {
      return { step: state.step + 1, status: 'completed', done: true }
    }

    // 模拟验证：检查是否满足成功标准
    const criteriaMet = goal.successCriteria
      ? state.currentTaskIndex >= state.subTasks.length - 1
      : false

    const updatedTasks = [...state.subTasks]
    if (updatedTasks[state.currentTaskIndex]) {
      updatedTasks[state.currentTaskIndex] = {
        ...updatedTasks[currentTask.status === 'running' ? state.currentTaskIndex : 0],
        status: criteriaMet ? 'completed' : 'failed',
      }
    }

    const allDone = updatedTasks.every((t: SubTask) => t.status === 'completed')

    return {
      step: state.step + 1,
      status: allDone ? 'completed' : 'verified',
      done: allDone,
      retries: criteriaMet ? state.retries : state.retries + 1,
      currentTaskIndex: state.currentTaskIndex + (criteriaMet ? 1 : 0),
      subTasks: updatedTasks,
      result: allDone ? '所有任务完成' : `任务 ${state.currentTaskIndex} ${criteriaMet ? '通过' : '需重试'}`,
      history: [
        ...state.history,
        { step: state.step, action: 'verify', result: allDone ? '全部完成' : '继续执行' },
      ],
    }
  }

  // ============================================================================
  // LoopStrategy 接口实现
  // ============================================================================

  decompose(goal: LoopGoal): SubTask[] {
    if (goal.subTasks && goal.subTasks.length > 0) {
      return goal.subTasks
    }
    return [
      this.createTask('分析：理解目标和约束条件'),
      this.createTask('计划：制定详细的执行计划'),
      this.createTask('执行：按计划执行具体操作'),
      this.createTask('验证：验证执行结果是否符合预期'),
    ]
  }

  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    const completed = subTasks.filter((t) => t.status === 'completed').length
    const total = subTasks.length

    if (goal.successCriteria && goal.successCriteria.length > 0) {
      const allMet = total > 0 && completed === total
      return {
        achieved: allMet,
        reason: allMet
          ? `所有 ${total} 个子任务已完成，成功标准已满足`
          : `已完成 ${completed}/${total} 个子任务`,
      }
    }

    return {
      achieved: total > 0 && completed === total,
      reason: `进度: ${completed}/${total} 子任务完成`,
    }
  }

  getSystemPrompt(goal: LoopGoal): string {
    return `你是一个基于 LangGraph 的状态机循环引擎。

## 执行目标
${goal.description}

## 图节点定义
1. **analyze** - 分析当前状态和目标差距
2. **plan** - 制定下一步执行计划
3. **execute** - 执行当前子任务
4. **verify** - 验证执行结果

## 边和跳转规则
- START → analyze（入口）
- analyze → plan
- plan → execute
- execute → verify
- verify → plan（继续下一轮，如果未达成目标）
- verify → END（如果目标达成或用尽重试次数）

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '所有子任务完成'}

## 约束
- 最大重试次数：3 次
- 每个节点必须输出状态更新
- 条件跳转由 verify 节点决定`
  }

  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    if (iteration >= maxIterations) return false
    if (subTasks.length > 0 && subTasks.every((t) => t.status === 'completed')) return false
    return true
  }

  /**
   * 执行 LangGraph 图
   * 使用纯 TypeScript StateGraph 执行引擎
   */
  async executeWithLangGraph(goal: LoopGoal): Promise<{
    success: boolean
    state: Partial<LangGraphLoopState>
    history: Array<{ step: number; action: string; result: string }>
  }> {
    await this.initGraph(goal)

    if (!this.compiled) {
      throw new Error('LangGraph 编译失败')
    }

    // 初始化状态
    const initialState: Partial<LangGraphLoopState> = {
      step: 0,
      status: 'start',
      retries: 0,
      subTasks: this.decompose(goal),
      currentTaskIndex: 0,
      result: '',
      done: false,
      history: [],
    }

    // 执行图（LangGraph 的 Pregel 引擎会自动处理节点执行和条件跳转）
    const result = await this.compiled.invoke(initialState)

    return {
      success: result.done || result.status === 'completed',
      state: result,
      history: result.history || [],
    }
  }

  /**
   * 获取图的状态快照（用于调试）
   */
  getGraphSnapshot(): { initialized: boolean; compiled: boolean } {
    return {
      initialized: this.graph !== null,
      compiled: this.compiled !== null,
    }
  }

  /**
   * 重置图状态
   */
  reset(): void {
    this.graph = null
    this.compiled = null
  }
}

export default LangGraphStrategy
