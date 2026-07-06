import React from 'react'
import type { Tool } from '../../Tool.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import NotebookList from './notebook-list.js'
import NotebookView from './notebook-view.js'
import {
  handleCreate,
  handleList,
  handleView,
  handleEdit,
  handleDelete,
  handlePin,
  handleSearch,
  handleTags,
  handleExport,
} from './notebook.js'
import type { Note, PaginatedResult } from '../../services/notebook/schema.js'

// ====== 命令定义 ======

const notebookTool: Tool = {
  name: 'notebook',
  description: '记事本 - 创建、查看、搜索和管理笔记',

  async call(args: string, context: any): Promise<string> {
    return exec(args, context)
  },

  definitions: {
    name: 'notebook',
    description: '记事本 - 创建、查看、搜索和管理笔记',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'view', 'edit', 'delete', 'pin', 'search', 'tags', 'export'],
          description: '子命令',
        },
        title: { type: 'string', description: '笔记标题' },
        content: { type: 'string', description: '笔记内容 Markdown' },
        tags: { type: 'string', description: '逗号分隔的标签' },
        id: { type: 'string', description: '笔记 ID' },
        query: { type: 'string', description: '搜索关键词' },
        page: { type: 'number', description: '页码' },
        limit: { type: 'number', description: '每页数量' },
        isPinned: { type: 'boolean', description: '是否置顶' },
      },
      required: ['action'],
    },
  },
}

export default notebookTool

// ====== 命令执行入口 ======

export async function exec(args: string, _context: any): Promise<string> {
  const parts = args.trim().split(/\s+/)
  const subcommand = parts[0]?.toLowerCase() ?? 'help'

  const tuiMode = !getIsNonInteractiveSession() && parts.length === 1 &&
    (subcommand === '' || subcommand === 'list' || subcommand === 'tui')

  if (tuiMode) {
    return 'NOTEBOOK_TUI_LAUNCH'
  }

  return handleTextMode(subcommand, parts.slice(1))
}

// ====== TUI 渲染组件 ======

interface NotebookTUIProps {
  initialView?: 'list' | 'view'
  noteId?: string
}

export function NotebookTUI({ initialView = 'list', noteId }: NotebookTUIProps) {
  const [view, setView] = React.useState<'list' | 'view' | 'new'>(
    initialView === 'view' && noteId ? 'view' : 'list'
  )
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(noteId ?? null)

  const handleSelect = (note: Note) => {
    setSelectedNoteId(note.id)
    setView('view')
  }
  const handleNew = () => { setView('new') }
  const handleBack = () => { setView('list'); setSelectedNoteId(null) }
  const handleDeleted = (_id: string) => { setView('list'); setSelectedNoteId(null) }

  switch (view) {
    case 'view':
      return selectedNoteId
        ? React.createElement(NotebookView, { noteId: selectedNoteId, onBack: handleBack, onDeleted: handleDeleted })
        : React.createElement(NotebookList, { onSelect: handleSelect, onNew: handleNew, onDelete: () => {}, onBack: handleBack })

    case 'new': {
      const note = handleCreate('新笔记', '', '')
      if (note.success && note.data && !Array.isArray(note.data)) {
        setSelectedNoteId(note.data.id)
        setView('view')
        return React.createElement(NotebookView, { noteId: note.data.id, onBack: handleBack, onDeleted: handleDeleted })
      }
      return React.createElement(NotebookList, { onSelect: handleSelect, onNew: handleNew, onDelete: () => {}, onBack: handleBack })
    }

    default:
      return React.createElement(NotebookList, { onSelect: handleSelect, onNew: handleNew, onDelete: () => {}, onBack: handleBack })
  }
}

// ====== 文本模式处理 ======

function handleTextMode(subcommand: string, args: string[]): string {
  switch (subcommand) {
    case 'create': {
      const title = args.join(' ') || '未命名笔记'
      return formatResult(handleCreate(title))
    }
    case 'list':
    case 'ls':
      return formatResult(handleList())

    case 'view':
    case 'show': {
      const id = args[0] || ''
      return formatResult(handleView(id))
    }
    case 'edit':
    case 'update': {
      const id = args[0] || ''
      const title = args.slice(1).join(' ')
      return formatResult(handleEdit(id, title || void 0))
    }
    case 'delete':
    case 'del':
    case 'rm': {
      const id = args[0] || ''
      return formatResult(handleDelete(id))
    }
    case 'pin': {
      const id = args[0] || ''
      return formatResult(handlePin(id))
    }
    case 'search':
    case 'find':
    case 'grep': {
      const query = args.join(' ')
      return formatResult(handleSearch(query))
    }
    case 'tags':
      return formatResult(handleTags())

    case 'export': {
      const id = args[0] || ''
      return formatResult(handleExport(id))
    }

    case 'help':
    default:
      return [
        '记事本 - 使用帮助',
        '',
        '用法:',
        '  /notebook                  启动 TUI 界面',
        '  /notebook create <标题>    创建新笔记',
        '  /notebook list             列出所有笔记',
        '  /notebook view <id>        查看笔记',
        '  /notebook edit <id> [标题] 编辑笔记',
        '  /notebook delete <id>      删除笔记',
        '  /notebook pin <id>         置顶/取消置顶',
        '  /notebook search <关键词>  搜索笔记',
        '  /notebook tags             查看所有标签',
        '  /notebook export <id>      导出笔记',
        '',
        '示例:',
        '  /notebook create 我的第一篇笔记',
        '  /notebook list',
        '  /notebook search SQLite',
      ].join('\n')
  }
}

// ====== 格式化输出 ======

function formatResult(result: any): string {
  if (!result.success) {
    return '错误: ' + result.message
  }

  if (result.data && Array.isArray(result.data)) {
    const lines = ['标签:']
    for (const t of result.data) {
      lines.push('  #' + t)
    }
    return lines.join('\n')
  }

  if (result.data && 'items' in result.data) {
    const paginated = result.data as PaginatedResult<Note>
    if (paginated.items.length === 0) {
      return '没有笔记'
    }
    const lines = ['共 ' + paginated.total + ' 条笔记:']
    for (const note of paginated.items) {
      const d = new Date(note.updatedAt)
      const ds = (d.getMonth() + 1) + '/' + d.getDate()
      const tags = note.tags.length > 0 ? ' [' + note.tags.join(', ') + ']' : ''
      const pin = note.isPinned ? '📌 ' : ''
      lines.push('  ' + pin + note.title + ' (' + ds + ')' + tags + ' ID:' + note.id.slice(0, 8))
    }
    lines.push('')
    lines.push('第 ' + paginated.page + '/' + paginated.totalPages + ' 页 (共 ' + paginated.total + ' 条)')
    return lines.join('\n')
  }

  if (result.data && 'id' in result.data) {
    const note = result.data as Note
    const lines = [
      note.isPinned ? '📌 ' : '' + note.title,
      '  ID: ' + note.id,
      '  创建: ' + note.createdAt,
      '  更新: ' + note.updatedAt,
    ]
    if (note.tags.length > 0) {
      lines.push('  标签: ' + note.tags.join(', '))
    }
    if (note.content) {
      const preview = note.content.slice(0, 200)
      lines.push('')
      lines.push(preview + (note.content.length > 200 ? '...' : ''))
    }
    return lines.join('\n')
  }

  return result.message
}
