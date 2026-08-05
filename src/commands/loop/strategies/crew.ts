/**
 * CrewAI 风格的多 Agent 协作循环策略
 *
 * 移植自 CrewAI Python 版（https://github.com/joaomdmoura/crewai）
 *
 * 核心架构：
 * - Agent：有角色（role）、目标（goal）、背景故事（backstory）
 * - Task：有描述、预期输出、分配的 Agent
 * - Crew：包含多个 Agent 和 Task，支持串行/并行执行
 * - Process：层级式（hierarchical）或顺序式（sequential）
 *
 * 角色流水线：
 *   manager → developer → tester → reviewer
 *                ↑                        │
 *                └─── (返工循环) ──────────┘
 *
 * 执行流程：
 *   1. manager 分解目标为子任务
 *   2. 按顺序分配给 developer → tester → reviewer
 *   3. reviewer 通过 → 任务完成
 *   4. reviewer 不通过 → 回退给 developer 返工
 *   5. 返工次数 > 2 → 标记失败
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

// ============================================================================
// 类型定义
// ============================================================================

/** CrewAI 角色标识 */
type CrewRole = 'manager' | 'developer' | 'tester' | 'reviewer'

/** 流程类型 */
type ProcessType = 'sequential' | 'hierarchical'

/** Agent 工具函数类型 */
type AgentTool = (input: string) => string | Promise<string>

/** Agent 配置选项 */
interface AgentOptions {
  /** 角色名称 */
  role: CrewRole
  /** 角色显示名 */
  roleTitle: string
  /** 个体目标 */
  goal: string
  /** 背景故事 */
  backstory: string
  /** 是否启用记忆系统 */
  memory: boolean
  /** 最大迭代次数 */
  maxIter: number
  /** 最大并发数（仅 hierarchical 模式） */
  maxConcurrent: number
  /** 可用工具列表 */
  tools: AgentTool[]
  /** 是否允许委托（将子任务分配给其他 Agent） */
  allowDelegation: boolean
}

/** Task 配置选项 */
interface TaskOptions {
  /** 任务描述 */
  description: string
  /** 预期输出 */
  expectedOutput: string
  /** 分配的 Agent 角色 */
  assignedRole: CrewRole
  /** 上下文依赖的任务 ID 列表 */
  contextTaskIds: string[]
  /** 是否异步执行 */
  asyncExecution: boolean
  /** 任务状态回调 */
  onComplete?: (result: string) => void
}

/** Task 执行结果 */
interface TaskResult {
  taskId: string
  success: boolean
  output: string
  error?: string
  /** 执行耗时（毫秒） */
  duration: number
  /** 执行的 Agent 角色 */
  executedBy: CrewRole
  /** 重试次数 */
  retryCount: number
}

/** 角色流水线执行结果 */
interface RolePipelineResult {
  role: CrewRole
  output: string
  success: boolean
}

/** 角色流水线方法返回值 */
interface PipelineExecutionResult {
  success: boolean
  results: RolePipelineResult[]
  reworkNeeded: boolean
  reworkReason: string
}

/** 返工记录 */
interface ReworkRecord {
  /** 返工轮次 */
  round: number
  /** 触发返工的角色 */
  fromRole: CrewRole
  /** 返工目标角色 */
  toRole: CrewRole
  /** 返工原因 */
  reason: string
  /** 时间戳 */
  timestamp: number
}

// ============================================================================
// Agent 类
// ============================================================================

/**
 * Agent — CrewAI 的智能体
 *
 * 每个 Agent 拥有：
 * - 角色定义（role, goal, backstory）
 * - 工具列表（tools）
 * - 记忆系统（memory）
 * - 委托能力（allowDelegation）
 *
 * Agent 不直接执行 Task，而是通过 Crew 的 Process 编排执行。
 */
class Agent {
  readonly role: CrewRole
  readonly roleTitle: string
  readonly goal: string
  readonly backstory: string
  readonly memory: boolean
  readonly maxIter: number
  readonly maxConcurrent: number
  readonly tools: AgentTool[]
  readonly allowDelegation: boolean

  /** 执行历史记忆 */
  private executionMemory: string[] = []

  constructor(options: AgentOptions) {
    this.role = options.role
    this.roleTitle = options.roleTitle
    this.goal = options.goal
    this.backstory = options.backstory
    this.memory = options.memory
    this.maxIter = options.maxIter
    this.maxConcurrent = options.maxConcurrent
    this.tools = options.tools
    this.allowDelegation = options.allowDelegation
  }

  /**
   * 生成该 Agent 的系统提示词
   */
  getSystemPrompt(): string {
    const memorySection = this.executionMemory.length > 0
      ? `\n\n## 记忆（历史执行记录）\n${this.executionMemory.slice(-5).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : ''

    const toolsSection = this.tools.length > 0
      ? `\n\n## 可用工具\n${this.tools.map((_, i) => `- tool_${i + 1}`).join('\n')}`
      : ''

    return `你是 ${this.roleTitle}（${this.role}）。

## 你的目标
${this.goal}

## 你的背景
${this.backstory}
${memorySection}
${toolsSection}

## 执行规则
1. 专注于你的角色职责，不要越界处理其他角色的职责
2. 输出要具体、可执行，便于下游 Agent 使用
3. ${this.memory ? '参考记忆系统中的历史记录，避免重复失败' : '每次执行独立，不依赖历史记忆'}
4. ${this.allowDelegation ? '如果任务超出你的能力范围，可以委托给其他 Agent' : '专注完成自己的任务，不要委托'}
5. 输出格式清晰，包含关键结论和详细结果
`
  }

  /**
   * 向记忆系统添加记录
   */
  addMemory(entry: string): void {
    if (!this.memory) return
    this.executionMemory.push(entry)
    // 保留最近 20 条记忆
    if (this.executionMemory.length > 20) {
      this.executionMemory = this.executionMemory.slice(-20)
    }
  }

  /**
   * 获取记忆内容
   */
  getMemory(): readonly string[] {
    return [...this.executionMemory]
  }

  /**
   * 重置记忆
   */
  clearMemory(): void {
    this.executionMemory = []
  }
}

// ============================================================================
// Task 类
// ============================================================================

/**
 * Task — CrewAI 的任务单元
 *
 * 每个 Task 拥有：
 * - 描述和预期输出
 * - 分配的 Agent 角色
 * - 上下文依赖（其他 Task 的输出）
 * - 执行状态和结果
 */
class Task {
  readonly id: string
  readonly description: string
  readonly expectedOutput: string
  readonly assignedRole: CrewRole
  readonly contextTaskIds: string[]
  readonly asyncExecution: boolean

  /** 执行状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' = 'pending'

  /** 执行结果 */
  result: string = ''

  /** 错误信息（失败时） */
  error: string = ''

  /** 执行耗时 */
  duration: number = 0

  /** 重试次数 */
  retryCount: number = 0

  /** 完成回调 */
  private readonly onComplete?: (result: string) => void

  constructor(id: string, options: TaskOptions) {
    this.id = id
    this.description = options.description
    this.expectedOutput = options.expectedOutput
    this.assignedRole = options.assignedRole
    this.contextTaskIds = options.contextTaskIds
    this.asyncExecution = options.asyncExecution
    this.onComplete = options.onComplete
  }

  /**
   * 生成任务执行提示词
   *
   * 包含上下文依赖的输出（如果有）
   *
   * @param contextOutputs 依赖任务的输出 Map
   */
  getPrompt(contextOutputs: Map<string, string> = new Map()): string {
    const contextSection = this.contextTaskIds.length > 0
      ? '\n## 上下文（上游任务输出）\n' +
        this.contextTaskIds
          .map((cid) => {
            const output = contextOutputs.get(cid)
            return output ? `[${cid}]: ${output.slice(0, 500)}` : `[${cid}]: （无输出）`
          })
          .join('\n')
      : ''

    return `## 当前任务
${this.description}

## 预期输出
${this.expectedOutput}
${contextSection}

## 执行要求
1. 严格按照任务描述执行
2. 输出要满足预期输出的要求
3. 记录关键决策和推理过程
4. 如果遇到无法解决的问题，说明具体原因
`
  }

  /**
   * 标记任务完成
   */
  markCompleted(output: string, duration: number): void {
    this.status = 'completed'
    this.result = output
    this.duration = duration
    this.onComplete?.(output)
  }

  /**
   * 标记任务失败
   */
  markFailed(error: string, duration: number): void {
    this.status = 'failed'
    this.error = error
    this.duration = duration
  }

  /**
   * 重置任务状态
   */
  reset(): void {
    this.status = 'pending'
    this.result = ''
    this.error = ''
    this.duration = 0
    this.retryCount = 0
  }
}

// ============================================================================
// Crew 类
// ============================================================================

/**
 * Crew — CrewAI 的多 Agent 协作引擎
 *
 * 负责管理 Agent 和 Task，并通过 Process 编排执行。
 * 支持两种流程：
 * - sequential（顺序式）：Task 按顺序依次执行
 * - hierarchical（层级式）：manager Agent 动态分配任务，支持并发
 */
class Crew {
  readonly agents: Map<CrewRole, Agent>
  readonly tasks: Task[]
  readonly process: ProcessType
  readonly maxConcurrent: number

  /** 任务执行历史 */
  private taskResults: Map<string, TaskResult> = new Map()

  /** 返工记录 */
  private reworkRecords: ReworkRecord[] = []

  /** 返工次数计数 */
  private reworkCount: number = 0

  /** 最大返工次数 */
  private readonly maxRework: number

  constructor(
    agents: Agent[],
    tasks: Task[],
    process: ProcessType = 'sequential',
    maxConcurrent: number = 3,
    maxRework: number = 2,
  ) {
    this.agents = new Map(agents.map((a) => [a.role, a]))
    this.tasks = tasks
    this.process = process
    this.maxConcurrent = maxConcurrent
    this.maxRework = maxRework
  }

  /**
   * 执行所有 Task
   *
   * 根据 process 类型选择执行策略：
   * - sequential：按 Task 列表顺序依次执行
   * - hierarchical：manager 动态分配，支持并发
   *
   * @param goal 原始目标描述
   * @returns 所有 Task 的执行结果
   */
  async execute(goal: string): Promise<TaskResult[]> {
    if (this.process === 'hierarchical') {
      return this.executeHierarchical(goal)
    }
    return this.executeSequential(goal)
  }

  /**
   * 顺序执行：按 Task 列表顺序依次执行
   */
  private async executeSequential(goal: string): Promise<TaskResult[]> {
    const results: TaskResult[] = []
    const contextOutputs = new Map<string, string>()

    for (const task of this.tasks) {
      const agent = this.agents.get(task.assignedRole)
      if (!agent) {
        results.push({
          taskId: task.id,
          success: false,
          output: '',
          error: `未找到角色 [${task.assignedRole}] 对应的 Agent`,
          duration: 0,
          executedBy: task.assignedRole,
          retryCount: task.retryCount,
        })
        continue
      }

      // 执行任务
      const result = await this.executeTask(task, agent, contextOutputs, goal)
      results.push(result)
      this.taskResults.set(task.id, result)

      if (result.success) {
        contextOutputs.set(task.id, result.output)
      }
    }

    return results
  }

  /**
   * 层级执行：manager 动态分配，支持并发
   *
   * 流程：
   * 1. manager Agent 分解目标，生成执行计划
   * 2. 按计划并发分配任务（不超过 maxConcurrent）
   * 3. 收集结果，由 manager 评估并决定是否继续
   */
  private async executeHierarchical(goal: string): Promise<TaskResult[]> {
    const manager = this.agents.get('manager')
    if (!manager) {
      // 没有 manager，退化为顺序执行
      return this.executeSequential(goal)
    }

    const results: TaskResult[] = []
    const contextOutputs = new Map<string, string>()

    // 1. manager 分解目标（第一个 task 是 manager 的计划任务）
    const managerTask = this.tasks.find((t) => t.assignedRole === 'manager')
    if (managerTask) {
      const managerResult = await this.executeTask(managerTask, manager, contextOutputs, goal)
      results.push(managerResult)
      this.taskResults.set(managerTask.id, managerResult)
      if (managerResult.success) {
        contextOutputs.set(managerTask.id, managerResult.output)
        manager.addMemory(`[plan] ${managerResult.output.slice(0, 200)}`)
      }
    }

    // 2. 并发执行非 manager 任务（按批次，每批 maxConcurrent 个）
    const nonManagerTasks = this.tasks.filter((t) => t.assignedRole !== 'manager')

    for (let i = 0; i < nonManagerTasks.length; i += this.maxConcurrent) {
      const batch = nonManagerTasks.slice(i, i + this.maxConcurrent)

      const batchResults = await Promise.all(
        batch.map(async (task) => {
          const agent = this.agents.get(task.assignedRole)
          if (!agent) {
            return {
              taskId: task.id,
              success: false,
              output: '',
              error: `未找到角色 [${task.assignedRole}] 对应的 Agent`,
              duration: 0,
              executedBy: task.assignedRole,
              retryCount: task.retryCount,
            }
          }
          return this.executeTask(task, agent, contextOutputs, goal)
        }),
      )

      for (const result of batchResults) {
        results.push(result)
        this.taskResults.set(result.taskId, result)
        if (result.success) {
          const task = this.tasks.find((t) => t.id === result.taskId)
          if (task) {
            contextOutputs.set(task.id, result.output)
          }
        }
      }
    }

    return results
  }

  /**
   * 执行单个 Task（含返工逻辑）
   */
  async executeTask(
    task: Task,
    agent: Agent,
    contextOutputs: Map<string, string>,
    goal: string,
  ): Promise<TaskResult> {
    const startTime = Date.now()
    task.status = 'running'

    try {
      // 生成执行提示词
      const systemPrompt = agent.getSystemPrompt()
      const taskPrompt = task.getPrompt(contextOutputs)

      // 模拟实际执行（在生产环境中调用 AI API）
      const output = await this.simulateExecution(agent, task, taskPrompt, systemPrompt, goal)

      task.markCompleted(output, Date.now() - startTime)

      // 向 Agent 记忆写入结果摘要
      agent.addMemory(`[${task.assignedRole}] ${task.description.slice(0, 50)}: ${output.slice(0, 100)}`)

      return {
        taskId: task.id,
        success: true,
        output,
        duration: task.duration,
        executedBy: task.assignedRole,
        retryCount: task.retryCount,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      task.markFailed(errorMessage, Date.now() - startTime)

      return {
        taskId: task.id,
        success: false,
        output: '',
        error: errorMessage,
        duration: task.duration,
        executedBy: task.assignedRole,
        retryCount: task.retryCount,
      }
    }
  }

  /**
   * 模拟 Agent 执行任务（生产环境替换为 AI API 调用）
   */
  private async simulateExecution(
    agent: Agent,
    task: Task,
    taskPrompt: string,
    systemPrompt: string,
    goal: string,
  ): Promise<string> {
    void taskPrompt
    void systemPrompt
    void goal

    // 模拟异步执行
    await new Promise((resolve) => setTimeout(resolve, 1))

    const roleActions: Record<CrewRole, string> = {
      manager: `[manager 执行计划] 分析目标并分解任务:\n${task.description}`,
      developer: `[developer 执行编码] 实现功能:\n${task.description}`,
      tester: `[tester 执行测试] 验证功能:\n${task.description}`,
      reviewer: `[reviewer 执行审查] 审查交付物:\n${task.description}`,
    }

    return `${roleActions[agent.role] || '执行任务'}\n\n执行结果: 任务完成（模拟）。实际运行中此处调用 AI Agent 执行。`
  }

  /**
   * 触发返工流程
   *
   * reviewer 不通过时，回退给 developer 返工。
   * 返工次数超过上限时返回失败。
   *
   * @param fromRole 触发返工的角色（通常是 reviewer）
   * @param toRole 返工目标角色（通常是 developer）
   * @param reason 返工原因
   * @returns 是否允许继续返工
   */
  triggerRework(fromRole: CrewRole, toRole: CrewRole, reason: string): boolean {
    this.reworkCount++

    this.reworkRecords.push({
      round: this.reworkCount,
      fromRole,
      toRole,
      reason,
      timestamp: Date.now(),
    })

    return this.reworkCount <= this.maxRework
  }

  /**
   * 获取返工记录
   */
  getReworkRecords(): readonly ReworkRecord[] {
    return [...this.reworkRecords]
  }

  /**
   * 获取当前返工次数
   */
  getReworkCount(): number {
    return this.reworkCount
  }

  /**
   * 获取最大返工次数
   */
  getMaxRework(): number {
    return this.maxRework
  }

  /**
   * 获取指定任务的结果
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    return this.taskResults.get(taskId)
  }

  /**
   * 获取所有执行结果
   */
  getAllResults(): Map<string, TaskResult> {
    return new Map(this.taskResults)
  }

  /**
   * 重置 Crew 状态
   */
  reset(): void {
    this.taskResults.clear()
    this.reworkRecords = []
    this.reworkCount = 0
    for (const task of this.tasks) {
      task.reset()
    }
    for (const agent of this.agents.values()) {
      agent.clearMemory()
    }
  }
}

// ============================================================================
// CrewStrategy — 循环策略实现
// ============================================================================

export class CrewStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'crew'
  readonly displayName = 'CrewAI 多Agent协作循环'
  readonly description = '多 Agent 协作循环，移植自 CrewAI。支持角色分配（manager/developer/tester/reviewer）、任务编排、返工机制。'

  /** Crew 实例 */
  private crew: Crew

  /** Agent 实例映射 */
  private readonly agents: Map<CrewRole, Agent> = new Map()

  /** 当前流程类型 */
  private processType: ProcessType = 'sequential'

  /** 返工次数 */
  private reworkCount = 0

  /** 最大返工次数 */
  private readonly maxRework = 2

  /** 角色执行历史 */
  private roleExecutionHistory: Array<{
    role: CrewRole
    success: boolean
    output: string
    timestamp: number
  }> = []

  constructor() {
    super()
    this.crew = this.createCrew()
  }

  /**
   * 创建 Crew 实例（含默认 Agent 和空 Task 列表）
   */
  private createCrew(): Crew {
    // 创建 4 个默认角色 Agent
    const managerAgent = new Agent({
      role: 'manager',
      roleTitle: '项目经理',
      goal: '将复杂目标分解为清晰可执行的子任务，分配给合适的团队成员，监控整体进度和质量',
      backstory: '你是一位经验丰富的项目经理，擅长将模糊的需求转化为具体的执行计划。你能识别任务之间的依赖关系，合理分配工作，确保团队高效协作。你注重效率和质量的平衡。',
      memory: true,
      maxIter: 10,
      maxConcurrent: 3,
      tools: [],
      allowDelegation: true,
    })

    const developerAgent = new Agent({
      role: 'developer',
      roleTitle: '高级开发者',
      goal: '根据项目经理分配的任务，高质量地完成具体实现，遵循最佳实践，确保代码可维护性和性能',
      backstory: '你是一位技术精湛的高级开发者，精通多种编程语言和框架。你注重代码质量、可维护性和性能，能够快速将计划转化为可靠的实现。你善于解决复杂的技术难题。',
      memory: true,
      maxIter: 15,
      maxConcurrent: 2,
      tools: [],
      allowDelegation: false,
    })

    const testerAgent = new Agent({
      role: 'tester',
      roleTitle: '测试工程师',
      goal: '验证开发者的实现是否满足需求，发现潜在问题，确保交付质量',
      backstory: '你是一位严谨的测试专家，善于从用户视角发现缺陷。你不仅验证功能正确性，还关注边界条件、异常处理和用户体验。你的测试报告详尽且具有建设性。',
      memory: true,
      maxIter: 10,
      maxConcurrent: 3,
      tools: [],
      allowDelegation: false,
    })

    const reviewerAgent = new Agent({
      role: 'reviewer',
      roleTitle: '技术审查者',
      goal: '对最终交付物进行质量审查，确保达到验收标准，不达标坚决打回返工',
      backstory: '你是一位资深的技术审查者，拥有丰富的代码审查和架构评审经验。你以质量为唯一标准，能够准确识别设计缺陷、安全隐患和性能瓶颈。不达标的交付物你绝不放行。',
      memory: true,
      maxIter: 5,
      maxConcurrent: 1,
      tools: [],
      allowDelegation: false,
    })

    this.agents.set('manager', managerAgent)
    this.agents.set('developer', developerAgent)
    this.agents.set('tester', testerAgent)
    this.agents.set('reviewer', reviewerAgent)

    return new Crew(
      [managerAgent, developerAgent, testerAgent, reviewerAgent],
      [],
      'sequential',
      3,
      this.maxRework,
    )
  }

  /**
   * 将目标按角色分解为子任务
   *
   * 每个子任务分配给一个角色，任务之间有明确的依赖关系：
   * manager → developer → tester → reviewer
   *
   * manager 的输出是任务分配计划
   * developer 的输出是实现结果
   * tester 的输出是测试报告
   * reviewer 的输出是审查结论（通过/返工）
   */
  decompose(goal: LoopGoal): SubTask[] {
    const tasks: SubTask[] = [
      {
        id: 'crew-manager',
        description: `[manager] 任务分解：分析目标 "${goal.description}"，将其分解为具体的执行计划，明确每个角色的职责和交付物`,
        status: 'pending',
        assignedTo: 'manager',
      },
      {
        id: 'crew-developer',
        description: `[developer] 编码实现：根据 manager 分配的计划执行具体实现，遵循最佳实践，确保代码质量`,
        status: 'pending',
        assignedTo: 'developer',
      },
      {
        id: 'crew-tester',
        description: `[tester] 功能测试：验证 developer 的实现是否满足需求，运行测试用例，发现潜在问题`,
        status: 'pending',
        assignedTo: 'tester',
      },
      {
        id: 'crew-reviewer',
        description: `[reviewer] 质量审查：对照成功标准审查交付物 ${goal.successCriteria?.map((c) => `["${c}"]`).join(', ') ?? ''}，通过则完成，不通过则打回 developer 返工`,
        status: 'pending',
        assignedTo: 'reviewer',
      },
    ]

    return tasks
  }

  /**
   * 基于角色完成度和 Crew 执行状态的目标达成评估
   *
   * 判定逻辑：
   * - reviewer 通过 + 所有角色完成 → 达成
   * - 返工次数超限 → 失败
   * - 任一角色连续失败 2 次 → 失败
   * - 所有角色完成（无自定义标准） → 达成
   * - 否则继续
   */
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    // 1. 检查返工次数是否超限
    if (this.reworkCount > this.maxRework) {
      return {
        achieved: false,
        reason: `返工次数已超限（${this.reworkCount}/${this.maxRework}），团队无法在当前策略下达成目标`,
      }
    }

    // 2. 检查是否有角色连续失败 2 次
    for (const [, agent] of this.agents) {
      const failures = this.roleExecutionHistory
        .filter((h) => h.role === agent.role && !h.success)
        .slice(-2)
      if (failures.length >= 2) {
        return {
          achieved: false,
          reason: `角色 [${agent.role}] 已连续失败 2 次，协作流程无法继续推进`,
        }
      }
    }

    // 3. 检查 reviewer 是否通过（最终质量关卡）
    const reviewerTask = subTasks.find((t) => t.id === 'crew-reviewer')
    if (reviewerTask?.status === 'completed') {
      const allCompleted = subTasks.every((t) => t.status === 'completed')
      if (allCompleted) {
        return {
          achieved: true,
          reason: '审查者(reviewer)已批准，所有角色任务已完成，协作目标达成',
        }
      }
    }

    // 4. 检查成功标准（如果目标定义了）
    if (goal.successCriteria && goal.successCriteria.length > 0) {
      const completedCount = subTasks.filter((t) => t.status === 'completed').length
      if (completedCount === subTasks.length) {
        return {
          achieved: true,
          reason: `所有 ${subTasks.length} 个角色任务已完成，满足 ${goal.successCriteria.length} 条成功标准`,
        }
      }
    }

    // 5. 默认：继续循环
    const completedCount = subTasks.filter((t) => t.status === 'completed').length
    return {
      achieved: false,
      reason: `团队协作中，已完成 ${completedCount}/${subTasks.length} 个角色任务，返工次数: ${this.reworkCount}/${this.maxRework}`,
    }
  }

  /**
   * 返回 CrewAI 风格的系统提示词
   *
   * 描述角色分工、协作流程、返工机制和质量控制规则
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    const roleDescriptions = Array.from(this.agents.values())
      .map((a) => `### ${a.roleTitle}（${a.role}）\n- 目标: ${a.goal}\n- 背景: ${a.backstory}`)
      .join('\n\n')

    return `你是 CrewAI 多 Agent 协作引擎的执行者。你需要协调一个由不同角色组成的团队来完成以下目标。

## 目标
${goal.description}${criteria}

## 团队成员

${roleDescriptions}

## 协作流程图

\`\`\`
manager → developer → tester → reviewer
            ↑                        │
            └─── (返工循环, ≤${this.maxRework}次) ─┘
\`\`\`

## 流程类型

### sequential（顺序式）
- Task 按照定义的顺序依次执行
- 每个 Task 的输出作为下一个 Task 的上下文
- 适用于有明确依赖关系的任务链

### hierarchical（层级式）
- manager Agent 负责动态分解目标和分配任务
- 支持并发执行（最大 ${this.crew.maxConcurrent} 个任务同时执行）
- manager 评估中间结果并调整计划
- 适用于复杂、需要动态调整的任务

## 返工机制

当 reviewer 审查不通过时：
1. reviewer 给出具体的返工原因和改进建议
2. 任务回退到 developer 进行修复
3. developer 根据反馈修复后，重新走 tester → reviewer 流程
4. 返工次数超过 ${this.maxRework} 次 → 标记任务失败

## 执行规则
1. 从 manager 开始，每个迭代专注一个角色的任务
2. 每个角色的输出作为下一个角色的输入上下文
3. reviewer 是最终质量关卡，不通过必须返工
4. 任何角色连续失败 2 次将终止整个协作流程
5. 每次只处理一个角色，不要跳过角色
6. Agent 的记忆系统会记录历史执行，避免重复错误
`
  }

  /**
   * CrewAI 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 返工次数超过上限
   * 3. 任一角色连续失败 2 次
   * 4. 所有角色完成且 reviewer 通过
   */
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    if (iteration >= maxIterations) return false
    if (this.reworkCount > this.maxRework) return false

    // 检查是否有角色连续失败 2 次
    for (const [, agent] of this.agents) {
      const recentFailures = this.roleExecutionHistory
        .filter((h) => h.role === agent.role && !h.success)
        .slice(-2)
      if (recentFailures.length >= 2) return false
    }

    const allCompleted = subTasks.length > 0 && subTasks.every((t) => t.status === 'completed')
    if (allCompleted) return false

    return true
  }

  // ─── CrewAI 特色方法 ────────────────────────────────────────

  /**
   * 执行角色流水线
   *
   * 按照 manager → developer → tester → reviewer 的顺序执行一轮。
   * 如果 reviewer 不通过且返工次数未超限，回退到 developer 返工。
   *
   * @param goal 原始目标
   * @param onProgress 进度回调
   * @returns 本轮执行结果
   */
  async executePipeline(
    goal: LoopGoal,
    onProgress?: (role: CrewRole, result: string) => void,
  ): Promise<PipelineExecutionResult> {
    const results: RolePipelineResult[] = []
    const roles: CrewRole[] = ['manager', 'developer', 'tester', 'reviewer']

    for (const role of roles) {
      const agent = this.agents.get(role)
      if (!agent) continue

      const taskId = `crew-${role}`
      const task = new Task(taskId, {
        description: `${role} 任务: ${goal.description}`,
        expectedOutput: `${role} 的执行结果`,
        assignedRole: role,
        contextTaskIds: results.length > 0
          ? [`crew-${results[results.length - 1]!.role}`]
          : [],
        asyncExecution: false,
      })

      const contextOutputs = new Map<string, string>()
      for (const r of results) {
        contextOutputs.set(`crew-${r.role}`, r.output)
      }

      const result = await this.crew.executeTask(task, agent, contextOutputs, goal.description)
      results.push({ role, output: result.output, success: result.success })

      this.roleExecutionHistory.push({
        role,
        success: result.success,
        output: result.output,
        timestamp: Date.now(),
      })

      onProgress?.(role, result.output)
    }

    // 检查 reviewer 结果，决定是否需要返工
    const reviewerResult = results.find((r) => r.role === 'reviewer')
    const reworkNeeded = reviewerResult
      ? (!reviewerResult.success || reviewerResult.output.includes('返工') || reviewerResult.output.includes('不通过'))
      : false

    let reworkReason = ''
    if (reworkNeeded) {
      reworkReason = reviewerResult?.output ?? '审查未通过'
      const canRework = this.crew.triggerRework('reviewer', 'developer', reworkReason)
      if (canRework) {
        this.reworkCount = this.crew.getReworkCount()
      }
    }

    const allSuccess = results.every((r) => r.success) && !reworkNeeded

    return { success: allSuccess, results, reworkNeeded, reworkReason }
  }

  /**
   * 获取指定角色的 Agent 实例
   */
  getAgent(role: CrewRole): Agent | undefined {
    return this.agents.get(role)
  }

  /**
   * 获取所有角色的定义信息
   */
  getRoles(): Array<{ role: CrewRole; title: string; goal: string; backstory: string }> {
    return Array.from(this.agents.values()).map((a) => ({
      role: a.role,
      title: a.roleTitle,
      goal: a.goal,
      backstory: a.backstory,
    }))
  }

  /**
   * 获取内部 Crew 实例
   */
  getCrew(): Crew {
    return this.crew
  }

  /**
   * 获取当前流程类型
   */
  getProcessType(): ProcessType {
    return this.processType
  }

  /**
   * 获取协作状态的完整快照
   */
  getStateSnapshot(): {
    reworkCount: number
    maxRework: number
    processType: ProcessType
    roleHistoryLength: number
    lastRoleResult: { role: CrewRole; success: boolean; output: string } | undefined
    agentCount: number
    taskCount: number
  } {
    return {
      reworkCount: this.reworkCount,
      maxRework: this.maxRework,
      processType: this.processType,
      roleHistoryLength: this.roleExecutionHistory.length,
      lastRoleResult: this.roleExecutionHistory.length > 0
        ? (() => {
            const last = this.roleExecutionHistory[this.roleExecutionHistory.length - 1]!
            return { role: last.role, success: last.success, output: last.output }
          })()
        : undefined,
      agentCount: this.agents.size,
      taskCount: this.crew.tasks.length,
    }
  }

  /**
   * 重置策略到初始状态
   */
  reset(): void {
    this.reworkCount = 0
    this.roleExecutionHistory = []
    this.crew.reset()
    this.processType = 'sequential'
  }
}
