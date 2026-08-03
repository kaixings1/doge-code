import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  CREATE_TABLES_SQL,
  type Note,
  type NoteRow,
  type CreateNoteInput,
  type UpdateNoteInput,
  type SearchParams,
  type PaginatedResult,
} from './schema.js'

function getDbPath(): string {
  const dir = join(homedir(), '.doge', 'notebook')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'notes.db')
}

let db: Database | null = null

export function getDatabase(): Database {
  if (!db) {
    db = new Database(getDbPath())
    db.exec('PRAGMA journal_mode=WAL')
    db.exec('PRAGMA busy_timeout=5000')
    db.exec('PRAGMA foreign_keys=ON')
    db.exec(CREATE_TABLES_SQL)
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    isPinned: row.is_pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

let _idCounter = 0
function generateId(): string {
  _idCounter++
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 8)
  const seq = _idCounter.toString(36).padStart(4, '0')
  return now + '-' + rand + '-' + seq
}

export function createNote(input: CreateNoteInput): Note {
  const d = getDatabase()
  const now = new Date().toISOString()
  const id = generateId()
  const tags = JSON.stringify(input.tags ?? [])

  d.run(
    'INSERT INTO notes (id, title, content, tags, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [id, input.title, input.content ?? '', tags, now, now],
  )

  return {
    id,
    title: input.title,
    content: input.content ?? '',
    tags: input.tags ?? [],
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function getNote(id: string): Note | null {
  const d = getDatabase()
  const row = d.query('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | null
  return row ? rowToNote(row) : null
}

export function getAllNotes(): Note[] {
  const d = getDatabase()
  const rows = d
    .query('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC')
    .all() as NoteRow[]
  return rows.map(rowToNote)
}

export function updateNote(id: string, input: UpdateNoteInput): Note | null {
  const d = getDatabase()
  const existing = getNote(id)
  if (!existing) return null

  const now = new Date().toISOString()
  const title = input.title ?? existing.title
  const content = input.content ?? existing.content
  const tags = JSON.stringify(input.tags ?? existing.tags)
  const isPinnedValue = input.isPinned != null ? (input.isPinned ? 1 : 0) : (existing.isPinned ? 1 : 0)

  d.run(
    'UPDATE notes SET title = ?, content = ?, tags = ?, is_pinned = ?, updated_at = ? WHERE id = ?',
    [title, content, tags, isPinnedValue, now, id],
  )

  return getNote(id)
}

export function deleteNote(id: string): boolean {
  const d = getDatabase()
  const result = d.run('DELETE FROM notes WHERE id = ?', [id])
  return result.changes > 0
}

export function togglePinNote(id: string): Note | null {
  const note = getNote(id)
  if (!note) return null
  return updateNote(id, { isPinned: !note.isPinned })
}

export function searchNotes(params: SearchParams): PaginatedResult<Note> {
  const d = getDatabase()
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 50))
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const bindings: unknown[] = []

  if (params.query && params.query.trim()) {
    conditions.push('notes.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)')
    const sanitized = params.query.trim().replace(/['"]/g, '')
    bindings.push(sanitized)
  }

  if (params.tag && params.tag.trim()) {
    conditions.push('notes.tags LIKE ?')
    const tagVal = JSON.stringify(params.tag.trim())
    bindings.push('%' + tagVal + '%')
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  const sortField = params.sortBy ?? 'updatedAt'
  const sortDir = params.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const fieldMap: Record<string, string> = {
    updatedAt: 'updated_at',
    createdAt: 'created_at',
    title: 'title',
  }
  const orderBy = 'ORDER BY is_pinned DESC, ' + (fieldMap[sortField] ?? 'updated_at') + ' ' + sortDir

  const countRow = d
    .query('SELECT COUNT(*) as cnt FROM notes ' + whereClause)
    .get(...bindings) as { cnt: number }
  const total = countRow.cnt

  const rows = d
    .query('SELECT * FROM notes ' + whereClause + ' ' + orderBy + ' LIMIT ? OFFSET ?')
    .all(...bindings, limit, offset) as NoteRow[]

  return {
    items: rows.map(rowToNote),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export function getAllTags(): string[] {
  const d = getDatabase()
  const rows = d.query('SELECT DISTINCT tags FROM notes').all() as { tags: string }[]
  const tagSet = new Set<string>()
  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags) as string[]
      for (const tag of tags) {
        tagSet.add(tag)
      }
    } catch {
      // ignore
    }
  }
  return Array.from(tagSet).sort()
}

export function exportNoteToMarkdown(note: Note): string {
  const tagsStr = note.tags.length > 0 ? 'tags: ' + note.tags.join(', ') : ''
  return [
    '# ' + note.title,
    '',
    'created: ' + note.createdAt,
    'updated: ' + note.updatedAt,
    tagsStr,
    '---',
    '',
    note.content,
  ].join('\n')
}

export function importFromMarkdown(filename: string, content: string): Note | null {
  const lines = content.split('\n')
  let title = filename.replace(/\.md$/i, '')
  const contentLines: string[] = []
  let inFrontMatter = false

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim()
    } else if (line === '---') {
      inFrontMatter = !inFrontMatter
    } else if (!inFrontMatter) {
      contentLines.push(line)
    }
  }

  return createNote({
    title,
    content: contentLines.join('\n').trim(),
  })
}
