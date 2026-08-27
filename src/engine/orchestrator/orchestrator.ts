/**
 * src/engine/orchestrator/orchestrator.ts
 *
 * 编排器核心 — 整合 Pipeline + Discuss 两种模式
 *
 * Pipeline 模式：严格顺序流水线（research → analyze → design → plan → implement → verify → review）
 * Discuss 模式：多角色自由讨论（吸收 AutoGen GroupChat + CrewAI Flow）
 */

import type {
  WorkflowStage,
  AgentRole,
  AgentMessage,
  OrchestrationResult,
  OrchestratorConfig,
  RoleExecutionResult,
} from './messages.js'
import { buildAgentDefinition, getAllRoles, getRoleDisplayName } from './agentRole.js'
import { PipelineExecutor, type PipelineExecutorDeps, PIPELINE_STAGES } from './pipeline.js'
import { TaskGraph, buildParallelGraph } from './taskGraph.js'

// ---------------------------------------------------------------------------
// Orchestrator — 主入口
// ---------------------------------------------------------------------------

export class Orchestrator {
  private config: OrchestratorConfig
  private deps: OrchestratorDeps
  private graph: TaskGraph | null = null
  private discussionHistory: AgentMessage[] = []

  constructor(config: Partial<OrchestratorConfig> = {}, deps: OrchestratorDeps) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.deps = deps
  }

  /**
   * 提交任务并执行（吸收自 LangSmith / CrewAI trace：自动追踪编排链路）
   */
  async run(taskDescription: string): Promise<OrchestrationResult> {
    const traceName = `orchestrator:${this.config.mode}`
    const traceId = this.deps.onTraceStart?.(traceName, taskDescription)
    const startTime = Date.now()
    try {
      const result = await this._runImpl(taskDescription)
      this.deps.onTraceEnd?.(traceId, result.summary ?? '', [`mode:${this.config.mode}`])
      // 追踪数据持久化（吸收自 LangSmith export）
      if (traceId && this.deps.onTracePersist) {
        this.deps.onTracePersist({
          traceId,
          name: traceName,
          input: taskDescription,
          output: result.summary,
          metadata: [`mode:${this.config.mode}`],
          startTime,
          endTime: Date.now(),
        })
      }
      return result
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.deps.onTraceFail?.(traceId, errMsg)
      // 失败 trace 也持久化
      if (traceId && this.deps.onTracePersist) {
        this.deps.onTracePersist({
          traceId,
          name: traceName,
          input: taskDescription,
          error: errMsg,
          metadata: [`mode:${this.config.mode}`],
          startTime,
          endTime: Date.now(),
        })
      }
      throw error
    }
  }

  private async _runImpl(taskDescription: string): Promise<OrchestrationResult> {
    if (this.config.mode === 'discuss') {
      return this.runDiscussMode(taskDescription)
    }

    if (this.config.mode === 'parallel') {
      return this.runParallelMode(taskDescription)
    }

    // 默认 pipeline 模式
    return this.runPipelineMode(taskDescription)
  }

  // -----------------------------------------------------------------------
  // Pipeline 模式
  // -----------------------------------------------------------------------

  private async runPipelineMode(taskDescription: string): Promise<OrchestrationResult> {
    const executor = new PipelineExecutor(
      {
        executeRole: (role, systemPrompt, userPrompt, context) =>
          this.deps.executeLLM(role, systemPrompt, userPrompt, context),
        onProgress: (stage, role, output) => {
          if (this.config.verbose) {
            console.log(`[Orchestrator] ${stage} → ${role} 完成`)
          }
        },
      },
      this.config
    )

    return executor.run(taskDescription)
  }

  // -----------------------------------------------------------------------
  // Parallel 模式
  // -----------------------------------------------------------------------

  private async runParallelMode(taskDescription: string): Promise<OrchestrationResult> {
    const nodes = buildParallelGraph(taskDescription)
    this.graph = new TaskGraph()
    this.graph.addNodes(nodes)

    const roleResults: RoleExecutionResult[] = []
    const startTime = Date.now()
    let totalIterations = 0
    const artifacts: string[] = []

    // 执行阶段
    while (!this.graph.isAllCompleted() && !this.graph.hasFailed()) {
      const readyNodes = this.graph.getReady()

      for (const node of readyNodes) {
        this.graph.markRunning(node.id)

        const roleDef = buildAgentDefinition(node.role)
        const context = this.buildNodeContext(node)

        try {
          const output = await this.deps.executeLLM(
            node.role,
            roleDef.systemPrompt,
            node.description,
            context
          )

          const nodeArtifacts = this.extractArtifacts(output)
          artifacts.push(...nodeArtifacts)

          this.graph.markCompleted(node.id, output)
          roleResults.push({
            role: node.role,
            stage: node.stage,
            success: true,
            output,
            iterations: 1,
            duration: 0,
            artifacts: nodeArtifacts,
          })
          totalIterations++

          if (this.config.verbose) {
            console.log(`[Orchestrator] ${node.stage} → ${node.role} 完成`)
          }
        } catch (err: any) {
          this.graph.markFailed(node.id, err.message)
          roleResults.push({
            role: node.role,
            stage: node.stage,
            success: false,
            output: err.message,
            iterations: 1,
            duration: 0,
            error: err.message,
          })
        }
      }

      // 如果没有就绪节点且没有失败，说明有循环依赖或全部完成
      if (readyNodes.length === 0 && !this.graph.isAllCompleted()) {
        // 跳过因依赖失败而无法执行的节点
        const allNodes = this.graph.getAll()
        let anySkipped = false
        for (const node of allNodes) {
          if (node.status === 'pending' && this.graph.skipIfDependencyFailed(node.id)) {
            anySkipped = true
          }
        }
        if (!anySkipped) break
      }
    }

    const hasFailed = this.graph.hasFailed()
    const lastCompleted = this.graph.getAll().filter(n => n.status === 'completed').pop()
    const mergedOutput = lastCompleted?.result ?? ''

    return {
      success: !hasFailed,
      finalStage: hasFailed ? 'failed' : 'done',
      roleResults,
      mergedOutput,
      qualityScore: computeQualityScore(roleResults),
      totalDuration: Date.now() - startTime,
      totalIterations,
      summary: this.buildSummary(!hasFailed, hasFailed ? 'failed' : 'done', roleResults, artifacts, Date.now() - startTime, totalIterations),
      artifacts,
    }
  }

  // -----------------------------------------------------------------------
  // Discuss 模式 — 多角色自由讨论（吸收 AutoGen GroupChat）
  // -----------------------------------------------------------------------

  private async runDiscussMode(taskDescription: string): Promise<OrchestrationResult> {
    const startTime = Date.now()
    const roleResults: RoleExecutionResult[] = []
    const artifacts: string[] = []
    const enabledRoles = this.config.roles
    const maxRounds = this.config.maxDiscussionRounds

    // 构建初始消息
    let discussionContext = `## 任务\n${taskDescription}\n\n## 讨论规则\n${enabledRoles.map(r => `- ${getRoleDisplayName(r)}: 从你的专业角度分析`).join('\n')}\n\n请开始讨论。`

    for (let round = 0; round < maxRounds; round++) {
      // 每个角色依次发言
      for (const role of enabledRoles) {
        const roleDef = buildAgentDefinition(role)
        const userPrompt = `${discussionContext}\n\n## 轮次 ${round + 1} — ${getRoleDisplayName(role)} 发言\n请从你的专业角度分析，给出观点、建议或决策。`

        try {
          const output = await this.deps.executeLLM(role, roleDef.systemPrompt, userPrompt, discussionContext)

          // 记录消息
          const message: AgentMessage = {
            id: `msg-${round}-${role}-${Date.now()}`,
            from: role,
            content: output,
            causeBy: 'discuss',
            timestamp: new Date().toISOString(),
          }
          this.discussionHistory.push(message)

          // 检查是否达成共识
          if (output.includes('[CONSENSUS]') || output.includes('[DECISION]')) {
            const nodeArtifacts = this.extractArtifacts(output)
            artifacts.push(...nodeArtifacts)

            return {
              success: true,
              finalStage: 'done',
              roleResults: [
                ...roleResults,
                {
                  role,
                  stage: 'review',
                  success: true,
                  output,
                  iterations: round + 1,
                  duration: Date.now() - startTime,
                  artifacts: nodeArtifacts,
                },
              ],
              mergedOutput: output,
              qualityScore: 80,
              totalDuration: Date.now() - startTime,
              totalIterations: round + 1,
              summary: this.buildSummary(true, 'done', roleResults, artifacts, Date.now() - startTime, round + 1),
              artifacts,
            }
          }

          roleResults.push({
            role,
            stage: 'discuss',
            success: true,
            output,
            iterations: 1,
            duration: 0,
          })

          // 更新讨论上下文（保留最近 5 轮）
          discussionContext = this.buildDiscussionContext(this.discussionHistory.slice(-10))
        } catch (err: any) {
          roleResults.push({
            role,
            stage: 'discuss',
            success: false,
            output: err.message,
            iterations: 1,
            duration: 0,
            error: err.message,
          })
        }
      }
    }

    // 达到最大轮数，汇总最终结果
    const finalOutput = this.discussionHistory.length > 0
      ? this.discussionHistory[this.discussionHistory.length - 1].content
      : '讨论未产生有效结果'

    return {
      success: false,
      finalStage: 'review',
      roleResults,
      mergedOutput: finalOutput,
      qualityScore: computeQualityScore(roleResults),
      totalDuration: Date.now() - startTime,
      totalIterations: maxRounds,
      summary: this.buildSummary(false, 'review', roleResults, artifacts, Date.now() - startTime, maxRounds),
      artifacts,
    }
  }

  // -----------------------------------------------------------------------
  // 辅助方法
  // -----------------------------------------------------------------------

  private buildNodeContext(node: any): string {
    let ctx = ''
    if (node.dependencies.length > 0) {
      ctx += '## 依赖节点输出\n'
      for (const depId of node.dependencies) {
        const dep = this.graph?.get(depId)
        if (dep?.result) {
          ctx += `### ${dep.stage}\n${dep.result.slice(0, 1000)}\n\n`
        }
      }
    }
    return ctx
  }

  private buildDiscussionContext(messages: AgentMessage[]): string {
    const recent = messages.slice(-10)
    return recent
      .map(m => `[${getRoleDisplayName(m.from)}] ${m.content.slice(0, 500)}`)
      .join('\n\n')
  }

  private extractArtifacts(output: string): string[] {
    const artifacts: string[] = []
    const patterns = [
      /(?:创建|写入|保存|修改|生成)\s+[`"]?([^\s`"']+\.(ts|tsx|js|jsx|py|md|json|yaml|yml|toml))[`"]?/gi,
    ]
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(output)) !== null) {
        const path = match[1]
        if (path && !artifacts.includes(path)) artifacts.push(path)
      }
    }
    return artifacts
  }

  private buildSummary(success: boolean, finalStage: string, results: RoleExecutionResult[], artifacts: string[], duration: number, iterations: number): string {
    const status = success ? '✅ 成功' : '❌ 失败'
    const lines = [
      `${status} | 最终阶段: ${finalStage}`,
      `质量评分: ${computeQualityScore(results)}/100`,
      `总耗时: ${(duration / 1000).toFixed(1)}s`,
      `总迭代: ${iterations}`,
      '',
      '阶段执行结果:',
    ]

    for (const r of results) {
      const icon = r.success ? '✅' : '❌'
      lines.push(`  ${icon} ${r.role} (${r.stage})`)
      if (r.error) lines.push(`     错误: ${r.error}`)
    }

    if (artifacts.length > 0) {
      lines.push('', '产出文件:')
      for (const a of artifacts) lines.push(`  - ${a}`)
    }

    return lines.join('\n')
  }
}

// ---------------------------------------------------------------------------
// OrchestratorDeps — 编排器依赖注入
// ---------------------------------------------------------------------------

export interface OrchestratorDeps {
  /** 执行 LLM 调用：role + systemPrompt + userPrompt + context → output */
  executeLLM: (role: string, systemPrompt: string, userPrompt: string, context: string) => Promise<string>
  /** 编排链路追踪开始（吸收自 LangSmith / CrewAI trace） */
  onTraceStart?: (name: string, input: string) => string
  /** 编排链路追踪结束 */
  onTraceEnd?: (traceId: string, output: string, metadata?: string[]) => void
  /** 编排链路追踪失败 */
  onTraceFail?: (traceId: string, error: string) => void
  /** 追踪数据持久化回调（吸收自 LangSmith export）：将 trace 记录写入外部存储 */
  onTracePersist?: (record: { traceId: string; name: string; input: string; output?: string; error?: string; metadata?: string[]; startTime: number; endTime: number }) => void
}

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: OrchestratorConfig = {
  mode: 'pipeline',
  maxIterations: 10,
  parallelResearch: true,
  mergeStrategy: 'merge',
  roles: ['team_leader', 'pm', 'architect', 'engineer', 'qa', 'researcher'],
  autoFix: true,
  qualityGate: true,
  verbose: false,
  maxDiscussionRounds: 5,
}

// ---------------------------------------------------------------------------
// 质量评分
// ---------------------------------------------------------------------------

function computeQualityScore(results: RoleExecutionResult[]): number {
  if (results.length === 0) return 0

  let score = 0
  const weights: Record<string, number> = {
    research: 10,
    analyze: 15,
    design: 15,
    plan: 10,
    implement: 25,
    verify: 20,
    review: 5,
  }

  for (const r of results) {
    const w = weights[r.stage] ?? 10
    if (r.success) {
      score += w
      score += Math.min(5, Math.floor(r.output.length / 200))
    } else {
      score += Math.floor(w * 0.2)
    }
  }

  return Math.min(100, score)
}

// ---------------------------------------------------------------------------
// 阶段 → 角色映射
// ---------------------------------------------------------------------------

function stageToRole(stage: WorkflowStage): string {
  const map: Record<WorkflowStage, string> = {
    research: 'researcher',
    analyze: 'pm',
    design: 'architect',
    plan: 'team_leader',
    implement: 'engineer',
    verify: 'qa',
    review: 'team_leader',
    done: 'supervisor',
    failed: 'supervisor',
  }
  return map[stage] ?? 'team_leader'
}
