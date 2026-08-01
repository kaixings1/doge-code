import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'

const inputSchema = lazySchema(() =>
  z.object({
    command: z.string().describe('要执行的 Shell 命令'),
    cwd: z.string().optional().describe('工作目录'),
    env: z.record(z.string()).optional().describe('环境变量'),
    timeout: z.number().optional().describe('超时时间（毫秒），默认 120000'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    exitCode: z.number().describe('退出码'),
    stdout: z.string().describe('标准输出'),
    stderr: z.string().describe('标准错误输出'),
    durationMs: z.number().describe('执行耗时（毫秒）'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

export const ShellTool = buildTool({
  name: 'shell',
  description: async () => '执行 Shell 命令，支持自定义工作目录和环境变量',
  callOn: 'manual',
  async prompt() {
    return '使用 shell 工具执行 Shell 命令。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'shell'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    const cmd = (input as Record<string, unknown>)?.command ?? '?'
    return `Shell: ${cmd.substring(0, 50)}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const code = (content as Record<string, unknown>)?.exitCode
    const dur = (content as Record<string, unknown>)?.durationMs
    let msg = `Exit code: ${code}`
    if (dur) msg += ` (${dur}ms)`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ command, cwd, env, timeout = 120000 }) {
    const startTime = Date.now()
    try {
      const result = await exec(command, new AbortController().signal, 'bash', {
        timeout,
        cwd,
        env,
      })
      const durationMs = Date.now() - startTime
      return {
        data: {
          exitCode: result.code ?? 0,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          durationMs,
        } as Output,
      }
    } catch (err) {
      const durationMs = Date.now() - startTime
      const error = err instanceof Error ? err : new Error(String(err))
      return {
        data: {
          exitCode: error.message.includes('timeout') ? -1 : 1,
          stdout: '',
          stderr: error.message,
          durationMs,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
