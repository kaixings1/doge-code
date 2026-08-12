import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  priority: 'low' | 'medium' | 'high'
  createdAt: string
  updatedAt: string
  pinned: boolean
}

const NOTES_DIR = join(homedir(), '.doge', 'notes')

function loadNotes(): Note[] {
  try {
    if (!existsSync(NOTES_DIR)) return []
    return readdirSync(NOTES_DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(NOTES_DIR, f), 'utf-8')))
  } catch { return [] }
}

function saveNote(note: Note) {
  try {
    if (!existsSync(NOTES_DIR)) mkdirSync(NOTES_DIR, { recursive: true })
    writeFileSync(join(NOTES_DIR, note.id + '.json'), JSON.stringify(note, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  let notes = loadNotes()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📝 快速笔记', '', '📖 用法：', '  /notes                           列出所有笔记', '  /notes add <标题>                 添加笔记', '  /notes show <ID>                 查看笔记', '  /notes edit <ID>                 编辑笔记', '  /notes delete <ID>               删除笔记', '  /notes search <关键词>            搜索笔记', '  /notes tags                      列出标签', '  /notes pin <ID>                  置顶/取消置顶', '  /notes export                    导出全部', '  /notes import <文件>              导入笔记', '  /notes clear                     删除全部', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    if (notes.length === 0) return { type: 'text', value: '📋 无笔记。使用 /notes add <标题> 创建一条。' }
    notes.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() })
    const lines = ['📝 笔记（' + notes.length + '）：', '==============', '']
    notes.slice(0, 20).forEach(n => {
      lines.push((n.pinned ? '📌 ' : '   ') + n.id + ' [' + n.priority + '] ' + n.title + (n.tags.length > 0 ? ' (' + n.tags.join(', ') + ')' : ''))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add' || cmd === 'create') {
    const title = parts.slice(1).join(' ') || 'Untitled'
    const note: Note = { id: 'note-' + Date.now().toString(36), title, content: '', tags: [], priority: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false }
    saveNote(note)
    return { type: 'text', value: '✅ 已创建：' + note.id + '\n编辑：' + join(NOTES_DIR, note.id + '.json') }
  }

  if (cmd === 'show' || cmd === 'get') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: '❌ 未找到：' + id }
    const lines = ['📝 ' + note.title, '================', '', note.content || '（空）', '', '标签：' + (note.tags.join(', ') || '无'), '优先级：' + note.priority, '更新时间：' + note.updatedAt.slice(0, 19)]
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: '❌ 未找到：' + id }
    try { require('fs').unlinkSync(join(NOTES_DIR, note.id + '.json')); return { type: 'text', value: '✅ 已删除：' + note.title } }
    catch { return { type: 'text', value: '❌ 删除失败' } }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: '📖 用法：/notes search <关键词>' }
    const results = notes.filter(n => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query) || n.tags.some(t => t.toLowerCase().includes(query)))
    if (results.length === 0) return { type: 'text', value: '未找到结果：' + query }
    const lines = ['Search Results (' + results.length + '):', '====================', '']
    results.forEach(n => lines.push(n.id + ' - ' + n.title))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tags') {
    const allTags = new Set<string>()
    notes.forEach(n => n.tags.forEach(t => allTags.add(t)))
    return { type: 'text', value: '🏷️ 标签：' + (allTags.size > 0 ? Array.from(allTags).join(', ') : '无') }
  }

  if (cmd === 'pin') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: 'Not found: ' + id }
    note.pinned = !note.pinned
    saveNote(note)
    return { type: 'text', value: '✅ ' + (note.pinned ? '已置顶' : '已取消置顶') + '：' + note.title }
  }

  if (cmd === 'export') {
    return { type: 'text', value: JSON.stringify(notes, null, 2) }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + file }
    try {
      const imported = JSON.parse(readFileSync(file, 'utf-8'))
      imported.forEach((n: Note) => saveNote(n))
      return { type: 'text', value: '✅ 已导入 ' + imported.length + ' 条笔记' }
    } catch { return { type: 'text', value: '❌ 导入失败' } }
  }

  if (cmd === 'clear') {
    notes.forEach(n => { try { require('fs').unlinkSync(join(NOTES_DIR, n.id + '.json')) } catch { /* ignore */ } })
    return { type: 'text', value: '✅ 已删除所有笔记' }
  }

  if (cmd === 'edit') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: '❌ 未找到：' + id }
    return { type: 'text', value: '✏️ 编辑：' + join(NOTES_DIR, note.id + '.json') + '\n或使用：/notes delete ' + id + ' && /notes add <新标题>' }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const notes: Command = {
  type: 'local', name: 'notes',
  description: '📝 快速笔记 - 列表/添加/查看/编辑/删除/搜索/置顶/标签/导出/导入',
  aliases: '/notes, /note, /n'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default notes
