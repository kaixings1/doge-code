import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface Bookmark {
  id: string
  file: string
  line: number
  endLine?: number
  text: string
  note: string
  tags: string[]
  createdAt: string
}

const BOOKMARKS_FILE = join(homedir(), '.doge', 'bookmarks.json')

function loadBookmarks(): Bookmark[] {
  try {
    if (!existsSync(BOOKMARKS_FILE)) return []
    return JSON.parse(readFileSync(BOOKMARKS_FILE, 'utf-8'))
  } catch { return [] }
}

function saveBookmarks(bookmarks: Bookmark[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarks, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  let bookmarks = loadBookmarks()

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    if (bookmarks.length === 0) return { type: 'text', value: 'ℹ️ 暂无书签。使用 /bookmark add <文件>:<行号> 创建一个。' }
    const lines = ['📋 书签列表：', '═══════════', '']
    bookmarks.forEach(b => {
      lines.push(b.file + ':' + b.line + ' - ' + (b.note || b.text.slice(0, 50)))
      if (b.tags.length > 0) lines.push('  标签：' + b.tags.join(', '))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    const location = parts[1]
    const note = parts.slice(2).join(' ')
    if (!location) return { type: 'text', value: '📖 用法：/bookmark add <文件>:<行号> [备注]' }

    const [file, lineStr] = location.split(':')
    const line = parseInt(lineStr) || 1

    let text = ''
    try {
      const content = readFileSync(file, 'utf-8')
      text = content.split('\n')[line - 1]?.trim() || ''
    } catch { /* ignore */ }

    const bookmark: Bookmark = {
      id: 'bm-' + Date.now().toString(36),
      file,
      line,
      text,
      note,
      tags: [],
      createdAt: new Date().toISOString(),
    }
    bookmarks.push(bookmark)
    saveBookmarks(bookmarks)
    return { type: 'text', value: '✅ 书签已添加：' + file + ':' + line }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/bookmark delete <ID>' }
    const idx = bookmarks.findIndex(b => b.id === id || b.id.startsWith(id))
    if (idx === -1) return { type: 'text', value: '❌ 未找到：' + id }
    const removed = bookmarks.splice(idx, 1)[0]
    saveBookmarks(bookmarks)
    return { type: 'text', value: '✅ 已删除：' + removed.file + ':' + removed.line }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: '📖 用法：/bookmark search <关键词>' }
    const results = bookmarks.filter(b =>
      b.file.toLowerCase().includes(query) ||
      b.note.toLowerCase().includes(query) ||
      b.text.toLowerCase().includes(query) ||
      b.tags.some(t => t.toLowerCase().includes(query))
    )
    if (results.length === 0) return { type: 'text', value: '🔍 未找到书签：' + query }
    const lines = ['🔍 搜索结果：', '═════════════', '']
    results.forEach(b => {
      lines.push(b.id + ' - ' + b.file + ':' + b.line)
      lines.push('  ' + (b.note || b.text.slice(0, 60)))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tags') {
    const allTags = new Set<string>()
    bookmarks.forEach(b => b.tags.forEach(t => allTags.add(t)))
    return { type: 'text', value: '🏷️ 标签：' + (allTags.size > 0 ? Array.from(allTags).join(', ') : '无') }
  }

  if (cmd === 'clear') {
    bookmarks = []
    saveBookmarks(bookmarks)
    return { type: 'text', value: '✅ 已清除所有书签' }
  }

  return { type: 'text', value: [
    '📑 代码书签', '',
    '📖 用法：',
    '  /bookmark list            列出所有书签',
    '  /bookmark add <文件:行号>  添加书签',
    '  /bookmark delete <ID>     删除书签',
    '  /bookmark search <关键词> 搜索书签',
    '  /bookmark tags            列出所有标签',
    '  /bookmark clear           清除所有书签',
  ].join('\n') }
}

const bookmark: Command = {
  type: 'local',
  name: 'bookmark',
  description: '代码书签 - 标记和跳转到重要代码位置',
  aliases: ['/bookmark', '/bm'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default bookmark
