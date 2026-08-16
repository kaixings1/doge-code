/**
 * toolCollectionOrchestrator.ts — 工具集合编排器（吸收 OpenManus 精华）
 *
 * 将 ToolRegistry 作为统一工具入口，提供：
 * 1. executeByName — 按名称执行工具（替代分散式调用）
 * 2. executeBatch — 批量执行工具（支持并行/串行）
 * 3. executePipeline — 工具管道（前一个的输出作为后一个的输入）
 * 4. discoverTools — 智能工具发现（基于任务描述推荐工具）
 * 5. validateToolChain — 验证工具链的兼容性
 */

import { ToolScheduler, type ToolCall, type ToolResult } from '../../engine/toolScheduler.js'
import { getGlobalToolRegistry, type ToolAdapter, type ToolExecutionContext } from './toolRegistry.js'

// ─── 执行配置 ────────────────────────────────────────────

export interface ExecuteOptions {
  timeout?: number
  onProgress?: (toolName: string, progress: { percent: number; message?: string }) => void
  continueOnError?: boolean
  maxConcurrency?: number
}

export interface PipelineStep {
  tool: string
  input: Record<string, unknown>
  outputKey?: string   // 将输出存储到 context 的键名
  condition?: string   // 条件表达式，满足才执行
}

export interface PipelineResult {
  success: boolean
  steps: Array<{
    tool: string
    success: boolean
    output?: unknown
    error?: string
    duration: number
  }>
  finalOutput?: unknown
  totalDuration: number
}

// ─── 工具发现 ────────────────────────────────────────────

export interface ToolDiscovery {
  recommended: Array<{
    tool: string
    reason: string
    confidence: number
  }>
  pipeline: string[]           // 推荐的执行顺序
  alternatives: Record<string, string[]>  // 每个工具的替代
}

// ─── 编排器 ────────────────────────────────────────────

export class ToolCollectionOrchestrator {
  private registry = getGlobalToolRegistry()
  private toolScheduler: ToolScheduler | null = null

  setToolScheduler(scheduler: ToolScheduler): void {
    this.toolScheduler = scheduler
  }

  // ─── 单工具执行 ────────────────────────────────────────────

  async executeByName(name: string, input: Record<string, unknown>, opts: ExecuteOptions = {}): Promise<{
    success: boolean
    output?: unknown
    error?: string
    duration: number
  }> {
    const adapter = this.registry.get(name)
    if (!adapter) {
      return { success: false, error: `工具未找到: ${name}`, duration: 0 }
    }

    const startTime = Date.now()
    try {
      const result = await adapter.execute(input, {
        timeout: opts.timeout,
        onProgress: opts.onProgress,
      })
      this.registry.recordExecution(name, result)
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        duration: result.duration,
      }
    } catch (e) {
      const duration = Date.now() - startTime
      const error = e instanceof Error ? e.message : String(e)
      this.registry.recordExecution(name, {
        success: false,
        error,
        errorType: 'runtime',
        duration,
      })
      return { success: false, error, duration }
    }
  }

  // ─── 批量执行 ────────────────────────────────────────────

  async executeBatch(
    calls: Array<{ tool: string; input: Record<string, unknown> }>,
    opts: ExecuteOptions = {},
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = []
    const maxConcurrency = opts.maxConcurrency ?? 3

    // 分组：可并行 vs 必须串行
    const parallel: typeof calls = []
    const serial: typeof calls = []

    for (const call of calls) {
      const adapter = this.registry.get(call.tool)
      if (adapter?.metadata.annotations?.destructiveHint) {
        serial.push(call)
      } else {
        parallel.push(call)
      }
    }

    // 并行执行
    const parallelResults = await this.executeParallel(parallel, maxConcurrency, opts)
    results.push(...parallelResults)

    // 串行执行
    for (const call of serial) {
      const result = await this.executeByName(call.tool, call.input, opts)
      results.push({
        toolUseId: `${call.tool}_${Date.now()}`,
        success: result.success,
        output: result.output,
        error: result.error,
      })
      if (!result.success && !opts.continueOnError) {
        break
      }
    }

    return results
  }

  private async executeParallel(
    calls: Array<{ tool: string; input: Record<string, unknown> }>,
    concurrency: number,
    opts: ExecuteOptions,
  ): Promise<ToolResult[]> {
    if (calls.length === 0) return []

    const results: ToolResult[] = []
    const batches: Array<Array<typeof calls>> = []

    for (let i = 0; i < calls.length; i += concurrency) {
      batches.push(calls.slice(i, i + concurrency))
    }

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(call =>
          this.executeByName(call.tool, call.input, opts).then(result => ({
            toolUseId: `${call.tool}_${Date.now()}`,
            success: result.success,
            output: result.output,
            error: result.error,
          } as ToolResult))
        )
      )

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          results.push(settled.value)
        } else {
          results.push({
            toolUseId: 'unknown',
            success: false,
            error: settled.reason?.message ?? 'Unknown error',
          })
        }
        if (!opts.continueOnError && results.some(r => !r.success)) {
          break
        }
      }
    }

    return results
  }

  // ─── 管道执行 ────────────────────────────────────────────

  async executePipeline(
    steps: PipelineStep[],
    opts: ExecuteOptions = {},
  ): Promise<PipelineResult> {
    const stepResults: PipelineResult['steps'] = []
    let lastOutput: unknown = null
    const context: Record<string, unknown> = {}
    const startTime = Date.now()

    for (const step of steps) {
      // 条件检查
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        stepResults.push({
          tool: step.tool,
          success: true,
          output: null,
          duration: 0,
        })
        continue
      }

      // 合并上下文中的值到输入
      const mergedInput = this.mergeContext(step.input, context)

      const result = await this.executeByName(step.tool, mergedInput, opts)
      stepResults.push({
        tool: step.tool,
        success: result.success,
        output: result.output,
        error: result.error,
        duration: result.duration,
      })

      if (!result.success && !opts.continueOnError) {
        return {
          success: false,
          steps: stepResults,
          totalDuration: Date.now() - startTime,
        }
      }

      lastOutput = result.output
      // 存储到上下文
      if (step.outputKey) {
        context[step.outputKey] = result.output
      }
    }

    return {
      success: stepResults.every(s => s.success),
      steps: stepResults,
      finalOutput: lastOutput,
      totalDuration: Date.now() - startTime,
    }
  }

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    try {
      // 安全的条件表达式求值（仅支持简单的变量存在检查）
      if (condition.startsWith('exists:')) {
        const key = condition.slice(7)
        return key in context && context[key] !== null && context[key] !== undefined
      }
      if (condition.startsWith('!exists:')) {
        const key = condition.slice(8)
        return !(key in context && context[key] !== null && context[key] !== undefined)
      }
      return true
    } catch {
      return true
    }
  }

  private mergeContext(input: Record<string, unknown>, context: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...input }
    // 替换 {{key}} 占位符
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.includes('{{')) {
        result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, match) => {
          const ctxValue = context[match]
          return ctxValue !== undefined ? JSON.stringify(ctxValue) : `{{${match}}}`
        })
      }
    }
    return result
  }

  // ─── 智能工具发现 ────────────────────────────────────────────

  discoverTools(taskDescription: string): ToolDiscovery {
    const registry = this.registry
    const allTools = registry.getAll()
    const recommended: ToolDiscovery['recommended'] = []

    // 基于关键词匹配推荐工具
    const keywords = this.extractKeywords(taskDescription)

    for (const adapter of allTools) {
      const score = this.computeRelevance(adapter, keywords, taskDescription)
      if (score > 0.3) {
        recommended.push({
          tool: adapter.metadata.name,
          reason: this.generateReason(adapter, keywords),
          confidence: score,
        })
      }
    }

    // 按置信度排序
    recommended.sort((a, b) => b.confidence - a.confidence)

    // 生成推荐管道
    const pipeline = this.recommendPipeline(recommended)

    // 生成替代关系
    const alternatives: Record<string, string[]> = {}
    for (const rec of recommended.slice(0, 5)) {
      const alts = registry.getAlternatives(rec.tool)
      if (alts.length > 0) {
        alternatives[rec.tool] = alts.map(a => a.metadata.name)
      }
    }

    return {
      recommended: recommended.slice(0, 10),
      pipeline,
      alternatives,
    }
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off',
      'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
      'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so',
      'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if',
      'while', 'about', 'up', 'down', '这个', '那个', '一个', '什么', '怎么',
      '如何', '为什么', '哪', '哪些', '请', '帮我', '需要', '要', '了',
    ])

    const words = text.toLowerCase().split(/[\s\p{P}]+/u)
    return words.filter(w => w.length > 1 && !stopWords.has(w))
  }

  private computeRelevance(adapter: ToolAdapter, keywords: string[], task: string): number {
    const name = adapter.metadata.name.toLowerCase()
    const desc = adapter.metadata.description.toLowerCase()
    const tags = adapter.metadata.tags.map(t => t.toLowerCase())
    const allText = `${name} ${desc} ${tags.join(' ')}`

    let score = 0
    for (const kw of keywords) {
      if (allText.includes(kw)) {
        score += 0.2
      }
      if (name.includes(kw)) {
        score += 0.3 // 名称匹配权重更高
      }
    }

    // 归一化到 0-1
    return Math.min(1, score)
  }

  private generateReason(adapter: ToolAdapter, keywords: string[]): string {
    const matchingKeywords = keywords.filter(kw =>
      adapter.metadata.name.toLowerCase().includes(kw) ||
      adapter.metadata.description.toLowerCase().includes(kw) ||
      adapter.metadata.tags.some(t => t.toLowerCase().includes(kw))
    )
    return `匹配关键词: ${matchingKeywords.join(', ')}`
  }

  private recommendPipeline(recommended: ToolDiscovery['recommended']): string[] {
    const pipeline: string[] = []
    const order: Record<string, number> = {
      glob: 1, grep: 2, code_search: 3, file_read: 4,
      file_edit: 5, file_write: 6, bash: 7, git: 8,
    }

    const sorted = [...recommended].sort((a, b) => {
      const orderA = order[a.tool] ?? 99
      const orderB = order[b.tool] ?? 99
      if (orderA !== orderB) return orderA - orderB
      return b.confidence - a.confidence
    })

    for (const rec of sorted) {
      if (!pipeline.includes(rec.tool)) {
        pipeline.push(rec.tool)
      }
    }

    return pipeline
  }

  // ─── 工具链验证 ────────────────────────────────────────────

  validateToolChain(toolNames: string[]): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    for (const name of toolNames) {
      const adapter = this.registry.get(name)
      if (!adapter) {
        errors.push(`工具未注册: ${name}`)
        continue
      }

      if (adapter.metadata.deprecated) {
        warnings.push(`工具已弃用: ${name}，建议使用 ${adapter.metadata.replacement ?? '替代工具'}`)
      }

      // 检查依赖
      const rels = this.registry.getRelationships(name)
      for (const rel of rels) {
        if (rel.type === 'depends_on' && !toolNames.includes(rel.target)) {
          warnings.push(`${name} 依赖 ${rel.target}，但后者不在工具链中`)
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }
}

// 全局单例
let globalOrchestrator: ToolCollectionOrchestrator | null = null

export function getGlobalOrchestrator(): ToolCollectionOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new ToolCollectionOrchestrator()
  }
  return globalOrchestrator
}

export function resetGlobalOrchestrator(): void {
  globalOrchestrator = null
}
