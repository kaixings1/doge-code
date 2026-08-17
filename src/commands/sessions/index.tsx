// ============================================================================
// Sessions Command - Enhanced Version
// 多会话管理：创建/切换/删除/搜索/标签/导出/分析/合并/归档
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput, useApp, useStdin } from '../../ink.js'
import * as React from 'react'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs'
import { join, basename, resolve } from 'path'
import { createInterface } from 'readline'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface SessionEntry {
  id: string
  name: string
  createdAt: number
  lastActiveAt: number
  messageCount: number
  tags: string[]
  category: string
  color: string
  archived: boolean
  template: string
  notes: string
  priority: 'low' | 'normal' | 'high'
  duration: number // 会话时长（秒）
  fileSize: number // 会话文件大小（字节）
  summary: string
  firstMessage: string
  lastMessage: string
  modelsUsed: string[]
}

interface SessionStore {
  version: string
  updatedAt: number
  sessions: SessionEntry[]
  categories: string[]
  tags: string[]
  templates: SessionTemplate[]
  settings: SessionSettings
}

interface SessionTemplate {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  systemPrompt: string
  createdAt: number
}

interface SessionSettings {
  autoSaveInterval: number
  maxSessions: number
  defaultCategory: string
  defaultTags: string[]
  archiveAfterDays: number
  trackUsageStats: boolean
  autoBackup: boolean
}

interface SearchFilters {
  query: string
  category: string
  tags: string[]
  dateFrom: number
  dateTo: number
  archived: boolean | null
  priority: string
  minMessages: number
  maxMessages: number
  sortBy: 'name' | 'date' | 'messages' | 'duration'
  sortOrder: 'asc' | 'desc'
}

interface SessionStats {
  totalSessions: number
  activeSessions: number
  archivedSessions: number
  totalMessages: number
  totalDuration: number
  avgMessagesPerSession: number
  avgDuration: number
  mostUsedCategory: string
  mostUsedTags: Array<{ tag: string; count: number }>
  sessionsByMonth: Array<{ month: string; count: number }>
  messagesByMonth: Array<{ month: string; count: number }>
}

interface ComparisonResult {
  sessionA: SessionEntry
  sessionB: SessionEntry
  commonTags: string[]
  commonCategory: boolean
  messageCountDiff: number
  durationDiff: number
  timeDiff: number
}

// ============================================================================
// Constants
// ============================================================================

const SESSION_DIR = join(process.cwd(), '.doge', 'sessions')
const SESSION_FILE = join(SESSION_DIR, 'sessions.json')
const EXPORT_DIR = join(SESSION_DIR, 'exports')
const ARCHIVE_DIR = join(SESSION_DIR, 'archives')
const BACKUP_DIR = join(SESSION_DIR, 'backups')

const SESSION_COLORS = ['green', 'yellow', 'blue', 'magenta', 'cyan', 'red', 'white']

const DEFAULT_SETTINGS: SessionSettings = {
  autoSaveInterval: 300000, // 5分钟
  maxSessions: 100,
  defaultCategory: '默认',
  defaultTags: [],
  archiveAfterDays: 30,
  trackUsageStats: true,
  autoBackup: true,
}

const DEFAULT_STORE: SessionStore = {
  version: '2.0',
  updatedAt: Date.now(),
  sessions: [],
  categories: ['默认', '开发', '设计', '学习', '工作', '个人'],
  tags: ['重要', '进行中', '已完成', '待处理', '参考', '模板'],
  templates: [],
  settings: DEFAULT_SETTINGS,
}

// ============================================================================
// Core Functions
// ============================================================================

function ensureDirs(): void {
  for (const dir of [SESSION_DIR, EXPORT_DIR, ARCHIVE_DIR, BACKUP_DIR]) {
    try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

function loadStore(): SessionStore {
  try {
    if (existsSync(SESSION_FILE)) {
      const data = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'))
      return { ...DEFAULT_STORE, ...data }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_STORE }
}

function persistStore(store: SessionStore): boolean {
  try {
    ensureDirs()
    store.updatedAt = Date.now()
    writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2), 'utf-8')
    return true
  } catch { return false }
}

function generateId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getColorForIndex(index: number): string {
  return SESSION_COLORS[index % SESSION_COLORS.length]
}

// ============================================================================
// Session CRUD
// ============================================================================

function createSession(store: SessionStore, name?: string, category?: string, tags?: string[]): SessionEntry {
  const session: SessionEntry = {
    id: generateId(),
    name: name || `会话 ${store.sessions.length + 1}`,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    messageCount: 0,
    tags: tags || [],
    category: category || store.settings.defaultCategory,
    color: getColorForIndex(store.sessions.length),
    archived: false,
    template: '',
    notes: '',
    priority: 'normal',
    duration: 0,
    fileSize: 0,
    summary: '',
    firstMessage: '',
    lastMessage: '',
    modelsUsed: [],
  }
  store.sessions.unshift(session)
  persistStore(store)
  return session
}

function switchSession(store: SessionStore, id: string): SessionEntry | null {
  const session = store.sessions.find(s => s.id === id)
  if (session) {
    session.lastActiveAt = Date.now()
    persistStore(store)
  }
  return session
}

function deleteSession(store: SessionStore, id: string): boolean {
  const idx = store.sessions.findIndex(s => s.id === id)
  if (idx === -1) return false
  store.sessions.splice(idx, 1)
  persistStore(store)
  return true
}

function updateSession(store: SessionStore, id: string, updates: Partial<SessionEntry>): SessionEntry | null {
  const session = store.sessions.find(s => s.id === id)
  if (!session) return null
  Object.assign(session, updates)
  persistStore(store)
  return session
}

function archiveSession(store: SessionStore, id: string): boolean {
  const session = store.sessions.find(s => s.id === id)
  if (!session) return false
  session.archived = true
  persistStore(store)
  return true
}

function unarchiveSession(store: SessionStore, id: string): boolean {
  const session = store.sessions.find(s => s.id === id)
  if (!session) return false
  session.archived = false
  persistStore(store)
  return true
}

function duplicateSession(store: SessionStore, id: string): SessionEntry | null {
  const session = store.sessions.find(s => s.id === id)
  if (!session) return null
  const duplicate: SessionEntry = {
    ...session,
    id: generateId(),
    name: `${session.name} (副本)`,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    archived: false,
  }
  store.sessions.unshift(duplicate)
  persistStore(store)
  return duplicate
}

function mergeSessions(store: SessionStore, ids: string[]): SessionEntry | null {
  const sessions = ids.map(id => store.sessions.find(s => s.id === id)).filter(Boolean) as SessionEntry[]
  if (sessions.length < 2) return null

  const merged: SessionEntry = {
    id: generateId(),
    name: `合并: ${sessions.map(s => s.name).join(' + ')}`,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    messageCount: sessions.reduce((sum, s) => sum + s.messageCount, 0),
    tags: [...new Set(sessions.flatMap(s => s.tags))],
    category: sessions[0].category,
    color: sessions[0].color,
    archived: false,
    template: '',
    notes: sessions.map(s => s.notes).filter(Boolean).join('\n---\n'),
    priority: 'normal',
    duration: sessions.reduce((sum, s) => sum + s.duration, 0),
    fileSize: sessions.reduce((sum, s) => sum + s.fileSize, 0),
    summary: sessions.map(s => s.summary).filter(Boolean).join('\n'),
    firstMessage: sessions[0].firstMessage,
    lastMessage: sessions[sessions.length - 1].lastMessage,
    modelsUsed: [...new Set(sessions.flatMap(s => s.modelsUsed))],
  }

  store.sessions.unshift(merged)
  persistStore(store)
  return merged
}

// ============================================================================
// Search & Filter
// ============================================================================

function searchSessions(store: SessionStore, filters: Partial<SearchFilters>): SessionEntry[] {
  let results = [...store.sessions]

  const f = filters as SearchFilters

  // Text search
  if (f.query) {
    const q = f.query.toLowerCase()
    results = results.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.notes.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q)
    )
  }

  // Category filter
  if (f.category) {
    results = results.filter(s => s.category === f.category)
  }

  // Tags filter
  if (f.tags && f.tags.length > 0) {
    results = results.filter(s => f.tags.some(t => s.tags.includes(t)))
  }

  // Date range
  if (f.dateFrom) {
    results = results.filter(s => s.createdAt >= f.dateFrom!)
  }
  if (f.dateTo) {
    results = results.filter(s => s.createdAt <= f.dateTo!)
  }

  // Archived filter
  if (f.archived !== null && f.archived !== undefined) {
    results = results.filter(s => s.archived === f.archived)
  }

  // Priority filter
  if (f.priority) {
    results = results.filter(s => s.priority === f.priority)
  }

  // Message count range
  if (f.minMessages !== undefined) {
    results = results.filter(s => s.messageCount >= f.minMessages!)
  }
  if (f.maxMessages !== undefined) {
    results = results.filter(s => s.messageCount <= f.maxMessages!)
  }

  // Sort
  const sortBy = f.sortBy || 'date'
  const sortOrder = f.sortOrder || 'desc'

  results.sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'date': cmp = a.createdAt - b.createdAt; break
      case 'messages': cmp = a.messageCount - b.messageCount; break
      case 'duration': cmp = a.duration - b.duration; break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })

  return results
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

function calculateStats(store: SessionStore): SessionStats {
  const active = store.sessions.filter(s => !s.archived)
  const archived = store.sessions.filter(s => s.archived)

  const tagCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  const monthCounts = new Map<string, { sessions: number; messages: number }>()

  for (const s of store.sessions) {
    // Tag counts
    for (const tag of s.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
    // Category counts
    categoryCounts.set(s.category, (categoryCounts.get(s.category) || 0) + 1)
    // Month counts
    const month = new Date(s.createdAt).toISOString().slice(0, 7)
    const mc = monthCounts.get(month) || { sessions: 0, messages: 0 }
    mc.sessions++
    mc.messages += s.messageCount
    monthCounts.set(month, mc)
  }

  const totalMessages = store.sessions.reduce((sum, s) => sum + s.messageCount, 0)
  const totalDuration = store.sessions.reduce((sum, s) => sum + s.duration, 0)

  return {
    totalSessions: store.sessions.length,
    activeSessions: active.length,
    archivedSessions: archived.length,
    totalMessages,
    totalDuration,
    avgMessagesPerSession: store.sessions.length > 0 ? Math.round(totalMessages / store.sessions.length) : 0,
    avgDuration: store.sessions.length > 0 ? Math.round(totalDuration / store.sessions.length) : 0,
    mostUsedCategory: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    mostUsedTags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    sessionsByMonth: [...monthCounts.entries()].map(([month, data]) => ({ month, count: data.sessions })).sort((a, b) => a.month.localeCompare(b.month)),
    messagesByMonth: [...monthCounts.entries()].map(([month, data]) => ({ month, count: data.messages })).sort((a, b) => a.month.localeCompare(b.month)),
  }
}

// ============================================================================
// Comparison
// ============================================================================

function compareSessions(store: SessionStore, idA: string, idB: string): ComparisonResult | null {
  const a = store.sessions.find(s => s.id === idA)
  const b = store.sessions.find(s => s.id === idB)
  if (!a || !b) return null

  return {
    sessionA: a,
    sessionB: b,
    commonTags: a.tags.filter(t => b.tags.includes(t)),
    commonCategory: a.category === b.category,
    messageCountDiff: a.messageCount - b.messageCount,
    durationDiff: a.duration - b.duration,
    timeDiff: a.createdAt - b.createdAt,
  }
}

// ============================================================================
// Import/Export
// ============================================================================

function exportSession(store: SessionStore, id: string, format: 'json' | 'md' | 'txt'): string | null {
  const session = store.sessions.find(s => s.id === id)
  if (!session) return null

  const filename = `${session.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_')}_${Date.now()}`

  if (format === 'json') {
    const path = join(EXPORT_DIR, `${filename}.json`)
    writeFileSync(path, JSON.stringify(session, null, 2), 'utf-8')
    return path
  }

  if (format === 'md') {
    const lines = [
      `# ${session.name}`,
      '',
      `- **ID**: ${session.id}`,
      `- **分类**: ${session.category}`,
      `- **标签**: ${session.tags.join(', ')}`,
      `- **优先级**: ${session.priority}`,
      `- **创建时间**: ${new Date(session.createdAt).toLocaleString('zh-CN')}`,
      `- **最后活跃**: ${new Date(session.lastActiveAt).toLocaleString('zh-CN')}`,
      `- **消息数**: ${session.messageCount}`,
      `- **时长**: ${Math.round(session.duration / 60)}分钟`,
      `- **模型**: ${session.modelsUsed.join(', ')}`,
      '',
      '## 摘要',
      session.summary || '无摘要',
      '',
      '## 笔记',
      session.notes || '无笔记',
    ]
    const path = join(EXPORT_DIR, `${filename}.md`)
    writeFileSync(path, lines.join('\n'), 'utf-8')
    return path
  }

  // txt format
  const lines = [
    `会话: ${session.name}`,
    `ID: ${session.id}`,
    `分类: ${session.category}`,
    `标签: ${session.tags.join(', ')}`,
    `创建时间: ${new Date(session.createdAt).toLocaleString('zh-CN')}`,
    `消息数: ${session.messageCount}`,
    '',
    `摘要: ${session.summary || '无'}`,
    '',
    `笔记: ${session.notes || '无'}`,
  ]
  const path = join(EXPORT_DIR, `${filename}.txt`)
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

function exportAllSessions(store: SessionStore, format: 'json' | 'md' | 'txt'): string {
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `all_sessions_${timestamp}`

  if (format === 'json') {
    const path = join(EXPORT_DIR, `${filename}.json`)
    writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
    return path
  }

  const lines: string[] = [`# 所有会话 (${store.sessions.length} 个)\n`]
  for (const s of store.sessions) {
    lines.push(`## ${s.name}`)
    lines.push(`- ID: ${s.id}`)
    lines.push(`- 分类: ${s.category}`)
    lines.push(`- 标签: ${s.tags.join(', ')}`)
    lines.push(`- 消息数: ${s.messageCount}`)
    lines.push(`- 创建: ${new Date(s.createdAt).toLocaleString('zh-CN')}`)
    lines.push('')
  }

  const path = join(EXPORT_DIR, `${format === 'md' ? `${filename}.md` : `${filename}.txt`}`)
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

function importSession(store: SessionStore, filePath: string): SessionEntry | null {
  try {
    const content = readFileSync(resolve(filePath), 'utf-8')
    const data = JSON.parse(content)
    const session: SessionEntry = {
      ...data,
      id: generateId(), // New ID to avoid conflicts
      name: `${data.name} (导入)`,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }
    store.sessions.unshift(session)
    persistStore(store)
    return session
  } catch {
    return null
  }
}

// ============================================================================
// Backup & Archive
// ============================================================================

function createBackup(store: SessionStore): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(BACKUP_DIR, `backup_${timestamp}.json`)
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
  return path
}

function restoreFromBackup(store: SessionStore, backupPath: string): boolean {
  try {
    const content = readFileSync(resolve(backupPath), 'utf-8')
    const data = JSON.parse(content)
    const restored = { ...DEFAULT_STORE, ...data }
    persistStore(restored)
    return true
  } catch {
    return false
  }
}

function listBackups(): string[] {
  try {
    ensureDirs()
    return readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse()
  } catch {
    return []
  }
}

function autoArchiveSessions(store: SessionStore): number {
  const threshold = Date.now() - store.settings.archiveAfterDays * 24 * 60 * 60 * 1000
  let count = 0
  for (const s of store.sessions) {
    if (!s.archived && s.lastActiveAt < threshold) {
      s.archived = true
      count++
    }
  }
  if (count > 0) persistStore(store)
  return count
}

// ============================================================================
// Template Management
// ============================================================================

function createTemplate(store: SessionStore, name: string, description: string, category: string, tags: string[], systemPrompt: string): SessionTemplate {
  const template: SessionTemplate = {
    id: generateId(),
    name,
    description,
    category,
    tags,
    systemPrompt,
    createdAt: Date.now(),
  }
  store.templates.push(template)
  persistStore(store)
  return template
}

function deleteTemplate(store: SessionStore, id: string): boolean {
  const idx = store.templates.findIndex(t => t.id === id)
  if (idx === -1) return false
  store.templates.splice(idx, 1)
  persistStore(store)
  return true
}

function createSessionFromTemplate(store: SessionStore, templateId: string): SessionEntry | null {
  const template = store.templates.find(t => t.id === templateId)
  if (!template) return null
  return createSession(store, template.name, template.category, template.tags)
}

// ============================================================================
// Formatting Utilities
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}小时${mins}分钟`
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📑 多会话管理 - 增强版',
    '',
    '创建、切换、搜索、分析、导出、归档会话。',
    '',
    '用法:',
    '  /sessions <命令> [参数]',
    '',
    '基本命令:',
    '  list                  列出所有会话',
    '  new [名称]            创建新会话',
    '  switch <ID>           切换会话',
    '  delete <ID>           删除会话',
    '  duplicate <ID>        复制会话',
    '  merge <ID1> <ID2>     合并会话',
    '',
    '搜索与筛选:',
    '  search <关键词>       搜索会话',
    '  filter --category <分类> --tags <标签>',
    '  filter --archived     只看已归档',
    '  filter --priority <high|normal|low>',
    '',
    '标签与分类:',
    '  tags                  列出所有标签',
    '  categories            列出所有分类',
    '  tag-add <ID> <标签>   添加标签',
    '  tag-remove <ID> <标签> 移除标签',
    '  category <ID> <分类>  设置分类',
    '  priority <ID> <级别>  设置优先级',
    '',
    '归档:',
    '  archive <ID>          归档会话',
    '  unarchive <ID>        取消归档',
    '  archived              列出已归档会话',
    '  auto-archive          自动归档过期会话',
    '',
    '导入/导出:',
    '  export <ID> [json|md|txt]   导出单个会话',
    '  export-all [json|md|txt]    导出所有会话',
    '  import <文件路径>            导入会话',
    '',
    '模板:',
    '  template-list         列出模板',
    '  template-create       创建模板',
    '  template-delete <ID>  删除模板',
    '  template-use <ID>     从模板创建会话',
    '',
    '统计与分析:',
    '  stats                 会话统计',
    '  compare <ID1> <ID2>   对比两个会话',
    '  timeline              会话时间线',
    '  activity              活跃度分析',
    '',
    '备份:',
    '  backup                创建备份',
    '  backups               列出备份',
    '  restore <备份文件>    恢复备份',
    '',
    '设置:',
    '  settings              查看设置',
    '  set <键> <值>         修改设置',
    '',
    '快捷键 (交互模式):',
    '  n - 创建新会话',
    '  d - 删除当前会话',
    '  a - 归档/取消归档',
    '  e - 导出当前会话',
    '  s - 搜索会话',
    '  t - 标签管理',
    '  r - 刷新',
    '  1-9 - 切换会话',
    '  Esc - 退出',
  ].join('\n')
}

// ============================================================================
// Main Call Function
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const store = loadStore()
  const parts = (args || '').trim().split(/\s+/)
  const command = parts[0]?.toLowerCase() || 'interactive'
  const rest = parts.slice(1).join(' ')

  // Non-interactive commands
  switch (command) {
    case 'help':
      return { type: 'text', value: renderHelp() }
    case 'list':
      return { type: 'text', value: listSessionsText(store) }
    case 'new':
      return handleNewSession(store, rest)
    case 'switch':
      return handleSwitchSession(store, rest)
    case 'delete':
      return handleDeleteSession(store, rest)
    case 'duplicate':
      return handleDuplicateSession(store, rest)
    case 'merge':
      return handleMergeSessions(store, rest)
    case 'search':
      return handleSearch(store, rest)
    case 'filter':
      return handleFilter(store, parts.slice(1))
    case 'tags':
      return { type: 'text', value: listTags(store) }
    case 'categories':
      return { type: 'text', value: listCategories(store) }
    case 'tag-add':
      return handleTagAdd(store, parts.slice(1))
    case 'tag-remove':
      return handleTagRemove(store, parts.slice(1))
    case 'category':
      return handleSetCategory(store, parts.slice(1))
    case 'priority':
      return handleSetPriority(store, parts.slice(1))
    case 'archive':
      return handleArchive(store, rest, true)
    case 'unarchive':
      return handleArchive(store, rest, false)
    case 'archived':
      return { type: 'text', value: listArchivedSessions(store) }
    case 'auto-archive':
      return handleAutoArchive(store)
    case 'export':
      return handleExport(store, parts.slice(1))
    case 'export-all':
      return handleExportAll(store, rest)
    case 'import':
      return handleImport(store, rest)
    case 'template-list':
      return { type: 'text', value: listTemplates(store) }
    case 'template-create':
      return handleCreateTemplate(store, rest)
    case 'template-delete':
      return handleDeleteTemplate(store, rest)
    case 'template-use':
      return handleUseTemplate(store, rest)
    case 'stats':
      return { type: 'text', value: formatStats(calculateStats(store)) }
    case 'compare':
      return handleCompare(store, parts.slice(1))
    case 'timeline':
      return { type: 'text', value: formatTimeline(store) }
    case 'activity':
      return { type: 'text', value: formatActivity(calculateStats(store)) }
    case 'backup':
      return handleBackup(store)
    case 'backups':
      return { type: 'text', value: listBackupsText() }
    case 'restore':
      return handleRestore(store, rest)
    case 'settings':
      return { type: 'text', value: formatSettings(store.settings) }
    case 'set':
      return handleSetSetting(store, parts.slice(1))
    case 'interactive':
    default:
      return renderInteractiveUI(store, onDone)
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

function listSessionsText(store: SessionStore): string {
  const sessions = store.sessions.filter(s => !s.archived)
  if (sessions.length === 0) return '📋 没有活动会话。使用 /sessions new 创建一个。'

  const lines: string[] = [`📑 会话列表 (${sessions.length} 个活动会话):`]
  lines.push('═'.repeat(60))

  for (const s of sessions) {
    const tagStr = s.tags.length > 0 ? ` [${s.tags.join(', ')}]` : ''
    const date = new Date(s.createdAt).toLocaleDateString('zh-CN')
    lines.push(`  [${s.id}] ${s.name}`)
    lines.push(`    分类: ${s.category}${tagStr} | 消息: ${s.messageCount} | 创建: ${date}`)
    if (s.notes) lines.push(`    备注: ${truncate(s.notes, 40)}`)
  }

  return lines.join('\n')
}

function handleNewSession(store: SessionStore, name: string) {
  const session = createSession(store, name || undefined)
  return { type: 'text', value: `✅ 已创建会话: ${session.name} (${session.id})` }
}

function handleSwitchSession(store: SessionStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供会话 ID' }
  const session = switchSession(store, id)
  if (!session) return { type: 'text', value: `❌ 未找到会话 ${id}` }
  return { type: 'text', value: `✅ 已切换到会话: ${session.name}` }
}

function handleDeleteSession(store: SessionStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供会话 ID' }
  if (store.sessions.length <= 1) return { type: 'text', value: '❌ 至少需要保留一个会话' }
  const deleted = deleteSession(store, id)
  return deleted ? { type: 'text', value: `✅ 已删除会话` } : { type: 'text', value: `❌ 未找到会话 ${id}` }
}

function handleDuplicateSession(store: SessionStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供会话 ID' }
  const dup = duplicateSession(store, id)
  return dup ? { type: 'text', value: `✅ 已复制会话: ${dup.name}` } : { type: 'text', value: `❌ 未找到会话` }
}

function handleMergeSessions(store: SessionStore, ids: string[]) {
  if (ids.length < 2) return { type: 'text', value: '❌ 请提供至少两个会话 ID' }
  const merged = mergeSessions(store, ids)
  return merged ? { type: 'text', value: `✅ 已合并会话: ${merged.name}` } : { type: 'text', value: `❌ 合并失败` }
}

function handleSearch(store: SessionStore, query: string) {
  if (!query) return { type: 'text', value: '❌ 请提供搜索关键词' }
  const results = searchSessions(store, { query })
  if (results.length === 0) return { type: 'text', value: `🔍 未找到包含 "${query}" 的会话` }

  const lines: string[] = [`🔍 搜索结果 (${results.length} 个):`]
  for (const s of results) {
    lines.push(`  [${s.id}] ${s.name} (${s.category}) ${s.tags.join(', ')}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

function handleFilter(store: SessionStore, args: string[]) {
  const filters: Partial<SearchFilters> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) { filters.category = args[i + 1]; i++ }
    if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[i + 1].split(','); i++ }
    if (args[i] === '--archived') { filters.archived = true }
    if (args[i] === '--priority' && args[i + 1]) { filters.priority = args[i + 1]; i++ }
  }
  const results = searchSessions(store, filters)
  if (results.length === 0) return { type: 'text', value: '📋 没有符合条件的会话' }

  const lines: string[] = [`📋 筛选结果 (${results.length} 个):`]
  for (const s of results) {
    lines.push(`  [${s.id}] ${s.name} | ${s.category} | ${s.tags.join(', ') || '无标签'} | ${s.messageCount}条消息`)
  }
  return { type: 'text', value: lines.join('\n') }
}

function listTags(store: SessionStore): string {
  const allTags = new Set(store.sessions.flatMap(s => s.tags))
  const lines: string[] = ['🏷️ 所有标签:']
  for (const tag of allTags) {
    const count = store.sessions.filter(s => s.tags.includes(tag)).length
    lines.push(`  ${tag} (${count})`)
  }
  return lines.join('\n')
}

function listCategories(store: SessionStore): string {
  const lines: string[] = ['📁 所有分类:']
  for (const cat of store.categories) {
    const count = store.sessions.filter(s => s.category === cat && !s.archived).length
    lines.push(`  ${cat} (${count})`)
  }
  return lines.join('\n')
}

function handleTagAdd(store: SessionStore, args: string[]) {
  const [id, ...tags] = args
  if (!id || tags.length === 0) return { type: 'text', value: '❌ 请提供会话 ID 和标签' }
  const session = store.sessions.find(s => s.id === id)
  if (!session) return { type: 'text', value: `❌ 未找到会话 ${id}` }
  for (const tag of tags) {
    if (!session.tags.includes(tag)) session.tags.push(tag)
    if (!store.tags.includes(tag)) store.tags.push(tag)
  }
  persistStore(store)
  return { type: 'text', value: `✅ 已添加标签: ${tags.join(', ')}` }
}

function handleTagRemove(store: SessionStore, args: string[]) {
  const [id, ...tags] = args
  if (!id || tags.length === 0) return { type: 'text', value: '❌ 请提供会话 ID 和标签' }
  const session = store.sessions.find(s => s.id === id)
  if (!session) return { type: 'text', value: `❌ 未找到会话 ${id}` }
  session.tags = session.tags.filter(t => !tags.includes(t))
  persistStore(store)
  return { type: 'text', value: `✅ 已移除标签: ${tags.join(', ')}` }
}

function handleSetCategory(store: SessionStore, args: string[]) {
  const [id, category] = args
  if (!id || !category) return { type: 'text', value: '❌ 请提供会话 ID 和分类' }
  if (!store.categories.includes(category)) {
    store.categories.push(category)
  }
  const session = updateSession(store, id, { category })
  return session ? { type: 'text', value: `✅ 已设置分类为: ${category}` } : { type: 'text', value: `❌ 未找到会话` }
}

function handleSetPriority(store: SessionStore, args: string[]) {
  const [id, priority] = args
  if (!id || !['high', 'normal', 'low'].includes(priority)) return { type: 'text', value: '❌ 请提供会话 ID 和优先级 (high/normal/low)' }
  const session = updateSession(store, id, { priority: priority as any })
  return session ? { type: 'text', value: `✅ 已设置优先级为: ${priority}` } : { type: 'text', value: `❌ 未找到会话` }
}

function handleArchive(store: SessionStore, id: string, archive: boolean) {
  if (!id) return { type: 'text', value: '❌ 请提供会话 ID' }
  const fn = archive ? archiveSession : unarchiveSession
  const result = fn(store, id)
  return result ? { type: 'text', value: `✅ 已${archive ? '归档' : '取消归档'}会话` } : { type: 'text', value: `❌ 未找到会话` }
}

function listArchivedSessions(store: SessionStore): string {
  const archived = store.sessions.filter(s => s.archived)
  if (archived.length === 0) return '📋 没有已归档的会话'

  const lines: string[] = [`📋 已归档会话 (${archived.length} 个):`]
  for (const s of archived) {
    lines.push(`  [${s.id}] ${s.name} | ${s.category} | 归档于 ${formatRelativeTime(s.lastActiveAt)}`)
  }
  return lines.join('\n')
}

function handleAutoArchive(store: SessionStore) {
  const count = autoArchiveSessions(store)
  return { type: 'text', value: count > 0 ? `✅ 已自动归档 ${count} 个过期会话` : '📋 没有需要归档的会话' }
}

function handleExport(store: SessionStore, args: string[]) {
  const [id, format] = args
  if (!id) return { type: 'text', value: '❌ 请提供会话 ID' }
  const path = exportSession(store, id, (format as any) || 'json')
  return path ? { type: 'text', value: `✅ 已导出到: ${path}` } : { type: 'text', value: `❌ 导出失败` }
}

function handleExportAll(store: SessionStore, format: string) {
  const path = exportAllSessions(store, (format as any) || 'json')
  return { type: 'text', value: `✅ 已导出所有会话到: ${path}` }
}

function handleImport(store: SessionStore, filePath: string) {
  if (!filePath) return { type: 'text', value: '❌ 请提供文件路径' }
  const session = importSession(store, filePath)
  return session ? { type: 'text', value: `✅ 已导入会话: ${session.name}` } : { type: 'text', value: `❌ 导入失败` }
}

function listTemplates(store: SessionStore): string {
  if (store.templates.length === 0) return '📋 没有模板'

  const lines: string[] = [`📋 会话模板 (${store.templates.length} 个):`]
  for (const t of store.templates) {
    lines.push(`  [${t.id}] ${t.name} - ${t.description}`)
  }
  return lines.join('\n')
}

function handleCreateTemplate(store: SessionStore, rest: string) {
  if (!rest) return { type: 'text', value: '❌ 请提供模板名称' }
  const template = createTemplate(store, rest, '', '默认', [], '')
  return { type: 'text', value: `✅ 已创建模板: ${template.name}` }
}

function handleDeleteTemplate(store: SessionStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供模板 ID' }
  const deleted = deleteTemplate(store, id)
  return deleted ? { type: 'text', value: `✅ 已删除模板` } : { type: 'text', value: `❌ 未找到模板` }
}

function handleUseTemplate(store: SessionStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供模板 ID' }
  const session = createSessionFromTemplate(store, id)
  return session ? { type: 'text', value: `✅ 已从模板创建会话: ${session.name}` } : { type: 'text', value: `❌ 未找到模板` }
}

function formatStats(stats: SessionStats): string {
  const lines: string[] = []
  lines.push('📊 会话统计')
  lines.push('═'.repeat(40))
  lines.push(`总会话数: ${stats.totalSessions}`)
  lines.push(`活动会话: ${stats.activeSessions}`)
  lines.push(`已归档: ${stats.archivedSessions}`)
  lines.push(`总消息数: ${stats.totalMessages}`)
  lines.push(`平均每会话消息: ${stats.avgMessagesPerSession}`)
  lines.push(`总时长: ${formatDuration(stats.totalDuration)}`)
  lines.push(`平均时长: ${formatDuration(stats.avgDuration)}`)
  lines.push(`常用分类: ${stats.mostUsedCategory}`)
  lines.push('')
  lines.push('--- 常用标签 ---')
  for (const t of stats.mostUsedTags.slice(0, 5)) {
    lines.push(`  ${t.tag}: ${t.count}次`)
  }
  lines.push('')
  lines.push('--- 月度趋势 ---')
  for (const m of stats.sessionsByMonth.slice(-6)) {
    lines.push(`  ${m.month}: ${m.count}个会话, ${stats.messagesByMonth.find(x => x.month === m.month)?.count || 0}条消息`)
  }
  return lines.join('\n')
}

function handleCompare(store: SessionStore, args: string[]) {
  if (args.length < 2) return { type: 'text', value: '❌ 请提供两个会话 ID' }
  const result = compareSessions(store, args[0], args[1])
  if (!result) return { type: 'text', value: '❌ 未找到会话' }

  const lines: string[] = []
  lines.push('📊 会话对比')
  lines.push('═'.repeat(50))
  lines.push(`${result.sessionA.name} vs ${result.sessionB.name}`)
  lines.push('')
  lines.push(`消息数: ${result.sessionA.messageCount} vs ${result.sessionB.messageCount} (差: ${result.messageCountDiff > 0 ? '+' : ''}${result.messageCountDiff})`)
  lines.push(`时长: ${formatDuration(result.sessionA.duration)} vs ${formatDuration(result.sessionB.duration)}`)
  lines.push(`分类: ${result.sessionA.category} ${result.commonCategory ? '✅ 相同' : '❌ 不同'} ${result.sessionB.category}`)
  lines.push(`标签: ${result.commonTags.length > 0 ? result.commonTags.join(', ') : '无共同标签'}`)
  lines.push(`时间差: ${Math.abs(Math.round(result.timeDiff / 86400000))}天`)

  return { type: 'text', value: lines.join('\n') }
}

function formatTimeline(store: SessionStore): string {
  const sessions = [...store.sessions].sort((a, b) => a.createdAt - b.createdAt)
  const lines: string[] = ['📅 会话时间线:']

  for (const s of sessions) {
    const date = new Date(s.createdAt).toLocaleDateString('zh-CN')
    const icon = s.archived ? '📦' : '💬'
    lines.push(`  ${date} ${icon} ${s.name} (${s.messageCount}条消息)`)
  }

  return lines.join('\n')
}

function formatActivity(stats: SessionStats): string {
  const lines: string[] = ['📈 活跃度分析:']
  lines.push(`日均会话: ${(stats.totalSessions / Math.max(stats.sessionsByMonth.length, 1)).toFixed(1)}`)
  lines.push(`日均消息: ${(stats.totalMessages / Math.max(stats.sessionsByMonth.length, 1)).toFixed(1)}`)
  return lines.join('\n')
}

function handleBackup(store: SessionStore) {
  const path = createBackup(store)
  return { type: 'text', value: `✅ 已创建备份: ${path}` }
}

function listBackupsText(): string {
  const backups = listBackups()
  if (backups.length === 0) return '📋 没有备份'

  const lines: string[] = [`📋 备份列表 (${backups.length} 个):`]
  for (const b of backups.slice(0, 10)) {
    lines.push(`  ${b}`)
  }
  return lines.join('\n')
}

function handleRestore(store: SessionStore, path: string) {
  if (!path) return { type: 'text', value: '❌ 请提供备份文件路径' }
  const success = restoreFromBackup(store, path)
  return success ? { type: 'text', value: `✅ 已从备份恢复` } : { type: 'text', value: `❌ 恢复失败` }
}

function formatSettings(settings: SessionSettings): string {
  const lines: string[] = ['⚙️ 会话设置:']
  lines.push(`  自动保存间隔: ${settings.autoSaveInterval / 1000}秒`)
  lines.push(`  最大会话数: ${settings.maxSessions}`)
  lines.push(`  默认分类: ${settings.defaultCategory}`)
  lines.push(`  默认标签: ${settings.defaultTags.join(', ')}`)
  lines.push(`  自动归档天数: ${settings.archiveAfterDays}`)
  lines.push(`  追踪使用统计: ${settings.trackUsageStats ? '是' : '否'}`)
  lines.push(`  自动备份: ${settings.autoBackup ? '是' : '否'}`)
  return lines.join('\n')
}

function handleSetSetting(store: SessionStore, args: string[]) {
  const [key, value] = args
  if (!key || !value) return { type: 'text', value: '❌ 请提供设置键和值' }

  switch (key) {
    case 'autoSaveInterval': store.settings.autoSaveInterval = parseInt(value) * 1000; break
    case 'maxSessions': store.settings.maxSessions = parseInt(value); break
    case 'defaultCategory': store.settings.defaultCategory = value; break
    case 'archiveAfterDays': store.settings.archiveAfterDays = parseInt(value); break
    case 'trackUsageStats': store.settings.trackUsageStats = value === 'true'; break
    case 'autoBackup': store.settings.autoBackup = value === 'true'; break
    default: return { type: 'text', value: `❌ 未知设置: ${key}` }
  }

  persistStore(store)
  return { type: 'text', value: `✅ 已设置 ${key} = ${value}` }
}

// ============================================================================
// Interactive UI
// ============================================================================

function renderInteractiveUI(store: SessionStore, onDone: () => void) {
  return React.createElement(SessionsComponent, { store, onDone })
}

interface SessionsProps {
  store: SessionStore
  onDone: () => void
}

const SessionsComponent: React.FC<SessionsProps> = ({ store: initialStore, onDone }) => {
  const [store, setStore] = React.useState(initialStore)
  const [activeId, setActiveId] = React.useState<string | null>(store.sessions.find(s => !s.archived)?.id || null)
  const [mode, setMode] = React.useState<'list' | 'search' | 'stats' | 'help'>('list')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedIdx, setSelectedIdx] = React.useState(0)
  const [message, setMessage] = React.useState<string | null(null)
  const [refresh, setRefresh] = React.useState(0)

  const sessions = store.sessions.filter(s => !s.archived)
  const filteredSessions = searchQuery
    ? searchSessions(store, { query: searchQuery })
    : sessions

  useInput((input, key) => {
    if (key.escape) { onDone(); return }

    if (mode === 'list' || mode === 'search') {
      if (input === 'n') {
        const newSession = createSession(store)
        setStore({ ...store })
        setActiveId(newSession.id)
        setMessage(`已创建: ${newSession.name}`)
        setRefresh(r => r + 1)
      }
      if (input === 'd' && filteredSessions.length > 0) {
        const target = filteredSessions[selectedIdx]
        if (target && store.sessions.length > 1) {
          deleteSession(store, target.id)
          setStore({ ...store })
          setMessage(`已删除: ${target.name}`)
          setSelectedIdx(0)
          setRefresh(r => r + 1)
        }
      }
      if (input === 'a' && filteredSessions.length > 0) {
        const target = filteredSessions[selectedIdx]
        if (target) {
          if (target.archived) {
            unarchiveSession(store, target.id)
          } else {
            archiveSession(store, target.id)
          }
          setStore({ ...store })
          setMessage(`${target.archived ? '取消归档' : '已归档'}: ${target.name}`)
          setRefresh(r => r + 1)
        }
      }
      if (input === 's') {
        setMode('search')
        setSearchQuery('')
      }
      if (input === 't') {
        setMode('stats')
      }
      if (input === 'h' || input === '?') {
        setMode('help')
      }
      if (input === 'r') {
        setStore(loadStore())
        setMessage('已刷新')
        setRefresh(r => r + 1)
      }
      if (key.upArrow && selectedIdx > 0) {
        setSelectedIdx(selectedIdx - 1)
      }
      if (key.downArrow && selectedIdx < filteredSessions.length - 1) {
        setSelectedIdx(selectedIdx + 1)
      }
      if (key.return && filteredSessions.length > 0) {
        const target = filteredSessions[selectedIdx]
        if (target) {
          switchSession(store, target.id)
          setActiveId(target.id)
          setStore({ ...store })
          setMessage(`已切换到: ${target.name}`)
        }
      }
      // Number keys to switch sessions
      const num = parseInt(input)
      if (!isNaN(num) && num >= 1 && num <= 9 && num <= filteredSessions.length) {
        const target = filteredSessions[num - 1]
        if (target) {
          switchSession(store, target.id)
          setActiveId(target.id)
          setStore({ ...store })
          setMessage(`已切换到: ${target.name}`)
        }
      }
    } else {
      if (key.escape || input === 'q' || input === 'b') {
        setMode('list')
      }
    }
  })

  if (mode === 'help') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">📑 会话管理 - 帮助</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>快捷键:</Text>
          <Text>  n - 创建新会话</Text>
          <Text>  d - 删除选中会话</Text>
          <Text>  a - 归档/取消归档</Text>
          <Text>  s - 搜索会话</Text>
          <Text>  t - 查看统计</Text>
          <Text>  r - 刷新列表</Text>
          <Text>  ↑↓ - 选择会话</Text>
          <Text>  Enter - 切换会话</Text>
          <Text>  1-9 - 快速切换</Text>
          <Text>  Esc - 退出</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>按 Esc/q/返回</Text>
        </Box>
      </Box>
    )
  }

  if (mode === 'stats') {
    const stats = calculateStats(store)
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">📊 会话统计</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>总会话数: {stats.totalSessions}</Text>
          <Text>活动会话: {stats.activeSessions}</Text>
          <Text>已归档: {stats.archivedSessions}</Text>
          <Text>总消息数: {stats.totalMessages}</Text>
          <Text>平均每会话: {stats.avgMessagesPerSession}条</Text>
          <Text>总时长: {formatDuration(stats.totalDuration)}</Text>
          <Text>常用分类: {stats.mostUsedCategory}</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold>常用标签:</Text>
          {stats.mostUsedTags.slice(0, 5).map((t, i) => (
            <Text key={i}>  {t.tag}: {t.count}次</Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>按 Esc/q/返回</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">📑 会话管理</Text>
        <Text dimColor> ({sessions.length} 个活动会话)</Text>
      </Box>

      {mode === 'search' && (
        <Box marginBottom={1}>
          <Text color="yellow">🔍 搜索: {searchQuery}_</Text>
        </Box>
      )}

      {/* Session list */}
      <Box flexDirection="column">
        {filteredSessions.map((s, i) => {
          const isActive = s.id === activeId
          const isSelected = i === selectedIdx
          const date = formatRelativeTime(s.createdAt)
          const tagStr = s.tags.length > 0 ? ` [${s.tags.join(', ')}]` : ''
          const priorityIcon = s.priority === 'high' ? '🔴' : s.priority === 'low' ? '🔵' : '⚪'

          return (
            <Box key={s.id} flexDirection="row">
              <Text color={isSelected ? 'yellow' : isActive ? 'green' : 'white'}>
                {isSelected ? '▶' : isActive ? '●' : '○'}
              </Text>
              <Text> {priorityIcon} [{i + 1}] </Text>
              <Text color={isActive ? 'green' : 'white'}>{s.name}</Text>
              <Text dimColor>{tagStr}</Text>
              <Text dimColor> ({s.messageCount}条, {date})</Text>
            </Box>
          )
        })}
      </Box>

      {/* Status message */}
      {message && (
        <Box marginTop={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {/* Bottom hint */}
      <Box marginTop={1}>
        <Text dimColor>
          n 新建 | d 删除 | a 归档 | s 搜索 | t 统计 | ↑↓ 选择 | Enter 切换 | Esc 退出
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Command Definition
// ============================================================================

const sessions: Command = {
  type: 'local-jsx' as const,
  name: 'sessions',
  description: '多会话管理 - 创建/切换/搜索/标签/导出/分析/归档/备份/合并',
  aliases: ['/sessions', '/sess'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default sessions
