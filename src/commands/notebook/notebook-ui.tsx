import React, { useState } from 'react'
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
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
import type { Note } from '../../services/notebook/schema.js'

// ====== local-jsx call 入口 ======

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  const parts = (args ?? '').trim().split(/\s+/)
  const subcommand = parts[0]?.toLowerCase() ?? ''

  // 无参数 → 启动 TUI
  if (subcommand === '' || subcommand === 'list') {
    return React.createElement(NotebookApp, { onDone })
  }

  // 显式指定 --tui / --gui 强制 TUI
  if (subcommand === 'tui' || parts.includes('--tui') || parts.includes('--gui')) {
    return React.createElement(NotebookApp, { onDone })
  }

  // 文本模式
  return handleTextMode(subcommand, parts.slice(1), onDone)
}

// ====== TUI 应用组件 ======

interface NotebookAppProps {
  onDone: LocalJSXCommandOnDone
  initialView?: 'list' | 'view'
  noteId?: string
}

function NotebookApp({ onDone, initialView = 'list', noteId }: NotebookAppProps) {
  const [view, setView] = useState<'list' | 'view' | 'new'>(initialView)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(noteId ?? null)

  const handleSelect = (note: Note) => {
    setSelectedNoteId(note.id)
    setView('view')
  }

  const handleNew = () => {
    const result = handleCreate('新笔记', '', '')
    if (result.success && result.data && !Array.isArray(result.data)) {
      setSelectedNoteId(result.data.id)
      setView('view')
    } else {
      setView('list')
    }
  }

  const handleBack = () => {
    setView('list')
    setSelectedNoteId(null)
  }

  const handleDeleted = (id: string) => {
    setView('list')
    setSelectedNoteId(null)
  }

  const handleExit = () => {
    onDone()
  }

  switch (view) {
    case 'view':
      return selectedNoteId
        ? React.createElement(NotebookView, {
            noteId: selectedNoteId,
            onBack: handleBack,
            onDeleted: handleDeleted,
          })
        : React.createElement(NotebookList, {
            onSelect: handleSelect,
            onNew: handleNew,
            onDelete: () => {},
            onBack: handleBack,
          })

    default:
      return React.createElement(NotebookList, {
        onSelect: handleSelect,
        onNew: handleNew,
        onDelete: () => {},
        onBack: handleBack,
      })
  }
}

// ====== 文本模式处理 ======

function handleTextMode(
  subcommand: string,
  args: string[],
  onDone: LocalJSXCommandOnDone,
): string {
  let result: string

  switch (subcommand) {
    case 'create': {
      const title = args.join(' ') || '未命名笔记'
      onDone('笔记已创建: ' + title)
      return '笔记已创建: ' + title
    }
    case 'list':
    case 'ls': {
      const r = handleList()
      result = formatResult(r)
      onDone(result)
      return result
    }
    case 'view':
    case 'show': {
      const id = args[0] || ''
      if (!id) { result = '请提供笔记 ID'; onDone(result); return result }
      noteResult(handleView(id), onDone)
      return formatResult(handleView(id))
    }
    case 'edit':
    case 'update': {
      const id = args[0] || ''
      if (!id) { result = '请提供笔记 ID'; onDone(result); return result }
      const title = args.slice(1).join(' ')
      noteResult(handleEdit(id, title || void 0), onDone)
      return formatResult(handleEdit(id, title || void 0))
    }
    case 'delete':
    case 'del':
    case 'rm': {
      const id = args[0] || ''
      if (!id) { result = '请提供笔记 ID'; onDone(result); return result }
      noteResult(handleDelete(id), onDone)
      return formatResult(handleDelete(id))
    }
    case 'pin': {
      const id = args[0] || ''
      if (!id) { result = '请提供笔记 ID'; onDone(result); return result }
      noteResult(handlePin(id), onDone)
      return formatResult(handlePin(id))
    }
    case 'search':
    case 'find':
    case 'grep': {
      const query = args.join(' ')
      const r = handleSearch(query)
      result = formatResult(r)
      onDone(result)
      return result
    }
    case 'tags': {
      const r = handleTags()
      result = formatResult(r)
      onDone(result)
      return result
    }
    case 'export': {
      const id = args[0] || ''
      if (!id) { result = '请提供笔记 ID'; onDone(result); return result }
      noteResult(handleExport(id), onDone)
      return formatResult(handleExport(id))
    }
    default:
      result = [
        '记事本 - 使用帮助',
        '',
        '用法:',
        '  /notebook                  启动 TUI 界面',
        '  /notebook list             列出笔记',
        '  /notebook create <标题>    创建笔记',
        '  /notebook view <id>        查看笔记',
        '  /notebook edit <id> [标题] 编辑笔记',
        '  /notebook delete <id>      删除笔记',
        '  /notebook pin <id>         置顶/取消置顶',
        '  /notebook search <关键词>  搜索笔记',
        '  /notebook tags             查看标签',
      ].join('\n')
      onDone(result)
      return result
  }
}

function noteResult(r: any, onDone: LocalJSXCommandOnDone) {
  if (r.success) {
    onDone(r.message)
  } else {
    onDone('错误: ' + r.message)
  }
}

function formatResult(r: any): string {
  if (!r.success) return '错误: ' + r.message
  if (r.data && Array.isArray(r.data)) return formatTagList(r.data)
  if (r.data && 'items' in r.data) return formatPaginated(r.data)
  if (r.data && 'id' in r.data) return formatSingleNote(r.data)
  return r.message || '操作完成'
}

function formatSingleNote(note: Note): string {
  return [
    '📝 ' + note.title,
    '标签: ' + (note.tags.length ? note.tags.join(', ') : '无'),
    '置顶: ' + (note.isPinned ? '是' : '否'),
    '更新: ' + note.updatedAt,
    '---',
    note.content || '（空内容）',
  ].join('\n')
}

function formatPaginated(data: { items: Note[]; total: number; page: number }): string {
  const lines = ['📓 笔记列表 (' + data.items.length + '/' + data.total + ')']
  for (const note of data.items) {
    lines.push((note.isPinned ? '📌' : '  ') + ' ' + note.title + ' (' + note.id.substring(0, 8) + ')')
  }
  return lines.join('\n')
}

function formatTagList(tags: string[]): string {
  return '标签: ' + (tags.length ? tags.join(', ') : '无标签')
}