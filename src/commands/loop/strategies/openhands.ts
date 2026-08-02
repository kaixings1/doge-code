/**
 * OpenHands 风格工程代理循环策略
 *
 * 核心概念：
 * - 计划（Plan）：先制定详细执行计划，再开始行动
 * - 执行（Execute）：按计划逐步执行具体操作
 * - 验证（Verify）：验证执行结果是否符合预期
 * - 迭代改进：验证失败则修改计划重新执行
 * - 状态追踪：维护计划状态和执行历史
 *
 * 循环流程：
 *   plan → execute → verify
 *     ↑                  │
 *     └─── (迭代改进) ───┘
 *     ↓ (连续 2 次验证无改进)
 *     plan（重新规划）
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

/** OpenHands 三阶段标识 */
type OpenHandsPhase = 'plan' | 'execute' | 'verify'

/** 计划条目 */
interface PlanStep {
  id: string
  action: string
  expectedOutcome: string
  status: 'pending' | 'executed' | 'verified' | 'failed'
  executionResult?: string
  verificationResult?: string
}

/** 验证轮次结果 */
interface VerificationRound {
  iteration: number
  stepId: string
  passed: boolean
  feedback: string
  timestamp: number
}

export class OpenHandsStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'openhands'
  readonly displayName = 'OpenHands 工程代理循环'
  readonly description = '工程代理风格的计划-执行-验证循环。先计划、再执行、最后验证，失败则迭代改进。'

  /** 当前详细计划步骤列表 */
  private planSteps: PlanStep[] = []

  /** 当前活跃阶段 */
  private currentPhase: OpenHandsPhase = 'plan'

  /** 验证历史记录 */
  private verificationHistory: VerificationRound[] = []

  /** 各阶段连续失败次数 */
  private phaseFailures: Record<OpenHandsPhase, number> = {
    plan: 0,
    execute: 0,
    verify: 0,
  }

  /** 连续验证无改进计数（核心终止条件） */
  private stagnationCount = 0

  /** 最大连续验证无改进次数 */
  private readonly maxStagnation = 2

  /** 最大阶段连续失败次数 */
  private readonly maxPhaseFailure = 3

  /**
   * 将目标分解为计划、执行、验证三个阶段
   *
   * OpenHands 风格：每个阶段是一个 SubTask。
   * plan 阶段将产生具体的 PlanStep 列表，
   * execute 和 verify 阶段基于 PlanStep 逐步推进。
   *
   * 子任务按顺序排列：plan → execute → verify
   */
  decompose(goal: LoopGoal): SubTask[] {
    // 如果目标已预定义子任务，直接使用
    if (goal.subTasks && goal.subTasks.length > 0) {
      // 将预定义子任务映射为 PlanStep
      this.planSteps = goal.subTasks.map((st) => ({
        id: st.id,
        action: st.action ?? st.description,
        expectedOutcome: goal.successCriteria?.join('; ') ?? '完成目标',
        status: st.status === 'completed' ? 'verified' : 'pending',
        executionResult: st.result,
      }))
      return goal.subTasks
    }

    // OpenHands 风格：生成 3 个阶段的框架任务
    const phases: SubTask[] = [
      {
        id: 'openhands-plan',
        description: `[plan] 制定详细执行计划：分析目标 "${goal.description}"，分解为具体可执行的步骤，明确每个步骤的预期输出。`,
        status: 'pending',
      },
      {
        id: 'openhands-execute',
        description: `[execute] 按计划执行：逐步执行 plan 阶段制定的步骤，记录每个步骤的实际执行结果。`,
        status: 'pending',
      },
      {
        id: 'openhands-verify',
        description: `[verify] 验证结果：逐一检查每个步骤的实际结果是否符合预期，判断整体目标是否达成。失败则触发迭代改进。`,
        status: 'pending',
      },
    ]

    return phases
  }

  /**
   * OpenHands 风格的验证评估
   *
   * 判定逻辑（按优先级）：
   * 1. 连续 2 次验证无改进 → 目标失败（无法进一步推进）
   * 2. 任一阶段连续失败 3 次 → 目标失败（无法推进）
   * 3. 所有 PlanStep 状态为 verified → 目标达成
   * 4. 所有子任务完成且满足成功标准 → 目标达成
   * 5. 否则继续迭代
   */
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    // 1. 检查连续验证无改进
    if (this.stagnationCount >= this.maxStagnation) {
      return {
        achieved: false,
        reason: `连续 ${this.maxStagnation} 轮验证均无改进，无法进一步推进目标`,
      }
    }

    // 2. 检查是否有阶段连续失败达到上限
    for (const [phase, count] of Object.entries(this.phaseFailures)) {
      if (count >= this.maxPhaseFailure) {
        return {
          achieved: false,
          reason: `阶段 [${phase}] 已连续失败 ${count} 次，计划-执行-验证循环无法继续推进`,
        }
      }
    }

    // 3. 检查所有 PlanStep 是否已验证通过
    if (this.planSteps.length > 0) {
      const allVerified = this.planSteps.every(s => s.status === 'verified')
      if (allVerified) {
        return {
          achieved: true,
          reason: `计划所有 ${this.planSteps.length} 个步骤均已验证通过`,
        }
      }

      // 检查是否有步骤失败（需要迭代）
      const failedSteps = this.planSteps.filter(s => s.status === 'failed')
      if (failedSteps.length > 0) {
        return {
          achieved: false,
          reason: `${failedSteps.length} 个计划步骤验证失败，需要迭代改进：${failedSteps.map(s => s.action).slice(0, 3).join(', ')}`,
        }
      }

      // 计划步骤尚未全部执行
      const executedCount = this.planSteps.filter(s => s.status === 'executed' || s.status === 'verified').length
      return {
        achieved: false,
        reason: `计划执行进度 ${executedCount}/${this.planSteps.length}，当前阶段: [${this.currentPhase}]`,
      }
    }

    // 4. 检查所有子任务是否完成
    const completedCount = subTasks.filter(t => t.status === 'completed').length
    const totalCount = subTasks.length

    if (totalCount > 0 && completedCount === totalCount) {
      // 检查成功标准
      if (goal.successCriteria && goal.successCriteria.length > 0) {
        const allResults = subTasks
          .filter(t => t.result)
          .map(t => t.result!)
          .join('\n')

        const criteriaMet = goal.successCriteria.filter((c) =>
          allResults.toLowerCase().includes(c.toLowerCase())
        ).length

        if (criteriaMet === goal.successCriteria.length) {
          return {
            achieved: true,
            reason: `所有 ${totalCount} 个阶段已完成，成功标准全部满足（${criteriaMet}/${goal.successCriteria.length}）`,
          }
        }

        return {
          achieved: false,
          reason: `阶段全部完成，但成功标准仅满足 ${criteriaMet}/${goal.successCriteria.length}，需要迭代改进`,
        }
      }

      return {
        achieved: true,
        reason: `所有 ${totalCount} 个阶段已完成，计划-执行-验证循环完整执行`,
      }
    }

    // 5. 默认：继续循环
    return {
      achieved: false,
      reason: `计划-执行-验证循环运行中，完成进度 ${completedCount}/${totalCount}，当前阶段: [${this.currentPhase}]，停滞计数: ${this.stagnationCount}/${this.maxStagnation}`,
    }
  }

  /**
   * 返回 OpenHands 风格的系统提示词
   *
   * 描述计划-执行-验证的工程代理循环逻辑，
   * 包含迭代改进策略和状态追踪规则
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    const planSection = this.planSteps.length > 0
      ? `\n\n## 当前计划（${this.planSteps.length} 步）\n${this.planSteps.map((s, i) => {
          const statusMark = s.status === 'verified' ? '[通过]' : s.status === 'executed' ? '[执行]' : s.status === 'failed' ? '[失败]' : '[待办]'
          return `${i + 1}. ${statusMark} ${s.action}\n   预期: ${s.expectedOutcome}${s.executionResult ? `\n   实际: ${s.executionResult.slice(0, 100)}` : ''}`
        }).join('\n')}`
      : ''

    const verificationSection = this.verificationHistory.length > 0
      ? `\n\n## 验证历史（最近 5 轮）\n${this.verificationHistory.slice(-5).map((v, i) => {
          return `  轮次 ${i + 1}: 步骤 [${v.stepId}] ${v.passed ? '通过' : '未通过'} — ${v.feedback.slice(0, 80)}`
        }).join('\n')}`
      : ''

    return `你是 OpenHands 工程代理。你需要通过计划-执行-验证的工程循环来完成以下目标。

## 目标
${goal.description}${criteria}${planSection}${verificationSection}

## 工程代理循环（Plan-Execute-Verify）

\`\`\`
plan → execute → verify
  ↑                  │
  └────── (迭代改进) ───┘
\`\`\`

### 阶段 1：plan（制定计划）
- 分析目标，理解需求的核心要素
- 将目标分解为具体、可执行、可验证的步骤
- 为每个步骤定义明确的预期输出（可验证的标准）
- 输出格式：
  \`\`\`
  步骤 1: <具体操作>
    预期输出: <可验证的结果描述>
  步骤 2: <具体操作>
    预期输出: <可验证的结果描述>
  \`\`\`
- 计划应该足够详细，使得 execute 阶段可以机械执行

### 阶段 2：execute（执行计划）
- 严格按照 plan 阶段的步骤顺序执行
- 每个步骤执行后记录实际输出
- 如果某个步骤无法执行，记录失败原因并继续后续步骤
- 执行过程中严格遵循计划，不自行修改计划（计划修改由 verify 失败触发）
- 输出格式：
  \`\`\`
  步骤 1 执行结果: <实际输出>
  步骤 2 执行结果: <实际输出>
  \`\`\`

### 阶段 3：verify（验证结果）
- 逐一比对每个步骤的实际输出与预期输出
- 判断每个步骤是否通过验证：
  - 通过：实际输出满足预期要求
  - 未通过：实际输出不满足预期要求，记录具体差异
- 判断整体目标是否达成（所有步骤通过 + 满足成功标准）
- 如果验证失败，生成具体的改进反馈：
  - 哪个步骤失败了
  - 失败的具体原因
  - 建议的改进方向
- 输出格式：
  \`\`\`
  验证结果:
  - 步骤 1: [通过/未通过] <理由>
  - 步骤 2: [通过/未通过] <理由>
  整体判定: [达成/未达成]
  改进建议: <具体建议>
  \`\`\`

## 迭代改进规则
1. 验证失败时，回到 plan 阶段重新制定计划
2. 新计划必须针对上次验证失败的具体原因进行改进
3. 连续 ${this.maxStagnation} 轮验证无改进将触发终止（防止无效迭代）
4. 改进时应保持已经验证通过的步骤，只修改失败的步骤
5. 如果某个步骤连续 ${this.maxPhaseFailure} 次失败，尝试完全不同的替代方案

## 执行约束
- 每次迭代专注一个阶段，不要跨阶段混合
- 计划必须可验证：每个步骤的预期输出必须是具体的、可检查的
- 验证必须诚实：不要将不满足的结果标记为通过
- 记录所有验证历史，作为迭代改进的依据
`
  }

  /**
   * OpenHands 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 连续验证无改进达到上限（停滞检测）
   * 3. 任一阶段连续失败达到上限
   * 4. 所有计划步骤验证通过（目标达成）
   */
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    // 条件 1：达到最大迭代次数
    if (iteration >= maxIterations) {
      return false
    }

    // 条件 2：连续验证无改进达到上限
    if (this.stagnationCount >= this.maxStagnation) {
      return false
    }

    // 条件 3：任一阶段连续失败达到上限
    for (const count of Object.values(this.phaseFailures)) {
      if (count >= this.maxPhaseFailure) {
        return false
      }
    }

    // 条件 4：所有计划步骤已验证通过（目标达成）
    if (this.planSteps.length > 0 && this.planSteps.every(s => s.status === 'verified')) {
      return false
    }

    // 条件 5：所有子任务完成
    const allCompleted = subTasks.length > 0 && subTasks.every(t => t.status === 'completed')
    if (allCompleted) {
      return false
    }

    return true
  }

  // ─── OpenHands 特色方法：三阶段工程代理 ───────────────────────

  /**
   * 计划：将目标分解为具体可执行的步骤
   *
   * OpenHands 的核心是"先计划再执行"。plan 阶段：
   * 1. 分析目标的复杂度
   * 2. 分解为有序的步骤序列
   * 3. 为每个步骤定义可验证的预期输出
   *
   * @param goal 原始目标
   * @returns 格式化后的计划文本
   */
  plan(goal: LoopGoal): string {
    // 如果有预定义子任务，基于它们构建计划
    if (goal.subTasks && goal.subTasks.length > 0) {
      this.planSteps = goal.subTasks.map((st) => ({
        id: st.id,
        action: st.action ?? st.description,
        expectedOutcome: goal.successCriteria?.join('; ') ?? '完成目标要求',
        status: 'pending',
      }))
    }

    if (this.planSteps.length === 0) {
      // 没有子任务时，生成默认的单步计划
      this.planSteps = [{
        id: `plan-step-1`,
        action: goal.description,
        expectedOutcome: goal.successCriteria?.join('且') ?? '达成目标',
        status: 'pending',
      }]
    }

    const planText = this.planSteps
      .map((s, i) => `${i + 1}. ${s.action}\n   预期输出: ${s.expectedOutcome}`)
      .join('\n')

    this.currentPhase = 'execute'

    return `## 执行计划（${this.planSteps.length} 步）\n\n${planText}\n\n下一步：开始执行步骤 1`
  }

  /**
   * 执行：执行指定步骤并记录结果
   *
   * @param stepId 要执行的步骤 ID
   * @param result 实际执行结果
   * @returns 执行确认文本
   */
  executeStep(stepId: string, result: string): string {
    const step = this.planSteps.find(s => s.id === stepId)
    if (!step) {
      return `错误: 未找到步骤 [${stepId}]，无法执行`
    }

    step.status = 'executed'
    step.executionResult = result
    this.currentPhase = 'verify'

    // 检查是否还有未执行的步骤
    const nextPending = this.planSteps.find(s => s.status === 'pending')

    return `## 步骤执行完成: [${step.action.slice(0, 50)}]\n\n实际输出: ${result.slice(0, 300)}\n\n${nextPending ? `下一步: 执行步骤 "${nextPending.action.slice(0, 50)}"` : '所有步骤已执行，进入验证阶段'}`
  }

  /**
   * 验证：验证步骤执行结果是否符合预期
   *
   * 这是 OpenHands 的核心差异化能力。verify 阶段：
   * 1. 逐一检查实际输出与预期输出的匹配度
   * 2. 标记每个步骤的验证状态
   * 3. 检测是否有改进（与上次验证比较）
   * 4. 决定是否触发迭代改进
   *
   * @param stepId 要验证的步骤 ID
   * @param passed 是否通过验证
   * @param feedback 验证反馈（未通过时描述具体差异）
   * @returns 验证报告
   */
  verify(stepId: string, passed: boolean, feedback: string): string {
    const step = this.planSteps.find(s => s.id === stepId)
    if (!step) {
      return `错误: 未找到步骤 [${stepId}]，无法验证`
    }

    // 更新步骤状态
    step.status = passed ? 'verified' : 'failed'
    step.verificationResult = feedback

    // 记录验证历史
    const verificationRound: VerificationRound = {
      iteration: this.verificationHistory.length + 1,
      stepId,
      passed,
      feedback,
      timestamp: Date.now(),
    }
    this.verificationHistory.push(verificationRound)

    // 更新阶段状态
    this.currentPhase = passed ? 'execute' : 'plan'

    // 检测停滞：检查最近两轮验证结果
    this.updateStagnationCount()

    // 更新阶段失败计数
    if (!passed) {
      this.phaseFailures.verify = (this.phaseFailures.verify ?? 0) + 1
    } else {
      this.phaseFailures.verify = 0
    }

    return this.generateVerificationReport(step, passed, feedback)
  }

  /**
   * 批量验证所有已执行步骤
   *
   * 验证所有状态为 'executed' 的步骤，生成完整验证报告
   *
   * @param results 步骤 ID 到验证结果的映射
   * @returns 完整验证报告
   */
  verifyAll(results: Array<{ stepId: string; passed: boolean; feedback: string }>): string {
    const reports: string[] = []
    let allPassed = true

    for (const { stepId, passed, feedback } of results) {
      const step = this.planSteps.find(s => s.id === stepId)
      if (!step) continue

      step.status = passed ? 'verified' : 'failed'
      step.verificationResult = feedback

      this.verificationHistory.push({
        iteration: this.verificationHistory.length + 1,
        stepId,
        passed,
        feedback,
        timestamp: Date.now(),
      })

      if (!passed) allPassed = false
    }

    this.updateStagnationCount()
    this.currentPhase = allPassed ? 'execute' : 'plan'
    if (!allPassed) {
      this.phaseFailures.verify = (this.phaseFailures.verify ?? 0) + 1
    } else {
      this.phaseFailures.verify = 0
    }

    return this.generateBatchVerificationReport()
  }

  /**
   * 获取当前计划的完整状态
   *
   * 包含所有步骤的执行情况，用于外部引擎判断进度
   */
  getPlanStatus(): {
    totalSteps: number
    pendingCount: number
    executedCount: number
    verifiedCount: number
    failedCount: number
    currentPhase: OpenHandsPhase
    stagnationCount: number
    steps: ReadonlyArray<PlanStep>
  } {
    return {
      totalSteps: this.planSteps.length,
      pendingCount: this.planSteps.filter(s => s.status === 'pending').length,
      executedCount: this.planSteps.filter(s => s.status === 'executed').length,
      verifiedCount: this.planSteps.filter(s => s.status === 'verified').length,
      failedCount: this.planSteps.filter(s => s.status === 'failed').length,
      currentPhase: this.currentPhase,
      stagnationCount: this.stagnationCount,
      steps: [...this.planSteps],
    }
  }

  /**
   * 获取验证历史
   */
  getVerificationHistory(): ReadonlyArray<VerificationRound> {
    return [...this.verificationHistory]
  }

  /**
   * 重置策略到初始状态
   */
  reset(): void {
    this.planSteps = []
    this.currentPhase = 'plan'
    this.verificationHistory = []
    this.phaseFailures = { plan: 0, execute: 0, verify: 0 }
    this.stagnationCount = 0
  }

  // ─── 私有辅助方法 ───────────────────────────────────────────

  /**
   * 更新停滞计数
   *
   * 检测逻辑：比较最近两轮验证结果
   * - 如果连续两轮验证失败的步骤完全相同（无改进）→ 停滞计数 +1
   * - 如果有改进（不同的失败步骤，或失败步骤减少）→ 重置停滞计数
   */
  private updateStagnationCount(): void {
    // 获取最近两轮验证的失败步骤
    const recentFailures = this.verificationHistory
      .slice(-2)
      .filter(v => !v.passed)
      .map(v => v.stepId)

    if (recentFailures.length < 2) {
      // 不足两轮失败数据，检查是否有改进
      const lastTwoRounds = this.verificationHistory.slice(-2)
      const recentFailedSteps = new Set(lastTwoRounds.filter(v => !v.passed).map(v => v.stepId))
      const previousFailedSteps = new Set(
        this.verificationHistory.slice(-4, -2).filter(v => !v.passed).map(v => v.stepId)
      )

      // 如果失败步骤集合没有变化，说明停滞
      if (recentFailedSteps.size > 0 &&
          recentFailedSteps.size === previousFailedSteps.size &&
          [...recentFailedSteps].every(id => previousFailedSteps.has(id))) {
        this.stagnationCount++
        return
      }

      // 有改进则重置
      if (recentFailedSteps.size < previousFailedSteps.size) {
        this.stagnationCount = 0
        return
      }
    }

    // 检查连续两次验证是否完全重复
    const lastRound = this.verificationHistory[this.verificationHistory.length - 1]
    const prevRound = this.verificationHistory[this.verificationHistory.length - 2]

    if (lastRound && prevRound && !lastRound.passed && !prevRound.passed) {
      if (lastRound.stepId === prevRound.stepId) {
        this.stagnationCount++
      } else {
        // 不同的步骤失败，说明在尝试不同方向，不算停滞
        this.stagnationCount = 0
      }
    } else if (lastRound?.passed) {
      // 最近一次验证通过，重置停滞
      this.stagnationCount = 0
    }
  }

  /**
   * 生成单个步骤的验证报告
   */
  private generateVerificationReport(step: PlanStep, passed: boolean, feedback: string): string {
    const statusMark = passed ? '通过' : '未通过'
    const nextAction = passed
      ? (this.planSteps.some(s => s.status === 'pending')
        ? '继续执行下一个步骤'
        : '所有步骤已执行，准备整体验证')
      : '需要迭代改进计划，重新制定失败步骤的执行方案'

    return `## 验证结果: [${step.action.slice(0, 50)}]

状态: ${statusMark}
预期输出: ${step.expectedOutcome}
实际输出: ${step.executionResult?.slice(0, 200) ?? '无'}
验证反馈: ${feedback}
下一步: ${nextAction}`
  }

  /**
   * 生成批量验证的完整报告
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
      ? '全部通过'
      : this.stagnationCount >= this.maxStagnation
        ? '停滞检测触发，需要终止'
        : '部分未通过，需要迭代改进'

    return `## 批量验证报告

总计: ${total} 步 | 通过: ${verified} | 未通过: ${failed} | 未执行: ${pending}

${failedSteps ? `### 失败步骤\n${failedSteps}` : '### 所有步骤验证通过'}

### 判定: ${overallVerdict}
### 停滞计数: ${this.stagnationCount}/${this.maxStagnation}
### 下一阶段: ${this.currentPhase === 'plan' ? '重新制定计划' : '继续执行'}`
  }
}

// ─── 扩展 SubTask 支持可选 action 字段 ───────────────────────────
// 注意：action 字段不在原始 types.ts 中，这里通过 module augmentation 扩展
declare module '../types.js' {
  interface SubTask {
    /** 可选的具体动作描述（用于 OpenHands 计划步骤） */
    action?: string
  }
}
