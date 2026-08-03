import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    target: z.enum(['session', 'recent', 'custom']).describe('要压缩的目标'),
    threshold: z.number().optional().describe('token 阈值'),
    keepMessages: z.number().optional().describe('保留最近的消息数'),
    format: z.enum(['summary', 'bullet', 'structured']).optional().describe('压缩格式'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    collapsed: z.boolean().describe('压缩是否成功'),
    tokensSaved: z.number().describe('节省的 token 数量'),
    originalTokens: z.number().describe('原始 token 数量'),
    compressedTokens: z.number().describe('压缩后 token 数量'),
    summary: z.string().describe('压缩摘要'),
    message: z.string().describe('结果消息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

// 简单的内存上下文存储
interface ContextEntry {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens: number
  timestamp: number
}

const contextStore: ContextEntry[] = []
const MAX_CONTEXT_ENTRIES = 500

function addContext(role: ContextEntry['role'], content: string): ContextEntry {
  const entry: ContextEntry = {
    id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    content,
    tokens: Math.ceil(content.length / 4),
    timestamp: Date.now(),
  }
  contextStore.push(entry)
  if (contextStore.length > MAX_CONTEXT_ENTRIES) {
    contextStore.shift()
  }
  return entry
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function generateSummary(entries: ContextEntry[], format: string): string {
  if (entries.length === 0) return '无上下文可压缩'

  const totalInput = entries.filter(e => e.role === 'user').map(e => e.content)
  const totalOutput = entries.filter(e => e.role === 'assistant').map(e => e.content)
  const systemMsgs = entries.filter(e => e.role === 'system')

  if (format === 'bullet') {
    const bullets: string[] = []
    bullets.push(`# 上下文摘要`)
    bullets.push(`- 消息总数: ${entries.length}`)
    bullets.push(`- 用户消息: ${totalInput.length} 条`)
    bullets.push(`- 助手消息: ${totalOutput.length} 条`)
    bullets.push(`- 系统消息: ${systemMsgs.length} 条`)

    // 提取关键用户输入
    const keyInputs = totalInput
      .filter(msg => msg.length > 10)
      .slice(-10)
      .map(msg => {
        const firstLine = msg.split('\n')[0].trim()
        return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine
      })
    if (keyInputs.length > 0) {
      bullets.push('')
      bullets.push('## 关键对话')
      for (const input of keyInputs) {
        bullets.push(`- ${input}`)
      }
    }
    return bullets.join('\n')
  }

  if (format === 'structured') {
    return JSON.stringify({
      total_messages: entries.length,
      user_messages: totalInput.length,
      assistant_messages: totalOutput.length,
      system_messages: systemMsgs.length,
      recent_user_inputs: totalInput.slice(-5).map(m => m.split('\n')[0].trim().slice(0, 100)),
      time_range: {
        start: entries[0]?.timestamp ?? 0,
        end: entries[entries.length - 1]?.timestamp ?? 0,
      },
    }, null, 2)
  }

  // 默认 summary 格式
  const recentUserInput = totalInput.slice(-3).map(m => m.split('\n')[0].trim()).join('; ')
  const recentAssistantOutput = totalOutput.slice(-3).map(m => m.slice(0, 100)).join('; ')

  return `[${entries.length} 条消息压缩] 最近用户输入: "${recentUserInput}" | 助手回复: "${recentAssistantOutput.slice(0, 150)}"`
}

export const ContextCollapseTool = buildTool({
  name: 'context-collapse',
  description: async () => '压缩上下文以减少 token 使用量（支持多种格式）',
  callOn: 'manual',
  async prompt() {
    return '使用 context-collapse 工具压缩上下文以节省 token。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'context-collapse'
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
    const target = (input as Record<string, unknown>)?.target ?? '?'
    return `ContextCollapse: ${target}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as Record<string, unknown>).message || '上下文压缩完成',
    }
  },
  async call({ target, threshold = 10000, keepMessages = 20, format = 'summary' }) {
    let entriesToProcess: ContextEntry[] = []

    switch (target) {
      case 'session': {
        entriesToProcess = [...contextStore]
        break
      }
      case 'recent': {
        const keep = Math.min(keepMessages, contextStore.length)
        entriesToProcess = contextStore.slice(-keep)
        break
      }
      case 'custom': {
        entriesToProcess = [...contextStore].slice(-keepMessages)
        break
      }
    }

    const originalTokens = entriesToProcess.reduce((sum, e) => sum + e.tokens, 0)
    const summary = generateSummary(entriesToProcess, format)
    const compressedTokens = estimateTokens(summary)
    const tokensSaved = Math.max(0, originalTokens - compressedTokens)
    const compressionRatio = originalTokens > 0 ? ((tokensSaved / originalTokens) * 100).toFixed(1) : '0'

    // 保留系统消息，清理旧的用户/助手消息
    const systemEntries = entriesToProcess.filter(e => e.role === 'system')
    const keepRecent = entriesToProcess.filter(e => e.timestamp > Date.now() - 300000).slice(-10)
    const preserved = [...systemEntries, ...keepRecent]
    contextStore.length = 0
    contextStore.push(...preserved)

    return {
      data: {
        collapsed: true,
        tokensSaved,
        originalTokens,
        compressedTokens,
        summary,
        message: `压缩完成: ${originalTokens} → ${compressedTokens} tokens (节省 ${compressionRatio}%)`,
      } as Output,
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)

export { addContext, contextStore }
