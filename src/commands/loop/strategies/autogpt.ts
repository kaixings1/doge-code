/**
 * AutoGPT 风格的目标驱动循环策略
 *
 * 核心概念：
 * - 任务分解（Task Decomposition）：将大目标分解为可执行的子任务
 * - 思考-行动-观察循环（Think-Act-Observe）：每轮迭代遵循认知闭环
 * - 自我批评（Self-Critique）：每步行动后评估效果
 * - 动态重规划（Dynamic Replanning）：根据反馈调整计划
 * - 记忆系统（Memory System）：记住之前的尝试和结果
 *
 * 循环流程：
 *   think → act → observe → critique
 *     ↑                        │
 *     └─── (重规划) ───────────┘
 *     ↓ (连续无进展)
 *     think（重新思考）
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, LoopStrategyName, SubTask } from '../types.js'

/** AutoGPT 认知阶段标识 */
type AutoGPTPhase = 'think' | 'act' | 'observe' | 'critique'

/** 阶段执行结果 */
interface PhaseResult {
  phase: AutoGPTPhase
  success: boolean
  output: string
  /** 该阶段产出的子任务 ID（think 阶段产出） */
  generatedTaskId?: string
}

/** 进展快照（用于检测停滞） */
interface ProgressSnapshot {
  completedCount: number
  totalCount: number
  timestamp: number
}

/** 追踪每个阶段的连续失败次数 */
type PhaseFailureCount = Record<AutoGPTPhase, number>

export class AutoGPTStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'autogpt'
  readonly displayName = 'AutoGPT 目标驱动循环'
  readonly description = '目标驱动的智能循环引擎，支持任务分解、自我评估、动态重规划。遵循思考-行动-观察-自我批评的认知闭环。'

  /** 各阶段连续失败次数 */
  private phaseFailures: PhaseFailureCount = {
    think: 0,
    act: 0,
    observe: 0,
    critique: 0,
  }

  /** 阶段执行历史（每次迭代追加） */
  private phaseHistory: PhaseResult[] = []

  /** 当前活跃的认知阶段 */
  private currentPhase: AutoGPTPhase = 'think'

  /** 动态任务队列（think 阶段不断生成新任务） */
  private taskQueue: SubTask[] = []

  /** 已完成任务的记忆（observe 阶段写入） */
  private memory: string[] = []

  /** 进展快照历史（critique 阶段记录） */
  private progressHistory: ProgressSnapshot[] = []

  /** 连续无进展次数（critique 阶段判定） */
  private stagnationCount = 0

  /** 最大连续无进展次数 */
  private readonly maxStagnation = 3

  /** 最大阶段连续失败次数 */
  private readonly maxPhaseFailure = 3

  /**
   * 将目标分解为思考、行动、观察、评估 4 个认知阶段
   *
   * AutoGPT 风格：不预先固定子任务，而是让 think 阶段动态生成。
   * 初始分解只产生 4 个阶段的框架任务，具体执行内容由循环中的
   * think 阶段根据当前状态动态决定。
   *
   * 子任务按优先级排序：think > act > observe > critique
   */
  decompose(goal: LoopGoal): SubTask[] {
    // 如果目标已预定义子任务，直接使用（尊重用户规划）
    if (goal.subTasks && goal.subTasks.length > 0) {
      this.taskQueue = [...goal.subTasks]
      return goal.subTasks
    }

    // AutoGPT 风格：生成 4 个认知阶段的框架任务
    const framework: SubTask[] = [
      {
        id: 'autogpt-think',
        description: `[think] 思考分析：理解目标 "${goal.description}"，分析当前状态，决定下一步行动。回顾记忆系统中的历史尝试，避免重复失败路径。`,
        status: 'pending',
      },
      {
        id: 'autogpt-act',
        description: `[act] 执行行动：根据 think 阶段的决策，执行具体操作。记录执行过程和结果。`,
        status: 'pending',
      },
      {
        id: 'autogpt-observe',
        description: `[observe] 观察结果：分析 act 阶段的执行输出，提取关键信息，判断行动是否有效。将有用信息写入记忆。`,
        status: 'pending',
      },
      {
        id: 'autogpt-critique',
        description: `[critique] 自我批评：评估当前进展，判断目标是否达成或需要重规划。检测是否陷入停滞。`,
        status: 'pending',
      },
    ]

    this.taskQueue = [...framework]
    return framework
  }

  /**
   * AutoGPT 风格的自我评估
   *
   * 判定逻辑（按优先级）：
   * 1. 连续无进展达到上限 → 目标失败（陷入死循环）
   * 2. 任一阶段连续失败 3 次 → 目标失败（无法推进）
   * 3. 所有子任务完成且满足成功标准 → 目标达成
   * 4. 所有子任务完成（无自定义标准） → 目标达成
   * 5. 否则继续循环
   */
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    // 1. 检查连续无进展（停滞检测）
    if (this.stagnationCount >= this.maxStagnation) {
      return {
        achieved: false,
        reason: `连续 ${this.maxStagnation} 轮评估无进展，陷入停滞状态，需要终止循环`,
      }
    }

    // 2. 检查是否有阶段连续失败达到上限
    for (const [phase, count] of Object.entries(this.phaseFailures)) {
      if (count >= this.maxPhaseFailure) {
        return {
          achieved: false,
          reason: `阶段 [${phase}] 已连续失败 ${count} 次，认知闭环无法继续推进`,
        }
      }
    }

    // 3. 检查所有子任务是否完成
    const completedCount = subTasks.filter(t => t.status === 'completed').length
    const totalCount = subTasks.length

    if (totalCount > 0 && completedCount === totalCount) {
      // 所有子任务已完成，检查成功标准
      if (goal.successCriteria && goal.successCriteria.length > 0) {
        // 有自定义成功标准：检查 critique 阶段的输出是否确认满足
        const critiqueTask = subTasks.find(t => t.id === 'autogpt-critique')
        const critiqueResult = critiqueTask?.result ?? ''
        const allCriteriaMet = goal.successCriteria.every((c) =>
          critiqueResult.toLowerCase().includes(c.toLowerCase()) ||
          critiqueResult.includes('达成') ||
          critiqueResult.includes('完成') ||
          critiqueResult.includes('满足')
        )

        if (allCriteriaMet || critiqueResult.length > 0) {
          return {
            achieved: true,
            reason: `所有 ${totalCount} 个子任务已完成，成功标准已满足`,
          }
        }
      } else {
        // 无自定义标准：所有子任务完成即视为达成
        return {
          achieved: true,
          reason: `所有 ${totalCount} 个子任务已完成，认知闭环完整执行一轮`,
        }
      }
    }

    // 4. 检查成功标准（即使子任务未全部完成，但标准已满足）
    if (goal.successCriteria && goal.successCriteria.length > 0) {
      const allMemory = this.memory.join('\n')
      const allResults = subTasks
        .filter(t => t.result)
        .map(t => t.result!)
        .join('\n')
      const combinedOutput = `${allMemory}\n${allResults}`

      const criteriaMet = goal.successCriteria.filter((c) =>
        combinedOutput.toLowerCase().includes(c.toLowerCase())
      ).length

      if (criteriaMet === goal.successCriteria.length && completedCount >= 3) {
        return {
          achieved: true,
          reason: `成功标准已全部满足（${criteriaMet}/${goal.successCriteria.length}），且核心阶段已完成`,
        }
      }
    }

    // 5. 默认：继续循环
    const progressPercent = totalCount > 0
      ? Math.round((completedCount / totalCount) * 100)
      : 0
    return {
      achieved: false,
      reason: `认知循环运行中，进度 ${progressPercent}%（${completedCount}/${totalCount}），当前阶段: [${this.currentPhase}]，停滞计数: ${this.stagnationCount}/${this.maxStagnation}`,
    }
  }

  /**
   * 返回 AutoGPT 风格的系统提示词
   *
   * 描述思考-行动-观察-自我批评的认知闭环，
   * 包含记忆系统使用方法和动态重规划规则
   */
  getSystemPrompt(goal: LoopGoal): string {
    const criteria = goal.successCriteria?.length
      ? `\n\n## 成功标准\n${goal.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''

    const memorySection = this.memory.length > 0
      ? `\n\n## 记忆系统（历史经验）\n${this.memory.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : ''

    return `你是 AutoGPT 目标驱动智能体。你需要通过思考-行动-观察-自我批评的认知闭环来完成以下目标。

## 目标
${goal.description}${criteria}${memorySection}

## 认知闭环（Think-Act-Observe-Critique）

\`\`\`
think → act → observe → critique
  ↑                          │
  └────── (动态重规划) ───────┘
\`\`\`

### 阶段 1：think（思考分析）
- 分析当前状态和目标的差距
- 回顾记忆系统中的历史尝试，避免重复失败
- 决定下一步最优先的行动
- 如果之前的路径被证明无效，尝试全新策略
- 输出：行动计划（具体、可执行、有优先级）

### 阶段 2：act（执行行动）
- 严格按照 think 阶段的计划执行
- 执行过程中记录关键操作和中间结果
- 如果遇到预期外的障碍，记录障碍详情
- 输出：执行结果（成功/失败 + 详细输出）

### 阶段 3：observe（观察分析）
- 分析 act 阶段的执行输出
- 提取关键信息和有用数据
- 判断行动是否朝着目标前进
- 将重要发现写入记忆系统
- 输出：观察报告（有效/无效 + 关键发现）

### 阶段 4：critique（自我批评）
- 评估当前整体进展百分比
- 判断目标是否已经达成
- 检测是否陷入停滞（连续无进展）
- 决定是否需要重规划（改变策略）
- 输出：评估结论（达成/继续/重规划 + 理由）

## 执行规则
1. 从 think 阶段开始，每个迭代专注一个认知阶段
2. 每次 think 必须参考记忆系统，避免重复失败
3. 连续 ${this.maxStagnation} 轮无进展将触发终止（防止死循环）
4. 任何阶段连续失败 ${this.maxPhaseFailure} 次将终止循环
5. 记忆系统是关键资源：observe 写入，think 读取
6. 动态重规划是核心能力：勇于放弃无效路径，尝试新方向
7. 每次只处理一个阶段，输出要传递给下游阶段使用
`
  }

  /**
   * AutoGPT 特色的停止条件
   *
   * 停止条件（满足任一即停止）：
   * 1. 达到最大迭代次数
   * 2. 连续无进展达到上限（停滞检测）
   * 3. 任一阶段连续失败达到上限
   * 4. 所有子任务完成且目标达成
   */
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    // 条件 1：达到最大迭代次数
    if (iteration >= maxIterations) {
      return false
    }

    // 条件 2：连续无进展达到上限
    if (this.stagnationCount >= this.maxStagnation) {
      return false
    }

    // 条件 3：任一阶段连续失败达到上限
    for (const count of Object.values(this.phaseFailures)) {
      if (count >= this.maxPhaseFailure) {
        return false
      }
    }

    // 条件 4：所有子任务完成（目标达成）
    const allCompleted = subTasks.length > 0 && subTasks.every(t => t.status === 'completed')
    if (allCompleted) {
      return false
    }

    return true
  }

  // ─── AutoGPT 特色方法：认知闭环四阶段 ───────────────────────

  /**
   * 思考：分析当前状态，决定下一步行动
   *
   * 这是 AutoGPT 的核心决策方法。每轮 think 阶段：
   * 1. 回顾目标，评估当前差距
   * 2. 读取记忆系统，了解历史尝试
   * 3. 分析已完成子任务的结果
   * 4. 决定下一步最优行动
   *
   * @param goal 原始目标
   * @param history 已完成子任务历史
   * @returns 思考结论和行动计划
   */
  think(goal: LoopGoal, history: SubTask[]): string {
    const completedTasks = history.filter(t => t.status === 'completed')
    const failedTasks = history.filter(t => t.status === 'failed')
    const memorySummary = this.memory.length > 0
      ? this.memory.slice(-5).join('; ')
      : '无历史记忆'

    const analysis = [
      `目标: "${goal.description}"`,
      `已完成任务数: ${completedTasks.length}`,
      `失败任务数: ${failedTasks.length}`,
      `记忆摘要: ${memorySummary}`,
      `当前阶段: ${this.currentPhase}`,
      `停滞计数: ${this.stagnationCount}/${this.maxStagnation}`,
    ]

    // 分析失败模式，避免重复
    const failurePatterns = failedTasks
      .filter(t => t.error)
      .map(t => t.error!)
      .slice(-3)

    if (failurePatterns.length > 0) {
      analysis.push(`近期失败模式: ${failurePatterns.join('; ')}`)
    }

    // 生成行动计划
    const actionPlan = this.generateActionPlan(goal, completedTasks)
    analysis.push(`行动计划: ${actionPlan}`)

    return analysis.join('\n')
  }

  /**
   * 行动：执行具体任务
   *
   * 根据 think 阶段的决策，生成执行指令。
   * 实际执行由外部引擎完成，此方法负责生成执行上下文。
   *
   * @param task 要执行的子任务
   * @returns 行动指令和上下文
   */
  act(task: SubTask): string {
    const memoryContext = this.memory.length > 0
      ? `\n## 历史经验（避免重复失败）\n${this.memory.slice(-3).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : ''

    return `## 执行任务: [${task.id}] ${task.description}

### 执行上下文
- 当前认知阶段: act
- 任务状态: ${task.status}
- 历史尝试次数: ${this.phaseHistory.filter(h => h.phase === 'act').length}

${memoryContext}

### 执行要求
1. 严格按照任务描述执行
2. 记录所有关键操作和输出
3. 如遇障碍，详细记录障碍原因
4. 执行完成后将结果写入任务 result 字段
`
  }

  /**
   * 观察：分析行动结果
   *
   * 对 act 阶段的输出进行结构化分析，
   * 提取关键信息并写入记忆系统。
   *
   * @param result act 阶段的执行结果
   * @returns 观察报告
   */
  observe(result: string): string {
    if (!result || result.trim().length === 0) {
      return '观察结果: 无有效输出，行动可能未产生结果'
    }

    // 分析结果的有效性
    const lines = result.trim().split('\n').filter(l => l.trim().length > 0)
    const hasError = result.toLowerCase().includes('error') ||
      result.toLowerCase().includes('fail') ||
      result.includes('错误') ||
      result.includes('失败')
    const hasSuccess = result.toLowerCase().includes('success') ||
      result.toLowerCase().includes('complete') ||
      result.includes('成功') ||
      result.includes('完成')

    const observations: string[] = [
      `输出行数: ${lines.length}`,
      `包含错误信号: ${hasError}`,
      `包含成功信号: ${hasSuccess}`,
    ]

    // 提取关键信息（取前 5 行作为摘要）
    const summary = lines.slice(0, 5).join(' | ')
    observations.push(`输出摘要: ${summary}`)

    // 写入记忆系统
    const memoryEntry = `[observe] ${hasSuccess ? '成功' : hasError ? '失败' : '中性'}: ${summary.slice(0, 200)}`
    this.memory.push(memoryEntry)

    // 限制记忆大小（保留最近 20 条）
    if (this.memory.length > 20) {
      this.memory = this.memory.slice(-20)
    }

    return `## 观察报告\n${observations.join('\n')}\n\n已写入记忆: ${memoryEntry}`
  }

  /**
   * 自我批评：评估行动效果
   *
   * 这是 AutoGPT 的核心差异化能力。每轮 critique：
   * 1. 评估当前进展百分比
   * 2. 检测是否陷入停滞
   * 3. 决定是否需要重规划
   *
   * @param goal 原始目标
   * @param subTasks 所有子任务状态
   * @returns 批评结论和建议
   */
  critique(goal: LoopGoal, subTasks: SubTask[]): string {
    const completedCount = subTasks.filter(t => t.status === 'completed').length
    const totalCount = subTasks.length
    const progressPercent = totalCount > 0
      ? Math.round((completedCount / totalCount) * 100)
      : 0

    // 记录当前进展快照
    const currentSnapshot: ProgressSnapshot = {
      completedCount,
      totalCount,
      timestamp: Date.now(),
    }

    // 检测停滞：与上一次快照比较
    const lastSnapshot = this.progressHistory[this.progressHistory.length - 1]
    if (lastSnapshot) {
      if (lastSnapshot.completedCount === currentSnapshot.completedCount) {
        this.stagnationCount++
      } else {
        // 有进展，重置停滞计数
        this.stagnationCount = 0
      }
    }

    this.progressHistory.push(currentSnapshot)

    // 分析成功标准满足情况
    const criteriaAnalysis = goal.successCriteria?.length
      ? goal.successCriteria.map((c) => {
          const allResults = subTasks
            .filter(t => t.result)
            .map(t => t.result!)
            .join('\n')
          const met = allResults.toLowerCase().includes(c.toLowerCase())
          return `  - "${c}": ${met ? '已满足' : '未满足'}`
        }).join('\n')
      : '无自定义成功标准'

    // 生成批评结论
    const verdict = progressPercent >= 100
      ? '目标已达成'
      : this.stagnationCount >= this.maxStagnation
        ? '陷入停滞，需要终止'
        : this.stagnationCount > 0
          ? `进展缓慢（停滞 ${this.stagnationCount} 轮），考虑重规划`
          : '正在推进中'

    return `## 自我批评报告

### 进展评估
- 完成进度: ${progressPercent}%（${completedCount}/${totalCount} 子任务）
- 停滞计数: ${this.stagnationCount}/${this.maxStagnation}
- 当前阶段: ${this.currentPhase}

### 成功标准分析
${criteriaAnalysis}

### 批评结论
${verdict}

### 建议行动
${this.generateRecommendation(progressPercent, this.stagnationCount, goal)}
`
  }

  // ─── 状态管理方法 ───────────────────────────────────────────

  /**
   * 处理阶段执行结果，更新认知闭环状态
   *
   * @param phase 当前执行的阶段
   * @param success 阶段是否成功
   * @param output 阶段输出
   * @returns 下一个要执行的阶段
   */
  processPhaseResult(phase: AutoGPTPhase, success: boolean, output: string): AutoGPTPhase {
    const result: PhaseResult = { phase, success, output }
    this.phaseHistory.push(result)

    if (success) {
      // 成功：重置该阶段的失败计数
      this.phaseFailures[phase] = 0

      // 成功后按正常闭环流转
      this.currentPhase = this.getNextPhase(phase)
      return this.currentPhase
    } else {
      // 失败：增加失败计数
      this.phaseFailures[phase] = (this.phaseFailures[phase] ?? 0) + 1

      // 连续失败达到上限则不再推进（由 shouldContinue 终止）
      if (this.phaseFailures[phase] >= this.maxPhaseFailure) {
        return phase
      }

      // 失败时根据阶段类型决定重试策略
      this.currentPhase = this.getRetryPhase(phase)
      return this.currentPhase
    }
  }

  /**
   * 获取当前认知闭环的完整状态快照
   *
   * 用于调试和状态可视化
   */
  getStateSnapshot(): {
    currentPhase: AutoGPTPhase
    phaseFailures: PhaseFailureCount
    historyLength: number
    lastResult: PhaseResult | undefined
    memorySize: number
    stagnationCount: number
    maxStagnation: number
    taskQueueLength: number
  } {
    return {
      currentPhase: this.currentPhase,
      phaseFailures: { ...this.phaseFailures },
      historyLength: this.phaseHistory.length,
      lastResult: this.phaseHistory[this.phaseHistory.length - 1],
      memorySize: this.memory.length,
      stagnationCount: this.stagnationCount,
      maxStagnation: this.maxStagnation,
      taskQueueLength: this.taskQueue.length,
    }
  }

  /**
   * 获取记忆系统的当前内容
   */
  getMemory(): readonly string[] {
    return [...this.memory]
  }

  /**
   * 向记忆系统添加条目（外部调用）
   */
  addMemory(entry: string): void {
    this.memory.push(entry)
    if (this.memory.length > 20) {
      this.memory = this.memory.slice(-20)
    }
  }

  /**
   * 重置认知闭环到初始状态
   */
  reset(): void {
    this.phaseFailures = { think: 0, act: 0, observe: 0, critique: 0 }
    this.phaseHistory = []
    this.currentPhase = 'think'
    this.taskQueue = []
    this.memory = []
    this.progressHistory = []
    this.stagnationCount = 0
  }

  // ─── 私有辅助方法 ───────────────────────────────────────────

  /**
   * 正常流转：获取下一个认知阶段
   *
   * 闭环定义：
   * think → act
   * act → observe
   * observe → critique
   * critique → think（循环）
   */
  private getNextPhase(current: AutoGPTPhase): AutoGPTPhase {
    const cycle: Record<AutoGPTPhase, AutoGPTPhase> = {
      think: 'act',
      act: 'observe',
      observe: 'critique',
      critique: 'think',
    }
    return cycle[current] ?? 'think'
  }

  /**
   * 失败时的重跳策略
   *
   * - think 失败：停留在 think（重新思考，因为决策有问题）
   * - act 失败：回退到 think（重新决策，因为行动方向可能错）
   * - observe 失败：回退到 act（重新执行，因为观察需要新数据）
   * - critique 失败：回退到 observe（重新观察，因为评估需要新信息）
   */
  private getRetryPhase(failedPhase: AutoGPTPhase): AutoGPTPhase {
    const retryEdges: Record<AutoGPTPhase, AutoGPTPhase> = {
      think: 'think',
      act: 'think',
      observe: 'act',
      critique: 'observe',
    }
    return retryEdges[failedPhase] ?? 'think'
  }

  /**
   * 生成行动计划（think 阶段的决策输出）
   */
  private generateActionPlan(goal: LoopGoal, completedTasks: SubTask[]): string {
    if (completedTasks.length === 0) {
      return `首次执行，从目标 "${goal.description}" 的第一步开始`
    }

    const lastCompleted = completedTasks[completedTasks.length - 1]
    return `基于上次完成 "${lastCompleted.description.slice(0, 50)}..."，继续推进目标的下一环节`
  }

  /**
   * 生成改进建议（critique 阶段的决策输出）
   */
  private generateRecommendation(progressPercent: number, stagnation: number, goal: LoopGoal): string {
    if (progressPercent >= 100) {
      return '目标已完成，准备结束循环'
    }
    if (stagnation >= this.maxStagnation) {
      return '已陷入停滞，建议终止并报告失败原因'
    }
    if (stagnation > 0) {
      return `连续 ${stagnation} 轮无进展，建议彻底改变策略：尝试完全不同的方法，或重新分解目标`
    }
    if (goal.successCriteria && goal.successCriteria.length > 0) {
      return `继续推进，优先满足成功标准: "${goal.successCriteria[0]}"`
    }
    return '继续当前策略，保持推进节奏'
  }
}
