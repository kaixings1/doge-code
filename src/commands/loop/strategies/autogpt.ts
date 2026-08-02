/**
 * AutoGPT 风格的目标驱动循环策略
 *
 * 移植自 AutoGPT Python 版（https://github.com/Significant-Gravitas/AutoGPT）
 * 参考：autogpt_platform/backend/backend/executor/manager.py
 *
 * 核心架构：
 * - GraphExecution：图执行引擎，每个节点是一个功能 Block
 * - execute_graph：从入口节点开始，递归执行子节点
 * - execute_node：执行单个节点的 Block，处理输入输出
 * - 任务队列：使用队列管理待执行的节点
 * - 并发控制：支持最大并发数限制
 * - 状态追踪：每个节点有 pending/running/completed/failed 状态
 *
 * 执行循环：
 *   1. 将目标分解为子任务（节点）
 *   2. 从入口节点开始执行
 *   3. 节点执行成功后，将子节点加入队列
 *   4. 节点失败后，根据重试策略决定是否重试
 *   5. 所有节点完成 → 目标达成
 *   6. 连续失败超过阈值 → 目标失败
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

// ============================================================================
// 类型定义
// ============================================================================

/** 图节点状态 */
type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'

/** 图节点 — 对应 AutoGPT 的 Block */
interface GraphNode {
  /** 节点唯一标识 */
  id: string
  /** 节点名称（人类可读） */
  name: string
  /** 节点描述（具体要执行的操作） */
  description: string
  /** 当前执行状态 */
  status: NodeStatus
  /** 父节点 ID 列表（依赖的节点） */
  parentIds: string[]
  /** 子节点 ID 列表（执行成功后触发的节点） */
  childIds: string[]
  /** 执行结果 */
  result?: string
  /** 失败原因 */
  error?: string
  /** 已重试次数 */
  retryCount: number
  /** 最大重试次数 */
  maxRetries: number
  /** 创建时间戳 */
  createdAt: number
  /** 开始执行时间戳 */
  startedAt?: number
  /** 完成时间戳 */
  completedAt?: number
  /** 输入数据（来自父节点的输出） */
  inputData?: Record<string, unknown>
  /** 输出数据（供子节点使用） */
  outputData?: Record<string, unknown>
}

/** 图执行配置 */
interface GraphConfig {
  /** 最大并发执行节点数 */
  maxConcurrency: number
  /** 默认最大重试次数 */
  defaultMaxRetries: number
  /** 重试基础延迟（毫秒） */
  retryBaseDelayMs: number
  /** 重试最大延迟（毫秒） */
  retryMaxDelayMs: number
  /** 指数退避倍数 */
  backoffMultiplier: number
  /** 全局最大连续失败次数（超过则终止整个图） */
  maxConsecutiveFailures: number
}

/** 图执行状态 */
interface GraphState {
  /** 所有节点（id → node） */
  nodes: Map<string, GraphNode>
  /** 待执行节点 ID 队列 */
  queue: string[]
  /** 当前正在执行的节点 ID 集合 */
  running: Set<string>
  /** 已完成的节点 ID 集合 */
  completed: Set<string>
  /** 已失败的节点 ID 集合 */
  failed: Set<string>
  /** 连续失败计数 */
  consecutiveFailures: number
  /** 执行历史记录 */
  history: Array<{ timestamp: number; nodeId: string; event: string; detail?: string }>
  /** 图开始执行时间 */
  startTime: number
  /** 图是否已完成 */
  finished: boolean
}

/** 节点执行结果 */
interface NodeExecutionResult {
  success: boolean
  output?: string
  error?: string
  data?: Record<string, unknown>
}

/** 图执行结果 */
interface GraphExecutionResult {
  success: boolean
  completedNodes: string[]
  failedNodes: string[]
  totalRetries: number
  duration: number
  history: Array<{ timestamp: number; nodeId: string; event: string; detail?: string }>
}

// ============================================================================
// GraphExecutor — 图执行引擎
// ============================================================================

/**
 * GraphExecutor
 *
 * AutoGPT 风格的图执行引擎。
 * 管理节点的生命周期：创建 → 入队 → 执行 → 完成/失败 → 触发子节点。
 *
 * 核心职责：
 * 1. 维护节点状态机（pending → running → completed/failed）
 * 2. 管理任务队列（BFS 顺序执行）
 * 3. 控制并发（信号量机制）
 * 4. 处理重试（指数退避）
 * 5. 记录执行历史
 */
class GraphExecutor {
  /** 图状态 */
  private state: GraphState
  /** 图配置 */
  private config: GraphConfig

  constructor(config: Partial<GraphConfig> = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 3,
      defaultMaxRetries: config.defaultMaxRetries ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 1000,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 5,
    }

    this.state = {
      nodes: new Map(),
      queue: [],
      running: new Set(),
      completed: new Set(),
      failed: new Set(),
      consecutiveFailures: 0,
      history: [],
      startTime: Date.now(),
      finished: false,
    }
  }

  // ─── 节点管理 ─────────────────────────────────────────────────

  /**
   * 添加节点到图中
   *
   * @param node 要添加的节点（不含状态字段，由引擎初始化）
   * @return 添加后的节点 ID
   */
  addNode(node: Omit<GraphNode, 'status' | 'retryCount' | 'createdAt' | 'startedAt' | 'completedAt' | 'result' | 'error'>): string {
    const fullNode: GraphNode = {
      ...node,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    }
    this.state.nodes.set(node.id, fullNode)
    return node.id
  }

  /**
   * 添加边（父子关系）
   *
   * 创建从父节点到子节点的有向边。
   * 子节点会在父节点完成后被触发。
   *
   * @param parentId 父节点 ID
   * @param childId 子节点 ID
   */
  addEdge(parentId: string, childId: string): void {
    const parent = this.state.nodes.get(parentId)
    const child = this.state.nodes.get(childId)

    if (!parent) {
      throw new Error(`addEdge: 父节点 [${parentId}] 不存在`)
    }
    if (!child) {
      throw new Error(`addEdge: 子节点 [${childId}] 不存在`)
    }

    // 避免重复添加
    if (!parent.childIds.includes(childId)) {
      parent.childIds.push(childId)
    }
    if (!child.parentIds.includes(parentId)) {
      child.parentIds.push(parentId)
    }
  }

  /**
   * 设置入口节点（图的起始执行节点）
   *
   * 入口节点是图的第一个执行节点，没有父节点依赖。
   * 可以设置多个入口节点（它们会并发执行）。
   *
   * @param nodeId 入口节点 ID
   */
  setEntryNode(nodeId: string): void {
    const node = this.state.nodes.get(nodeId)
    if (!node) {
      throw new Error(`setEntryNode: 节点 [${nodeId}] 不存在`)
    }
    // 将入口节点加入队列
    if (!this.state.queue.includes(nodeId)) {
      this.state.queue.push(nodeId)
    }
  }

  // ─── 图执行 ───────────────────────────────────────────────────

  /**
   * 执行整个图
   *
   * 从入口节点开始，按 BFS 顺序执行节点。
   * 支持并发执行（受 maxConcurrency 限制）。
   * 节点成功后自动将子节点入队。
   * 节点失败后根据重试策略决定是否重试。
   *
   * @param nodeExecutor 节点执行函数（由外部提供，负责实际业务逻辑）
   * @returns 图执行结果
   */
  async executeGraph(
    nodeExecutor: (node: GraphNode) => Promise<NodeExecutionResult>,
  ): Promise<GraphExecutionResult> {
    this.state.startTime = Date.now()
    this.logEvent('__graph__', 'graph_start', `开始执行图，共 ${this.state.nodes.size} 个节点，队列长度 ${this.state.queue.length}`)

    let totalRetries = 0

    // 主执行循环：队列非空或仍有运行中的节点时继续
    while (this.state.queue.length > 0 || this.state.running.size > 0) {
      // 检查全局失败终止条件
      if (this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        this.logEvent('__graph__', 'graph_abort', `连续失败 ${this.state.consecutiveFailures} 次，超过阈值 ${this.config.maxConsecutiveFailures}，终止图执行`)
        this.state.finished = true
        break
      }

      // 启动尽可能多的节点（受并发限制）
      while (this.state.queue.length > 0 && this.state.running.size < this.config.maxConcurrency) {
        const nodeId = this.state.queue.shift()
        if (!nodeId) break

        const node = this.state.nodes.get(nodeId)
        if (!node) continue

        // 检查依赖是否全部满足（所有父节点已完成）
        const dependenciesMet = this.checkDependencies(node)
        if (!dependenciesMet) {
          // 依赖未满足，放回队列尾部（等待下一轮）
          this.state.queue.push(nodeId)
          break  // 避免死循环：如果队首都未满足，后面的也大概率未满足
        }

        // 启动节点执行（不 await，让它在后台运行）
        this.executeNode(nodeId, nodeExecutor)
      }

      // 等待一小段时间，让运行中的节点有机会完成
      // 使用 Promise.race 等待任意一个运行中的节点完成
      if (this.state.running.size > 0) {
        await this.waitForAnyRunning()
      }
    }

    this.state.finished = true
    const duration = Date.now() - this.state.startTime

    // 判断图是否成功：所有节点都已完成
    const allCompleted = this.state.nodes.size > 0 && this.state.completed.size === this.state.nodes.size

    this.logEvent('__graph__', 'graph_end', `图执行结束，完成: ${this.state.completed.size}, 失败: ${this.state.failed.size}, 耗时: ${duration}ms`)

    return {
      success: allCompleted,
      completedNodes: [...this.state.completed],
      failedNodes: [...this.state.failed],
      totalRetries,
      duration,
      history: [...this.state.history],
    }
  }

  /**
   * 执行单个节点
   *
   * 节点执行生命周期：
   * 1. pending → running：标记开始
   * 2. 调用 nodeExecutor 执行实际逻辑
   * 3. running → completed/failed：标记结果
   * 4. 成功 → 将子节点入队
   * 5. 失败 → 重试或标记最终失败
   *
   * @param nodeId 节点 ID
   * @param nodeExecutor 节点执行函数   */
  private async executeNode(
    nodeId: string,
    nodeExecutor: (node: GraphNode) => Promise<NodeExecutionResult>,
  ): Promise<void> {
    const node = this.state.nodes.get(nodeId)
    if (!node) return

    // 标记为运行中
    node.status = 'running'
    node.startedAt = Date.now()
    this.state.running.add(nodeId)
    this.logEvent(nodeId, 'node_start', `开始执行节点: ${node.name}`)

    try {
      // 执行节点逻辑
      const execResult = await nodeExecutor(node)

      if (execResult.success) {
        // ─── 节点执行成功 ───
        node.status = 'completed'
        node.result = execResult.output
        node.outputData = execResult.data
        node.completedAt = Date.now()
        this.state.running.delete(nodeId)
        this.state.completed.add(nodeId)
        this.state.consecutiveFailures = 0  // 重置连续失败计数

        this.logEvent(nodeId, 'node_complete', `节点完成: ${node.name}，输出: ${execResult.output?.slice(0, 100) ?? '无'}`)

        // 将子节点加入队列（依赖满足时）
        this.enqueueChildren(nodeId)
      } else {
        // ─── 节点执行失败 ───
        await this.handleNodeFailure(node, execResult.error ?? '未知错误')
      }
    } catch (error) {
      // ─── 节点执行抛出异常 ───
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.handleNodeFailure(node, `执行异常: ${errorMessage}`)
    }
  }

  /**
   * 处理节点失败
   *
   * 重试策略（指数退避）：
   * - 如果 retryCount < maxRetries：等待后退避延迟后重试
   * - 如果 retryCount >= maxRetries：标记为最终失败
   *
   * @param node 失败的节点
   * @param errorMessage 错误信息
   */
  private async handleNodeFailure(node: GraphNode, errorMessage: string): Promise<void> {
    node.retryCount++
    this.state.consecutiveFailures++

    this.logEvent(node.id, 'node_fail', `节点失败 (第 ${node.retryCount} 次): ${node.name}，错误: ${errorMessage}`)

    if (node.retryCount <= node.maxRetries) {
      // 可以重试：计算退避延迟
      const delay = this.calculateBackoffDelay(node.retryCount)
      this.logEvent(node.id, 'node_retry', `将在 ${delay}ms 后重试节点: ${node.name}`)

      // 等待退避延迟
      await new Promise(resolve => setTimeout(resolve, delay))

      // 重置状态并放回队列
      node.status = 'pending'
      node.error = undefined
      this.state.running.delete(node.id)
      this.state.queue.push(node.id)
    } else {
      // 超过最大重试次数：标记为最终失败
      node.status = 'failed'
      node.error = errorMessage
      node.completedAt = Date.now()
      this.state.running.delete(node.id)
      this.state.failed.add(node.id)

      this.logEvent(node.id, 'node_final_fail', `节点最终失败（已重试 ${node.retryCount - 1} 次）: ${node.name}`)
    }
  }

  /**
   * 检查节点的所有依赖是否已满足
   *
   * 依赖满足条件：所有父节点状态为 completed。
   *
   * @param node 要检查的节点
   * @returns 依赖是否全部满足
   */
  private checkDependencies(node: GraphNode): boolean {
    for (const parentId of node.parentIds) {
      const parent = this.state.nodes.get(parentId)
      if (!parent || parent.status !== 'completed') {
        return false
      }
    }
    return true
  }

  /**
   * 将节点的子节点加入执行队列
   *
   * 仅当子节点的所有依赖都已满足时才入队。
   *
   * @param nodeId 已完成节点的 ID
   */
  private enqueueChildren(nodeId: string): void {
    const node = this.state.nodes.get(nodeId)
    if (!node) return

    for (const childId of node.childIds) {
      const child = this.state.nodes.get(childId)
      if (!child) continue

      // 只将 pending 状态的子节点入队
      if (child.status !== 'pending') continue

      // 检查子节点的所有依赖是否都已满足
      if (this.checkDependencies(child)) {
        // 避免重复入队
        if (!this.state.queue.includes(childId) && !this.state.running.has(childId)) {
          this.state.queue.push(childId)
          this.logEvent(childId, 'node_enqueued', `子节点入队: ${child.name}（父节点 [${nodeId}] 完成）`)
        }
      }
    }
  }

  /**
   * 计算指数退避延迟
   *
   * 公式：min(baseDelay * multiplier^(retryCount-1), maxDelay)
   *
   * 示例（baseDelay=1000, multiplier=2, maxDelay=30000）：
   *   retry 1 → 1000ms
   *   retry 2 → 2000ms
   *   retry 3 → 4000ms
   *   retry 4 → 8000ms
   *   retry 5 → 16000ms
   *   retry 6 → 30000ms（达到上限）
   *
   * @param retryCount 当前重试次数（从 1 开始）
   * @returns 延迟毫秒数
   */
  private calculateBackoffDelay(retryCount: number): number {
    const exponentialDelay = this.config.retryBaseDelayMs * Math.pow(this.config.backoffMultiplier, retryCount - 1)
    return Math.min(exponentialDelay, this.config.retryMaxDelayMs)
  }

  /**
   * 等待任意一个运行中的节点完成
   *
   * 使用轮询机制（每 10ms 检查一次），
   * 当发现运行中节点数减少时返回。
   */
  private async waitForAnyRunning(): Promise<void> {
    const initialRunningCount = this.state.running.size
    while (this.state.running.size >= initialRunningCount && this.state.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  // ─── 状态查询 ─────────────────────────────────────────────────

  /**
   * 获取图执行状态快照
   */
  getStateSnapshot(): {
    totalNodes: number
    pendingCount: number
    runningCount: number
    completedCount: number
    failedCount: number
    queueLength: number
    consecutiveFailures: number
    finished: boolean
    duration: number
  } {
    return {
      totalNodes: this.state.nodes.size,
      pendingCount: this.state.nodes.size - this.state.running.size - this.state.completed.size - this.state.failed.size,
      runningCount: this.state.running.size,
      completedCount: this.state.completed.size,
      failedCount: this.state.failed.size,
      queueLength: this.state.queue.length,
      consecutiveFailures: this.state.consecutiveFailures,
      finished: this.state.finished,
      duration: Date.now() - this.state.startTime,
    }
  }

  /**
   * 获取所有节点的当前状态
   */
  getAllNodes(): GraphNode[] {
    return [...this.state.nodes.values()]
  }

  /**
   * 获取执行历史记录
   */
  getHistory(): ReadonlyArray<{ timestamp: number; nodeId: string; event: string; detail?: string }> {
    return [...this.state.history]
  }

  // ─── 内部工具 ─────────────────────────────────────────────────

  /**
   * 记录执行事件到历史
   */
  private logEvent(nodeId: string, event: string, detail?: string): void {
    this.state.history.push({
      timestamp: Date.now(),
      nodeId,
      event,
      detail,
    })
  }
}

// ============================================================================
// AutoGPT Strategy
// ============================================================================

/**
 * AutoGPT 策略
 *
 * 使用图执行引擎（GraphExecutor）驱动目标分解和任务执行。
 * 每个子任务对应图中的一个节点，节点之间通过依赖关系连接。
 *
 * 继承 BaseLoopStrategy，将 GraphExecutor 的能力暴露给 LoopEngine。
 */
export class AutoGPTStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'autogpt'
  readonly displayName = 'AutoGPT 目标驱动循环'
  readonly description = '基于图执行引擎的目标驱动循环。支持任务分解、并发控制、指数退避重试。灵感来自 AutoGPT 的 Block 架构。'

  /** 图执行引擎实例 */
  private executor: GraphExecutor

  /** 最大连续失败次数（全局终止条件） */
  private readonly maxConsecutiveFailures = 5

  constructor() {
    super()
    this.executor = new GraphExecutor({
      maxConcurrency: 3,
      defaultMaxRetries: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 30000,
      backoffMultiplier: 2,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
    })
  }

  /**
   * 将目标分解为子任务（图节点）
   *
   * 策略：
   * - 如果目标已预定义子任务，为每个子任务创建一个节点
   *  并建立线性依赖关系（前一个完成后一个才能开始）
   * - 如果未预定义子任务，创建单一节点直接对应目标描述
   *
   * 节点类型：
   * - 入口节点：无依赖，可以立即开始
   * - 中间节点：依赖前序节点
   * - 出口节点：无子节点，完成后触发图终止
   */
  decompose(goal: LoopGoal): SubTask[] {
    // 如果目标已预定义子任务，为每个创建节点
    if (goal.subTasks && goal.subTasks.length > 0) {
      const nodes: SubTask[] = []

      for (let i = 0; i < goal.subTasks.length; i++) {
        const st = goal.subTasks[i]
        const nodeId = st.id || `autogpt-node-${i}`

        // 添加到图引擎
        this.executor.addNode({
          id: nodeId,
          name: st.description.slice(0, 50),
          description: st.description,
          parentIds: i > 0 ? [goal.subTasks[i - 1].id || `autogpt-node-${i - 1}`] : [],
          childIds: [],
          maxRetries: 3,
        })

        nodes.push({
          ...st,
          id: nodeId,
          status: st.status || 'pending',
        })
      }

      // 建立节点间的边
      for (let i = 0; i < goal.subTasks.length - 1; i++) {
        const currentId = goal.subTasks[i].id || `autogpt-node-${i}`
        const nextId = goal.subTasks[i + 1].id || `autogpt-node-${i + 1}`
        try {
          this.executor.addEdge(currentId, nextId)
        } catch {
          // 忽略边添加错误（节点可能已被添加）
        }
      }

      // 设置入口节点
      if (goal.subTasks.length > 0) {
        const entryId = goal.subTasks[0].id || 'autogpt-node-0'
        this.executor.setEntryNode(entryId)
      }

      return nodes
    }

    // 未预定义子任务：创建入口节点 + 出口节点的两阶段结构
    const entryId = 'autogpt-entry'
    const exitId = 'autogpt-exit'

    this.executor.addNode({
      id: entryId,
      name: '执行目标',
      description: goal.description,
      parentIds: [],
      childIds: [exitId],
      maxRetries: 3,
    })

    this.executor.addNode({
      id: exitId,
      name: '完成确认',
      description: `确认目标已达成: ${goal.description}`,
      parentIds: [entryId],
      childIds: [],
      maxRetries: 1,
    })

    this.executor.setEntryNode(entryId)

    return [
      { id: entryId, description: `[entry] ${goal.description}`, status: 'pending' },
      { id: exitId, description: `[exit] 确认目标完成`, status: 'pending' },
    ]
  }

  /**
   * AutoGPT 风格的评估
   *
   * 判定逻辑：
   * 1. 全局连续失败超过阈值 → 目标失败
   * 2. 图引擎报告所有节点完成 → 检查成功标准
   * 3. 有节点失败且不可重试 → 目标可能失败
   * 4. 否则继续执行
   */
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    const snapshot = this.executor.getStateSnapshot()

    // 1. 检查全局失败终止条件
    if (snapshot.consecutiveFailures >= this.maxConsecutiveFailures) {
      return {
        achieved: false,
        reason: `全局连续失败 ${snapshot.consecutiveFailures} 次，超过阈值 ${this.maxConsecutiveFailures}，图执行终止`,
      }
    }

    // 2. 检查是否所有节点已完成
    if (snapshot.completedCount === snapshot.totalNodes && snapshot.totalNodes > 0) {
      // 所有节点完成，检查成功标准
      if (goal.successCriteria && goal.successCriteria.length > 0) {
        const allResults = subTasks
          .filter(t => t.result)
          .map(t => t.result!)
          .join('\n')
        const criteriaMet = goal.successCriteria.filter(c =>
          allResults.toLowerCase().includes(c.toLowerCase())
        ).length

        if (criteriaMet === goal.successCriteria.length) {
          return {
            achieved: true,
            reason: `所有 ${snapshot.totalNodes} 个节点完成，成功标准全部满足（${criteriaMet}/${goal.successCriteria.length}）`,
          }
        }
        return {
          achieved: false,
          reason: `节点全部完成，但成功标准仅满足 ${criteriaMet}/${goal.successCriteria.length}`,
        }
      }

      return {
        achieved: true,
        reason: `图执行完成：所有 ${snapshot.totalNodes} 个节点执行成功`,
      }
    }

    // 3. 检查是否有不可重试的失败节点
    if (snapshot.failedCount > 0 && snapshot.queueLength === 0 && snapshot.runningCount === 0) {
      // 有失败节点且没有活跃/待处理的节点 → 无法继续推进
      return {
        achieved: false,
        reason: `${snapshot.failedCount} 个节点最终失败，图无法继续推进（完成: ${snapshot.completedCount}/${snapshot.totalNodes}）`,
      }
    }

    // 4. 继续执行
    const progress = snapshot.totalNodes > 0
      ? Math.round((snapshot.completedCount / snapshot.totalNodes) * 100)
      : 0

    return {
      achieved: false,
      reason: `图执行进度 ${progress}%（完成: ${snapshot.completedCount}, 运行中: ${snapshot.runningCount}, 待处理: ${snapshot.queueLength}, 失败: ${snapshot.failedCount}）`,
    }
  }

  /**
   * AutoGPT 风格的系统提示词
   *
   * 描述图执行引擎的工作方式，
   * 包括节点依赖、并发执行和重试策略
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    const snapshot = this.executor.getStateSnapshot()

    return `你是 AutoGPT 图执行引擎驱动的 AI 代理。通过执行图节点来完成目标。

## 目标
${goal.description}${criteria}

## 图执行引擎（GraphExecution）

### 核心概念
- **节点（Node）**：每个子任务是一个功能 Block，有独立的输入/输出
- **边（Edge）**：节点间的依赖关系，子节点依赖父节点的输出
- **队列（Queue）**：待执行节点按 BFS 顺序排队
- **并发控制**：最大并发数 ${this.executor.getStateSnapshot().runningCount}/3，避免资源争抢

### 节点状态机
\`\`\`
pending → running → completed
                   → failed → (retry) → pending
                            → (exceed maxRetries) → final_failed
\`\`\`

### 执行循环
1. 从入口节点开始，将无依赖节点加入队列
2. 从队列取出节点执行（不超过并发上限）
3. 节点成功 → 将依赖它的子节点入队
4. 节点失败 → 指数退避后重试（最多 3 次）
5. 所有节点完成 → 目标达成
6. 连续失败 ${this.maxConsecutiveFailures} 次 → 全局终止

### 重试策略（指数退避）
- 第 1 次重试：等待 1000ms
- 第 2 次重试：等待 2000ms
- 第 3 次重试：等待 4000ms
- 最大延迟：30000ms

## 当前图状态
- 总节点数: ${snapshot.totalNodes}
- 已完成: ${snapshot.completedCount}
- 运行中: ${snapshot.runningCount}
- 待处理: ${snapshot.queueLength}
- 已失败: ${snapshot.failedCount}

## 执行规则
1. 每个节点独立执行，不跨节点共享状态（通过 inputData/outputData 传递）
2. 节点失败时分析错误原因，重试时调整策略
3. 连续失败 3 次标记该节点为最终失败
4. 全局连续失败 ${this.maxConsecutiveFailures} 次时停止整个图
5. 完成后确认所有成功标准是否满足
`
  }

  /**
   * AutoGPT 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 全局连续失败达到阈值
   * 3. 所有节点完成（目标达成）
   * 4. 有不可恢复的失败节点且无活跃节点
   */
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    // 条件 1：达到最大迭代次数
    if (iteration >= maxIterations) {
      return false
    }

    const snapshot = this.executor.getStateSnapshot()

    // 条件 2：全局连续失败达到阈值
    if (snapshot.consecutiveFailures >= this.maxConsecutiveFailures) {
      return false
    }

    // 条件 3：所有节点已完成
    if (snapshot.completedCount === snapshot.totalNodes && snapshot.totalNodes > 0) {
      return false
    }

    // 条件 4：有失败节点且无活跃/待处理节点（死锁）
    if (snapshot.failedCount > 0 && snapshot.queueLength === 0 && snapshot.runningCount === 0) {
      return false
    }

    return true
  }

  // ─── AutoGPT 特色方法 ─────────────────────────────────────────

  /**
   * 获取底层图执行引擎
   *
   * 外部引擎可用来直接操作图（添加节点、设置边、执行图等）
   */
  getExecutor(): GraphExecutor {
    return this.executor
  }

  /**
   * 手动触发图执行（供外部引擎调用）
   *
   * @param nodeExecutor 节点执行函数
   * @returns 图执行结果
   */
  async runGraph(
    nodeExecutor: (node: GraphNode) => Promise<NodeExecutionResult>,
  ): Promise<GraphExecutionResult> {
    return this.executor.executeGraph(nodeExecutor)
  }

  /**
   * 获取当前图状态快照
   */
  getGraphSnapshot(): ReturnType<GraphExecutor['getStateSnapshot']> {
    return this.executor.getStateSnapshot()
  }

  /**
   * 获取执行历史（按时间排序的事件序列）
   */
  getExecutionHistory(): ReadonlyArray<{ timestamp: number; nodeId: string; event: string; detail?: string }> {
    return this.executor.getHistory()
  }

  /**
   * 重置策略和图执行引擎到初始状态
   */
  reset(): void {
    this.executor = new GraphExecutor({
      maxConcurrency: 3,
      defaultMaxRetries: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 30000,
      backoffMultiplier: 2,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
    })
  }
}

// 导出 GraphExecutor 和类型，供外部使用
export { GraphExecutor }
export type { GraphNode, GraphConfig, GraphState, NodeExecutionResult, GraphExecutionResult, NodeStatus }
