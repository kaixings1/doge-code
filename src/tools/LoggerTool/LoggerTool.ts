import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).describe('日志级别'),
    message: z.string().describe('日志消息'),
    context: z.record(z.unknown()).optional().describe('日志上下文'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    logged: z.boolean().describe('日志是否已写入'),
    level: z.string().describe('日志级别'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

// 内存日志存储（最近 200 条）
const MAX_LOG_ENTRIES = 200
const memoryLog: Array<{ level: string; message: string; context?: Record<string, unknown>; timestamp: string }> = []

function writeToMemoryLog(level: string, message: string, context?: Record<string, unknown>): void {
  const entry = { level, message, context, timestamp: new Date().toISOString() }
  memoryLog.push(entry)
  if (memoryLog.length > MAX_LOG_ENTRIES) {
    memoryLog.shift()
  }
}

export const LoggerTool = buildTool({
  name: 'logger',
  description: async () => '写入结构化日志（debug/info/warn/error）',
  callOn: 'always',
  async prompt() {
    return '使用 logger 工具写入日志。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'logger'
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
    const level = (input as any)?.level ?? '?'
    const message = (input as any)?.message ?? ''
    return `Logger: ${level} ${message}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Logged at level ${(content as any).level}`,
    }
  },
  async call({ level, message, context }) {
    const consoleFn =
      level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log

    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`
    if (context && Object.keys(context).length > 0) {
      consoleFn(`${prefix} ${message}`, JSON.stringify(context))
    } else {
      consoleFn(`${prefix} ${message}`)
    }

    writeToMemoryLog(level, message, context)

    return {
      data: {
        logged: true,
        level,
      } as Output,
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
