/**
 * Persistent Memory System - .claudeskills/ 跨会话记忆持久化
 *
 * 功能：
 * - 将关键上下文持久化到 .claudeskills/ 目录
 * - 跨会话加载相关记忆
 * - 自动注入上下文到系统提示词
 */

import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

// ============================================================================
// Types
// ============================================================================

export interface PersistentMemoryEntry {
  id: string
  type: 'preference' | 'pattern' | 'decision' | 'context' | 'skill'
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
  sessionId?: string
  projectPath?: string
}

export interface PersistentMemoryIndex {
  entries: PersistentMemoryEntry[]
  lastSync: number
  version: string
}

// ============================================================================
// Paths
// ============================================================================

const CLAUDESKILLS_DIR = '.claudeskills'
const MEMORY_DIR = 'memory'
const INDEX_FILE = 'index.json'

/**
 * 获取 .claudeskills/memory/ 目录路径
 */
export function getPersistentMemoryDir(cwd: string = process.cwd()): string {
  return path.join(cwd, CLAUDESKILLS_DIR, MEMORY_DIR)
}

/**
 * 获取索引文件路径
 */
export function getPersistentMemoryIndexPath(cwd: string = process.cwd()): string {
  return path.join(getPersistentMemoryDir(cwd), INDEX_FILE)
}

/**
 * 获取用户级记忆目录（跨项目共享）
 */
export function getUserPersistentMemoryDir(): string {
  return path.join(homedir(), '.claude', CLAUDESKILLS_DIR, MEMORY_DIR)
}

// ============================================================================
// Index Management
// ============================================================================

/**
 * 读取记忆索引
 */
export function loadMemoryIndex(cwd: string = process.cwd()): PersistentMemoryIndex {
  const indexPath = getPersistentMemoryIndexPath(cwd)

  try {
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, 'utf-8')
      const index = JSON.parse(raw) as PersistentMemoryIndex
      return {
        entries: index.entries || [],
        lastSync: index.lastSync || 0,
        version: index.version || '1.0',
      }
    }
  } catch {
    // 索引损坏，返回空索引
  }

  return {
    entries: [],
    lastSync: 0,
    version: '1.0',
  }
}

/**
 * 保存记忆索引
 */
export function saveMemoryIndex(index: PersistentMemoryIndex, cwd: string = process.cwd()): void {
  const dir = getPersistentMemoryDir(cwd)
  const indexPath = path.join(dir, INDEX_FILE)

  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8')
  } catch (error) {
    console.error('保存记忆索引失败:', error)
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * 创建记忆条目
 */
export function createMemoryEntry(entry: Omit<PersistentMemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): PersistentMemoryEntry {
  const newEntry: PersistentMemoryEntry = {
    ...entry,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const index = loadMemoryEntry(newEntry.projectPath || process.cwd())
  index.entries.push(newEntry)
  saveMemoryIndex(index, newEntry.projectPath || process.cwd())

  return newEntry
}

/**
 * 更新记忆条目
 */
export function updateMemoryEntry(id: string, updates: Partial<PersistentMemoryEntry>, cwd: string = process.cwd()): PersistentMemoryEntry | null {
  const index = loadMemoryIndex(cwd)
  const entryIndex = index.entries.findIndex(e => e.id === id)

  if (entryIndex === -1) return null

  index.entries[entryIndex] = {
    ...index.entries[entryIndex],
    ...updates,
    updatedAt: Date.now(),
  }

  saveMemoryIndex(index, cwd)
  return index.entries[entryIndex]
}

/**
 * 删除记忆条目
 */
export function deleteMemoryEntry(id: string, cwd: string = process.cwd()): boolean {
  const index = loadMemoryIndex(cwd)
  const initialLength = index.entries.length

  index.entries = index.entries.filter(e => e.id !== id)

  if (index.entries.length < initialLength) {
    saveMemoryIndex(index, cwd)
    return true
  }

  return false
}

/**
 * 查询记忆条目
 */
export function queryMemoryEntries(query: {
  type?: PersistentMemoryEntry['type']
  tags?: string[]
  projectPath?: string
  limit?: number
} = {}): PersistentMemoryEntry[] {
  const index = loadMemoryEntry(query.projectPath || process.cwd())

  let results = index.entries

  if (query.type) {
    results = results.filter(e => e.type === query.type)
  }

  if (query.tags && query.tags.length > 0) {
    results = results.filter(e =>
      query.tags!.some(tag => e.tags.includes(tag))
    )
  }

  if (query.projectPath) {
    results = results.filter(e =>
      e.projectPath === query.projectPath || !e.projectPath
    )
  }

  // 按更新时间倒序排列
  results.sort((a, b) => b.updatedAt - a.updatedAt)

  if (query.limit) {
    results = results.slice(0, query.limit)
  }

  return results
}

// ============================================================================
// Memory Injection
// ============================================================================

/**
 * 生成记忆注入提示词（用于系统提示词）
 */
export function generateMemoryInjection(cwd: string = process.cwd(), maxEntries: number = 10): string {
  const entries = queryMemoryEntries({
    projectPath: cwd,
    limit: maxEntries,
  })

  if (entries.length === 0) return ''

  const lines: string[] = [
    '## 相关记忆',
    '',
    '以下是从持久化记忆中检索到的相关信息：',
    '',
  ]

  for (const entry of entries) {
    lines.push(`### ${entry.title}`)
    lines.push(`类型: ${entry.type}`)
    if (entry.tags.length > 0) {
      lines.push(`标签: ${entry.tags.join(', ')}`)
    }
    lines.push('')
    lines.push(entry.content)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 提取并保存会话记忆（在会话结束时调用）
 */
export function extractAndSaveSessionMemory(
  sessionContent: string,
  sessionId: string,
  cwd: string = process.cwd(),
): void {
  // 简单的关键词提取逻辑
  const patterns = [
    /用户偏好[：:]\s*(.+?)(?:\n|$)/g,
    /约定[：:]\s*(.+?)(?:\n|$)/g,
    /注意[：:]\s*(.+?)(?:\n|$)/g,
    /决策[：:]\s*(.+?)(?:\n|$)/g,
    /TODO[：:]\s*(.+?)(?:\n|$)/gi,
  ]

  const extractedItems: { title: string; content: string; type: PersistentMemoryEntry['type'] }[] = []

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(sessionContent)) !== null) {
      const content = match[1]?.trim()
      if (content && content.length > 5) {
        extractedItems.push({
          title: content.slice(0, 50),
          content,
          type: 'context',
        })
      }
    }
  }

  // 保存提取的记忆
  for (const item of extractedItems) {
    createMemoryEntry({
      type: item.type,
      title: item.title,
      content: item.content,
      tags: ['auto-extracted'],
      sessionId,
      projectPath: cwd,
    })
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadMemoryEntry(cwd: string): PersistentMemoryIndex {
  return loadMemoryIndex(cwd)
}
