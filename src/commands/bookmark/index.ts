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
    if (bookmarks.length === 0) return { type: 'text', value: 'No bookmarks. Use /bookmark add <file>:<line> to create one.' }
    const lines = ['Bookmarks:', '===========', '']
    bookmarks.forEach(b => {
      lines.push(b.file + ':' + b.line + ' - ' + (b.note || b.text.slice(0, 50)))
      if (b.tags.length > 0) lines.push('  Tags: ' + b.tags.join(', '))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    const location = parts[1]
    const note = parts.slice(2).join(' ')
    if (!location) return { type: 'text', value: 'Usage: /bookmark add <file>:<line> [note]' }

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
    return { type: 'text', value: '[OK] Bookmark added: ' + file + ':' + line }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const id = parts[1]
    if (!id) return { type: 'text', value: 'Usage: /bookmark delete <id>' }
    const idx = bookmarks.findIndex(b => b.id === id || b.id.startsWith(id))
    if (idx === -1) return { type: 'text', value: 'Not found: ' + id }
    const removed = bookmarks.splice(idx, 1)[0]
    saveBookmarks(bookmarks)
    return { type: 'text', value: '[OK] Deleted: ' + removed.file + ':' + removed.line }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: 'Usage: /bookmark search <query>' }
    const results = bookmarks.filter(b =>
      b.file.toLowerCase().includes(query) ||
      b.note.toLowerCase().includes(query) ||
      b.text.toLowerCase().includes(query) ||
      b.tags.some(t => t.toLowerCase().includes(query))
    )
    if (results.length === 0) return { type: 'text', value: 'No bookmarks found for: ' + query }
    const lines = ['Search Results:', '================', '']
    results.forEach(b => {
      lines.push(b.id + ' - ' + b.file + ':' + b.line)
      lines.push('  ' + (b.note || b.text.slice(0, 60)))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tags') {
    const allTags = new Set<string>()
    bookmarks.forEach(b => b.tags.forEach(t => allTags.add(t)))
    return { type: 'text', value: 'Tags: ' + (allTags.size > 0 ? Array.from(allTags).join(', ') : 'none') }
  }

  if (cmd === 'clear') {
    bookmarks = []
    saveBookmarks(bookmarks)
    return { type: 'text', value: '[OK] All bookmarks cleared' }
  }

  return { type: 'text', value: [
    'Code Bookmarks',
    '',
    '📖 📖 Usage: ',
    '  /bookmark list             List all bookmarks',
    '  /bookmark add <file:line>  Add bookmark at location',
    '  /bookmark delete <id>      Delete a bookmark',
    '  /bookmark search <query>   Search bookmarks',
    '  /bookmark tags             List all tags',
    '  /bookmark clear            Clear all bookmarks',
  ].join('\n') }
}

const bookmark: Command = {
  type: 'local',
  name: 'bookmark',
  description: 'Code bookmarks - mark and jump to important code locations',
  aliases: ['/bookmark', '/bm'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default bookmark
