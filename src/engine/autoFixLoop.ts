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
  /FAIL\s+\S+\.test/,
  /AssertionError/,
  /expect\(.*\)\.(to|not)/,
  /✗\s*FAIL/,
  /✗\s*failing/,
  /\d+\s*failing/,
  /test\s*failed/i,
  /tests?\s*failed/i,
  /expected.*received/,
]

// ============ 结构化错误解析器（吸收自 zhikuncode SelfCorrectionLoop） ============

export interface CompileError {
  file: string
  line: number | null
  column: number | null
  code: string | null
  message: string
}

export interface TestFailure {
  file: string
  line: number | null
  testName: string
  message: string
}

export interface CorrectionInstruction {
  targetFiles: string[]
  errorType: 'compile' | 'test' | 'lint'
  description: string
  rawErrors: string[]
}

/**
 * 结构化编译错误解析器。
 * 从 lint/test 输出中提取文件路径、行号、错误码和消息。
 * 吸收自 zhikuncode CompileErrorParser。
 */
export class CompileErrorParser {
  private static readonly PATTERNS = [
    // TypeScript/JavaScript: error TS1234: message (file, line, char)
    /^(.+?)\((\d+)(?:,(\d+))?\):\s*(?:error\s+(TS\d+):\s*(.+))$/m,
    // Standard compiler: file:line:column: error: message
    /^(.+?):(\d+)(?::(\d+))?:\s*error:\s*(.+)$/m,
    // Python: File "file", line N: message
    /^File\s+"(.+?)",\s*line\s+(\d+)(?:,\s*in\s+(.+))?:\s*(.+)$/m,
    // Generic: filename:line: message
    /^(.+\.(?:ts|tsx|js|jsx|py|rs|go|java|rb|c|cpp|h)):(\d+):\s*(.+)$/m,
  ]

  static parse(output: string): CompileError[] {
    const errors: CompileError[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      for (const pattern of this.PATTERNS) {
        const match = line.match(pattern)
        if (match) {
          errors.push({
            file: match[1]?.trim() || '',
            line: match[2] ? parseInt(match[2], 10) : null,
            column: match[3] ? parseInt(match[3], 10) : null,
            code: match[4] || null,
            message: match[5] || match[4] || line.trim(),
          })
          break
        }
      }
    }

    return errors
  }

  /** 提取本次错误涉及的文件列表（去重） */
  static extractFiles(errors: CompileError[]): string[] {
    return [...new Set(errors.map(e => e.file).filter(Boolean))]
  }
}

/**
 * 结构化测试失败解析器。
 * 从 test runner 输出中提取失败的文件、行号和测试名。
 * 吸收自 zhikuncode TestFailureParser。
 */
export class TestFailureParser {
  private static readonly FAILURE_PATTERNS = [
    // Jest/Vitest: FAIL path/to/file.test.ts
    /^FAIL\s+(.+\.(?:test|spec)\.(?:ts|tsx|js|jsx|py))/gm,
    // Generic FAIL with any filename
    /^FAIL\s+(\S+)/gm,
    // pytest: FAILED path/to/file.py::TestClass::test_method
    /^FAILED\s+(.+?)(?:::(.+?))?\s*$/gm,
    // Standard: ✗ FAIL filename
    /^✗\s*FAIL\s+(.+)/gm,
    // JUnit XML-ish: tests failed: filename:line
    /tests?\s*failed[:\s]+(.+?)(?::(\d+))?/gi,
  ]

  /** 检测输出中是否包含测试失败 */
  static hasFailures(output: string): boolean {
    return /(?:FAIL(?:ED)?|failing|AssertionError|tests?\s*failed|✗\s*(?:FAIL|failing))/i.test(output)
  }

  /** 提取失败的文件列表 */
  static extractFiles(output: string): string[] {
    const files: string[] = []
    for (const pattern of this.FAILURE_PATTERNS) {
      const matches = output.matchAll(pattern)
      for (const m of matches) {
        const file = m[1]?.trim()
        if (file && !files.includes(file)) files.push(file)
      }
    }
    return files
  }

  /** 生成结构化修正指令 */
  static buildInstruction(output: string, maxItems = 10): CorrectionInstruction | null {
    if (!this.hasFailures(output)) return null

    const files = this.extractFiles(output).slice(0, maxItems)
    if (files.length === 0) return null

    // 提取关键错误行
    const errorLines = output.split('\n')
      .filter(l => /(?:error|Error|FAIL|AssertionError|expected|received)/i.test(l))
      .slice(0, maxItems)

    return {
      targetFiles: files,
      errorType: 'test',
      description: `测试失败涉及 ${files.length} 个文件`,
      rawErrors: errorLines,
    }
  }
}

// ============ 增强的 AutoFixLoop ============

export class AutoFixLoop {
  private config: AutoFixLoopConfig
  private currentIteration = 0
  /** 首轮出现的错误文件集合，用于 shouldAbort 检测是否引入了新文件 */
  private firstRoundErrorFiles = new Set<string>()
  /** 首轮出现的错误类型集合，用于 shouldAbort 检测是否引入了新错误类型 */
  private firstRoundErrorCodes = new Set<string>()

  constructor(config: AutoFixLoopConfig) {
    this.config = config
  }

  /**
   * shouldAbort — 中止检查（吸收自 zhikuncode SelfCorrectionLoop）。
   *
   * 检查是否应提前中止修复循环：
   * 1. 当前轮次涉及的文件与首轮完全不同（说明修复引入了新问题）
   * 2. 当前轮次出现的错误类型与首轮完全不同（说明修复方向错误）
   *
   * SWE-bench 模式下阈值更宽松（允许更多探索）。
   */
  shouldAbort(
    currentErrors: Array<{ type: 'lint' | 'test'; message: string }>,
    editedFiles: string[],
  ): boolean {
    if (this.currentIteration === 0) {
      // 首轮：记录基线
      for (const e of currentErrors) {
        this.firstRoundErrorCodes.add(e.type + ':' + e.message.split(/[:(]/)[0])
      }
      for (const f of editedFiles) this.firstRoundErrorFiles.add(f)
      return false
    }

    // 检查是否引入了全新的错误文件
    const newFiles = editedFiles.filter(f => !this.firstRoundErrorFiles.has(f))
    if (newFiles.length > 0 && currentErrors.length > 0) {
      // 新文件 + 仍有错误 = 可能引入了新问题
      const newFileErrorRatio = newFiles.length / Math.max(1, editedFiles.length)
      if (newFileErrorRatio > 0.5) {
        this.config.onEvent?.({ type: 'autofix_skip', reason: `检测到 ${newFiles.length} 个新错误文件，中止修复` })
        return true
      }
    }

    // 检查错误类型是否完全改变（说明修复无效）
    if (currentErrors.length > 0 && this.firstRoundErrorCodes.size > 0) {
      const currentCodes = new Set(currentErrors.map(e => e.type + ':' + e.message.split(/[:(]/)[0]))
      const overlap = [...currentCodes].filter(c => this.firstRoundErrorCodes.has(c))
      if (overlap.length === 0 && this.currentIteration >= 2) {
        this.config.onEvent?.({ type: 'autofix_skip', reason: '错误类型完全改变，修复方向可能错误' })
        return true
      }
    }

    return false
  }

  /**
   * 检查是否需要触发自动修复循环。
   * 返回注入对话的消息列表（tool role），为空则无需修复。
   */
  maybeRun(
    results: Array<{ toolUseId: string; success: boolean; output?: unknown; error?: string }>,
  ): Array<{ role: 'user'; content: string }> {
    if (!this.config.enabled) return []
    if (this.currentIteration >= this.config.maxIterations) return []

    // 从所有工具输出中提取编辑的文件路径
    const editedFiles = this.extractEditedFiles(results)
    if (editedFiles.length === 0) return []

    // 使用结构化解析器提取错误
    const compileErrors = CompileErrorParser.parse(
      results.map(r => typeof r.output === 'string' ? r.output : typeof r.error === 'string' ? r.error : '').join('\n')
    )
    const testOutput = results.map(r => typeof r.output === 'string' ? r.output : '').join('\n')
    const testFailures = TestFailureParser.extractFiles(testOutput)

    const allErrors: Array<{ type: 'lint' | 'test'; message: string }> = [
      ...compileErrors.map(e => ({ type: 'lint' as const, message: `${e.file}:${e.line ?? '?'}: ${e.message}` })),
      ...testFailures.map(f => ({ type: 'test' as const, message: `测试失败: ${f}` })),
    ]

    // shouldAbort 检查
    if (this.shouldAbort(allErrors, editedFiles)) {
      this.reset()
      return []
    }

    this.currentIteration++
    const injectedMessages: Array<{ role: 'user'; content: string }> = []

    this.config.onEvent?.({ type: 'autofix_start', editedFiles })

    if (allErrors.length > 0) {
      this.config.onEvent?.({
        type: allErrors.some(e => e.type === 'lint') ? 'autofix_lint' : 'autofix_test',
        output: allErrors.map(e => e.message).join('\n'),
        hasErrors: true,
      })
      injectedMessages.push({
        role: 'user',
        content: `[Auto-Fix Loop] 验证发现问题（轮次 ${this.currentIteration}/${this.config.maxIterations}）:\n${allErrors.slice(0, 10).map(e => e.message).join('\n')}\n\n请修复以上错误。`,
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
    this.firstRoundErrorFiles.clear()
    this.firstRoundErrorCodes.clear()
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
