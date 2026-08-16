/**
 * src/engine/orchestrator/pipeline.ts
 *
 * Pipeline 执行器 — 吸收 MetaGPT 严格顺序流水线
 *
 * 每个阶段由对应角色执行，产出输出后传递给下一个阶段。
 * 支持 autoFix（失败自动重试）和 qualityGate（QA 门禁）。
 */

import type { WorkflowStage, AgentMessage, OrchestrationResult, RoleExecutionResult, OrchestratorConfig } from './messages.js'
import { buildAgentDefinition } from './agentRole.js'

// Pipeline 阶段定义
export const PIPELINE_STAGES: WorkflowStage[] = [
  'research', 'analyze', 'design', 'plan', 'implement', 'verify', 'review', 'done'
]

// ---------------------------------------------------------------------------
// PipelineExecutor
// ---------------------------------------------------------------------------

export interface PipelineExecutorDeps {
  /** 调用 LLM 执行角色任务 */
  executeRole: (role: string, systemPrompt: string, task: string, context: string) => Promise<string>
  /** 可选：写入文件 */
  writeFile?: (path: string, content: string) => Promise<void>
  /** 可选：运行命令 */
  runCommand?: (cmd: string) => Promise<string>
  /** 进度回调 */
  onProgress?: (stage: WorkflowStage, role: string, output: string) => void
}

export class PipelineExecutor {
  private deps: PipelineExecutorDeps
  private config: OrchestratorConfig
  private roleOutputs: Map<WorkflowStage, string> = new Map()
  private messages: AgentMessage[] = []
  private artifacts: string[] = []
  private totalIterations = 0

  constructor(deps: PipelineExecutorDeps, config: OrchestratorConfig) {
    this.deps = deps
    this.config = config
  }

  /**
   * 执行完整流水线
   */
  async run(taskDescription: string): Promise<OrchestrationResult> {
    const startTime = Date.now()
    const roleResults: RoleExecutionResult[] = []
    let previousOutput = ''

    const stages = this.config.mode === 'parallel'
      ? ['research', 'analyze', 'plan', 'implement', 'verify', 'review']
      : PIPELINE_STAGES

    for (const stage of stages) {
      if (stage === 'done') break

      // 检查是否跳过（依赖失败）
      const roleDef = buildAgentDefinition(stageToRole(stage))
      const context = this.buildContext(stage, previousOutput)

      // 执行角色
      const result = await this.executeStage(stage, roleDef, taskDescription, context)

      roleResults.push(result)
      this.totalIterations += result.iterations

      if (result.success) {
        previousOutput = result.output
        this.roleOutputs.set(stage, result.output)

        // 记录 artifacts
        if (result.artifacts) {
          this.artifacts.push(...result.artifacts)
        }
      } else {
        // 失败处理
        if (this.config.autoFix && result.error && !result.error.includes('[BLOCKED]')) {
          const retryResult = await this.retryStage(stage, roleDef, taskDescription, context, result)
          if (retryResult.success) {
            roleResults[roleResults.length - 1] = retryResult
            previousOutput = retryResult.output
            this.roleOutputs.set(stage, retryResult.output)
            this.totalIterations += retryResult.iterations
            continue
          }
        }

        // 失败且无法修复 → 终止
        return this.buildResult(false, 'failed', roleResults, '', startTime)
      }

      // 进度回调
      if (this.deps.onProgress) {
        this.deps.onProgress(stage, roleDef.name, result.output)
      }
    }

    // QA 质量门禁
    let finalStage: WorkflowStage = 'review'
    let mergedOutput = previousOutput

    if (this.config.qualityGate && this.roleOutputs.has('verify')) {
      const qaResult = roleResults.find(r => r.role === 'qa')
      if (qaResult && !qaResult.success) {
        return this.buildResult(false, 'verify', roleResults, mergedOutput, startTime)
      }
    }

    return this.buildResult(true, 'done', roleResults, mergedOutput, startTime)
  }

  /**
   * 执行单个阶段
   */
  private async executeStage(
    stage: WorkflowStage,
    roleDef: ReturnType<typeof buildAgentDefinition>,
    task: string,
    context: string
  ): Promise<RoleExecutionResult> {
    const startTime = Date.now()
    const systemPrompt = roleDef.systemPrompt
    const userPrompt = this.buildStagePrompt(stage, task, context)
    let iterations = 0
    let output = ''

    // 重试逻辑
    const maxRetries = roleDef.retryPolicy === 'twice' ? 2 : roleDef.retryPolicy === 'once' ? 1 : 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      iterations++
      try {
        output = await this.deps.executeRole(roleDef.role, systemPrompt, userPrompt, context)

        // 检查是否标记为阻塞
        if (output.includes('[BLOCKED]')) {
          return {
            role: roleDef.role,
            stage,
            success: false,
            output,
            iterations,
            duration: Date.now() - startTime,
            error: output.includes('[BLOCKED]') ? 'Task blocked by agent' : undefined,
          }
        }

        // 提取 artifacts（如果输出中包含文件路径标记）
        const artifacts = this.extractArtifacts(output)

        return {
          role: roleDef.role,
          stage,
          success: true,
          output,
          iterations,
          duration: Date.now() - startTime,
          artifacts,
        }
      } catch (err: any) {
        if (attempt < maxRetries) {
          continue
        }
        return {
          role: roleDef.role,
          stage,
          success: false,
          output: output || err.message,
          iterations,
          duration: Date.now() - startTime,
          error: err.message,
        }
      }
    }

    return {
      role: roleDef.role,
      stage,
      success: false,
      output,
      iterations,
      duration: Date.now() - startTime,
      error: 'Max retries exceeded',
    }
  }

  /**
   * 重试阶段（带错误上下文）
   */
  private async retryStage(
    stage: WorkflowStage,
    roleDef: ReturnType<typeof buildAgentDefinition>,
    task: string,
    context: string,
    previousResult: RoleExecutionResult
  ): Promise<RoleExecutionResult> {
    const errorContext = `\n\n## 上一步执行失败\n错误：${previousResult.error}\n输出：${previousResult.output.slice(0, 500)}\n\n请修复上述问题并重新执行。`
    const retryContext = context + errorContext

    return this.executeStage(stage, roleDef, task, retryContext)
  }

  /**
   * 构建阶段执行上下文
   */
  private buildContext(stage: WorkflowStage, previousOutput: string): string {
    let context = ''

    if (previousOutput) {
      context += `## 前序阶段输出\n${previousOutput.slice(0, 3000)}\n`
    }

    if (this.roleOutputs.size > 0) {
      context += '\n## 已完成的阶段输出\n'
      for (const [s, output] of this.roleOutputs) {
        if (s !== stage) {
          context += `### ${s}\n${output.slice(0, 500)}\n\n`
        }
      }
    }

    return context
  }

  /**
   * 构建阶段提示词
   */
  private buildStagePrompt(stage: WorkflowStage, task: string, context: string): string {
    const prompts: Record<WorkflowStage, string> = {
      research: `## 调研阶段\n\n任务：${task}\n\n请调研代码库中相关的现有实现、依赖关系和影响范围。只调研不修改文件。输出格式：\n1. 相关文件列表（路径 + 行号）\n2. 现有实现摘要\n3. 潜在风险和依赖`,
      analyze: `## 需求分析阶段\n\n任务：${task}\n\n请基于调研结果编写 PRD（产品需求文档）：\n1. 功能概述\n2. 用户故事（As a... I want... So that...）\n3. 验收标准（Given/When/Then）\n4. 优先级（P0/P1/P2）\n5. 范围边界（什么不做）`,
      design: `## 技术设计阶段\n\n任务：${task}\n\n请基于 PRD 设计技术方案：\n1. 模块划分和职责\n2. 接口定义（参数/返回值/异常）\n3. 数据流和状态管理\nn4. 技术选型和理由\n5. 风险评估和缓解方案`,
      plan: `## 任务规划阶段\n\n任务：${task}\n\n请将技术方案分解为可执行的任务：\n1. 任务列表（编号 + 描述 + 估计复杂度）\n2. 依赖关系（A 依赖 B）\n3. 执行顺序\n4. 每个任务的验收标准`,
      implement: `## 实现阶段\n\n任务：${task}\n\n请根据任务计划编写代码：\n1. 按计划逐步实现\n2. 遵循项目代码规范\n3. 每个 commit 有清晰的 message\n4. 完成后运行相关测试\n5. 如果测试失败，自动修复`,
      verify: `## 验证阶段\n\n任务：${task}\n\n请验证实现是否正确：\n1. 运行相关测试（单元测试 + 集成测试）\n2. 检查代码覆盖率\n3. 验证是否符合 PRD 的验收标准\n4. 输出质量报告`,
      review: `## 最终审查阶段\n\n任务：${task}\n\n请对所有阶段输出进行最终审查：\n1. 检查所有阶段输出是否完整\n2. 验证实现是否满足需求\n3. 检查代码质量和规范\n4. 给出最终结论：通过 / 不通过（附带原因）`,
      done: '',
      failed: '',
    }

    const prompt = prompts[stage] || task
    return context ? `${prompt}\n\n${context}` : prompt
  }

  /**
   * 从输出中提取文件路径标记
   */
  private extractArtifacts(output: string): string[] {
    const artifacts: string[] = []
    // 匹配常见文件路径标记
    const patterns = [
      /(?:创建|写入|保存|修改|生成)\s+[`"]?([^\s`"']+\.(ts|tsx|js|jsx|py|md|json|yaml|yml|toml))[`"]?/gi,
      /(?:文件|路径)[：:]\s*[`"]?([^\s`"']+\.(ts|tsx|js|jsx|py|md|json|yaml|yml|toml))[`"]?/gi,
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(output)) !== null) {
        const path = match[1]
        if (path && !artifacts.includes(path)) {
          artifacts.push(path)
        }
      }
    }

    return artifacts
  }

  /**
   * 构建最终结果
   */
  private buildResult(
    success: boolean,
    finalStage: WorkflowStage,
    roleResults: RoleExecutionResult[],
    mergedOutput: string,
    startTime: number
  ): OrchestrationResult {
    const qualityScore = computeQualityScore(roleResults)

    return {
      success,
      finalStage,
      roleResults,
      mergedOutput,
      qualityScore,
      totalDuration: Date.now() - startTime,
      totalIterations: this.totalIterations,
      summary: this.buildSummary(success, finalStage, roleResults, qualityScore),
      artifacts: this.artifacts,
    }
  }

  /**
   * 构建摘要
   */
  private buildSummary(success: boolean, finalStage: WorkflowStage, results: RoleExecutionResult[], qualityScore: number): string {
    const status = success ? '✅ 成功' : '❌ 失败'
    const lines = [
      `${status} | 最终阶段: ${finalStage}`,
      `质量评分: ${qualityScore}/100`,
      `总耗时: ${this.formatDuration(this.totalDuration)}`,
      `总迭代: ${this.totalIterations}`,
      '',
      '阶段执行结果:',
    ]

    for (const r of results) {
      const icon = r.success ? '✅' : '❌'
      lines.push(`  ${icon} ${r.role} (${r.stage}) — ${r.iterations} iterations, ${this.formatDuration(r.duration)}`)
      if (r.error) lines.push(`     错误: ${r.error}`)
      if (r.artifacts && r.artifacts.length > 0) {
        lines.push(`     产出: ${r.artifacts.join(', ')}`)
      }
    }

    return lines.join('\n')
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
}

// ---------------------------------------------------------------------------
// 质量评分（对齐 teamOrchestrator.computeQualityScore）
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

