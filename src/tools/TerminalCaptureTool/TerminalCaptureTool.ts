import { type Tool } from '../../engine/types.js'
import { spawn } from 'child_process'

interface CaptureResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  durationMs: number
  stdoutLines: number
}

export class TerminalCaptureTool implements Tool {
  name = 'terminal_capture'
  description = 'Capture terminal output with streaming, timing stats, exit code analysis, and memory-safe buffering'
  parameters = {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'Command to execute and capture' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
      cwd: { type: 'string', description: 'Working directory (default: current directory)' },
      shell: { type: 'string', description: 'Shell to use: cmd, powershell, bash, or auto', enum: ['cmd', 'powershell', 'bash', 'auto'] },
      maxOutput: { type: 'number', description: 'Maximum output length in chars (default 5000, buffer capped at 2x)' },
      env: { type: 'object', description: 'Additional environment variables to pass' }
    },
    required: ['command']
  }
  validate = () => ({ valid: true })
  isEnabled = () => true
  async prompt() {
    return this.description
  }
  userFacingName() {
    return this.name
  }

  execute = async (params: Record<string, any>) => {
    const command = params?.command || ''
    if (!command) return { content: [{ type: 'text', text: 'Error: No command specified' }] }

    // 参数校验
    const timeout = typeof params?.timeout === 'number' && params.timeout > 0 ? params.timeout : 30000
    const maxOutput = typeof params?.maxOutput === 'number' && params.maxOutput > 0 ? params.maxOutput : 5000
    const cwd = params?.cwd || process.cwd()
    const shellChoice = params?.shell || 'auto'
    const extraEnv = params?.env && typeof params.env === 'object' ? params.env : {}

    // 确定 shell
    let shellCmd: string
    let shellArgs: string[]
    if (shellChoice === 'cmd' || (shellChoice === 'auto' && process.platform === 'win32')) {
      shellCmd = 'cmd.exe'
      shellArgs = ['/c', command]
    } else if (shellChoice === 'powershell') {
      shellCmd = 'powershell.exe'
      shellArgs = ['-NoProfile', '-Command', command]
    } else {
      shellCmd = process.platform === 'win32' ? 'bash' : '/bin/sh'
      shellArgs = ['-c', command]
    }

    const result = await this.capture(shellCmd, shellArgs, { command, timeout, maxOutput, cwd, extraEnv })

    // 退出码语义化
    let statusLabel = 'success'
    if (result.exitCode === null) {
      statusLabel = result.signal ? `killed by ${result.signal}` : 'timeout'
    } else if (result.exitCode !== 0) {
      statusLabel = `error (${result.exitCode})`
    }

    const lines = [
      '## Terminal Capture',
      '',
      `**Command:** \`${command}\``,
      `**Shell:** ${shellCmd} ${shellArgs.join(' ')}`,
      `**Exit Code:** ${result.exitCode ?? 'null (killed)'}`,
      `**Status:** ${statusLabel}`,
      `**Duration:** ${result.durationMs}ms`,
      `**Output Lines:** ${result.stdoutLines}`,
      `**Stdout Chars:** ${result.stdout.length}`,
      '',
      '**Stdout:**',
      '```',
      result.stdout || '(empty)',
      '```',
    ]
    if (result.stderr) {
      lines.push('', '**Stderr:**', '```', result.stderr.slice(0, 2000), '```')
    }
    if (result.stdout.length >= maxOutput) {
      lines.push('', `*(output truncated to ${maxOutput} chars; buffer capped at ${maxOutput * 2})*`)
    }
    if (result.signal) {
      lines.push('', `*process terminated by signal: ${result.signal}*`)
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }

  /**
   * 纯 spawn 流式执行，带内存安全缓冲
   */
  private capture(
    shellCmd: string,
    shellArgs: string[],
    opts: { command: string; timeout: number; maxOutput: number; cwd: string; extraEnv: Record<string, any> }
  ): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const start = Date.now()
      const bufferCap = opts.maxOutput * 2

      const child = spawn(shellCmd, shellArgs, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.extraEnv },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let stdoutLines = 0
      let killedByBuffer = false
      let timer: ReturnType<typeof setTimeout> | null = null

      // 超时强杀
      timer = setTimeout(() => {
        child.kill('SIGKILL')
      }, opts.timeout)

      // 流式收集 stdout（带内存保护：超过 2x maxOutput 立即终止）
      child.stdout?.on('data', (d: Buffer) => {
        const text = d.toString()
        stdout += text
        stdoutLines += (text.match(/\n/g) || []).length
        if (stdout.length > bufferCap) {
          killedByBuffer = true
          stdout = stdout.slice(0, bufferCap)
          child.kill('SIGKILL')
        }
      })

      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString()
        if (stderr.length > bufferCap) stderr = stderr.slice(0, bufferCap)
      })

      const finish = (exitCode: number | null, signal: string | null) => {
        if (timer) clearTimeout(timer)
        resolve({
          stdout,
          stderr,
          exitCode,
          signal: killedByBuffer ? 'buffer-limit' : signal,
          durationMs: Date.now() - start,
          stdoutLines,
        })
      }

      child.on('close', (code, signal) => finish(code, signal))
      child.on('error', (err) => {
        resolve({
          stdout,
          stderr: stderr || `spawn error: ${err.message}`,
          exitCode: -1,
          signal: null,
          durationMs: Date.now() - start,
          stdoutLines,
        })
      })
    })
  }
}
