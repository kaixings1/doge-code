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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Quick Notes', '', '📖 Usage: ', '  /notes                          List all notes', '  /notes add <title>              Add note', '  /notes show <id>                Show note', '  /notes edit <id>                Edit note', '  /notes delete <id>              Delete note', '  /notes search <query>           Search notes', '  /notes tags                     List tags', '  /notes pin <id>                 Pin/unpin note', '  /notes export                   Export all', '  /notes import <file>            Import notes', '  /notes clear                   Delete all', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    if (notes.length === 0) return { type: 'text', value: 'No notes. Use /notes add <title> to create one.' }
    notes.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() })
    const lines = ['Notes (' + notes.length + '):', '==============', '']
    notes.slice(0, 20).forEach(n => {
      lines.push((n.pinned ? '📌 ' : '   ') + n.id + ' [' + n.priority + '] ' + n.title + (n.tags.length > 0 ? ' (' + n.tags.join(', ') + ')' : ''))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add' || cmd === 'create') {
    const title = parts.slice(1).join(' ') || 'Untitled'
    const note: Note = { id: 'note-' + Date.now().toString(36), title, content: '', tags: [], priority: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false }
    saveNote(note)
    return { type: 'text', value: '[OK] Created: ' + note.id + '\nEdit: ' + join(NOTES_DIR, note.id + '.json') }
  }

  if (cmd === 'show' || cmd === 'get') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: 'Not found: ' + id }
    const lines = ['📝 ' + note.title, '================', '', note.content || '(empty)', '', 'Tags: ' + (note.tags.join(', ') || 'none'), 'Priority: ' + note.priority, 'Updated: ' + note.updatedAt.slice(0, 19)]
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: 'Not found: ' + id }
    try { require('fs').unlinkSync(join(NOTES_DIR, note.id + '.json')); return { type: 'text', value: '[OK] Deleted: ' + note.title } }
    catch { return { type: 'text', value: '[ERROR] Delete failed' } }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: 'Usage: /notes search <query>' }
    const results = notes.filter(n => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query) || n.tags.some(t => t.toLowerCase().includes(query)))
    if (results.length === 0) return { type: 'text', value: 'No results for: ' + query }
    const lines = ['Search Results (' + results.length + '):', '====================', '']
    results.forEach(n => lines.push(n.id + ' - ' + n.title))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tags') {
    const allTags = new Set<string>()
    notes.forEach(n => n.tags.forEach(t => allTags.add(t)))
    return { type: 'text', value: 'Tags: ' + (allTags.size > 0 ? Array.from(allTags).join(', ') : 'none') }
  }

  if (cmd === 'pin') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: 'Not found: ' + id }
    note.pinned = !note.pinned
    saveNote(note)
    return { type: 'text', value: '[OK] ' + (note.pinned ? 'Pinned' : 'Unpinned') + ': ' + note.title }
  }

  if (cmd === 'export') {
    return { type: 'text', value: JSON.stringify(notes, null, 2) }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
    try {
      const imported = JSON.parse(readFileSync(file, 'utf-8'))
      imported.forEach((n: Note) => saveNote(n))
      return { type: 'text', value: '[OK] Imported ' + imported.length + ' notes' }
    } catch { return { type: 'text', value: '[ERROR] Import failed' } }
  }

  if (cmd === 'clear') {
    notes.forEach(n => { try { require('fs').unlinkSync(join(NOTES_DIR, n.id + '.json')) } catch { /* ignore */ } })
    return { type: 'text', value: '[OK] All notes deleted' }
  }

  if (cmd === 'edit') {
    const id = parts[1]
    const note = notes.find(n => n.id === id || n.id.startsWith(id || ''))
    if (!note) return { type: 'text', value: 'Not found: ' + id }
    return { type: 'text', value: 'Edit: ' + join(NOTES_DIR, note.id + '.json') + '\nOr use: /notes delete ' + id + ' && /notes add <new title>' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const notes: Command = {
  type: 'local', name: 'notes',
  description: 'Quick notes - list/add/show/edit/delete/search/pin/tags/export/import',
  aliases: '/notes, /note, /n'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default notes
