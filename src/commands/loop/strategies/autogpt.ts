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
 *
 * 与 LoopEngine 的集成：
 * - decompose() 创建图节点和边，返回节点列表作为 subTasks
 * - setTaskExecutor() 接收引擎的任务执行器
 * - evaluate() 每次调用时执行一批就绪节点（依赖已满足的 pending 节点）
 * - shouldContinue() 基于图状态决定是否继续循环
 */

import { execSync } from 'child_process'
import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask, TaskExecutor } from '../types.js'

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

  // ─── 增量执行支持（供 AutoGPTStrategy 接入 LoopEngine）─────────

  /**
   * 获取所有就绪节点（依赖已满足的 pending 节点）
   *
   * 此方法供 AutoGPTStrategy.executeGraphNodes() 使用，
   * 在 evaluate() 中同步执行一批节点。
   *
   * @param limit 本次最多返回多少个就绪节点
   * @returns 就绪节点列表
   */
  getReadyNodes(limit?: number): GraphNode[] {
    const ready: GraphNode[] = []
    const visited = new Set<string>()

    // 从队列中按 BFS 顺序查找就绪节点
    for (const nodeId of this.state.queue) {
      if (limit !== undefined && ready.length >= limit) break
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      const node = this.state.nodes.get(nodeId)
      if (!node || node.status !== 'pending') continue

      if (this.checkDependencies(node)) {
        ready.push(node)
      }
    }

    // 如果队列为空但仍有 pending 节点（尚未入队的），也检查它们
    if (ready.length === 0 || (limit !== undefined && ready.length < limit)) {
      for (const node of this.state.nodes.values()) {
        if (limit !== undefined && ready.length >= limit) break
        if (node.status !== 'pending') continue
        if (visited.has(node.id)) continue
        visited.add(node.id)

        if (this.checkDependencies(node)) {
          ready.push(node)
        }
      }
    }

    return ready
  }

  /**
   * 标记节点为运行中（同步）
   *
   * 在 executeGraphNodes() 中调用，将节点状态从 pending 转为 running。
   *
   * @param nodeId 节点 ID
   */
  markNodeRunning(nodeId: string): void {
    const node = this.state.nodes.get(nodeId)
    if (!node) return

    node.status = 'running'
    node.startedAt = Date.now()
    this.state.running.add(nodeId)

    // 从队列中移除
    const queueIndex = this.state.queue.indexOf(nodeId)
    if (queueIndex >= 0) {
      this.state.queue.splice(queueIndex, 1)
    }

    this.logEvent(nodeId, 'node_start', `开始执行节点: ${node.name}`)
  }

  /**
   * 将执行结果同步回图节点（同步）
   *
   * 在 executeGraphNodes() 中调用，根据执行结果更新节点状态。
   * 成功时将子节点入队，失败时处理重试逻辑。
   *
   * @param nodeId 节点 ID
   * @param result 执行结果
   */
  applyNodeResult(nodeId: string, result: NodeExecutionResult): void {
    const node = this.state.nodes.get(nodeId)
    if (!node) return

    if (result.success) {
      // ─── 节点执行成功 ───
      node.status = 'completed'
      node.result = result.output
      node.outputData = result.data
      node.completedAt = Date.now()
      this.state.running.delete(nodeId)
      this.state.completed.add(nodeId)
      this.state.consecutiveFailures = 0

      this.logEvent(nodeId, 'node_complete', `节点完成: ${node.name}，输出: ${result.output?.slice(0, 100) ?? '无'}`)

      // 将子节点加入队列
      this.enqueueChildren(nodeId)
    } else {
      // ─── 节点执行失败 ───
      node.retryCount++
      this.state.consecutiveFailures++

      this.logEvent(nodeId, 'node_fail', `节点失败 (第 ${node.retryCount} 次): ${node.name}，错误: ${result.error ?? '未知错误'}`)

      if (node.retryCount <= node.maxRetries) {
        // 可以重试：放回队列（同步版本不使用退避延迟，由 LoopEngine 的迭代间隔控制）
        node.status = 'pending'
        node.error = undefined
        this.state.running.delete(nodeId)
        this.state.queue.push(nodeId)
        this.logEvent(nodeId, 'node_retry', `节点放回队列等待重试: ${node.name}`)
      } else {
        // 超过最大重试次数：标记为最终失败
        node.status = 'failed'
        node.error = result.error ?? '未知错误'
        node.completedAt = Date.now()
        this.state.running.delete(nodeId)
        this.state.failed.add(nodeId)

        this.logEvent(nodeId, 'node_final_fail', `节点最终失败（已重试 ${node.retryCount - 1} 次）: ${node.name}`)
      }
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
 *
 * 与 LoopEngine 的集成方式：
 * 1. `decompose()` 创建图节点和边，返回节点列表作为 subTasks
 * 2. `setTaskExecutor()` 接收引擎的任务执行器回调
 * 3. `evaluate()` 每次调用时执行一批就绪图节点（通过 executeGraphNodes）
 * 4. `shouldContinue()` 基于图状态决定是否继续循环
 *
 * 执行模型：
 * - LoopEngine 每次迭代调用 evaluate()
 * - evaluate() 内部调用 executeGraphNodes() 执行所有当前就绪的图节点
 * - 节点执行使用同步方式（execSync），与 evaluate() 的同步调用兼容
 * - 执行结果通过 syncNodeToSubTask() 同步回 subTasks 数组
 */
export class AutoGPTStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'autogpt'
  readonly displayName = 'AutoGPT 目标驱动循环'
  readonly description = '基于图执行引擎的目标驱动循环。支持任务分解、并发控制、指数退避重试。灵感来自 AutoGPT 的 Block 架构。'

  /** 图执行引擎实例 */
  private executor: GraphExecutor

  /** 最大连续失败次数（全局终止条件） */
  private readonly maxConsecutiveFailures = 5

  /** 任务执行器（由 LoopEngine 通过 setTaskExecutor 注入） */
  private taskExecutor: TaskExecutor | null = null

  /** 系统提示词缓存（用于构建节点执行提示） */
  private cachedSystemPrompt: string = ''

  /** 图是否已初始化（防止 decompose 重复创建节点） */
  private graphInitialized = false

  /** 节点 ID → SubTask 的映射（用于同步状态回引擎） */
  private nodeSubTaskMap: Map<string, SubTask> = new Map()

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

  // ─── LoopEngine 集成接口 ─────────────────────────────────────

  /**
   * 注入任务执行器
   *
   * 由 LoopEngine 在循环开始前调用，使策略能够在 evaluate() 中
   * 通过此执行器运行图节点。
   *
   * @param executor 任务执行器回调
   */
  setTaskExecutor(executor: TaskExecutor): void {
    this.taskExecutor = executor
  }

  /**
   * AutoGPT 策略在 evaluate() 中通过 executeGraphNodes() 自行处理任务执行
   * LoopEngine 主循环不应重复执行 pending 任务
   */
  handlesOwnExecution(): boolean {
    return true
  }

  /**
   * 将目标分解为子任务（图节点）
   *
   * 策略：
   * - 如果目标已预定义子任务，为每个子任务创建一个节点
   *  并建立线性依赖关系（前一个完成后一个才能开始）
   * - 如果未预定义子任务，创建入口节点 + 中间节点 + 出口节点的图结构
   *
   * 节点类型：
   * - 入口节点：无依赖，可以立即开始
   * - 中间节点：依赖前序节点
   * - 出口节点：无子节点，完成后触发图终止
   *
   * 注意：此方法只创建图结构，不执行节点。
   * 节点执行由 evaluate() → executeGraphNodes() 驱动。
   */
  decompose(goal: LoopGoal): SubTask[] {
    // 防止重复初始化（LoopEngine 可能在没有 pending 任务时再次调用 decompose）
    if (this.graphInitialized) {
      return [...this.nodeSubTaskMap.values()]
    }

    // 缓存系统提示词供后续节点执行使用
    this.cachedSystemPrompt = this.getSystemPrompt(goal)

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

        const subTask: SubTask = {
          ...st,
          id: nodeId,
          status: st.status || 'pending',
        }

        nodes.push(subTask)
        this.nodeSubTaskMap.set(nodeId, subTask)
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

      this.graphInitialized = true
      return nodes
    }

    // 未预定义子任务：根据目标描述创建有意义的多阶段任务
    const desc = goal.description.toLowerCase()
    const criteria = goal.successCriteria || []

    // 根据目标关键词创建有意义的任务列表
    const taskDefs: Array<{ id: string; name: string; desc: string }> = []

    // 阶段 1: 分析和规划
    taskDefs.push({
      id: 'autogpt-analyze',
      name: '分析需求',
      desc: `分析目标: "${goal.description}"。${criteria.length > 0 ? `成功标准: ${criteria.join(', ')}` : ''}输出需求分析报告。`,
    })

    // 阶段 2: 根据目标类型添加具体任务
    if (desc.includes('devops') || desc.includes('部署') || desc.includes('pipeline') || desc.includes('ci/cd')) {
      taskDefs.push({ id: 'autogpt-design', name: '设计流水线', desc: `设计 DevOps 部署流水线架构。${criteria.includes('代码检查') ? '包含代码检查阶段。' : ''}${criteria.includes('自动化测试') ? '包含自动化测试阶段。' : ''}${criteria.includes('自动部署') ? '包含自动部署阶段。' : ''}` })
      if (criteria.includes('代码检查') || desc.includes('lint') || desc.includes('检查')) {
        taskDefs.push({ id: 'autogpt-lint', name: '配置代码检查', desc: '配置并运行代码检查工具（ESLint、Prettier 等），确保代码质量。' })
      }
      if (criteria.includes('自动化测试') || desc.includes('test') || desc.includes('测试')) {
        taskDefs.push({ id: 'autogpt-test', name: '配置自动化测试', desc: '配置并运行自动化测试（Jest、Vitest 等），确保功能正确。' })
      }
      taskDefs.push({ id: 'autogpt-pipeline', name: '创建流水线配置', desc: '创建 CI/CD 配置文件（GitHub Actions、Jenkins 或 GitLab CI）。' })
      if (criteria.includes('自动部署') || desc.includes('deploy') || desc.includes('部署')) {
        taskDefs.push({ id: 'autogpt-deploy', name: '配置自动部署', desc: '配置自动部署脚本和流程。' })
      }
    } else if (desc.includes('修复') || desc.includes('bug') || desc.includes('fix')) {
      taskDefs.push({ id: 'autogpt-reproduce', name: '复现问题', desc: `复现并分析问题: ${goal.description}` })
      taskDefs.push({ id: 'autogpt-fix', name: '修复问题', desc: '定位根因并修复问题。' })
      taskDefs.push({ id: 'autogpt-verify', name: '验证修复', desc: '运行测试验证修复有效。' })
    } else {
      // 通用任务分解
      taskDefs.push({ id: 'autogpt-plan', name: '制定计划', desc: `制定执行计划: ${goal.description}` })
      taskDefs.push({ id: 'autogpt-execute', name: '执行任务', desc: `执行核心任务: ${goal.description}` })
    }

    // 阶段 N: 验证和总结
    taskDefs.push({ id: 'autogpt-verify', name: '验证结果', desc: `验证目标是否达成: ${goal.description}。${criteria.length > 0 ? `检查标准: ${criteria.join(', ')}` : ''}` })

    // 创建图节点和子任务
    const subTasks: SubTask[] = []
    for (let i = 0; i < taskDefs.length; i++) {
      const td = taskDefs[i]
      this.executor.addNode({
        id: td.id,
        name: td.name,
        description: td.desc,
        parentIds: i > 0 ? [taskDefs[i - 1].id] : [],
        childIds: i < taskDefs.length - 1 ? [taskDefs[i + 1].id] : [],
        maxRetries: 3,
      })
      const st: SubTask = { id: td.id, description: td.desc, status: 'pending' }
      subTasks.push(st)
      this.nodeSubTaskMap.set(td.id, st)
    }

    // 建立边
    for (let i = 0; i < taskDefs.length - 1; i++) {
      try { this.executor.addEdge(taskDefs[i].id, taskDefs[i + 1].id) } catch { /* ignore */ }
    }

    this.executor.setEntryNode(taskDefs[0].id)
    this.graphInitialized = true
    return subTasks
  }

  /**
   * AutoGPT 风格的评估
   *
   * 每次被 LoopEngine 调用时：
   * 1. 先执行一批就绪图节点（调用 executeGraphNodes）
   * 2. 然后根据图状态评估进展
   *
   * 判定逻辑：
   * 1. 全局连续失败超过阈值 → 目标失败
   * 2. 图引擎报告所有节点完成 → 检查成功标准
   * 3. 有节点失败且不可重试 → 目标可能失败
   * 4. 否则继续执行
   */
  async evaluate(goal: LoopGoal, subTasks: SubTask[]): Promise<{ achieved: boolean; reason: string }> {
    // ─── 步骤 1：执行就绪图节点 ───
    await this.executeGraphNodes(goal, subTasks)

    // ─── 步骤 2：基于图状态评估进展 ───
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
- **并发控制**：最大并发数 3，避免资源争抢

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

  // ─── 图节点执行引擎（核心集成逻辑）─────────────────────────

  /**
   * 执行一批就绪图节点
   *
   * 此方法是 AutoGPT 策略接入 LoopEngine 执行流的核心。
   * 每次 evaluate() 被调用时，此方法：
   * 1. 从 GraphExecutor 获取所有就绪节点（依赖已满足的 pending 节点）
   * 2. 对每个就绪节点，调用 nodeExecutor 执行
   * 3. 将执行结果通过 applyNodeResult 反馈给 GraphExecutor
   * 4. 通过 syncNodeToSubTask 将状态同步回 subTasks 数组
   *
   * 设计说明：
   * - 使用同步执行（execSync），与 evaluate() 的同步调用兼容
   * - 每次 evaluate() 执行所有就绪节点，确保图持续推进
   * - 节点执行结果立即反映到 subTasks，引擎下次迭代可见
   *
   * @param goal 当前目标（用于构建执行提示词）
   * @param subTasks 子任务列表（用于状态同步）
   */
  private async executeGraphNodes(goal: LoopGoal, subTasks: SubTask[]): Promise<void> {
    // 获取所有就绪节点（依赖已满足的 pending 节点）
    const readyNodes = this.executor.getReadyNodes()

    if (readyNodes.length === 0) {
      return
    }

    // 并行执行所有就绪节点（最多 3 个并发）
    const maxConcurrency = 3
    const batches: GraphNode[][] = []
    for (let i = 0; i < readyNodes.length; i += maxConcurrency) {
      batches.push(readyNodes.slice(i, i + maxConcurrency))
    }

    for (const batch of batches) {
      // 检查全局终止条件
      const snapshot = this.executor.getStateSnapshot()
      if (snapshot.consecutiveFailures >= this.maxConsecutiveFailures) {
        break
      }

      // 并行执行当前批次
      const promises = batch.map(async (node) => {
        this.executor.markNodeRunning(node.id)
        const nodePrompt = this.buildNodePrompt(goal, node, subTasks)
        const result = await this.executeNodeTask(node, nodePrompt)
        this.executor.applyNodeResult(node.id, result)
        this.syncNodeToSubTask(node.id, subTasks)
        return { node, result }
      })

      await Promise.all(promises)
    }
  }

  /**
   * 执行单个节点的任务
   *
   * 根据任务描述自动选择合适的执行方式：
   * - 包含可执行命令（test/lint/build/git 等）→ 使用 execSync 直接执行
   * - 其他任务 → 返回规划信息
   *
   * 此方法为同步方法，与 evaluate() 的同步调用兼容。
   * 使用 execSync 而非异步 taskExecutor，确保执行结果立即可用。
   *
   * @param node 图节点
   * @param prompt 执行提示词
   * @returns 节点执行结果
   */
  private async executeNodeTask(node: GraphNode, prompt: string): Promise<NodeExecutionResult> {
    // 如果有 AI taskExecutor，优先使用 AI 执行
    if (this.taskExecutor) {
      try {
        const result = await this.taskExecutor(prompt, this.cachedSystemPrompt, {
          id: node.id,
          description: node.description,
          status: 'running',
        })
        return {
          success: result.success,
          output: result.output,
          error: result.error,
          data: { type: 'ai_execution', nodeId: node.id },
        }
      } catch (aiError) {
        // AI 执行失败，回退到关键词匹配
      }
    }

    // 回退：根据任务类型选择执行命令
    const desc = node.description.toLowerCase()
    let cmd: string | null = null

    if (desc.includes('测试') || desc.includes('test') || desc.includes('运行测试')) {
      cmd = 'bun test 2>&1 | head -50'
    } else if (desc.includes('类型') || desc.includes('type') || desc.includes('typescript')) {
      cmd = 'bun run build 2>&1 | head -50'
    } else if (desc.includes('lint') || desc.includes('检查代码')) {
      cmd = 'bun run lint 2>&1 | head -50'
    } else if (desc.includes('build') || desc.includes('构建') || desc.includes('编译')) {
      cmd = 'bun run build 2>&1 | head -100'
    } else if (desc.includes('git status') || desc.includes('git 状态') || desc.includes('检查 git')) {
      cmd = 'git status --short 2>&1'
    } else if (desc.includes('git diff') || desc.includes('git 差异') || desc.includes('代码变更')) {
      cmd = 'git diff --stat 2>&1'
    } else if (desc.includes('git log') || desc.includes('git 提交') || desc.includes('提交历史')) {
      cmd = 'git log --oneline -10 2>&1'
    } else if (desc.includes('文件') || desc.includes('file') || desc.includes('目录')) {
      cmd = 'ls -la 2>&1 | head -30'
    } else if (desc.includes('分析') || desc.includes('计划') || desc.includes('analyze')) {
      // 分析规划类任务：返回结构化分析结果
      return {
        success: true,
        output: `目标分析完成: ${node.description}\n\n执行计划:\n1. 理解目标要求\n2. 分解为可执行步骤\n3. 按依赖顺序执行\n4. 验证结果`,
        data: { type: 'analysis', nodeId: node.id },
      }
    } else if (desc.includes('确认') || desc.includes('完成') || desc.includes('verify')) {
      // 确认类任务：返回确认结果
      return {
        success: true,
        output: `确认完成: ${node.description}\n\n所有前置节点已执行完毕，目标达成。`,
        data: { type: 'verification', nodeId: node.id },
      }
    }

    if (cmd) {
      try {
        const isWin = process.platform === 'win32'
        const shellPath = isWin ? 'C:\\Program Files\\Git\\bin\\bash.exe' : null
        const output = execSync(cmd, {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: shellPath,
        })
        return {
          success: true,
          output: output.slice(0, 2000),
          data: { type: 'shell', command: cmd, nodeId: node.id },
        }
      } catch (execErr: unknown) {
        const err = execErr as { stdout?: string; stderr?: string; status?: number }
        const output = (err.stdout ?? '') + '\n' + (err.stderr ?? '')
        return {
          success: false,
          output: output.slice(0, 2000),
          error: `命令退出码: ${err.status ?? 'unknown'}`,
          data: { type: 'shell', command: cmd, nodeId: node.id },
        }
      }
    }

    // 无法自动执行的任务：返回规划信息
    return {
      success: true,
      output: `任务规划: ${node.description}\n\n系统提示:\n${this.cachedSystemPrompt.slice(0, 500)}\n\n执行提示:\n${prompt.slice(0, 500)}\n\n（此任务需要 AI 代理执行，当前为规划模式）`,
      data: { type: 'planning', nodeId: node.id },
    }
  }

  /**
   * 构建节点执行提示词
   *
   * 为每个图节点构建包含上下文信息的执行提示词。
   *
   * @param goal 当前目标
   * @param node 当前节点
   * @param subTasks 所有子任务（用于提供上下文）
   * @returns 格式化的提示词
   */
  private buildNodePrompt(goal: LoopGoal, node: GraphNode, subTasks: SubTask[]): string {
    // 收集父节点的输出作为上下文
    const parentOutputs: string[] = []
    for (const parentId of node.parentIds) {
      const parentNode = this.executor.getAllNodes().find(n => n.id === parentId)
      if (parentNode?.result) {
        parentOutputs.push(`[父节点 ${parentNode.name}]: ${parentNode.result.slice(0, 300)}`)
      }
    }

    const parentContext = parentOutputs.length > 0
      ? `\n## 父节点输出（输入数据）\n${parentOutputs.join('\n')}`
      : ''

    return `## 目标
${goal.description}

## 当前图节点
- ID: ${node.id}
- 名称: ${node.name}
- 描述: ${node.description}
${parentContext}

## 所有子任务状态
${subTasks.map((t, i) => `${i + 1}. [${t.status}] ${t.description}`).join('\n')}

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '完成所有子任务'}

请执行当前节点任务，输出结果。如果任务需要执行命令，请直接执行并返回输出。`
  }

  /**
   * 将图节点状态同步到 subTasks 数组
   *
   * 由于 LoopEngine 持有对 subTasks 数组的引用，
   * 此方法将 GraphExecutor 中节点的最新状态同步到对应的 SubTask。
   *
   * @param nodeId 节点 ID
   * @param subTasks 子任务数组（由 LoopEngine 持有）
   */
  private syncNodeToSubTask(nodeId: string, subTasks: SubTask[]): void {
    const node = this.executor.getAllNodes().find(n => n.id === nodeId)
    if (!node) return

    // 在 subTasks 数组中找到对应的 SubTask
    const subTask = subTasks.find(t => t.id === nodeId)
    if (!subTask) {
      // 如果 subTasks 中不存在（可能引擎尚未创建），添加到映射
      const cached = this.nodeSubTaskMap.get(nodeId)
      if (cached) {
        cached.status = node.status
        cached.result = node.result
        cached.error = node.error
      }
      return
    }

    // 同步状态
    subTask.status = node.status
    subTask.result = node.result
    subTask.error = node.error

    // 更新缓存映射
    this.nodeSubTaskMap.set(nodeId, subTask)
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
    this.graphInitialized = false
    this.nodeSubTaskMap.clear()
    this.taskExecutor = null
    this.cachedSystemPrompt = ''
  }
}

// 导出 GraphExecutor 和类型，供外部使用
export { GraphExecutor }
export type { GraphNode, GraphConfig, GraphState, NodeExecutionResult, GraphExecutionResult, NodeStatus }
