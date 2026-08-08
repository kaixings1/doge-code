import { createNote, getNote, getAllNotes, updateNote, deleteNote, togglePinNote, searchNotes, getAllTags, exportNoteToMarkdown, importFromMarkdown, type CreateNoteInput, type UpdateNoteInput, type SearchParams,
} from '../../services/notebook/database.js'
import type { Note, PaginatedResult } from '../../services/notebook/schema.js'

// ====== 业务逻辑层 ======

export interface NotebookResult {
  success: boolean
  message: string
  data?: Note | Note[] | PaginatedResult<Note> | string[]
}

export function handleCreate(title: string, content?: string, tags?: string): NotebookResult {
  if (!title || !title.trim()) {
    return { success: false, message: '错误: 标题不能为空' }
  }
  const input: CreateNoteInput = {
    title: title.trim(),
    content: content ?? '',
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  }
  const note = createNote(input)
  return {
    success: true,
    message: '笔记已创建: ' + note.title + ' (' + note.id + '...)',
    data: note,
  }
}

export function handleList(page?: number, limit?: number): NotebookResult {
  const result = searchNotes({ page, limit })
  if (result.items.length === 0) {
    return { success: true, message: '暂无笔记。使用 /notebook create <标题> 创建新笔记。' }
  }
  return {
    success: true,
    message: '共 ' + result.total + ' 条笔记（第 ' + result.page + '/' + result.totalPages + ' 页）',
    data: result,
  }
}

export function handleView(id: string): NotebookResult {
  if (!id) {
    return { success: false, message: '错误: 请提供笔记 ID' }
  }
  const note = getNote(id)
  if (!note) {
    return { success: false, message: '错误: 未找到 ID 为 "' + id + '" 的笔记' }
  }
  return { success: true, message: '# ' + note.title, data: note }
}

export function handleEdit(id: string, title?: string, content?: string, tags?: string, isPinned?: boolean): NotebookResult {
  if (!id) {
    return { success: false, message: '错误: 请提供笔记 ID' }
  }
  const input: UpdateNoteInput = {}
  if (title != null) input.title = title.trim()
  if (content != null) input.content = content
  if (tags != null) input.tags = tags.split(',').map(t => t.trim()).filter(Boolean)
  if (isPinned != null) input.isPinned = isPinned
  const note = updateNote(id, input)
  if (!note) {
    return { success: false, message: '错误: 未找到 ID 为 "' + id + '" 的笔记' }
  }
  return { success: true, message: '笔记已更新: ' + note.title, data: note }
}

export function handleDelete(id: string): NotebookResult {
  if (!id) {
    return { success: false, message: '错误: 请提供笔记 ID' }
  }
  const note = getNote(id)
  if (!note) {
    return { success: false, message: '错误: 未找到 ID 为 "' + id + '" 的笔记' }
  }
  deleteNote(id)
  return { success: true, message: '笔记已删除: ' + note.title, data: note }
}

export function handlePin(id: string): NotebookResult {
  if (!id) {
    return { success: false, message: '错误: 请提供笔记 ID' }
  }
  const note = togglePinNote(id)
  if (!note) {
    return { success: false, message: '错误: 未找到 ID 为 "' + id + '" 的笔记' }
  }
  return {
    success: true,
    message: note.isPinned ? '笔记已置顶: ' + note.title : '笔记已取消置顶: ' + note.title,
    data: note,
  }
}

export function handleSearch(query: string, tag?: string, page?: number): NotebookResult {
  if (!query && !tag) {
    return { success: false, message: '错误: 请提供搜索关键词或标签' }
  }
  const params: SearchParams = { page, query, tag }
  const result = searchNotes(params)
  if (result.items.length === 0) {
    return { success: true, message: '未找到匹配的笔记' }
  }
  return {
    success: true,
    message: '找到 ' + result.total + ' 条匹配的笔记（第 ' + result.page + '/' + result.totalPages + ' 页）',
    data: result,
  }
}

export function handleTags(): NotebookResult {
  const tags = getAllTags()
  if (tags.length === 0) {
    return { success: true, message: '暂无标签' }
  }
  return { success: true, message: '共 ' + tags.length + ' 个标签', data: tags }
}

export function handleExport(id: string): NotebookResult {
  if (!id) {
    return { success: false, message: '错误: 请提供笔记 ID' }
  }
  const note = getNote(id)
  if (!note) {
    return { success: false, message: '错误: 未找到 ID 为 "' + id + '" 的笔记' }
  }
  const md = exportNoteToMarkdown(note)
  return { success: true, message: '笔记已导出:\n\n' + md, data: note }
}

// ====== 格式化工具（给 notebook-ui.tsx 调用） ======

export function formatTagList(tags: string[]): string {
  const lines: string[] = ['标签:']
  for (const t of tags) {
    lines.push('  #' + t)
  }
  return lines.join('\n')
}

export function formatPaginated(paginated: PaginatedResult<Note>): string {
  if (paginated.items.length === 0) return '没有笔记'
  const lines: string[] = ['共 ' + paginated.total + ' 条笔记:']
  for (const note of paginated.items) {
    const d = new Date(note.updatedAt)
    const ds = (d.getMonth() + 1) + '/' + d.getDate()
    const tags = note.tags.length > 0 ? ' [' + note.tags.join(', ') + ']' : ''
    const pin = note.isPinned ? '📌 ' : ''
    lines.push('  ' + pin + note.title + ' (' + ds + ')' + tags + ' ID:' + note.id)
  }
  lines.push('')
  lines.push('第 ' + paginated.page + '/' + paginated.totalPages + ' 页 (共 ' + paginated.total + ' 条)')
  return lines.join('\n')
}

export function formatSingleNote(note: Note): string {
  const lines: string[] = [
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
