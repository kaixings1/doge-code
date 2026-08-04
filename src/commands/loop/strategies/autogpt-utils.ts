/**
 * AutoGPT 增强功能模块
 *
 * 提供 AI 错误恢复、执行统计、任务超时控制等功能
 * 可作为 mixin 或独立模块使用
 */

import { execSync } from 'child_process'

export interface CommandResult {
  success: boolean
  output: string
  error?: string
  exitCode?: number
  duration: number
}

export interface ErrorRecoveryResult {
  fixed: boolean
  commands: string[]
  analysis: string
}

/**
 * 执行 bash 命令（带超时和错误处理）
 */
export function runCommand(cmd: string, timeoutMs: number = 60000): CommandResult {
  const start = Date.now()
  try {
    const isWin = process.platform === 'win32'
    const shellPath = isWin ? 'C:\\Program Files\\Git\\bin\\bash.exe' : undefined
    const output = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: timeoutMs,
      shell: shellPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      killSignal: 'SIGTERM',
    })
    return { success: true, output, duration: Date.now() - start }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number; killed?: boolean }
    return {
      success: false,
      output: (e.stdout ?? '') + '\n' + (e.stderr ?? ''),
      error: e.killed ? `Timeout (${timeoutMs}ms)` : `Exit ${e.status ?? '?'}`,
      exitCode: e.status,
      duration: Date.now() - start,
    }
  }
}

/**
 * 从输出中提取创建的文件路径
 */
export function extractCreatedFiles(output: string): string[] {
  const files: string[] = []
  // 匹配 > filepath 模式
  const redirectMatches = output.match(/>\s*([^\s&|]+)/g)
  if (redirectMatches) {
    for (const m of redirectMatches) {
      const fp = m.replace(/^>\s*/, '').trim()
      if (fp && !fp.startsWith('/dev/') && !fp.startsWith('-')) {
        files.push(fp)
      }
    }
  }
  // 匹配 📄 filepath 模式（AI 输出）
  const emojiMatches = output.match(/📄\s*([^\n]+)/g)
  if (emojiMatches) {
    for (const m of emojiMatches) {
      files.push(m.replace('📄 ', '').trim())
    }
  }
  return [...new Set(files)]
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * 执行统计
 */
export class ExecutionStats {
  totalCommands = 0
  successCommands = 0
  failedCommands = 0
  totalDuration = 0
  retries = 0
  createdFiles: string[] = []

  record(result: CommandResult): void {
    this.totalCommands++
    this.totalDuration += result.duration
    if (result.success) {
      this.successCommands++
    } else {
      this.failedCommands++
    }
    // 提取创建的文件
    const files = extractCreatedFiles(result.output)
    this.createdFiles.push(...files)
  }

  recordRetry(): void {
    this.retries++
  }

  get successRate(): number {
    return this.totalCommands > 0 ? (this.successCommands / this.totalCommands) * 100 : 0
  }

  get uniqueFiles(): string[] {
    return [...new Set(this.createdFiles)]
  }

  toString(): string {
    return (
      `执行统计: ${this.successCommands}/${this.totalCommands} 成功 ` +
      `(${this.successRate.toFixed(0)}%), ${this.retries} 重试, ` +
      `${formatDuration(this.totalDuration)}, ${this.uniqueFiles.length} 文件`
    )
  }
}
