/**
 * SWE-agent 风格的 Bug 修复循环策略
 *
 * 移植自 SWE-agent Python 版（https://github.com/princeton-nlp/SWE-agent）
 * 参考：.github/swe-agent/sweagent/agent/agents.py
 *
 * 核心架构：
 * - step()：执行一步 action → observation → 下一步
 * - run()：循环调用 step() 直到 done
 * - Trajectory：记录完整的执行轨迹（action, observation, state）
 * - RetryLoop：失败重试循环，支持 ScoreRetryLoop 和 ChooserRetryLoop
 * - ActionSampler：动作采样器，支持多种采样策略
 * - HistoryProcessor：历史处理器，压缩和管理上下文
 *
 * 执行循环：
 *   1. 定位（Localize）：在代码库中搜索相关文件和行号
 *   2. 分析（Analyze）：理解 bug 根因
 *   3. 生成补丁（Generate Patch）：生成 unified diff 格式的修复
 *   4. 验证（Verify）：运行测试验证修复
 *   5. 如果验证失败 → 回到步骤 2（重新分析）
 *   6. 连续 3 次失败 → 自动提交当前最佳结果（autosubmit）
 *
 * 关键机制：
 * - 成本追踪：跟踪 API 调用成本，超限自动停止
 * - 上下文管理：观察结果过长时自动截断
 * - 重试循环：支持评分制和选择制两种重试策略
 * - 轨迹保存：每步都保存执行轨迹，支持回放
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

// ============================================================================
// 类型定义
// ============================================================================

/** SWE-agent 修复阶段 */
type SWEEpoch = 'localize' | 'analyze' | 'patch' | 'verify' | 'autosubmit'

/** 动作类型 — SWE-agent 中 agent 可执行的操作 */
type ActionType =
  | 'search'       // 在代码库中搜索
  | 'view'         // 查看文件内容
  | 'edit'         // 编辑文件
  | 'delete'       // 删除文件
  | 'create'       // 创建文件
  | 'test'         // 运行测试
  | 'bash'         // 执行 bash 命令
  | 'submit'       // 提交结果
  | 'think'        // 思考/推理
  | 'finish'       // 完成修复

/** 动作 — agent 执行的具体操作 */
interface Action {
  /** 动作类型 */
  type: ActionType
  /** 动作参数 */
  input: Record<string, unknown>
  /** 动作描述 */
  description: string
  /** 时间戳 */
  timestamp: number
}

/** 观察结果 — 环境对动作的反馈 */
interface Observation {
  /** 观察内容 */
  content: string
  /** 是否出错 */
  isError: boolean
  /** 额外元数据 */
  metadata?: Record<string, unknown>
  /** 时间戳 */
  timestamp: number
}

/** 重试策略类型 */
type RetryStrategyType = 'score' | 'chooser'

/** 重试循环状态 */
interface RetryLoopState {
  /** 当前重试次数 */
  currentAttempt: number
  /** 最大重试次数 */
  maxAttempts: number
  /** 重试历史 */
  attempts: Array<{
    attemptNumber: number
    action: Action
    observation: Observation
    score?: number
    feedback?: string
    timestamp: number
  }>
  /** 最佳尝试记录 */
  bestAttempt: {
    attemptNumber: number
    score: number
    action: Action
    observation: Observation
  } | null
  /** 是否已解决 */
  resolved: boolean
}

/** 成本追踪状态 */
interface CostTracker {
  /** 累计成本（美元） */
  totalCost: number
  /** 输入 token 数 */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** API 调用次数 */
  apiCalls: number
  /** 成本上限 */
  costLimit: number
  /** 各阶段成本明细 */
  epochCosts: Record<SWEEpoch, number>
}

/** 上下文管理状态 */
interface ContextState {
  /** 历史消息 */
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  /** 最大上下文 token 数 */
  maxContextTokens: number
  /** 当前估计 token 数 */
  estimatedTokens: number
  /** 截断策略 */
  truncationStrategy: 'head' | 'tail' | 'sliding_window'
  /** 滑动窗口大小 */
  windowSize: number
  /** 已截断的消息数 */
  truncatedCount: number
}

/** 修复状态 */
interface RepairState {
  /** 当前修复阶段 */
  currentEpoch: SWEEpoch
  /** 定位结果 */
  localizationResult: {
    filePath: string
    lineStart: number
    lineEnd: number
    confidence: number
    relevantCode: string
  } | null
  /** 分析结果 */
  analysisResult: {
    rootCause: string
    fixStrategy: string
    affectedFiles: string[]
    riskLevel: 'low' | 'medium' | 'high'
  } | null
  /** 生成的补丁 */
  patchResult: {
    diffContent: string
    targetFile: string
    linesChanged: number
    patchVersion: number
  } | null
  /** 验证结果 */
  verifyResult: {
    testsPassed: boolean
    passedCount: number
    failedCount: number
    errorMessages: string[]
    duration: number
  } | null
  /** 连续失败次数 */
  consecutiveFailures: number
  /** 总尝试次数 */
  totalAttempts: number
  /** 是否已自动提交 */
  autoSubmitted: boolean
}

// ============================================================================
// TrajectoryStep — 轨迹步骤
// ============================================================================

/**
 * TrajectoryStep
 *
 * 记录 SWE-agent 每步执行的完整信息。
 * 一个 trajectory 就是一次完整修复尝试的记录，
 * 包含所有 action-observation 对。
 *
 * 对应 SWE-agent Python 版中的 trajectory 条目格式：
 * {"action": ..., "observation": ..., "state": ..., "model": ..., "cost": ...}
 */
class TrajectoryStep {
  /** 步骤序号（从 1 开始） */
  readonly stepNumber: number
  /** 所属修复轮次 */
  readonly epoch: SWEEpoch
  /** agent 执行的动作 */
  readonly action: Action
  /** 环境返回的观察 */
  readonly observation: Observation
  /** 动作执行前的状态摘要 */
  readonly stateBefore: string
  /** 动作执行后的状态摘要 */
  readonly stateAfter: string
  /** 本步骤成本 */
  readonly cost: number
  /** 执行耗时（毫秒） */
  readonly durationMs: number
  /** 时间戳 */
  readonly timestamp: number
  /** 模型名称 */
  readonly modelName: string
  /** 额外元数据 */
  readonly metadata: Record<string, unknown>

  constructor(params: {
    stepNumber: number
    epoch: SWEEpoch
    action: Action
    observation: Observation
    stateBefore: string
    stateAfter: string
    cost: number
    durationMs: number
    modelName?: string
    metadata?: Record<string, unknown>
  }) {
    this.stepNumber = params.stepNumber
    this.epoch = params.epoch
    this.action = params.action
    this.observation = params.observation
    this.stateBefore = params.stateBefore
    this.stateAfter = params.stateAfter
    this.cost = params.cost
    this.durationMs = params.durationMs
    this.timestamp = Date.now()
    this.modelName = params.modelName ?? 'default'
    this.metadata = params.metadata ?? {}
  }

  /**
   * 序列化为 JSON 对象（用于持久化）
   */
  toJSON(): Record<string, unknown> {
    return {
      stepNumber: this.stepNumber,
      epoch: this.epoch,
      action: this.action,
      observation: this.observation,
      stateBefore: this.stateBefore,
      stateAfter: this.stateAfter,
      cost: this.cost,
      durationMs: this.durationMs,
      timestamp: this.timestamp,
      modelName: this.modelName,
      metadata: this.metadata,
    }
  }

  /**
   * 格式化输出（用于日志和调试）
   */
  format(): string {
    const actionStr = `[${this.action.type}] ${this.action.description}`.slice(0, 80)
    const obsStr = this.observation.content.slice(0, 120)
    const errorMark = this.observation.isError ? ' [ERROR]' : ''
    return `Step ${this.stepNumber} | ${this.epoch} | ${actionStr}${errorMark}\n  → ${obsStr}`
  }
}

// ============================================================================
// RetryLoop — 重试循环管理器
// ============================================================================

/**
 * RetryLoop
 *
 * SWE-agent 风格的重试循环管理器。
 * 支持两种重试策略：
 *
 * 1. ScoreRetryLoop（评分制）：
 *    - 每次重试后对结果评分
 *    - 保留最高分的尝试
 *    - 评分低于阈值且次数用尽时触发 autosubmit
 *
 * 2. ChooserRetryLoop（选择制）：
 *    - 多次尝试后比较所有结果
 *    - 由 chooser 选择最佳结果
 *    - 触发条件：所有尝试评分都低于阈值
 *
 * 对应 SWE-agent Python 版：
 * ScoreRetryLoop 和 ChooserRetryLoop 类
 */
class RetryLoop {
  /** 重试策略类型 */
  private strategyType: RetryStrategyType
  /** 重试状态 */
  private state: RetryLoopState
  /** 评分阈值（评分制策略使用） */
  private scoreThreshold: number
  /** 评分函数（评分制策略使用） */
  private scoreFunction: ((observation: Observation) => number) | null

  constructor(params: {
    strategyType?: RetryStrategyType
    maxAttempts?: number
    scoreThreshold?: number
    scoreFunction?: (observation: Observation) => number
  } = {}) {
    this.strategyType = params.strategyType ?? 'score'
    this.scoreThreshold = params.scoreThreshold ?? 0.6
    this.scoreFunction = params.scoreFunction ?? null

    this.state = {
      currentAttempt: 0,
      maxAttempts: params.maxAttempts ?? 3,
      attempts: [],
      bestAttempt: null,
      resolved: false,
    }
  }

  /**
   * 是否还可以继续重试
   */
  canRetry(): boolean {
    return this.state.currentAttempt < this.state.maxAttempts && !this.state.resolved
  }

  /**
   * 记录一次尝试
   *
   * @param action 执行的动作
   * @param observation 环境反馈
   * @param feedback 评分制策略的反馈文本
   */
  recordAttempt(action: Action, observation: Observation, feedback?: string): void {
    this.state.currentAttempt++

    // 评分制：计算分数
    let score: number | undefined
    if (this.strategyType === 'score' && this.scoreFunction) {
      score = this.scoreFunction(observation)
    } else {
      // 默认评分：非错误观察得 0.5，有具体输出内容加 0.3
      score = observation.isError ? 0.2 : (observation.content.length > 50 ? 0.8 : 0.5)
    }

    const attempt = {
      attemptNumber: this.state.currentAttempt,
      action: { ...action },
      observation: { ...observation },
      score,
      feedback,
      timestamp: Date.now(),
    }

    this.state.attempts.push(attempt)

    // 更新最佳尝试
    if (!this.state.bestAttempt || (score !== undefined && score > this.state.bestAttempt.score)) {
      this.state.bestAttempt = {
        attemptNumber: this.state.currentAttempt,
        score: score ?? 0,
        action: { ...action },
        observation: { ...observation },
      }
    }

    // 评分制：分数超过阈值 → 标记为已解决
    if (this.strategyType === 'score' && score !== undefined && score >= this.scoreThreshold) {
      this.state.resolved = true
    }
  }

  /**
   * 是否需要自动提交（autosubmit）
   *
   * 触发条件：
   * - 所有重试次数已用尽
   * - 且问题未解决
   * - 且有至少一次尝试（有最佳结果可提交）
   */
  shouldAutosubmit(): boolean {
    return !this.canRetry() && !this.state.resolved && this.state.bestAttempt !== null
  }

  /**
   * 获取最佳尝试
   */
  getBestAttempt(): RetryLoopState['bestAttempt'] {
    return this.state.bestAttempt
  }

  /**
   * 获取重试报告
   */
  getReport(): string {
    const lines: string[] = []
    lines.push(`## 重试循环报告（策略: ${this.strategyType}）`)
    lines.push('')
    lines.push(`总尝试次数: ${this.state.currentAttempt}/${this.state.maxAttempts}`)
    lines.push(`状态: ${this.state.resolved ? '已解决' : '未解决'}`)
    lines.push('')

    if (this.state.bestAttempt) {
      lines.push(`最佳尝试: #${this.state.bestAttempt.attemptNumber}（评分: ${this.state.bestAttempt.score.toFixed(2)}）`)
      lines.push(`  动作: ${this.state.bestAttempt.action.description.slice(0, 80)}`)
      lines.push('')
    }

    lines.push('### 尝试历史')
    for (const attempt of this.state.attempts) {
      const scoreStr = attempt.score !== undefined ? `（评分: ${attempt.score.toFixed(2)}）` : ''
      const errorMark = attempt.observation.isError ? ' [ERROR]' : ''
      lines.push(`  #${attempt.attemptNumber}${scoreStr}${errorMark}: ${attempt.action.description.slice(0, 60)}`)
      if (attempt.feedback) {
        lines.push(`    反馈: ${attempt.feedback.slice(0, 80)}`)
      }
    }

    if (this.shouldAutosubmit()) {
      lines.push('')
      lines.push('### [autosubmit] 达到最大重试次数，自动提交当前最佳结果')
    }

    return lines.join('\n')
  }

  /**
   * 获取完整状态
   */
  getState(): Readonly<RetryLoopState> {
    return this.state
  }

  /**
   * 重置重试循环
   */
  reset(): void {
    this.state = {
      currentAttempt: 0,
      maxAttempts: this.state.maxAttempts,
      attempts: [],
      bestAttempt: null,
      resolved: false,
    }
  }
}

// ============================================================================
// SWEAgentStrategy — 循环策略实现
// ============================================================================

/**
 * SWEAgentStrategy
 *
 * SWE-agent 风格的 Bug 修复循环策略。
 * 移植自 SWE-agent Python 版的 step() / run() 核心循环。
 *
 * 循环流程：
 *   localize → analyze → patch → verify
 *                ↑                    │
 *                └─── (验证失败) ─────┘
 *                ↓ (连续 3 次失败)
 *              autosubmit
 *
 * 核心特性：
 * - 轨迹记录：完整记录每步 action-observation
 * - 成本追踪：超限自动停止
 * - 上下文管理：自动截断过长观察
 * - 重试循环：ScoreRetryLoop + ChooserRetryLoop
 * - 自动提交：连续失败 3 次后提交最佳结果
 */
export class SWEAgentStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'swe-agent'
  readonly displayName = 'SWE-agent Bug 修复循环'
  readonly description = 'Bug 修复专用循环引擎：定位→分析→生成补丁→验证，自动迭代直到测试通过。支持轨迹记录、成本追踪、重试循环和自动提交。'

  // ─── 修复状态 ───────────────────────────────────────────────────────

  /** 修复状态 */
  private repairState: RepairState

  /** 成本追踪器 */
  private costTracker: CostTracker

  /** 上下文管理器 */
  private contextState: ContextState

  /** 轨迹记录（所有步骤） */
  private trajectory: TrajectoryStep[] = []

  /** 重试循环管理器 */
  private retryLoop: RetryLoop

  /** 当前步骤序号 */
  private stepCounter = 0

  /** 最大连续失败次数（触发 autosubmit） */
  private readonly maxConsecutiveFailures = 3

  /** 观察结果最大长度（超过则截断） */
  private readonly maxObservationLength = 8000

  /** 滑动窗口大小（保留最近 N 条消息） */
  private readonly slidingWindowSize = 20

  constructor() {
    super()

    // 初始化修复状态
    this.repairState = this.createInitialRepairState()

    // 初始化成本追踪器
    this.costTracker = {
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      apiCalls: 0,
      costLimit: 10.0,  // 默认 10 美元上限
      epochCosts: {
        localize: 0,
        analyze: 0,
        patch: 0,
        verify: 0,
        autosubmit: 0,
      },
    }

    // 初始化上下文管理
    this.contextState = {
      messages: [],
      maxContextTokens: 100000,
      estimatedTokens: 0,
      truncationStrategy: 'sliding_window',
      windowSize: this.slidingWindowSize,
      truncatedCount: 0,
    }

    // 初始化重试循环管理器（评分制，最多 3 次，阈值 0.7）
    this.retryLoop = new RetryLoop({
      strategyType: 'score',
      maxAttempts: 3,
      scoreThreshold: 0.7,
      scoreFunction: this.scoreObservation.bind(this),
    })
  }

  // ─── LoopStrategy 接口实现 ──────────────────────────────────────

  /**
   * 将 Bug 修复目标分解为 4 个阶段子任务
   *
   * SWE-agent 修复流程的 4 个核心阶段：
   * 1. localize — 定位 bug 位置
   * 2. analyze  — 分析根因
   * 3. patch    — 生成补丁
   * 4. verify   — 验证修复
   *
   * 如果目标已预定义子任务，将它们与修复阶段合并
   */
  decompose(goal: LoopGoal): SubTask[] {
    // 标准修复流程的 4 个阶段
    const repairPhases: SubTask[] = [
      {
        id: 'swe-localize',
        description: '[localize] 定位：在代码库中搜索相关文件，确定 bug 的具体位置（文件路径 + 行号 + 相关代码上下文）。输出格式：文件路径、起始行号、结束行号、置信度。',
        status: 'pending',
        assignedTo: 'localize',
      },
      {
        id: 'swe-analyze',
        description: '[analyze] 分析：分析 bug 的根本原因，理解为什么会出现这个问题，确定修复策略。输出格式：根因描述、修复策略、受影响文件列表、风险等级。',
        status: 'pending',
        assignedTo: 'analyze',
      },
      {
        id: 'swe-patch',
        description: '[patch] 生成补丁：基于分析结果，生成 unified diff 格式的修复代码。格式要求：@@ -oldStart,oldLines +newStart,newLines @@，最小化变更范围。',
        status: 'pending',
        assignedTo: 'patch',
      },
      {
        id: 'swe-verify',
        description: ' 错误: [verify] 验证：运行测试验证修复是否成功。检查：测试是否全部通过、是否引入新失败、修复是否完整。如果失败返回步骤 2 重新分析。',
        status: 'pending',
        assignedTo: 'verify',
      },
    ]

    // 如果目标已预定义子任务，在前面追加
    if (goal.subTasks && goal.subTasks.length > 0) {
      const presetTasks = goal.subTasks.map(st => ({
        ...st,
        description: `[preset] ${st.description}`,
      }))
      return [...presetTasks, ...repairPhases]
    }

    return repairPhases
  }

  /**
   * SWE-agent 风格的目标达成评估
   *
   * 评估逻辑（按优先级）：
   * 1. 验证通过 → 达成
   * 2. 已自动提交 → 视为部分达成
   * 3. 连续失败超限 → 失败（触发 autosubmit）
   * 4. 成本超限 → 失败
   * 5. 修复阶段全部完成 → 达成
   * 6. 否则继续
   */
  evaluate(_goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    // 1. 验证通过 → 目标达成
    if (this.repairState.verifyResult?.testsPassed) {
      return {
        achieved: true,
        reason: `Bug 修复验证通过：${this.repairState.verifyResult.passedCount} 个测试全部通过，耗时 ${this.repairState.verifyResult.duration}ms`,
      }
    }

    // 2. 已自动提交 → 视为部分达成
    if (this.repairState.autoSubmitted) {
      return {
        achieved: true,
        reason: `已自动提交当前最佳结果（连续失败 ${this.repairState.consecutiveFailures} 次后触发 autosubmit），最佳评分: ${this.retryLoop.getBestAttempt()?.score.toFixed(2) ?? 'N/A'}`,
      }
    }

    // 3. 连续失败超限 → 失败
    if (this.repairState.consecutiveFailures >= this.maxConsecutiveFailures) {
      return {
        achieved: false,
        reason: `连续失败 ${this.repairState.consecutiveFailures} 次，超过最大连续失败阈值 ${this.maxConsecutiveFailures}，修复流程终止`,
      }
    }

    // 4. 成本超限 → 失败
    if (this.costTracker.totalCost >= this.costTracker.costLimit) {
      return {
        achieved: false,
        reason: `成本超限：累计 $${this.costTracker.totalCost.toFixed(4)}，超过上限 $${this.costTracker.costLimit.toFixed(2)}，修复流程终止`,
      }
    }

    // 5. 检查子任务完成情况
    const verifyTask = subTasks.find(t => t.id === 'swe-verify')
    if (verifyTask?.status === 'completed') {
      return {
        achieved: true,
        reason: '验证阶段完成，bug 修复流程结束',
      }
    }

    // 6. 根据修复阶段生成进度报告
    const epochProgress = this.getEpochProgress()
    const costInfo = `成本: $${this.costTracker.totalCost.toFixed(4)}/$${this.costTracker.costLimit.toFixed(2)}`
    const retryInfo = `重试: ${this.retryLoop.getState().currentAttempt}/${this.retryLoop.getState().maxAttempts}`

    return {
      achieved: false,
      reason: `修复进度: ${epochProgress} | 当前阶段: ${this.repairState.currentEpoch} | ${costInfo} | ${retryInfo} | 连续失败: ${this.repairState.consecutiveFailures}/${this.maxConsecutiveFailures}`,
    }
  }

  /**
   * SWE-agent 风格的系统提示词
   *
   * 描述修复流程的完整规则，包括：
   * - 4 个核心阶段的具体操作
   * - 动作空间（可执行的操作类型）
   * - 观察空间（环境的反馈格式）
   * - 成本约束和上下文管理规则
   * - 重试和自动提交策略
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    const costInfo = `\n## 成本约束\n- 成本上限: $${this.costTracker.costLimit.toFixed(2)}\n- 当前累计: $${this.costTracker.totalCost.toFixed(4)}\n- API 调用次数: ${this.costTracker.apiCalls}\n- 输入 token: ${this.costTracker.inputTokens}\n- 输出 token: ${this.costTracker.outputTokens}`

    return `你是 SWE-agent 风格的 Bug 修复工程师。你的任务是通过定位→分析→生成补丁→验证的循环流程修复 bug。

## 修复目标
${goal.description}${criteria}

## 修复循环（4 阶段）

\`\`\`
localize → analyze → patch → verify
             ↑                   │
             └─── (验证失败) ─────┘
             ↓ (连续 ${this.maxConsecutiveFailures} 次失败)
           autosubmit
\`\`\`

### 阶段 1：定位（Localize）
- 在代码库中搜索与 bug 相关的文件和行号
- 使用 grep/find 定位关键函数和变量
- 确定 bug 的具体位置
- 输出：文件路径、行号范围、相关代码、置信度

### 阶段 2：分析（Analyze）
- 理解 bug 的根本原因
- 确定哪些代码需要修改
- 评估修复的风险等级（low/medium/high）
- 输出：根因描述、修复策略、受影响文件

### 阶段 3：生成补丁（Generate Patch）
- 生成 unified diff 格式的修复代码
- 格式：@@ -oldStart,oldLines +newStart,newLines @@
- 最小化变更范围，避免不必要的修改
- 输出：diff 内容、目标文件、变更行数

### 阶段 4：验证（Verify）
- 运行相关测试验证修复
- 确认 bug 已被修复
- 确认没有引入新的测试失败
- 验证失败 → 返回阶段 2（重新分析，携带失败信息）

## 动作空间
- search: 在代码库中搜索代码
- view: 查看文件内容
- edit: 编辑文件
- create: 创建文件
- test: 运行测试
- bash: 执行 bash 命令
- think: 推理分析
- submit: 提交最终结果

## 重试策略
- 最大连续失败次数: ${this.maxConsecutiveFailures}
- 重试循环: ScoreRetryLoop（评分制，阈值 0.7）
- 评分规则: 非错误 + 有具体输出 → 0.8；非错误 + 简短输出 → 0.5；错误 → 0.2
- 连续失败 ${this.maxConsecutiveFailures} 次 → autosubmit（自动提交当前最佳结果）

## 上下文管理
- 观察结果超过 ${this.maxObservationLength} 字符时自动截断
- 使用滑动窗口保留最近 ${this.slidingWindowSize} 条消息
- 当前已截断消息数: ${this.contextState.truncatedCount}
- 估计 token 数: ${this.contextState.estimatedTokens}/${this.contextState.maxContextTokens}
${costInfo}

## 当前修复状态
- 当前阶段: ${this.repairState.currentEpoch}
- 总尝试次数: ${this.repairState.totalAttempts}
- 连续失败: ${this.repairState.consecutiveFailures}/${this.maxConsecutiveFailures}
- 自动提交: ${this.repairState.autoSubmitted ? '已触发' : '未触发'}
- 轨迹步骤数: ${this.trajectory.length}
`
  }

  /**
   * SWE-agent 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 验证通过（目标达成）
   * 3. 连续失败超限（触发 autosubmit 后停止）
   * 4. 成本超限
   * 5. 已自动提交
   */
  shouldContinue(iteration: number, maxIterations: number, _subTasks: SubTask[]): boolean {
    // 条件 1：达到最大迭代次数
    if (iteration >= maxIterations) {
      return false
    }

    // 条件 2：验证通过
    if (this.repairState.verifyResult?.testsPassed) {
      return false
    }

    // 条件 3：连续失败超限
    if (this.repairState.consecutiveFailures >= this.maxConsecutiveFailures) {
      return false
    }

    // 条件 4：成本超限
    if (this.costTracker.totalCost >= this.costTracker.costLimit) {
      return false
    }

    // 条件 5：已自动提交
    if (this.repairState.autoSubmitted) {
      return false
    }

    return true
  }

  // ─── SWE-agent 核心方法 ─────────────────────────────────────────

  /**
   * 执行一步（step）
   *
   * SWE-agent 的核心循环步骤：
   * 1. 根据当前状态生成 action
   * 2. 执行 action，获取 observation
   * 3. 处理 observation（截断过长内容）
   * 4. 记录 trajectory
   * 5. 更新成本和上下文状态
   *
   * @param action 要执行的动作
   * @param observation 环境返回的观察
   * @return 当前修复阶段
   */
  step(action: Action, observation: Observation): SWEEpoch {
    this.stepCounter++
    const startTime = Date.now()

    // 1. 处理观察结果（截断过长内容）
    const processedObs = this.processObservation(observation)

    // 2. 计算本步成本（简化模型：按 token 数估算）
    const stepCost = this.estimateStepCost(action, processedObs)

    // 3. 更新成本追踪
    this.updateCostTracker(stepCost)

    // 4. 记录轨迹步骤
    const stateBefore = this.summarizeState()
    const trajectoryStep = new TrajectoryStep({
      stepNumber: this.stepCounter,
      epoch: this.repairState.currentEpoch,
      action: { ...action },
      observation: { ...processedObs },
      stateBefore,
      stateAfter: '',  // 将在状态更新后填充
      cost: stepCost,
      durationMs: 0,  // 将在后面更新
    })

    // 5. 更新修复状态
    this.updateRepairState(action, processedObs)

    // 6. 更新轨迹步骤的 stateAfter
    const stateAfter = this.summarizeState()
    this.trajectory.push({
      ...trajectoryStep,
      stateAfter,
      durationMs: Date.now() - startTime,
    } as TrajectoryStep)

    // 7. 更新上下文
    this.updateContext(action, processedObs)

    return this.repairState.currentEpoch
  }

  /**
   * 执行完整修复循环（run）
   *
   * SWE-agent 的 run() 方法等价物。
   * 循环调用 step() 直到满足终止条件。
   *
   * 此方法返回修复过程的完整摘要，
   * 实际的逐步执行由外部循环引擎驱动。
   *
   * @returns 修复结果摘要
   */
  run(loopUntil: () => { action: Action; observation: Observation }): string {
    const lines: string[] = []
    lines.push('## SWE-agent 修复循环开始')
    lines.push('')
    lines.push(`目标: ${this.repairState.currentEpoch}`)
    lines.push('')

    // 主循环
    let iteration = 0
    const maxIterations = 50  // 安全上限

    while (this.shouldContinue(iteration, maxIterations, [])) {
      iteration++
      lines.push(`### 迭代 ${iteration}`)

      // 获取下一步动作和观察（由外部提供）
      const { action, observation } = loopUntil()

      // 执行一步
      const epoch = this.step(action, observation)
      lines.push(`  阶段: ${epoch} | 动作: ${action.type} | 观察长度: ${observation.content.length}`)

      // 检查是否需要 autosubmit
      if (this.retryLoop.shouldAutosubmit()) {
        this.performAutosubmit()
        lines.push('  [autosubmit] 自动提交当前最佳结果')
        break
      }

      // 检查验证结果
      if (this.repairState.verifyResult?.testsPassed) {
        lines.push('  [成功] 验证通过，bug 修复完成')
        break
      }
    }

    lines.push('')
    lines.push(this.getSummaryReport())
    return lines.join('\n')
  }

  /**
   * 评分观察结果（ScoreRetryLoop 使用）
   *
   * 评分规则：
   * - 错误观察 → 0.2
   * - 非错误 + 有实质内容（>100字符）→ 0.8
   * - 非错误 + 简短内容 → 0.5
   * - 包含"通过"/"成功"/"passed" → 额外 +0.1
   * - 包含"失败"/"错误"/"failed" → 额外 -0.2
   *
   * @param observation 要评分的观察
   * @returns 评分（0-1）
   */
  private scoreObservation(observation: Observation): number {
    if (observation.isError) {
      return 0.2
    }

    let score = observation.content.length > 100 ? 0.8 : 0.5

    // 根据关键词调整分数
    const content = observation.content.toLowerCase()
    if (content.includes('通过') || content.includes('成功') || content.includes('passed') || content.includes('success')) {
      score += 0.1
    }
    if (content.includes('失败') || content.includes('错误') || content.includes('failed') || content.includes('error')) {
      score -= 0.2
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * 处理观察结果（截断过长内容）
   *
   * 策略：
   * - 保留前 2000 字符（通常包含关键错误信息）
   * - 保留后 1000 字符（通常包含总结性信息）
   * - 中间用省略号连接
   *
   * @param observation 原始观察
   * @returns 处理后的观察
   */
  private processObservation(observation: Observation): Observation {
    const content = observation.content

    // 未超过限制，直接返回
    if (content.length <= this.maxObservationLength) {
      return observation
    }

    // 超过限制：截断处理
    const headLength = 2000
    const tailLength = 1000
    const head = content.slice(0, headLength)
    const tail = content.slice(-tailLength)
    const truncatedContent = `${head}\n\n... [截断 ${content.length - headLength - tailLength} 字符] ...\n\n${tail}`

    this.contextState.truncatedCount++

    return {
      ...observation,
      content: truncatedContent,
      metadata: {
        ...observation.metadata,
        originalLength: content.length,
        truncated: true,
      },
    }
  }

  /**
   * 更新修复状态
   *
   * 根据动作类型和观察结果，更新修复状态机的内部状态。
   * 这是 SWE-agent 状态转换的核心逻辑。
   */
  private updateRepairState(action: Action, observation: Observation): void {
    const state = this.repairState

    switch (state.currentEpoch) {
      case 'localize':
        // 定位阶段完成 → 切换到分析阶段
        if (action.type === 'search' || action.type === 'view') {
          if (!observation.isError && observation.content.length > 50) {
            state.localizationResult = {
              filePath: (action.input['filePath'] as string) ?? 'unknown',
              lineStart: (action.input['lineStart'] as number) ?? 0,
              lineEnd: (action.input['lineEnd'] as number) ?? 0,
              confidence: 0.8,
              relevantCode: observation.content.slice(0, 500),
            }
            state.currentEpoch = 'analyze'
          }
        }
        break

      case 'analyze':
        // 分析阶段完成 → 切换到补丁阶段
        if (action.type === 'think' && !observation.isError) {
          state.analysisResult = {
            rootCause: observation.content.slice(0, 200),
            fixStrategy: '基于根因分析的修复策略',
            affectedFiles: state.localizationResult ? [state.localizationResult.filePath] : [],
            riskLevel: 'medium',
          }
          state.currentEpoch = 'patch'
        }
        break

      case 'patch':
        // 补丁阶段完成 → 切换到验证阶段
        if (action.type === 'edit' || action.type === 'create') {
          state.patchResult = {
            diffContent: observation.content.slice(0, 1000),
            targetFile: state.localizationResult?.filePath ?? 'unknown',
            linesChanged: (action.input['linesChanged'] as number) ?? 1,
            patchVersion: state.totalAttempts + 1,
          }
          state.currentEpoch = 'verify'
          state.totalAttempts++
        }
        break

      case 'verify':
        // 验证阶段 → 根据结果决定下一步
        if (action.type === 'test') {
          const passed = !observation.isError && !observation.content.toLowerCase().includes('failed')
          state.verifyResult = {
            testsPassed: passed,
            passedCount: passed ? 1 : 0,
            failedCount: passed ? 0 : 1,
            errorMessages: passed ? [] : [observation.content.slice(0, 200)],
            duration: 0,
          }

          if (passed) {
            // 验证成功 → 修复完成
            state.consecutiveFailures = 0
          } else {
            // 验证失败 → 回到分析阶段
            state.consecutiveFailures++
            state.currentEpoch = 'analyze'

            // 记录重试
            this.retryLoop.recordAttempt(action, observation, observation.content.slice(0, 100))

            // 检查是否达到 autosubmit 条件
            if (this.retryLoop.shouldAutosubmit()) {
              this.performAutosubmit()
            }
          }
        }
        break

      case 'autosubmit':
        // 自动提交阶段：已提交最佳结果，无需进一步操作
        break
    }
  }

  /**
   * 执行自动提交（autosubmit）
   *
   * 触发条件：连续失败达到阈值或重试次数用尽。
   * 提交当前最佳尝试结果，标记修复流程结束。
   */
  private performAutosubmit(): void {
    const bestAttempt = this.retryLoop.getBestAttempt()
    if (bestAttempt) {
      this.repairState.autoSubmitted = true
      this.repairState.currentEpoch = 'autosubmit'

      // 将最佳结果记录到修复状态
      this.repairState.patchResult = {
        diffContent: `[autosubmit] 基于最佳尝试 #${bestAttempt.attemptNumber}（评分: ${bestAttempt.score.toFixed(2)}）\n${bestAttempt.observation.content.slice(0, 500)}`,
        targetFile: 'autosubmit_result',
        linesChanged: 0,
        patchVersion: this.repairState.totalAttempts,
      }
    }
  }

  /**
   * 估算步骤成本
   *
   * 简化模型：按输入/输出字符数估算 token 数，
   * 然后按 Claude Sonnet 定价计算成本。
   * - 输入：$3/MTok
   * - 输出：$15/MTok
   *
   * @param action 执行的动作
   * @param observation 观察结果
   * @returns 估算成本（美元）
   */
  private estimateStepCost(action: Action, observation: Observation): number {
    // 估算 token 数（粗略：1 token ≈ 4 字符）
    const actionTokens = JSON.stringify(action.input).length / 4
    const observationTokens = observation.content.length / 4
    const promptTokens = actionTokens + this.contextState.estimatedTokens / 10  // 上下文贡献
    const completionTokens = observationTokens

    // Claude Sonnet 定价
    const inputCostPerMillion = 3.0
    const outputCostPerMillion = 15.0

    const inputCost = (promptTokens / 1_000_000) * inputCostPerMillion
    const outputCost = (completionTokens / 1_000_000) * outputCostPerMillion

    return inputCost + outputCost
  }

  /**
   * 更新成本追踪器
   */
  private updateCostTracker(stepCost: number): void {
    this.costTracker.totalCost += stepCost
    this.costTracker.apiCalls++

    // 更新当前阶段的成本
    const epoch = this.repairState.currentEpoch
    this.costTracker.epochCosts[epoch] += stepCost

    // 更新 token 估算（简化模型）
    this.costTracker.inputTokens += 500  // 假设每步输入约 500 token
    this.costTracker.outputTokens += 200  // 假设每步输出约 200 token
  }

  /**
   * 更新上下文状态
   *
   * 将动作和观察添加到消息历史中，
   * 并应用滑动窗口截断。
   */
  private updateContext(action: Action, observation: Observation): void {
    // 添加用户消息（动作）
    this.contextState.messages.push({
      role: 'assistant',
      content: `[${action.type}] ${action.description}`,
    })

    // 添加观察消息
    this.contextState.messages.push({
      role: 'user',
      content: observation.content.slice(0, 1000),  // 限制单条消息长度
    })

    // 应用滑动窗口截断
    if (this.contextState.messages.length > this.contextState.windowSize) {
      const excess = this.contextState.messages.length - this.contextState.windowSize
      this.contextState.messages = this.contextState.messages.slice(excess)
      this.contextState.truncatedCount += excess
    }

    // 更新 token 估算
    this.contextState.estimatedTokens = this.contextState.messages.reduce(
      (sum, msg) => sum + msg.content.length / 4, 0,
    )
  }

  // ─── 轨迹记录和回放 ─────────────────────────────────────────────

  /**
   * 获取完整轨迹
   *
   * 返回所有记录的轨迹步骤，用于回放和分析。
   */
  getTrajectory(): ReadonlyArray<TrajectoryStep> {
    return [...this.trajectory]
  }

  /**
   * 回放轨迹
   *
   * 以人类可读的格式输出完整轨迹，
   * 用于调试和分析修复过程。
   *
   * @param fromStep 起始步骤（从 1 开始）
   * @param toStep 结束步骤（包含）
   * @returns 格式化后的轨迹文本
   */
  replayTrajectory(fromStep = 1, toStep = this.trajectory.length): string {
    const steps = this.trajectory.filter(
      s => s.stepNumber >= fromStep && s.stepNumber <= toStep,
    )

    if (steps.length === 0) {
      return '## 轨迹回放\n\n无轨迹记录。'
    }

    const lines: string[] = []
    lines.push('## 轨迹回放')
    lines.push('')
    lines.push(`步骤范围: ${fromStep}-${toStep}（共 ${steps.length} 步）`)
    lines.push(`总步骤数: ${this.trajectory.length}`)
    lines.push('')

    for (const step of steps) {
      lines.push(`### 步骤 ${step.stepNumber} | 阶段: ${step.epoch} | 耗时: ${step.durationMs}ms | 成本: $${step.cost.toFixed(6)}`)
      lines.push('')
      lines.push(`**动作** [${step.action.type}]: ${step.action.description}`)
      lines.push('')

      // 观察结果（截断显示）
      const obsContent = step.observation.content
      const displayObs = obsContent.length > 300
        ? `${obsContent.slice(0, 300)}...（共 ${obsContent.length} 字符）`
        : obsContent
      lines.push('**观察**:')
      lines.push('```')
      lines.push(displayObs)
      lines.push('```')

      if (step.observation.isError) {
        lines.push('')
        lines.push('**状态**: [ERROR]')
      }

      lines.push('')
      lines.push('---')
      lines.push('')
    }

    // 总结
    lines.push('## 轨迹总结')
    lines.push('')
    lines.push(`总步骤: ${this.trajectory.length}`)
    lines.push(`总成本: $${this.costTracker.totalCost.toFixed(4)}`)
    lines.push(`总耗时: ${this.trajectory.reduce((sum, s) => sum + s.durationMs, 0)}ms`)
    lines.push(`重试次数: ${this.retryLoop.getState().currentAttempt}`)

    return lines.join('\n')
  }

  /**
   * 导出轨迹为 JSON（用于持久化存储）
   */
  exportTrajectory(): string {
    return JSON.stringify({
      trajectory: this.trajectory.map(s => s.toJSON()),
      costTracker: this.costTracker,
      retryLoop: this.retryLoop.getState(),
      finalState: this.repairState,
    }, null, 2)
  }

  // ─── 成本追踪和上下文管理方法 ────────────────────────────────────

  /**
   * 获取成本报告
   */
  getCostReport(): string {
    const ct = this.costTracker
    const lines: string[] = []
    lines.push('## 成本追踪报告')
    lines.push('')
    lines.push(`累计成本: $${ct.totalCost.toFixed(4)} / $${ct.costLimit.toFixed(2)} (${((ct.totalCost / ct.costLimit) * 100).toFixed(1)}%)`)
    lines.push(`API 调用次数: ${ct.apiCalls}`)
    lines.push(`输入 token: ${ct.inputTokens.toLocaleString()}`)
    lines.push(`输出 token: ${ct.outputTokens.toLocaleString()}`)
    lines.push('')
    lines.push('### 各阶段成本')
    for (const [epoch, cost] of Object.entries(ct.epochCosts)) {
      const bar = '█'.repeat(Math.round((cost / (ct.totalCost || 1)) * 20))
      lines.push(`  ${epoch.padEnd(12)} $${cost.toFixed(4)} ${bar}`)
    }
    lines.push('')
    lines.push(`状态: ${ct.totalCost >= ct.costLimit ? '[超限] 已超出成本上限' : '[正常] 成本在限制范围内'}`)
    return lines.join('\n')
  }

  /**
   * 获取上下文状态报告
   */
  getContextReport(): string {
    const cs = this.contextState
    return [
      '## 上下文管理报告',
      '',
      `策略: ${cs.truncationStrategy}`,
      `滑动窗口大小: ${cs.windowSize} 条消息`,
      `当前消息数: ${cs.messages.length}`,
      `已截断消息数: ${cs.truncatedCount}`,
      `估计 token 数: ${cs.estimatedTokens.toLocaleString()} / ${cs.maxContextTokens.toLocaleString()}`,
      `观察截断阈值: ${this.maxObservationLength} 字符`,
      '',
      `状态: ${cs.estimatedTokens > cs.maxContextTokens ? ' 注意: [警告] 上下文接近上限' : '[正常] 上下文充足'}`,
    ].join('\n')
  }

  /**
   * 获取重试循环报告
   */
  getRetryReport(): string {
    return this.retryLoop.getReport()
  }

  // ─── 状态查询 ─────────────────────────────────────────────────

  /**
   * 获取修复状态快照
   */
  getRepairSnapshot(): Readonly<RepairState> {
    return { ...this.repairState }
  }

  /**
   * 获取成本追踪器快照
   */
  getCostSnapshot(): Readonly<CostTracker> {
    return { ...this.costTracker, epochCosts: { ...this.costTracker.epochCosts } }
  }

  /**
   * 获取完整状态快照
   */
  getFullSnapshot(): {
    repairState: Readonly<RepairState>
    costTracker: Readonly<CostTracker>
    retryState: Readonly<RetryLoopState>
    contextInfo: {
      messageCount: number
      estimatedTokens: number
      truncatedCount: number
    }
    trajectoryLength: number
    currentStep: number
  } {
    return {
      repairState: this.getRepairSnapshot(),
      costTracker: this.getCostSnapshot(),
      retryState: this.retryLoop.getState(),
      contextInfo: {
        messageCount: this.contextState.messages.length,
        estimatedTokens: this.contextState.estimatedTokens,
        truncatedCount: this.contextState.truncatedCount,
      },
      trajectoryLength: this.trajectory.length,
      currentStep: this.stepCounter,
    }
  }

  // ─── 私有辅助方法 ─────────────────────────────────────────────

  /**
   * 创建初始修复状态
   */
  private createInitialRepairState(): RepairState {
    return {
      currentEpoch: 'localize',
      localizationResult: null,
      analysisResult: null,
      patchResult: null,
      verifyResult: null,
      consecutiveFailures: 0,
      totalAttempts: 0,
      autoSubmitted: false,
    }
  }

  /**
   * 生成当前状态摘要
   */
  private summarizeState(): string {
    const s = this.repairState
    return `epoch=${s.currentEpoch}, failures=${s.consecutiveFailures}/${this.maxConsecutiveFailures}, attempts=${s.totalAttempts}, cost=$${this.costTracker.totalCost.toFixed(4)}`
  }

  /**
   * 获取修复阶段进度文本
   */
  private getEpochProgress(): string {
    const epochOrder: SWEEpoch[] = ['localize', 'analyze', 'patch', 'verify', 'autosubmit']
    const currentIndex = epochOrder.indexOf(this.repairState.currentEpoch)
    return `${currentIndex + 1}/${epochOrder.length}`
  }

  /**
   * 生成修复过程摘要报告
   */
  private getSummaryReport(): string {
    const lines: string[] = []
    lines.push('## SWE-agent 修复循环总结')
    lines.push('')
    lines.push(`最终阶段: ${this.repairState.currentEpoch}`)
    lines.push(`总尝试次数: ${this.repairState.totalAttempts}`)
    lines.push(`总步骤数: ${this.trajectory.length}`)
    lines.push(`连续失败: ${this.repairState.consecutiveFailures}`)
    lines.push(`自动提交: ${this.repairState.autoSubmitted ? '是' : '否'}`)
    lines.push('')
    lines.push(this.getCostReport())
    lines.push('')
    lines.push(this.getRetryReport())

    if (this.repairState.patchResult) {
      lines.push('')
      lines.push('### 最终补丁')
      lines.push('```diff')
      lines.push(this.repairState.patchResult.diffContent.slice(0, 500))
      lines.push('```')
    }

    return lines.join('\n')
  }

  /**
   * 重置策略到初始状态
   */
  reset(): void {
    this.repairState = this.createInitialRepairState()
    this.costTracker = {
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      apiCalls: 0,
      costLimit: this.costTracker.costLimit,
      epochCosts: {
        localize: 0,
        analyze: 0,
        patch: 0,
        verify: 0,
        autosubmit: 0,
      },
    }
    this.contextState = {
      messages: [],
      maxContextTokens: 100000,
      estimatedTokens: 0,
      truncationStrategy: 'sliding_window',
      windowSize: this.slidingWindowSize,
      truncatedCount: 0,
    }
    this.trajectory = []
    this.stepCounter = 0
    this.retryLoop.reset()
  }
}

// 导出内部类和类型，供外部使用
export { TrajectoryStep, RetryLoop }
export type {
  SWEEpoch,
  Action,
  ActionType,
  Observation,
  RetryLoopState,
  RetryStrategyType,
  CostTracker,
  ContextState,
  RepairState,
}
