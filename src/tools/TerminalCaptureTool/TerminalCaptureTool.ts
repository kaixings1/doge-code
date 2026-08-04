import { type Tool } from '../../engine/types.js'
import { execSync, spawn } from 'child_process'

export class TerminalCaptureTool implements Tool {
  name = 'terminal_capture'
  description = 'Capture terminal output from a command execution, supports streaming and error output'
  parameters = {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'Command to execute and capture' },
      timeout: { type: 'number', description: 'Timeout in milliseconds' },
      cwd: { type: 'string', description: 'Working directory' },
      shell: { type: 'string', description: 'Shell to use: cmd, powershell, bash, or auto', enum: ['cmd', 'powershell', 'bash', 'auto'] },
      maxOutput: { type: 'number', description: 'Maximum output length in chars' }
    },
    required: ['command']
  }
  validate = () => ({ valid: true })
  execute = async (params: Record<string, any>) => {
    const command = params?.command || ''
    if (!command) return { content: [{ type: 'text', text: 'Error: No command specified' }] }

    const timeout = params?.timeout || 30000
    const cwd = params?.cwd || process.cwd()
    const maxOutput = params?.maxOutput || 5000
    const shellChoice = params?.shell || 'auto'

    // 确定 shell
    let shellCmd: string
    let shellArgs: string[]
    if (shellChoice === 'cmd' || (shellChoice === 'auto' && process.platform === 'win32')) {
      shellCmd = 'cmd.exe'
      shellArgs = ['/c', command]
    } else if (shellChoice === 'powershell') {
      shellCmd = 'powershell.exe'
      shellArgs = ['-Command', command]
    } else {
      shellCmd = process.platform === 'win32' ? 'bash' : '/bin/sh'
      shellArgs = ['-c', command]
    }

    // 同步执行（快命令）
    try {
      const output = execSync(command, { encoding: 'utf-8', timeout, maxBuffer: 10 * 1024 * 1024, cwd, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' })
      const lines = ['## Terminal Capture', '', `**Command:** \`${command}\``, `**Exit Code:** 0`, `**Duration:** sync`, '', '**Output:**', '```', output.slice(0, maxOutput), '```']
      if (output.length > maxOutput) lines.push(`*(output truncated: ${output.length} chars)*`)
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    } catch (err: any) {
      // 同步失败，尝试流式执行以捕获 stderr
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
        const child = spawn(shellCmd, shellArgs, { cwd, shell: false, windowsHide: true })
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => { child.kill('SIGKILL') }, timeout)
        child.stdout?.on('data', (d) => { stdout += d.toString(); if (stdout.length > maxOutput * 2) child.kill('SIGKILL') })
        child.stderr?.on('data', (d) => { stderr += d.toString() })
        child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code }) })
        child.on('error', (e) => { clearTimeout(timer); resolve({ stdout, stderr: e.message, exitCode: -1 }) })
      })

      const lines = ['## Terminal Capture', '', `**Command:** \`${command}\``, `**Exit Code:** ${result.exitCode ?? 'timeout'}`, '', '**Stdout:**', '```', (result.stdout || '(empty)').slice(0, maxOutput), '```']
      if (result.stderr) {
        lines.push('', '**Stderr:**', '```', result.stderr.slice(0, Math.min(maxOutput, 2000)), '```')
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
  }
}
