import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    mode: z.enum(['visual', 'line', 'block']).describe('可视化模式类型'),
    selection: z.string().optional().describe('要选择的文本'),
    startLine: z.number().optional().describe('起始行号'),
    endLine: z.number().optional().describe('结束行号'),
    startCol: z.number().optional().describe('起始列号'),
    endCol: z.number().optional().describe('结束列号'),
    content: z.string().optional().describe('要操作的完整内容'),
    operation: z.enum(['activate', 'deactivate', 'select', 'yank', 'delete', 'indent', 'shift']).optional().describe('可视化模式操作'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    active: z.boolean().describe('可视化模式是否激活'),
    mode: z.string().describe('当前模式'),
    selected: z.string().optional().describe('选中的文本'),
    startLine: z.number().optional().describe('起始行号'),
    endLine: z.number().optional().describe('结束行号'),
    startCol: z.number().optional().describe('起始列号'),
    endCol: z.number().optional().describe('结束列号'),
    message: z.string().describe('操作结果消息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

let visualState: {
  active: boolean
  mode: 'visual' | 'line' | 'block'
  selected: string
  startLine: number
  endLine: number
  startCol: number
  endCol: number
  content: string
} | null = null

function activateVisualMode(mode: 'visual' | 'line' | 'block', content: string): void {
  visualState = {
    active: true,
    mode,
    selected: '',
    startLine: 0,
    endLine: 0,
    startCol: 0,
    endCol: 0,
    content,
  }
}

function deactivateVisualMode(): void {
  visualState = null
}

function getSelectionRange(content: string, startLine: number, endLine: number, startCol?: number, endCol?: number): { selected: string; startCol: number; endCol: number } {
  const lines = content.split('\n')
  const safeStartLine = Math.max(0, Math.min(startLine, lines.length - 1))
  const safeEndLine = Math.max(safeStartLine, Math.min(endLine, lines.length - 1))

  if (visualState?.mode === 'line') {
    const selectedLines = lines.slice(safeStartLine, safeEndLine + 1)
    return { selected: selectedLines.join('\n'), startCol: 0, endCol: 0 }
  }

  if (visualState?.mode === 'block') {
    const sCol = Math.max(0, startCol ?? 0)
    const eCol = Math.max(sCol, endCol ?? sCol + 8)
    const selectedLines = lines.slice(safeStartLine, safeEndLine + 1).map(line => {
      const from = Math.min(sCol, line.length)
      const to = Math.min(eCol, line.length)
      return line.slice(from, to)
    })
    return { selected: selectedLines.join('\n'), startCol: sCol, endCol: eCol }
  }

  // character-wise visual mode
  const startLineContent = lines[safeStartLine]
  const sCol = Math.max(0, Math.min(startCol ?? 0, startLineContent?.length ?? 0))
  const eCol = Math.max(sCol, Math.min(endCol ?? sCol + 8, startLineContent?.length ?? 0))

  const selected = startLineContent ? startLineContent.slice(sCol, eCol) : ''
  return { selected, startCol: sCol, endCol: eCol }
}

function applyOperation(operation: string, content: string, selected: string, startLine: number, endLine: number): { result: string; message: string } {
  const lines = content.split('\n')
  switch (operation) {
    case 'yank': {
      return { result: content, message: `已复制 ${selected.length} 个字符` }
    }
    case 'delete': {
      const safeStart = Math.max(0, startLine)
      const safeEnd = Math.min(endLine, lines.length - 1)
      lines.splice(safeStart, safeEnd - safeStart + 1)
      return { result: lines.join('\n'), message: `已删除 ${safeEnd - safeStart + 1} 行` }
    }
    case 'indent': {
      for (let i = startLine; i <= endLine && i < lines.length; i++) {
        lines[i] = '  ' + lines[i]
      }
      return { result: lines.join('\n'), message: `已缩进 ${endLine - startLine + 1} 行` }
    }
    case 'shift': {
      for (let i = startLine; i <= endLine && i < lines.length; i++) {
        if (lines[i].startsWith('  ')) {
          lines[i] = lines[i].slice(2)
        }
      }
      return { result: lines.join('\n'), message: `已取消缩进 ${endLine - startLine + 1} 行` }
    }
    default:
      return { result: content, message: '操作完成' }
  }
}

export const VimVisualModeTool = buildTool({
  name: 'vim-visual-mode',
  description: async () => 'Vim 可视化模式（字符/行/块选择及操作）',
  callOn: 'always',
  async prompt() {
    return '使用 vim-visual-mode 工具进行文本选择和操作。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'vim-visual-mode'
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
    const mode = (input as any)?.mode ?? '?'
    const op = (input as any)?.operation
    return `Vim: ${mode}${op ? ` ${op}` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as any).message || 'Visual mode operation completed',
    }
  },
  async call({ mode, selection, startLine, endLine, startCol, endCol, content, operation }) {
    const effectiveMode = mode || visualState?.mode || 'visual'
    const effectiveContent = content || visualState?.content || ''

    if (!operation || operation === 'activate') {
      activateVisualMode(effectiveMode, effectiveContent)
      const range = selection ? { selected: selection, startCol: startCol ?? 0, endCol: (startCol ?? 0) + selection.length } : getSelectionRange(effectiveContent, startLine ?? 0, endLine ?? 0, startCol, endCol)
      visualState!.selected = range.selected
      visualState!.startLine = startLine ?? 0
      visualState!.endLine = endLine ?? 0
      visualState!.startCol = range.startCol
      visualState!.endCol = range.endCol

      return {
        data: {
          active: true,
          mode: effectiveMode,
          selected: range.selected,
          startLine: startLine ?? 0,
          endLine: endLine ?? 0,
          startCol: range.startCol,
          endCol: range.endCol,
          message: `可视化模式 ${effectiveMode} 已激活`,
        } as Output,
      }
    }

    if (operation === 'deactivate') {
      deactivateVisualMode()
      return {
        data: {
          active: false,
          mode: effectiveMode,
          message: '可视化模式已关闭',
        } as Output,
      }
    }

    if (operation === 'select' || !operation) {
      const range = getSelectionRange(effectiveContent, startLine ?? 0, endLine ?? (startLine ?? 0), startCol, endCol)
      if (visualState) {
        visualState.selected = range.selected
        visualState.startLine = startLine ?? 0
        visualState.endLine = endLine ?? (startLine ?? 0)
        visualState.startCol = range.startCol
        visualState.endCol = range.endCol
      }
      return {
        data: {
          active: true,
          mode: effectiveMode,
          selected: range.selected,
          startLine: startLine ?? 0,
          endLine: endLine ?? (startLine ?? 0),
          startCol: range.startCol,
          endCol: range.endCol,
          message: `已选择 ${range.selected.length} 个字符`,
        } as Output,
      }
    }

    // yank, delete, indent, shift
    if (!visualState || !visualState.active) {
      return {
        data: {
          active: false,
          mode: effectiveMode,
          message: '请先激活可视化模式',
        } as Output,
      }
    }

    const range = getSelectionRange(effectiveContent, visualState.startLine, visualState.endLine, visualState.startCol, visualState.endCol)
    const { result, message } = applyOperation(operation, effectiveContent, range.selected, visualState.startLine, visualState.endLine)

    if (operation === 'yank') {
      return {
        data: {
          active: true,
          mode: visualState.mode,
          selected: range.selected,
          startLine: visualState.startLine,
          endLine: visualState.endLine,
          message,
        } as Output,
      }
    }

    deactivateVisualMode()
    return {
      data: {
        active: false,
        mode: visualState.mode,
        message: `${message}。结果内容:\n${result.slice(0, 500)}`,
      } as Output,
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
