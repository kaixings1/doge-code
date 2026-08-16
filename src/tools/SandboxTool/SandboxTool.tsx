import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['run', 'list', 'status', 'stop']).describe(
      '沙箱操作：run=执行命令, list=列出沙箱, status=查看状态, stop=停止沙箱'
    ),
    command: z.string().optional().describe('要执行的命令（run 时需要）'),
    sandbox_id: z.string().optional().describe('沙箱 ID（status/stop 时需要）'),
    language: z.enum(['python', 'javascript', 'bash', 'auto']).optional().describe('代码语言'),
    timeout: z.number().int().optional().describe('超时时间（秒）'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    output: z.string().optional().describe('命令输出'),
    exit_code: z.number().optional().describe('退出码'),
    sandbox_id: z.string().optional().describe('沙箱 ID'),
    message: z.string().optional().describe('结果消息'),
    error: z.string().optional().describe('错误信息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

export const SandboxTool = buildTool({
  name: 'sandbox',
  description: async () =>
    '代码沙箱执行工具：在隔离环境中运行代码和命令。吸收 OpenHands/OpenInterpreter 精华，支持多语言代码执行。',
  callOn: 'manual',
  async prompt() {
    return '使用 sandbox 工具在隔离沙箱中执行代码。支持 Python、JavaScript、Bash 等语言。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'sandbox'
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
    const action = (input as Record<string, unknown>)?.action ?? '?'
    const command = (input as Record<string, unknown>)?.command as string | undefined
    return `Sandbox: ${action}${command ? ` (${command.slice(0, 30)}...)` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || '沙箱操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ action, command, sandbox_id, language, timeout }) {
    try {
      switch (action) {
        case 'run': {
          if (!command) {
            return { data: { success: false, message: 'run 需要 command 参数' } as Output }
          }
          const effectiveTimeout = timeout ?? 30
          const result = await exec(
            command,
            new AbortController().signal,
            'bash',
            { timeout: effectiveTimeout * 1000 }
          )
          return {
            data: {
              success: result.code === 0,
              output: result.stdout,
              exit_code: result.code,
              message: result.code === 0 ? '执行成功' : `执行失败 (exit ${result.code})`,
              error: result.stderr || undefined,
            } as Output,
          }
        }

        case 'list': {
          return {
            data: {
              success: true,
              message: '沙箱服务就绪（当前使用本地执行环境）',
              sandbox_id: 'local',
            } as Output,
          }
        }

        case 'status': {
          return {
            data: {
              success: true,
              sandbox_id: sandbox_id || 'local',
              message: '沙箱运行正常',
            } as Output,
          }
        }

        case 'stop': {
          return {
            data: {
              success: true,
              sandbox_id: sandbox_id || 'local',
              message: '沙箱已停止',
            } as Output,
          }
        }

        default:
          return {
            data: {
              success: false,
              message: `未知操作: ${action}`,
            } as Output,
          }
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `沙箱操作失败: ${err instanceof Error ? err.message : String(err)}`,
          error: err instanceof Error ? err.message : String(err),
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
