import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['show', 'hide', 'focus', 'blur', 'write', 'clear', 'status']).describe('终端面板操作'),
    content: z.string().optional().describe('要写入终端的内容'),
    title: z.string().optional().describe('终端面板标题'),
    stream: z.enum(['stdout', 'stderr', 'both']).optional().describe('输出流'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    visible: z.boolean().describe('面板是否可见'),
    focused: z.boolean().describe('面板是否聚焦'),
    message: z.string().describe('状态消息'),
    lines: z.number().optional().describe('面板内容行数'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

interface TerminalSession {
  visible: boolean
  focused: boolean
  content: string[]
  title: string
  createdAt: number
}

const MAX_TERMINAL_LINES = 1000
let currentSession: TerminalSession = {
  visible: true,
  focused: true,
  content: [],
  title: 'Terminal',
  createdAt: Date.now(),
}

function appendContent(text: string): void {
  const lines = text.split('\n')
  currentSession.content.push(...lines)
  if (currentSession.content.length > MAX_TERMINAL_LINES) {
    currentSession.content = currentSession.content.slice(-MAX_TERMINAL_LINES)
  }
}

export const TerminalPanelTool = buildTool({
  name: 'terminal-panel',
  description: async () => '管理终端面板（show/hide/focus/write/clear/status）',
  callOn: 'manual',
  async prompt() {
    return '使用 terminal-panel 工具管理终端面板输出。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'terminal-panel'
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
    const action = (input as any)?.action ?? '?'
    const content = (input as any)?.content
    return `Terminal: ${action}${content ? ` "${content.slice(0, 40)}"` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as any).message || 'Terminal panel action completed',
    }
  },
  async call({ action, content, title, stream = 'stdout' }) {
    let message = ''
    let lines = currentSession.content.length

    switch (action) {
      case 'show': {
        currentSession.visible = true
        message = '终端面板已显示'
        break
      }
      case 'hide': {
        currentSession.visible = false
        currentSession.focused = false
        message = '终端面板已隐藏'
        break
      }
      case 'focus': {
        currentSession.visible = true
        currentSession.focused = true
        message = '终端面板已聚焦'
        break
      }
      case 'blur': {
        currentSession.focused = false
        message = '终端面板已失焦'
        break
      }
      case 'write': {
        if (!content) {
          return { data: { visible: currentSession.visible, focused: currentSession.focused, message: 'write 需要 content 参数', lines } } as Output
        }
        const prefix = stream === 'stderr' ? '[stderr]' : stream === 'both' ? '[all]' : ''
        const textToWrite = prefix ? `${prefix} ${content}` : content
        appendContent(textToWrite)
        lines = currentSession.content.length
        message = `已写入 ${content.split('\n').length} 行`
        break
      }
      case 'clear': {
        currentSession.content = []
        lines = 0
        message = '终端面板已清空'
        break
      }
      case 'status': {
        message = `面板: ${currentSession.visible ? '可见' : '隐藏'} | 聚焦: ${currentSession.focused ? '是' : '否'} | 行数: ${lines} | 标题: ${currentSession.title}`
        break
      }
    }

    return {
      data: {
        visible: currentSession.visible,
        focused: currentSession.focused,
        message,
        lines,
      } as Output,
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
