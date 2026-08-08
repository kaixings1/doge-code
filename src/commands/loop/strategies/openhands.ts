/**
 * OpenHands 风格工程代理循环策略
 *
 * 移植自 OpenHands（https://github.com/All-Hands-AI/OpenHands）
 *
 * 核心架构：
 * - Plan Phase：分析需求，制定详细执行计划
 * - Execute Phase：按计划执行具体操作
 * - Verify Phase：验证执行结果是否符合预期
 * - Iterate Phase：验证失败则修改计划重新执行
 *
 * 三个核心角色：
 * 1. Planner - 分析任务、制定计划、评估可行性
 * 2. Executor - 执行计划、处理异常、报告进度
 * 3. Verifier - 验证结果、检测问题、提出改进
 *
 * 执行流程：
 *   1. Planner 分析目标，生成执行计划（步骤列表）
 *   2. Executor 按计划逐步执行
 *   3. Verifier 验证每步结果
 *   4. 验证通过 → 继续下一步
 *   5. 验证失败 → 回退到 Planner 重新计划
 *   6. 连续 2 次计划失败 → 终止
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

// ============================================================================
// 类型定义
// ============================================================================

/** OpenHands 三阶段标识 */
type OpenHandsPhase = 'plan' | 'execute' | 'verify'

/** 计划步骤状态 */
type PlanStepStatus = 'pending' | 'executed' | 'verified' | 'failed'

/**
 * PlanStep — 计划步骤
 *
 * OpenHands 风格：每个步骤是一个原子操作，
 * 包含具体动作、预期输出、实际输出和验证结果。
 */
class PlanStep {
  /** 步骤唯一标识 */
  readonly id: string
  /** 步骤序号（从 1 开始） */
  readonly index: number
  /** 具体操作描述 */
  action: string
  /** 预期输出（可验证的标准） */
  expectedOutcome: string
  /** 当前状态 */
  status: PlanStepStatus
  /** 实际执行结果 */
  executionResult?: string
  /** 验证反馈 */
  verificationResult?: string
  /** 创建时间 */
  readonly createdAt: number
  /** 执行时间 */
  executedAt?: number
  /** 验证时间 */
  verifiedAt?: number
  /** 重试次数 */
  retryCount: number
  /** 所属计划版本（每次重新计划时递增） */
  planVersion: number

  constructor(
    id: string,
    index: number,
    action: string,
    expectedOutcome: string,
    planVersion = 1,
  ) {
    this.id = id
    this.index = index
    this.action = action
    this.expectedOutcome = expectedOutcome
    this.status = 'pending'
    this.createdAt = Date.now()
    this.retryCount = 0
    this.planVersion = planVersion
  }

  /**
   * 标记步骤为已执行
   */
  markExecuted(result: string): void {
    this.executionResult = result
    this.status = 'executed'
    this.executedAt = Date.now()
  }

  /**
   * 标记步骤验证结果
   */
  markVerified(passed: boolean, feedback: string): void {
    this.verificationResult = feedback
    this.status = passed ? 'verified' : 'failed'
    this.verifiedAt = Date.now()
    if (!passed) {
      this.retryCount++
    }
  }

  /**
   * 重置步骤状态（重新计划时调用）
   */
  reset(newAction?: string, newExpectedOutcome?: string): void {
    if (newAction) this.action = newAction
    if (newExpectedOutcome) this.expectedOutcome = newExpectedOutcome
    this.status = 'pending'
    this.executionResult = undefined
    this.verificationResult = undefined
    this.executedAt = undefined
    this.verifiedAt = undefined
  }

  /**
   * 获取步骤摘要（用于日志和报告）
   */
  toString(): string {
    const statusMark = this.status === 'verified' ? '[通过]'
      : this.status === 'executed' ? '[执行]'
      : this.status === 'failed' ? '[失败]'
      : '[待办]'
    return `${this.index}. ${statusMark} ${this.action}`
  }
}

/** 验证轮次结果 */
interface VerificationRound {
  /** 轮次编号 */
  iteration: number
  /** 计划版本 */
  planVersion: number
  /** 被验证的步骤 ID */
  stepId: string
  /** 是否通过 */
  passed: boolean
  /** 验证反馈 */
  feedback: string
  /** 验证时间 */
  timestamp: number
}

/** Planner 角色状态 */
interface PlannerState {
  /** 当前计划版本（每次重新计划 +1） */
  currentPlanVersion: number
  /** 计划历史（每次计划的快照） */
  planHistory: Array<{ version: number; steps: string[]; timestamp: number; reason: string }>
  /** 连续计划失败次数 */
  consecutivePlanFailures: number
  /** 最大连续计划失败次数（终止条件） */
  maxPlanFailures: number
  /** 历史验证反馈（用于改进计划） */
  verificationFeedbackHistory: string[]
}

/** Executor 角色状态 */
interface ExecutorState {
  /** 当前执行步骤索引 */
  currentStepIndex: number
  /** 已完成步骤数 */
  completedSteps: number
  /** 执行历史 */
  executionLog: Array<{ stepId: string; action: string; result: string; timestamp: number }>
  /** 异常计数 */
  errorCount: number
  /** 最大连续异常数 */
  maxConsecutiveErrors: number
}

/** Verifier 角色状态 */
interface VerifierState {
  /** 验证轮次计数 */
  totalVerificationRounds: number
  /** 通过次数 */
  passCount: number
  /** 失败次数 */
  failCount: number
  /** 验证历史 */
  verificationHistory: VerificationRound[]
  /** 连续无改进验证轮次 */
  stagnationCount: number
  /** 最大连续无改进次数（终止条件） */
  maxStagnation: number
}

// ============================================================================
// OpenHands Strategy
// ============================================================================

/**
 * OpenHands 策略
 *
 * 三个核心角色协作的工程代理循环：
 * - Planner：分析任务、制定计划、评估可行性
 * - Executor：执行计划、处理异常、报告进度
 * - Verifier：验证结果、检测问题、提出改进
 *
 * 循环流程：
 *   plan → execute → verify
 *     ↑                  │
 *     └─── (迭代改进) ───┘
 *     ↓ (连续 2 次计划失败)
 *     plan（重新规划）
 */
export class OpenHandsStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'openhands'
  readonly displayName = 'OpenHands 工程代理循环'
  readonly description = '工程代理风格的计划-执行-验证循环。三个核心角色协作：Planner 制定计划、Executor 执行计划、Verifier 验证结果，失败则迭代改进。'

  /** 当前活跃阶段 */
  private currentPhase: OpenHandsPhase = 'plan'

  /** 任务计数器（生成唯一任务 id） */
  private taskCounter = 0

  /** 当前计划步骤列表 */
  private planSteps: PlanStep[] = []

  /** Planner 角色状态 */
  private plannerState: PlannerState

  /** Executor 角色状态 */
  private executorState: ExecutorState

  /** Verifier 角色状态 */
  private verifierState: VerifierState

  constructor() {
    super()

    this.plannerState = {
      currentPlanVersion: 0,
      planHistory: [],
      consecutivePlanFailures: 0,
      maxPlanFailures: 2,
      verificationFeedbackHistory: [],
    }

    this.executorState = {
      currentStepIndex: -1,
      completedSteps: 0,
      executionLog: [],
      errorCount: 0,
      maxConsecutiveErrors: 3,
    }

    this.verifierState = {
      totalVerificationRounds: 0,
      passCount: 0,
      failCount: 0,
      verificationHistory: [],
      stagnationCount: 0,
      maxStagnation: 2,
    }
  }

  /**
   * 将目标分解为可执行的子任务
   *
   * 真实执行模式：每次迭代返回一个执行任务，
   * 任务内容为完整目标（AI 直接执行创建文件）。
   * 循环通过 evaluate 验证结果，失败则生成新任务迭代改进。
   *
   * 如果目标已预定义子任务，直接使用它们。
   */
  decompose(goal: LoopGoal): SubTask[] {
    // 如果目标已预定义子任务，直接使用（真实可执行的子任务）
    if (goal.subTasks && goal.subTasks.length > 0) {
      return goal.subTasks.map(st => ({ ...st, status: 'pending' as const }))
    }

    this.taskCounter++
    const attempt = this.taskCounter

    // 智能分解：根据目标关键词生成多个可并行执行的子任务
    const smartTasks = smartDecompose(goal.description, attempt)

    // 如果智能分解出多个任务，直接使用（支持并行执行）
    if (smartTasks.length > 1) {
      return smartTasks.map(st => ({
        id: `openhands-task-${attempt}-${Date.now()}-${st.id}`,
        description: `执行子任务（属于目标：${goal.description.slice(0, 50)}）：\n${st.description}`,
        status: 'pending' as const,
      }))
    }

    // 否则返回单个执行任务（目标本身，带上迭代计数提示）
    const iterationHint = attempt > 1
      ? `\n\n注意：这是第 ${attempt} 次尝试执行。前一次执行未达到预期，请分析原因，采用不同方案重新生成并执行必要的 bash 命令（不要重复上次失败的方案）。`
      : ''

    return [
      {
        id: `openhands-task-${attempt}-${Date.now()}`,
        description: `执行以下目标，必须使用 bash 命令创建/修改实际文件：\n${goal.description}${iterationHint}`,
        status: 'pending',
      },
    ]
  }

  /**
   * OpenHands 风格的验证评估
   *
   * 基于实际执行结果判定，而非阶段状态：
   * 1. 检测连续失败停滞（达到阈值则停止）
   * 2. 仍有待执行任务（pending/running）→ 继续执行，不判定结果
   * 3. 所有任务已执行 → 聚合所有已完成任务的输出（而非仅最后一个任务）
   * 4. 验证是否创建了文件（output 中的 📁 标记）
   * 5. 验证成功标准是否满足（针对聚合输出）
   * 6. 失败则继续迭代（AI 重新执行改进）
   */
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    // 检测连续无进展（多次失败或未创建文件）
    const failedCount = subTasks.filter(t => t.status === 'failed').length
    if (failedCount >= this.verifierState.maxStagnation) {
      this.verifierState.stagnationCount++
      if (this.verifierState.stagnationCount >= this.verifierState.maxStagnation) {
        return {
          achieved: false,
          reason: `连续 ${this.verifierState.maxStagnation} 次执行未成功创建文件，停止迭代`,
        }
      }
    } else {
      this.verifierState.stagnationCount = 0
    }

    if (subTasks.length === 0) {
      return { achieved: false, reason: '尚未生成执行任务' }
    }

    // 仍有待执行任务（pending/running）→ 继续执行，暂不判定
    const completedCount = subTasks.filter(t => t.status === 'completed').length
    const pendingCount = subTasks.filter(t => t.status === 'pending' || t.status === 'running').length
    if (pendingCount > 0) {
      return {
        achieved: false,
        reason: `任务执行中，等待完成（已完成 ${completedCount}/${subTasks.length}）`,
      }
    }

    // 所有任务已执行完毕 → 聚合所有已完成任务的输出（避免只检查最后一个任务
    // 而漏掉实现类任务的产出，导致目标已达成却误判未达标而空转）
    const completedTasks = subTasks.filter(t => t.status === 'completed')
    const output = completedTasks.map(t => t.result ?? '').join('\n')

    // 检查是否创建了文件（输出含明确的文件创建标记，避免误判"未创建文件"）
    const filePatterns = [
      /📁\s*创建了\s*\d+\s*个文件/i,
      /created\s+\d+\s*files?/i,
      /成功写入文件|文件已成功创建/i,
      /^\s*(?:•|·|-)\s*[\w./-]+\.[\w]+/m,
    ]
    const hasFiles = filePatterns.some(p => p.test(output))

    // 检查成功标准
    if (goal.successCriteria && goal.successCriteria.length > 0) {
      const criteriaMet = goal.successCriteria.filter(c =>
        output.toLowerCase().includes(c.toLowerCase())
      ).length

      if (criteriaMet === goal.successCriteria.length && hasFiles) {
        return {
          achieved: true,
          reason: `执行成功：成功标准全部满足（${criteriaMet}/${goal.successCriteria.length}），文件已创建`,
        }
      }
      return {
        achieved: false,
        reason: `执行完成但未完全达标：成功标准满足 ${criteriaMet}/${goal.successCriteria.length}${hasFiles ? '' : '，且未检测到创建文件'}。继续迭代改进`,
      }
    }

    if (hasFiles) {
      return {
        achieved: true,
        reason: `执行成功：检测到文件已创建（第 ${subTasks.length} 次尝试）`,
      }
    }

    return {
      achieved: false,
      reason: `执行完成但未检测到文件创建。请确认已用 bash 命令实际创建文件，继续迭代（第 ${subTasks.length} 次尝试）`,
    }
  }

  /**
   * OpenHands 风格的系统提示词
   *
   * 描述三个角色的职责分工和协作方式，
   * 包含迭代改进策略和状态追踪规则
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    const planSection = this.planSteps.length > 0
      ? `\n\n## 当前计划（v${this.plannerState.currentPlanVersion}，${this.planSteps.length} 步）\n${this.planSteps.map((s) => {
          const statusMark = s.status === 'verified' ? '[通过]'
            : s.status === 'executed' ? '[执行]'
            : s.status === 'failed' ? '[失败]'
            : '[待办]'
          return `  ${s.index}. ${statusMark} ${s.action}\n     预期: ${s.expectedOutcome}${s.executionResult ? `\n     实际: ${s.executionResult.slice(0, 100)}` : ''}${s.verificationResult ? `\n     验证: ${s.verificationResult.slice(0, 80)}` : ''}`
        }).join('\n')}`
      : ''

    const recentFeedback = this.plannerState.verificationFeedbackHistory.slice(-3)
    const feedbackSection = recentFeedback.length > 0
      ? `\n\n## 历史验证反馈（Planner 制定新计划时参考）\n${recentFeedback.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`
      : ''

    return `你是 OpenHands 工程代理，由三个专业角色协作完成任务。

## 目标
${goal.description}${criteria}${planSection}${feedbackSection}

## 三个核心角色

### Planner（规划者）
- 分析目标的核心需求和约束条件
- 将目标分解为有序、可执行、可验证的步骤
- 为每个步骤定义明确的预期输出
- 根据 Verifier 的反馈改进计划
- 评估计划的可行性

### Executor（执行者）
- 严格按照 Plan 阶段的步骤顺序执行
- 每个步骤执行后记录实际输出
- 遇到异常时记录详细错误信息
- 不自行修改计划（计划修改由 verify 失败触发）
- 向 Verifier 报告执行结果

### Verifier（验证者）
- 逐一比对实际输出与预期输出
- 诚实评估：不将不满足的结果标记为通过
- 未通过时给出具体的改进建议
- 检测连续无改进（ stagnation 检测）
- 判断整体目标是否达成

## 工程代理循环

\`\`\`
Planner.plan() → Executor.execute() → Verifier.verify()
       ↑                                    │
       └─────────── (迭代改进) ──────────────┘
       ↓ (连续 ${this.plannerState.maxPlanFailures} 次计划失败)
       终止循环
\`\`\`

### 阶段 1：Plan（Planner 制定计划）
输出格式：
\`\`\`
步骤 1: <具体操作>
  预期输出: <可验证的结果描述>
步骤 2: <具体操作>
  预期输出: <可验证的结果描述>
\`\`\`

### 阶段 2：Execute（Executor 执行计划）
输出格式：
\`\`\`
步骤 1 执行结果: <实际输出>
步骤 2 执行结果: <实际输出>
\`\`\`

### 阶段 3：Verify（Verifier 验证结果）
输出格式：
\`\`\`
验证结果:
- 步骤 1: [通过/未通过] <理由>
- 步骤 2: [通过/未通过] <理由>
整体判定: [达成/未达成]
改进建议: <具体建议>
\`\`\`

## 迭代改进规则
1. Verifier 验证失败 → Planner 重新制定计划（保持已通过的步骤）
2. 新计划必须针对上次验证失败的具体原因进行改进
3. 连续 ${this.verifierState.maxStagnation} 轮验证无改进 → 终止（防止无效迭代）
4. 连续 ${this.plannerState.maxPlanFailures} 次计划失败 → 终止（Planner 无法找到有效方案）
5. Executor 连续 ${this.executorState.maxConsecutiveErrors} 次异常 → 终止（执行环境有问题）

## 当前状态
- 计划版本: v${this.plannerState.currentPlanVersion}
- 当前阶段: [${this.currentPhase}]
- 验证轮次: ${this.verifierState.totalVerificationRounds}
- 停滞计数: ${this.verifierState.stagnationCount}/${this.verifierState.maxStagnation}
- 计划失败计数: ${this.plannerState.consecutivePlanFailures}/${this.plannerState.maxPlanFailures}
`
  }

  /**
   * OpenHands 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 连续验证无改进达到上限（Verifier 终止）
   * 3. 连续计划失败达到上限（Planner 终止）
   * 4. 连续执行异常达到上限（Executor 终止）
   * 5. 所有步骤验证通过（目标达成）
   */
  shouldContinue(iteration: number, maxIterations: number, _subTasks: SubTask[]): boolean {
    // 条件 1：达到最大迭代次数
    if (iteration >= maxIterations) {
      return false
    }

    // 条件 2：连续验证无改进达到上限
    if (this.verifierState.stagnationCount >= this.verifierState.maxStagnation) {
      return false
    }

    // 条件 3：连续计划失败达到上限
    if (this.plannerState.consecutivePlanFailures >= this.plannerState.maxPlanFailures) {
      return false
    }

    // 条件 4：连续执行异常达到上限
    if (this.executorState.errorCount >= this.executorState.maxConsecutiveErrors) {
      return false
    }

    // 条件 5：所有步骤已验证通过（目标达成）
    if (this.planSteps.length > 0 && this.planSteps.every(s => s.status === 'verified')) {
      return false
    }

    return true
  }

  // ─── Planner 角色方法 ─────────────────────────────────────────

  /**
   * Planner：制定执行计划
   *
   * 分析目标并生成步骤列表。
   * 如果有历史验证反馈，会参考反馈改进计划。
   *
   * @param goal 原始目标
   * @param stepActions 步骤操作描述列表（由 AI 生成）
   * @param stepOutcomes 步骤预期输出列表（与操作一一对应）
   * @return 格式化的计划文本
   */
  plan(goal: LoopGoal, stepActions: string[], stepOutcomes: string[]): string {
    const newVersion = this.plannerState.currentPlanVersion + 1

    // 创建新的计划步骤
    const newSteps: PlanStep[] = stepActions.map((action, i) => {
      const outcome = stepOutcomes[i] ?? goal.successCriteria?.join('; ') ?? '完成要求'
      return new PlanStep(
        `plan-step-v${newVersion}-${i}`,
        i + 1,
        action,
        outcome,
        newVersion,
      )
    })

    // 保留之前版本中已验证通过的步骤，替换失败的步骤
    if (this.planSteps.length > 0 && newVersion > 1) {
      const verifiedSteps = this.planSteps.filter(s => s.status === 'verified')
      const failedSteps = this.planSteps.filter(s => s.status === 'failed')

      // 如果有已验证的步骤，保留它们并追加新步骤
      if (verifiedSteps.length > 0 && failedSteps.length > 0) {
        const mergedSteps = [...verifiedSteps]
        let nextIndex = verifiedSteps.length + 1

        for (const newStep of newSteps) {
          mergedSteps.push(new PlanStep(
            newStep.id,
            nextIndex++,
            newStep.action,
            newStep.expectedOutcome,
            newVersion,
          ))
        }

        this.planSteps = mergedSteps
      } else {
        this.planSteps = newSteps
      }
    } else {
      this.planSteps = newSteps
    }

    // 更新 Planner 状态
    this.plannerState.currentPlanVersion = newVersion
    this.plannerState.planHistory.push({
      version: newVersion,
      steps: this.planSteps.map(s => s.action),
      timestamp: Date.now(),
      reason: newVersion === 1 ? '初始计划' : `基于验证反馈改进（反馈: ${this.plannerState.verificationFeedbackHistory.slice(-1)[0] ?? '无'}）`,
    })

    // 切换阶段到 execute
    this.currentPhase = 'execute'
    this.executorState.currentStepIndex = this.planSteps.findIndex(s => s.status === 'pending')

    return this.formatPlanText()
  }

  /**
   * Planner：获取当前计划文本
   */
  getPlanText(): string {
    return this.formatPlanText()
  }

  // ─── Executor 角色方法 ────────────────────────────────────────

  /**
   * Executor：执行指定步骤
   *
   * @param stepId 要执行的步骤 ID
   * @param result 实际执行结果
   * @return 执行确认文本
   */
  executeStep(stepId: string, result: string): string {
    const step = this.planSteps.find(s => s.id === stepId)
    if (!step) {
      this.executorState.errorCount++
      return `Executor 错误: 未找到步骤 [${stepId}]，无法执行`
    }

    // 记录执行结果
    step.markExecuted(result)
    this.executorState.completedSteps++
    this.executorState.errorCount = 0  // 成功后重置异常计数
    this.executorState.executionLog.push({
      stepId,
      action: step.action,
      result,
      timestamp: Date.now(),
    })

    // 查找下一个待执行步骤
    const nextPending = this.planSteps.find(s => s.status === 'pending')

    if (nextPending) {
      this.executorState.currentStepIndex = this.planSteps.indexOf(nextPending)
      return `## Executor 执行完成: [${step.action.slice(0, 50)}]\n\n实际输出: ${result.slice(0, 300)}\n\n下一步: 执行步骤 ${nextPending.index} "${nextPending.action.slice(0, 50)}"`
    }

    // 所有步骤已执行，切换到验证阶段
    this.currentPhase = 'verify'
    return `## Executor 执行完成: [${step.action.slice(0, 50)}]\n\n实际输出: ${result.slice(0, 300)}\n\n所有步骤已执行完毕，切换到 Verifier 验证阶段`
  }

  /**
   * Executor：获取下一个待执行步骤
   */
  getNextPendingStep(): PlanStep | undefined {
    return this.planSteps.find(s => s.status === 'pending')
  }

  /**
   * Executor：获取执行日志
   */
  getExecutionLog(): ReadonlyArray<{ stepId: string; action: string; result: string; timestamp: number }> {
    return [...this.executorState.executionLog]
  }

  // ─── Verifier 角色方法 ────────────────────────────────────────

  /**
   * Verifier：验证步骤执行结果
   *
   * @param stepId 要验证的步骤 ID
   * @param passed 是否通过验证
   * @param feedback 验证反馈
   * @return 验证报告
   */
  verify(stepId: string, passed: boolean, feedback: string): string {
    const step = this.planSteps.find(s => s.id === stepId)
    if (!step) {
      return `Verifier 错误: 未找到步骤 [${stepId}]，无法验证`
    }

    // 更新步骤状态
    step.markVerified(passed, feedback)

    // 记录验证轮次
    this.verifierState.totalVerificationRounds++
    if (passed) {
      this.verifierState.passCount++
    } else {
      this.verifierState.failCount++
    }

    this.verifierState.verificationHistory.push({
      iteration: this.verifierState.totalVerificationRounds,
      planVersion: this.plannerState.currentPlanVersion,
      stepId,
      passed,
      feedback,
      timestamp: Date.now(),
    })

    // 更新停滞检测
    this.updateStagnationCount()

    // 更新 Planner 的反馈历史（用于下次重新计划）
    if (!passed) {
      this.plannerState.verificationFeedbackHistory.push(
        `步骤 [${step.action.slice(0, 40)}] 验证失败: ${feedback.slice(0, 100)}`
      )
      this.plannerState.consecutivePlanFailures++
    } else {
      this.plannerState.consecutivePlanFailures = 0
    }

    // 决定下一阶段
    if (passed) {
      this.currentPhase = 'execute'
    } else {
      this.currentPhase = 'plan'
    }

    return this.generateVerificationReport(step, passed, feedback)
  }

  /**
   * Verifier：批量验证所有已执行步骤
   *
   * @param results 验证结果列表
   * @return 完整验证报告
   */
  verifyAll(results: Array<{ stepId: string; passed: boolean; feedback: string }>): string {
    const reports: string[] = []
    let allPassed = true

    for (const { stepId, passed, feedback } of results) {
      const step = this.planSteps.find(s => s.id === stepId)
      if (!step) continue

      step.markVerified(passed, feedback)

      this.verifierState.totalVerificationRounds++
      if (passed) {
        this.verifierState.passCount++
      } else {
        this.verifierState.failCount++
        allPassed = false
        this.plannerState.verificationFeedbackHistory.push(
          `步骤 [${step.action.slice(0, 40)}] 验证失败: ${feedback.slice(0, 100)}`
        )
      }

      this.verifierState.verificationHistory.push({
        iteration: this.verifierState.totalVerificationRounds,
        planVersion: this.plannerState.currentPlanVersion,
        stepId,
        passed,
        feedback,
        timestamp: Date.now(),
      })
    }

    this.updateStagnationCount()

    if (!allPassed) {
      this.plannerState.consecutivePlanFailures++
      this.currentPhase = 'plan'
    } else {
      this.plannerState.consecutivePlanFailures = 0
      this.currentPhase = 'execute'
    }

    return this.generateBatchVerificationReport()
  }

  /**
   * Verifier：获取验证历史
   */
  getVerificationHistory(): ReadonlyArray<VerificationRound> {
    return [...this.verifierState.verificationHistory]
  }

  // ─── 状态查询 ─────────────────────────────────────────────────

  /**
   * 获取完整状态快照
   *
   * 包含三个角色的状态和计划信息
   */
  getStateSnapshot(): {
    currentPhase: OpenHandsPhase
    planVersion: number
    totalSteps: number
    pendingSteps: number
    executedSteps: number
    verifiedSteps: number
    failedSteps: number
    verificationRounds: number
    stagnationCount: number
    planFailureCount: number
    errorCount: number
  } {
    return {
      currentPhase: this.currentPhase,
      planVersion: this.plannerState.currentPlanVersion,
      totalSteps: this.planSteps.length,
      pendingSteps: this.planSteps.filter(s => s.status === 'pending').length,
      executedSteps: this.planSteps.filter(s => s.status === 'executed').length,
      verifiedSteps: this.planSteps.filter(s => s.status === 'verified').length,
      failedSteps: this.planSteps.filter(s => s.status === 'failed').length,
      verificationRounds: this.verifierState.totalVerificationRounds,
      stagnationCount: this.verifierState.stagnationCount,
      planFailureCount: this.plannerState.consecutivePlanFailures,
      errorCount: this.executorState.errorCount,
    }
  }

  /**
   * 重置策略到初始状态
   */
  reset(): void {
    this.currentPhase = 'plan'
    this.planSteps = []

    this.plannerState = {
      currentPlanVersion: 0,
      planHistory: [],
      consecutivePlanFailures: 0,
      maxPlanFailures: 2,
      verificationFeedbackHistory: [],
    }

    this.executorState = {
      currentStepIndex: -1,
      completedSteps: 0,
      executionLog: [],
      errorCount: 0,
      maxConsecutiveErrors: 3,
    }

    this.verifierState = {
      totalVerificationRounds: 0,
      passCount: 0,
      failCount: 0,
      verificationHistory: [],
      stagnationCount: 0,
      maxStagnation: 2,
    }
  }

  // ─── 私有辅助方法 ─────────────────────────────────────────────

  /**
   * 格式化计划文本
   */
  private formatPlanText(): string {
    const lines: string[] = []
    lines.push(`## 执行计划（v${this.plannerState.currentPlanVersion}，${this.planSteps.length} 步）`)
    lines.push('')

    for (const step of this.planSteps) {
      const statusMark = step.status === 'verified' ? '[通过]'
        : step.status === 'executed' ? '[执行]'
        : step.status === 'failed' ? '[失败]'
        : '[待办]'
      lines.push(`${step.index}. ${statusMark} ${step.action}`)
      lines.push(`   预期输出: ${step.expectedOutcome}`)
    }

    lines.push('')
    const nextStep = this.planSteps.find(s => s.status === 'pending')
    lines.push(nextStep ? `下一步：执行步骤 ${nextStep.index}` : '所有步骤已执行，准备验证')

    return lines.join('\n')
  }

  /**
   * 生成单个步骤的验证报告
   */
  private generateVerificationReport(step: PlanStep, passed: boolean, feedback: string): string {
    const statusMark = passed ? '通过' : '未通过'
    const nextAction = passed
      ? (this.planSteps.some(s => s.status === 'pending')
        ? 'Executor: 继续执行下一个步骤'
        : 'Verifier: 所有步骤已执行，准备整体验证')
      : 'Planner: 需要重新制定计划，改进步骤的执行方案'

    return `## Verifier 验证结果: [${step.action.slice(0, 50)}]

状态: ${statusMark}
预期输出: ${step.expectedOutcome}
实际输出: ${step.executionResult?.slice(0, 200) ?? '无'}
验证反馈: ${feedback}
下一步: ${nextAction}
停滞计数: ${this.verifierState.stagnationCount}/${this.verifierState.maxStagnation}`
  }

  /**
   * 生成批量验证报告
   */
  private generateBatchVerificationReport(): string {
    const total = this.planSteps.length
    const verified = this.planSteps.filter(s => s.status === 'verified').length
    const failed = this.planSteps.filter(s => s.status === 'failed').length
    const pending = this.planSteps.filter(s => s.status === 'pending').length

    const failedSteps = this.planSteps
      .filter(s => s.status === 'failed')
      .map(s => `  - [${s.id}] ${s.action}: ${s.verificationResult?.slice(0, 100) ?? '未知原因'}`)
      .join('\n')

    const overallVerdict = failed === 0
      ? '全部通过 — 目标达成'
      : this.verifierState.stagnationCount >= this.verifierState.maxStagnation
        ? '停滞检测触发 — 终止循环'
        : '部分未通过 — Planner 需要迭代改进'

    return `## Verifier 批量验证报告

总计: ${total} 步 | 通过: ${verified} | 未通过: ${failed} | 未执行: ${pending}

${failedSteps ? `### 失败步骤\n${failedSteps}` : '### 所有步骤验证通过'}

### 判定: ${overallVerdict}
### 停滞计数: ${this.verifierState.stagnationCount}/${this.verifierState.maxStagnation}
### 下一阶段: ${this.currentPhase === 'plan' ? 'Planner 重新制定计划' : this.currentPhase === 'execute' ? 'Executor 继续执行' : 'Verifier 继续验证'}`
  }

  /**
   * 更新停滞计数
   *
   * 检测逻辑：比较最近两轮验证结果
   * - 如果连续两轮验证失败的步骤完全相同（无改进）→ 停滞计数 +1
   * - 如果有改进（不同的失败步骤，或失败步骤减少）→ 重置停滞计数
   */
  private updateStagnationCount(): void {
    const lastRound = this.verifierState.verificationHistory[this.verifierState.verificationHistory.length - 1]
    const prevRound = this.verifierState.verificationHistory[this.verifierState.verificationHistory.length - 2]

    if (!lastRound) return

    if (lastRound.passed) {
      // 最近验证通过，重置停滞
      this.verifierState.stagnationCount = 0
      return
    }

    if (prevRound && !lastRound.passed && !prevRound.passed) {
      if (lastRound.stepId === prevRound.stepId) {
        // 同一个步骤连续失败 → 停滞
        this.verifierState.stagnationCount++
      } else {
        // 不同步骤失败 → 在尝试不同方向，不算停滞
        this.verifierState.stagnationCount = 0
      }
    } else if (!prevRound || prevRound.passed) {
      // 只有一轮失败，尚未形成停滞
      // 不增加停滞计数
    }
  }
}

// ============================================================================
// 智能目标分解 — 根据目标关键词生成多个可并行执行的子任务
// ============================================================================

interface SmartTask {
  id: string
  description: string
}

function smartDecompose(goal: string, attempt: number): SmartTask[] {
  const g = goal.toLowerCase()

  // 根据关键词匹配任务类型模板
  const templates: Array<{ keywords: string[]; tasks: string[] }> = [
    {
      // Web 服务器/API
      keywords: ['服务器', 'server', 'api', 'http', 'web', '网页', '网站'],
      tasks: [
        `创建项目基础结构（package.json、目录结构）`,
        `实现核心功能代码（服务器/API 主文件）`,
        `创建配置文件和依赖声明`,
        `添加 README 说明文档`,
      ],
    },
    {
      // CLI 工具
      keywords: ['cli', '命令行', '工具', 'command', 'terminal'],
      tasks: [
        `创建入口文件（bin/主脚本）`,
        `实现命令解析和核心逻辑`,
        `添加依赖声明（package.json）`,
        `编写使用说明文档`,
      ],
    },
    {
      // 前端/React
      keywords: ['react', '前端', 'component', '页面', 'ui', '界面'],
      tasks: [
        `创建组件目录结构和入口文件`,
        `实现 UI 组件和样式`,
        `创建构建配置（vite/webpack）`,
        `添加项目依赖声明`,
      ],
    },
    {
      // 脚本/自动化
      keywords: ['脚本', 'script', '自动化', '批处理', '定时'],
      tasks: [
        `编写主脚本文件`,
        `创建配置（如 .env 模板、配置文件）`,
        `添加执行说明文档`,
      ],
    },
    {
      // 测试
      keywords: ['测试', 'test', '单元测试', '覆盖率'],
      tasks: [
        `创建测试文件（针对核心功能）`,
        `添加测试框架配置`,
        `编写测试用例`,
      ],
    },
    {
      // 数据/数据库
      keywords: ['数据', 'data', '数据库', 'database', 'sql', 'json', 'csv'],
      tasks: [
        `创建数据模型/结构定义`,
        `实现数据处理逻辑`,
        `创建示例数据文件`,
      ],
    },
    {
      // 重构/优化
      keywords: ['重构', 'refactor', '优化', '优化代码', '清理'],
      tasks: [
        `分析现有代码结构`,
        `实施重构/优化修改`,
        `验证修改后的代码（运行 lint/build）`,
      ],
    },
  ]

  // 匹配关键词
  for (const template of templates) {
    if (template.keywords.some(k => g.includes(k))) {
      // 尝试次数 > 1 时，合并为单任务（避免重复拆分导致循环退化）
      if (attempt > 1) return []
      return template.tasks.map((t, i) => ({ id: `st-${i}`, description: t }))
    }
  }

  return []
}

// 导出 PlanStep 类，供外部使用
export { PlanStep }
export type { VerificationRound, PlannerState, ExecutorState, VerifierState, PlanStepStatus }
