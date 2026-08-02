/**
 * engine/autoFixLoop.ts — 自动修复循环（吸收自 Aider）
 *
 * 在 FileEditTool/FileWriteTool 成功执行后，自动 lint → test → fix。
 * 检测工具输出中的错误模式，将错误注入对话让 agent 自动修复。
 *
 * 来源项目：Aider (https://aider.chat) 的 --auto-lint + --auto-test 机制
 */

export interface AutoFixLoopConfig {
  /** 最大自动修复轮数 */
  maxIterations: number
  /** 是否启用 */
  enabled: boolean
  /** 事件回调 */
  onEvent?: (event: AutoFixLoopEvent) => void
}

export type AutoFixLoopEvent =
  | { type: 'autofix_start'; editedFiles: string[] }
  | { type: 'autofix_lint'; output: string; hasErrors: boolean }
  | { type: 'autofix_test'; output: string; hasErrors: boolean }
  | { type: 'autofix_fix_attempt'; attempt: number }
  | { type: 'autofix_done'; success: boolean; attempts: number }
  | { type: 'autofix_skip'; reason: string }

/** 常见 lint 错误模式 */
const LINT_ERROR_PATTERNS = [
  /error TS\d+:/i,
  /error:\s*.*/,
  /✖\s*\d+\s*problem/,
  /found\s*\d+\s*error/,
  /lint\s*error/i,
  /type\s*error/i,
  /syntax\s*error/i,
  /unused\s*variable/i,
  /missing\s*return/i,
  /expected\s*';'/i,
  /expected\s*'}'/i,
  /expected\s*[)]'/i,
  /undefined\s*variable/i,
  /cannot\s*find\s*module/i,
]

/** 常见 test 错误模式 */
const TEST_ERROR_PATTERNS = [
  /FAIL\s+\S+\.test\./,
  /AssertionError/,
  /expect\(.*\)\.(to|not)/,
  /✗\s*FAIL/,
  /✗\s*failing/,
  /\d+\s*failing/,
  /test\s*failed/i,
  /tests?\s*failed/i,
  /expected.*received/,
]

export class AutoFixLoop {
  private config: AutoFixLoopConfig
  private currentIteration = 0

  constructor(config: AutoFixLoopConfig) {
    this.config = config
  }

  /**
   * 检查是否需要触发自动修复循环。
   * 返回注入对话的消息列表（tool role），为空则无需修复。
   */
  maybeRun(
    results: Array<{ toolUseId: string; success: boolean; output?: unknown; error?: string }>,
  ): Array<{ role: 'tool'; toolUseId: string; content: string }> {
    if (!this.config.enabled) return []
    if (this.currentIteration >= this.config.maxIterations) return []

    // 从所有工具输出中提取编辑的文件路径
    const editedFiles = this.extractEditedFiles(results)
    if (editedFiles.length === 0) return []

    this.currentIteration++
    const injectedMessages: Array<{ role: 'tool'; toolUseId: string; content: string }> = []

    this.config.onEvent?.({ type: 'autofix_start', editedFiles })

    // Step 1: 从工具输出中检测 lint/test 错误
    const allErrors = this.detectErrors(results)
    if (allErrors.length > 0) {
      this.config.onEvent?.({
        type: allErrors.some(e => e.type === 'lint') ? 'autofix_lint' : 'autofix_test',
        output: allErrors.map(e => e.message).join('\n'),
        hasErrors: true,
      })
      injectedMessages.push({
        role: 'tool',
        toolUseId: `autofix_validation_${this.currentIteration}`,
        content: `[Auto-Fix Loop] 验证发现问题（轮次 ${this.currentIteration}/${this.config.maxIterations}）:\n${allErrors.map(e => e.message).join('\n')}\n\n请修复以上错误。`,
      })
    } else {
      this.config.onEvent?.({ type: 'autofix_done', success: true, attempts: this.currentIteration })
    }

    if (injectedMessages.length > 0) {
      this.config.onEvent?.({ type: 'autofix_fix_attempt', attempt: this.currentIteration })
    }

    return injectedMessages
  }

  /** 重置轮次计数（新任务开始时调用） */
  reset(): void {
    this.currentIteration = 0
  }

  /** 从所有工具输出中提取被编辑的文件路径 */
  private extractEditedFiles(
    results: Array<{ toolUseId: string; success: boolean; output?: unknown; error?: string }>,
  ): string[] {
    const files: string[] = []
    for (const r of results) {
      const output = typeof r.output === 'string' ? r.output : ''
      if (!r.success) continue
      const editMatches = output.matchAll(/Edited? file[:\s]+([^\s,;]+\.(ts|tsx|js|jsx|py|rs|go|java|rb|php|c|cpp|h|css|scss|json|yaml|yml|md|txt|toml))/gi)
      for (const m of editMatches) {
        if (!files.includes(m[1])) files.push(m[1])
      }
      const writeMatches = output.matchAll(/File (?:written to|updated|saved)[:\s]+([^\s,;]+)/gi)
      for (const m of writeMatches) {
        if (!files.includes(m[1])) files.push(m[1])
      }
    }
    return files
  }

  /** 从工具输出中检测 lint/test 错误 */
  private detectErrors(results: Array<{ toolUseId: string; success: boolean; output?: unknown; error?: string }>): Array<{ type: 'lint' | 'test'; message: string }> {
    const found: Array<{ type: 'lint' | 'test'; message: string }> = []
    const seen = new Set<string>()

    for (const r of results) {
      const output = typeof r.output === 'string' ? r.output : ''
      const error = typeof r.error === 'string' ? r.error : ''
      const combined = `${output}\n${error}`

      // 扫描 lint 错误模式
      for (const pattern of LINT_ERROR_PATTERNS) {
        const matches = combined.matchAll(pattern)
        for (const m of matches) {
          const start = Math.max(0, m.index! - 30)
          const end = Math.min(combined.length, m.index! + 200)
          const line = combined.substring(start, end).trim()
          const key = line.substring(0, 60)
          if (!seen.has(key)) {
            seen.add(key)
            found.push({ type: 'lint', message: line })
          }
        }
      }

      // 扫描 test 错误模式
      for (const pattern of TEST_ERROR_PATTERNS) {
        const matches = combined.matchAll(pattern)
        for (const m of matches) {
          const start = Math.max(0, m.index! - 30)
          const end = Math.min(combined.length, m.index! + 200)
          const line = combined.substring(start, end).trim()
          const key = line.substring(0, 60)
          if (!seen.has(key)) {
            seen.add(key)
            found.push({ type: 'test', message: line })
          }
        }
      }
    }
    return found.slice(0, 20)
  }
}
