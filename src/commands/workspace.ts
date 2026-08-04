// ============================================================================
// Workspace Command - Enhanced Version
// 工作区管理：保存/恢复/对比/合并/模板/自动保存/搜索/导出/归档
// ============================================================================

import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, renameSync } from 'fs'
import { join, basename, resolve, dirname } from 'path'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface WorkspaceSnapshot {
  id: string
  name: string
  savedAt: string
  project: string
  branch: string
  summary: string
  files: string[]
  diff: string
  recentCommits: string[]
  tags: string[]
  category: string
  priority: 'low' | 'normal' | 'high'
  notes: string
  gitStatus: {
    modified: number
    added: number
    deleted: number
    untracked: number
  }
  totalChanges: number
  remoteBranch: string
  ahead: number
  behind: number
  mergeBase: string
  stashes: string[]
  metadata: Record<string, string>
}

interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  category: string
  summary: string
  tags: string[]
  files: string[]
  createdAt: string
}

interface WorkspaceStore {
  version: string
  updatedAt: string
  workspaces: WorkspaceSnapshot[]
  templates: WorkspaceTemplate[]
  categories: string[]
  settings: WorkspaceSettings
}

interface WorkspaceSettings {
  autoSaveInterval: number
  maxWorkspaces: number
  defaultCategory: string
  defaultTags: string[]
  archiveAfterDays: number
  trackUsageStats: boolean
  autoBackup: boolean
  diffContextLines: number
  includeUntracked: boolean
  includeIgnored: boolean
  maxDiffSize: number
  compressionEnabled: boolean
}

interface WorkspaceComparison {
  workspaceA: WorkspaceSnapshot
  workspaceB: WorkspaceSnapshot
  commonFiles: string[]
  uniqueToA: string[]
  uniqueToB: string[]
  fileChanges: Array<{
    file: string
    status: 'added' | 'removed' | 'modified' | 'unchanged'
    linesAdded: number
    linesRemoved: number
  }>
  branchDistance: number
  timeDiff: number
}

interface WorkspaceStats {
  totalWorkspaces: number
  totalFiles: number
  totalChanges: number
  avgFilesPerWorkspace: number
  mostUsedCategory: string
  mostUsedTags: Array<{ tag: string; count: number }>
  workspacesByMonth: Array<{ month: string; count: number }>
  largestWorkspace: string
  oldestWorkspace: string
}

interface SearchFilters {
  query: string
  category: string
  tags: string[]
  dateFrom: string
  dateTo: string
  branch: string
  project: string
  sortBy: 'name' | 'date' | 'changes' | 'files'
  sortOrder: 'asc' | 'desc'
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_DIR = join(process.cwd(), '.doge', 'workspaces')
const WORKSPACE_FILE = join(WORKSPACE_DIR, 'current.json')
const EXPORT_DIR = join(WORKSPACE_DIR, 'exports')
const ARCHIVE_DIR = join(WORKSPACE_DIR, 'archives')
const BACKUP_DIR = join(WORKSPACE_DIR, 'backups')

const DEFAULT_SETTINGS: WorkspaceSettings = {
  autoSaveInterval: 300000, // 5分钟
  maxWorkspaces: 50,
  defaultCategory: '默认',
  defaultTags: [],
  archiveAfterDays: 30,
  trackUsageStats: true,
  autoBackup: true,
  diffContextLines: 3,
  includeUntracked: true,
  includeIgnored: false,
  maxDiffSize: 5 * 1024 * 1024, // 5MB
  compressionEnabled: false,
}

const DEFAULT_STORE: WorkspaceStore = {
  version: '2.0',
  updatedAt: new Date().toISOString(),
  workspaces: [],
  templates: [],
  categories: ['默认', '开发', '修复', '重构', '实验', '发布'],
  settings: DEFAULT_SETTINGS,
}

// ============================================================================
// Core Functions
// ============================================================================

function ensureDirs(): void {
  for (const dir of [WORKSPACE_DIR, EXPORT_DIR, ARCHIVE_DIR, BACKUP_DIR]) {
    try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

function loadStore(): WorkspaceStore {
  try {
    if (existsSync(WORKSPACE_FILE)) {
      const data = JSON.parse(readFileSync(WORKSPACE_FILE, 'utf-8'))
      return { ...DEFAULT_STORE, ...data }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_STORE }
}

function persistStore(store: WorkspaceStore): boolean {
  try {
    ensureDirs()
    store.updatedAt = new Date().toISOString()
    writeFileSync(WORKSPACE_FILE, JSON.stringify(store, null, 2), 'utf-8')
    return true
  } catch { return false }
}

function generateId(): string {
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ============================================================================
// Git Helpers
// ============================================================================

function getProjectInfo(): { name: string; branch: string } {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8', timeout: 5000 }).trim()
    return { name: basename(process.cwd()), branch }
  } catch {
    return { name: basename(process.cwd()), branch: 'unknown' }
  }
}

function getGitStatus(): { modified: number; added: number; deleted: number; untracked: number } {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 5000 }).trim()
    const lines = status.split('\n').filter(Boolean)
    let modified = 0, added = 0, deleted = 0, untracked = 0
    for (const line of lines) {
      const indexStatus = line[0]
      const workTreeStatus = line[1]
      if (indexStatus === 'M' || workTreeStatus === 'M') modified++
      if (indexStatus === 'A') added++
      if (indexStatus === 'D' || workTreeStatus === 'D') deleted++
      if (indexStatus === '?' && workTreeStatus === '?') untracked++
    }
    return { modified, added, deleted, untracked }
  } catch {
    return { modified: 0, added: 0, deleted: 0, untracked: 0 }
  }
}

function getRemoteInfo(): { remoteBranch: string; ahead: number; behind: number } {
  try {
    const remoteBranch = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { encoding: 'utf-8', timeout: 3000 }).trim()
    const aheadBehind = execSync('git rev-list --left-right --count HEAD...@{u}', { encoding: 'utf-8', timeout: 3000 }).trim()
    const [ahead, behind] = aheadBehind.split('\t').map(Number)
    return { remoteBranch, ahead: ahead || 0, behind: behind || 0 }
  } catch {
    return { remoteBranch: '', ahead: 0, behind: 0 }
  }
}

function getMergeBase(): string {
  try {
    return execSync('git merge-base HEAD @{u}', { encoding: 'utf-8', timeout: 3000 }).trim()
  } catch {
    return ''
  }
}

function getStashes(): string[] {
  try {
    const output = execSync('git stash list', { encoding: 'utf-8', timeout: 3000 }).trim()
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function getDiff(contextLines = 3): string {
  try {
    return execSync(`git diff HEAD --unified=${contextLines}`, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024, timeout: 10000 })
  } catch {
    return ''
  }
}

function getRecentCommits(count = 5): string[] {
  try {
    const log = execSync(`git log --oneline -${count}`, { encoding: 'utf-8', timeout: 5000 })
    return log.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function getChangedFiles(): string[] {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 5000 })
    return status.split('\n').map(l => l.slice(3).trim()).filter(Boolean)
  } catch {
    return []
  }
}

// ============================================================================
// Workspace CRUD
// ============================================================================

function saveWorkspace(store: WorkspaceStore, name?: string, summary?: string, tags?: string[], category?: string): WorkspaceSnapshot {
  const { name: projectName, branch } = getProjectInfo()
  const gitStatus = getGitStatus()
  const remoteInfo = getRemoteInfo()

  const snapshot: WorkspaceSnapshot = {
    id: generateId(),
    name: name || `工作区 ${store.workspaces.length + 1}`,
    savedAt: new Date().toISOString(),
    project: projectName,
    branch,
    summary: summary || `自动保存于 ${new Date().toLocaleString('zh-CN')}`,
    files: getChangedFiles(),
    diff: getDiff(store.settings.diffContextLines),
    recentCommits: getRecentCommits(),
    tags: tags || [],
    category: category || store.settings.defaultCategory,
    priority: 'normal',
    notes: '',
    gitStatus,
    totalChanges: gitStatus.modified + gitStatus.added + gitStatus.deleted + gitStatus.untracked,
    remoteBranch: remoteInfo.remoteBranch,
    ahead: remoteInfo.ahead,
    behind: remoteInfo.behind,
    mergeBase: getMergeBase(),
    stashes: getStashes(),
    metadata: {},
  }

  store.workspaces.unshift(snapshot)

  // Enforce max workspaces limit
  if (store.workspaces.length > store.settings.maxWorkspaces) {
    const removed = store.workspaces.pop()
    if (removed) {
      // Archive removed workspace
      try {
        const archivePath = join(ARCHIVE_DIR, `${removed.id}.json`)
        writeFileSync(archivePath, JSON.stringify(removed, null, 2), 'utf-8')
      } catch { /* ignore */ }
    }
  }

  persistStore(store)
  return snapshot
}

function loadWorkspace(store: WorkspaceStore, id: string): WorkspaceSnapshot | null {
  return store.workspaces.find(w => w.id === id) || null
}

function deleteWorkspace(store: WorkspaceStore, id: string): boolean {
  const idx = store.workspaces.findIndex(w => w.id === id)
  if (idx === -1) return false
  store.workspaces.splice(idx, 1)
  persistStore(store)
  return true
}

function updateWorkspace(store: WorkspaceStore, id: string, updates: Partial<WorkspaceSnapshot>): WorkspaceSnapshot | null {
  const ws = store.workspaces.find(w => w.id === id)
  if (!ws) return null
  Object.assign(ws, updates)
  persistStore(store)
  return ws
}

// ============================================================================
// Comparison
// ============================================================================

function compareWorkspaces(store: WorkspaceStore, idA: string, idB: string): WorkspaceComparison | null {
  const a = store.workspaces.find(w => w.id === idA)
  const b = store.workspaces.find(w => w.id === idB)
  if (!a || !b) return null

  const filesA = new Set(a.files)
  const filesB = new Set(b.files)
  const commonFiles = [...filesA].filter(f => filesB.has(f))
  const uniqueToA = [...filesA].filter(f => !filesB.has(f))
  const uniqueToB = [...filesB].filter(f => !filesA.has(f))

  // Calculate branch distance (simplified)
  const branchDistance = a.branch === b.branch ? 0 : 1

  return {
    workspaceA: a,
    workspaceB: b,
    commonFiles,
    uniqueToA,
    uniqueToB,
    fileChanges: [
      ...uniqueToA.map(f => ({ file: f, status: 'removed' as const, linesAdded: 0, linesRemoved: 0 })),
      ...uniqueToB.map(f => ({ file: f, status: 'added' as const, linesAdded: 0, linesRemoved: 0 })),
      ...commonFiles.map(f => ({ file: f, status: 'modified' as const, linesAdded: 0, linesRemoved: 0 })),
    ],
    branchDistance,
    timeDiff: new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime(),
  }
}

// ============================================================================
// Merge
// ============================================================================

function mergeWorkspaces(store: WorkspaceStore, ids: string[]): WorkspaceSnapshot | null {
  const workspaces = ids.map(id => store.workspaces.find(w => w.id === id)).filter(Boolean) as WorkspaceSnapshot[]
  if (workspaces.length < 2) return null

  const allFiles = [...new Set(workspaces.flatMap(w => w.files))]
  const allTags = [...new Set(workspaces.flatMap(w => w.tags))]

  const merged: WorkspaceSnapshot = {
    id: generateId(),
    name: `合并: ${workspaces.map(w => w.name).join(' + ')}`,
    savedAt: new Date().toISOString(),
    project: workspaces[0].project,
    branch: workspaces[0].branch,
    summary: workspaces.map(w => w.summary).filter(Boolean).join('\n---\n'),
    files: allFiles,
    diff: workspaces.map(w => w.diff).filter(Boolean).join('\n'),
    recentCommits: [...new Set(workspaces.flatMap(w => w.recentCommits))],
    tags: allTags,
    category: workspaces[0].category,
    priority: 'normal',
    notes: workspaces.map(w => w.notes).filter(Boolean).join('\n---\n'),
    gitStatus: {
      modified: workspaces.reduce((sum, w) => sum + w.gitStatus.modified, 0),
      added: workspaces.reduce((sum, w) => sum + w.gitStatus.added, 0),
      deleted: workspaces.reduce((sum, w) => sum + w.gitStatus.deleted, 0),
      untracked: workspaces.reduce((sum, w) => sum + w.gitStatus.untracked, 0),
    },
    totalChanges: workspaces.reduce((sum, w) => sum + w.totalChanges, 0),
    remoteBranch: workspaces[0].remoteBranch,
    ahead: workspaces[0].ahead,
    behind: workspaces[0].behind,
    mergeBase: workspaces[0].mergeBase,
    stashes: [...new Set(workspaces.flatMap(w => w.stashes))],
    metadata: Object.assign({}, ...workspaces.map(w => w.metadata)),
  }

  store.workspaces.unshift(merged)
  persistStore(store)
  return merged
}

// ============================================================================
// Search & Filter
// ============================================================================

function searchWorkspaces(store: WorkspaceStore, filters: Partial<SearchFilters>): WorkspaceSnapshot[] {
  let results = [...store.workspaces]

  if (filters.query) {
    const q = filters.query.toLowerCase()
    results = results.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.summary.toLowerCase().includes(q) ||
      w.notes.toLowerCase().includes(q) ||
      w.tags.some(t => t.toLowerCase().includes(q)) ||
      w.category.toLowerCase().includes(q) ||
      w.branch.toLowerCase().includes(q)
    )
  }

  if (filters.category) {
    results = results.filter(w => w.category === filters.category)
  }

  if (filters.tags && filters.tags.length > 0) {
    results = results.filter(w => filters.tags!.some(t => w.tags.includes(t)))
  }

  if (filters.dateFrom) {
    results = results.filter(w => w.savedAt >= filters.dateFrom!)
  }

  if (filters.dateTo) {
    results = results.filter(w => w.savedAt <= filters.dateTo!)
  }

  if (filters.branch) {
    results = results.filter(w => w.branch === filters.branch)
  }

  // Sort
  const sortBy = filters.sortBy || 'date'
  const sortOrder = filters.sortOrder || 'desc'

  results.sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'date': cmp = new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime(); break
      case 'changes': cmp = a.totalChanges - b.totalChanges; break
      case 'files': cmp = a.files.length - b.files.length; break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })

  return results
}

// ============================================================================
// Statistics
// ============================================================================

function calculateStats(store: WorkspaceStore): WorkspaceStats {
  const tagCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  const monthCounts = new Map<string, number>()

  let totalFiles = 0
  let totalChanges = 0
  let largestWs = store.workspaces[0]
  let oldestWs = store.workspaces[0]

  for (const w of store.workspaces) {
    totalFiles += w.files.length
    totalChanges += w.totalChanges

    if (w.files.length > (largestWs?.files.length || 0)) largestWs = w
    if (new Date(w.savedAt) < new Date(oldestWs?.savedAt || Date.now())) oldestWs = w

    for (const tag of w.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
    categoryCounts.set(w.category, (categoryCounts.get(w.category) || 0) + 1)
    const month = w.savedAt.slice(0, 7)
    monthCounts.set(month, (monthCounts.get(month) || 0) + 1)
  }

  return {
    totalWorkspaces: store.workspaces.length,
    totalFiles,
    totalChanges,
    avgFilesPerWorkspace: store.workspaces.length > 0 ? Math.round(totalFiles / store.workspaces.length) : 0,
    mostUsedCategory: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    mostUsedTags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    workspacesByMonth: [...monthCounts.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
    largestWorkspace: largestWs?.name || '',
    oldestWorkspace: oldestWs?.name || '',
  }
}

// ============================================================================
// Templates
// ============================================================================

function createTemplate(store: WorkspaceStore, name: string, description: string, category: string, tags: string[]): WorkspaceTemplate {
  const template: WorkspaceTemplate = {
    id: generateId(),
    name,
    description,
    category,
    tags,
    summary: '',
    files: [],
    createdAt: new Date().toISOString(),
  }
  store.templates.push(template)
  persistStore(store)
  return template
}

function deleteTemplate(store: WorkspaceStore, id: string): boolean {
  const idx = store.templates.findIndex(t => t.id === id)
  if (idx === -1) return false
  store.templates.splice(idx, 1)
  persistStore(store)
  return true
}

function createWorkspaceFromTemplate(store: WorkspaceStore, templateId: string): WorkspaceSnapshot | null {
  const template = store.templates.find(t => t.id === templateId)
  if (!template) return null
  return saveWorkspace(store, template.name, template.summary, template.tags, template.category)
}

// ============================================================================
// Import/Export
// ============================================================================

function exportWorkspace(store: WorkspaceStore, id: string, format: 'json' | 'md' | 'txt'): string | null {
  const ws = store.workspaces.find(w => w.id === id)
  if (!ws) return null

  const filename = `${ws.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_')}_${Date.now()}`

  if (format === 'json') {
    const path = join(EXPORT_DIR, `${filename}.json`)
    writeFileSync(path, JSON.stringify(ws, null, 2), 'utf-8')
    return path
  }

  const lines = [
    format === 'md' ? `# ${ws.name}` : `工作区: ${ws.name}`,
    '',
    `- **ID**: ${ws.id}`,
    `- **项目**: ${ws.project}`,
    `- **分支**: ${ws.branch}`,
    `- **分类**: ${ws.category}`,
    `- **标签**: ${ws.tags.join(', ')}`,
    `- **优先级**: ${ws.priority}`,
    `- **保存时间**: ${new Date(ws.savedAt).toLocaleString('zh-CN')}`,
    `- **变更文件**: ${ws.files.length} 个`,
    `- **提交 Ahead/Behind**: ${ws.ahead}/${ws.behind}`,
    '',
    '## 摘要',
    ws.summary || '无摘要',
    '',
    '## 笔记',
    ws.notes || '无笔记',
    '',
    '## 变更文件',
    ...(ws.files.length > 0 ? ws.files.map(f => `  - ${f}`) : ['  无变更文件']),
    '',
    '## 最近提交',
    ...(ws.recentCommits.length > 0 ? ws.recentCommits.map(c => `  - ${c}`) : ['  无提交记录']),
    '',
    '## Git 状态',
    `  修改: ${ws.gitStatus.modified} | 新增: ${ws.gitStatus.added} | 删除: ${ws.gitStatus.deleted} | 未跟踪: ${ws.gitStatus.untracked}`,
  ]

  const path = join(EXPORT_DIR, `${format === 'md' ? `${filename}.md` : `${filename}.txt`}`)
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

function importWorkspace(store: WorkspaceStore, filePath: string): WorkspaceSnapshot | null {
  try {
    const content = readFileSync(resolve(filePath), 'utf-8')
    const data = JSON.parse(content)
    const ws: WorkspaceSnapshot = {
      ...data,
      id: generateId(),
      name: `${data.name} (导入)`,
      savedAt: new Date().toISOString(),
    }
    store.workspaces.unshift(ws)
    persistStore(store)
    return ws
  } catch {
    return null
  }
}

// ============================================================================
// Backup & Archive
// ============================================================================

function createBackup(store: WorkspaceStore): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(BACKUP_DIR, `backup_${timestamp}.json`)
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
  return path
}

function restoreFromBackup(store: WorkspaceStore, backupPath: string): boolean {
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

function autoArchiveWorkspaces(store: WorkspaceStore): number {
  const threshold = Date.now() - store.settings.archiveAfterDays * 24 * 60 * 60 * 1000
  let count = 0
  const toArchive = store.workspaces.filter(w => new Date(w.savedAt).getTime() < threshold)

  for (const ws of toArchive) {
    try {
      const archivePath = join(ARCHIVE_DIR, `${ws.id}.json`)
      writeFileSync(archivePath, JSON.stringify(ws, null, 2), 'utf-8')
      const idx = store.workspaces.indexOf(ws)
      if (idx !== -1) {
        store.workspaces.splice(idx, 1)
        count++
      }
    } catch { /* ignore */ }
  }

  if (count > 0) persistStore(store)
  return count
}

// ============================================================================
// Formatting Utilities
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.floor(ms / 1000)}秒`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}分钟`
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  return `${hours}小时${mins}分钟`
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
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
    '📋 工作区管理 - 增强版',
    '',
    '保存、恢复、对比、合并、搜索、导出工作上下文。',
    '',
    '用法:',
    '  /workspace <命令> [参数]',
    '',
    '基本命令:',
    '  save [名称] [--summary <摘要>] [--tags <标签>] [--category <分类>]',
    '  load <ID>                 恢复工作区',
    '  list                      列出所有工作区',
    '  delete <ID>               删除工作区',
    '  view <ID>                 查看工作区详情',
    '',
    '搜索与筛选:',
    '  search <关键词>           搜索工作区',
    '  filter --category <分类> --tags <标签> --branch <分支>',
    '  filter --date-from <日期> --date-to <日期>',
    '',
    '对比与合并:',
    '  compare <ID1> <ID2>       对比两个工作区',
    '  merge <ID1> <ID2>         合并工作区',
    '  diff <ID>                 查看工作区差异',
    '',
    '标签与分类:',
    '  tags                      列出所有标签',
    '  categories                列出所有分类',
    '  tag-add <ID> <标签>       添加标签',
    '  tag-remove <ID> <标签>    移除标签',
    '  category <ID> <分类>      设置分类',
    '  priority <ID> <级别>      设置优先级',
    '',
    '模板:',
    '  template-list             列出模板',
    '  template-create <名称>    创建模板',
    '  template-delete <ID>      删除模板',
    '  template-use <ID>         从模板创建工作区',
    '',
    '导入/导出:',
    '  export <ID> [json|md|txt] 导个工作区',
    '  export-all [json|md|txt]  导出所有工作区',
    '  import <文件路径>         导入工作区',
    '',
    '统计与分析:',
    '  stats                     工作区统计',
    '  timeline                  工作区时间线',
    '  activity                  活跃度分析',
    '',
    '备份:',
    '  backup                    创建备份',
    '  backups                   列出备份',
    '  restore <备份文件>        恢复备份',
    '',
    '设置:',
    '  settings                  查看设置',
    '  set <键> <值>             修改设置',
    '',
    '快捷操作:',
    '  /workspace save "重构中"    快速保存',
    '  /workspace list            列出工作区',
    '  /workspace stats           查看统计',
  ].join('\n')
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const store = loadStore()
  const parts = (args || '').trim().split(/\s+/)
  const command = parts[0]?.toLowerCase() || 'help'
  const rest = parts.slice(1).join(' ')

  switch (command) {
    case 'help':
      return { type: 'text', value: renderHelp() }
    case 'save':
      return handleSave(store, parts.slice(1))
    case 'load':
      return handleLoad(store, rest)
    case 'list':
      return handleList(store)
    case 'delete':
      return handleDelete(store, rest)
    case 'view':
      return handleView(store, rest)
    case 'search':
      return handleSearch(store, rest)
    case 'filter':
      return handleFilter(store, parts.slice(1))
    case 'compare':
      return handleCompare(store, parts.slice(1))
    case 'merge':
      return handleMerge(store, parts.slice(1))
    case 'diff':
      return handleDiff(store, rest)
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
    case 'template-list':
      return { type: 'text', value: listTemplates(store) }
    case 'template-create':
      return handleCreateTemplate(store, rest)
    case 'template-delete':
      return handleDeleteTemplate(store, rest)
    case 'template-use':
      return handleUseTemplate(store, rest)
    case 'export':
      return handleExport(store, parts.slice(1))
    case 'export-all':
      return handleExportAll(store, rest)
    case 'import':
      return handleImport(store, rest)
    case 'stats':
      return { type: 'text', value: formatStats(calculateStats(store)) }
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
    default:
      return { type: 'text', value: renderHelp() }
  }
}

// ============================================================================
// Handlers
// ============================================================================

function handleSave(store: WorkspaceStore, args: string[]) {
  let name = ''
  let summary = ''
  let tags: string[] = []
  let category = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--summary' && args[i + 1]) { summary = args[i + 1]; i++ }
    else if (args[i] === '--tags' && args[i + 1]) { tags = args[i + 1].split(','); i++ }
    else if (args[i] === '--category' && args[i + 1]) { category = args[i + 1]; i++ }
    else { name = args.slice(i).join(' '); break }
  }

  const ws = saveWorkspace(store, name || undefined, summary || undefined, tags.length > 0 ? tags : undefined, category || undefined)
  return { type: 'text', value: `✅ 已保存工作区: ${ws.name} (${ws.id})\n   项目: ${ws.project} | 分支: ${ws.branch} | 文件: ${ws.files.length} 个变更` }
}

function handleLoad(store: WorkspaceStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供工作区 ID' }
  const ws = loadWorkspace(store, id)
  if (!ws) return { type: 'text', value: `❌ 未找到工作区 ${id}` }

  const lines: string[] = []
  lines.push(`📋 工作区: ${ws.name}`)
  lines.push(`   ID: ${ws.id}`)
  lines.push(`   项目: ${ws.project}`)
  lines.push(`   分支: ${ws.branch}`)
  lines.push(`   保存时间: ${new Date(ws.savedAt).toLocaleString('zh-CN')}`)
  lines.push(`   摘要: ${ws.summary}`)
  lines.push(`   分类: ${ws.category}`)
  lines.push(`   标签: ${ws.tags.join(', ') || '无'}`)
  lines.push(`   优先级: ${ws.priority}`)
  lines.push(`   变更文件: ${ws.files.length} 个`)
  lines.push(`   Git状态: 修改${ws.gitStatus.modified} 新增${ws.gitStatus.added} 删除${ws.gitStatus.deleted} 未跟踪${ws.gitStatus.untracked}`)
  lines.push(`   Ahead/Behind: ${ws.ahead}/${ws.behind}`)
  lines.push('')
  lines.push('📝 变更文件:')
  ws.files.slice(0, 20).forEach(f => lines.push(`   • ${f}`))
  if (ws.files.length > 20) lines.push(`   ... 和另外 ${ws.files.length - 20} 个文件`)

  return { type: 'text', value: lines.join('\n') }
}

function handleList(store: WorkspaceStore) {
  const workspaces = store.workspaces
  if (workspaces.length === 0) return { type: 'text', value: '📋 没有保存的工作区。使用 /workspace save 创建一个。' }

  const lines: string[] = [`📋 工作区列表 (${workspaces.length} 个):`]
  lines.push('═'.repeat(60))

  for (const w of workspaces) {
    const date = formatRelativeTime(w.savedAt)
    const tagStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : ''
    const priorityIcon = w.priority === 'high' ? '🔴' : w.priority === 'low' ? '🔵' : '⚪'
    lines.push(`  [${w.id.slice(0, 8)}] ${priorityIcon} ${w.name}`)
    lines.push(`    ${w.project}/${w.branch}${tagStr} | ${w.files.length}文件 | ${date}`)
    if (w.summary) lines.push(`    ${truncate(w.summary, 50)}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

function handleDelete(store: WorkspaceStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供工作区 ID' }
  const deleted = deleteWorkspace(store, id)
  return deleted ? { type: 'text', value: `✅ 已删除工作区` } : { type: 'text', value: `❌ 未找到工作区 ${id}` }
}

function handleView(store: WorkspaceStore, id: string) {
  return handleLoad(store, id)
}

function handleSearch(store: WorkspaceStore, query: string) {
  if (!query) return { type: 'text', value: '❌ 请提供搜索关键词' }
  const results = searchWorkspaces(store, { query })
  if (results.length === 0) return { type: 'text', value: `🔍 未找到包含 "${query}" 的工作区` }

  const lines: string[] = [`🔍 搜索结果 (${results.length} 个):`]
  for (const w of results) {
    lines.push(`  [${w.id.slice(0, 8)}] ${w.name} (${w.category}) ${w.tags.join(', ')}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

function handleFilter(store: WorkspaceStore, args: string[]) {
  const filters: Partial<SearchFilters> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) { filters.category = args[i + 1]; i++ }
    if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[i + 1].split(','); i++ }
    if (args[i] === '--branch' && args[i + 1]) { filters.branch = args[i + 1]; i++ }
    if (args[i] === '--date-from' && args[i + 1]) { filters.dateFrom = args[i + 1]; i++ }
    if (args[i] === '--date-to' && args[i + 1]) { filters.dateTo = args[i + 1]; i++ }
  }
  const results = searchWorkspaces(store, filters)
  if (results.length === 0) return { type: 'text', value: '📋 没有符合条件的工作区' }

  const lines: string[] = [`📋 筛选结果 (${results.length} 个):`]
  for (const w of results) {
    lines.push(`  [${w.id.slice(0, 8)}] ${w.name} | ${w.category} | ${w.branch} | ${w.files.length}文件`)
  }
  return { type: 'text', value: lines.join('\n') }
}

function handleCompare(store: WorkspaceStore, args: string[]) {
  if (args.length < 2) return { type: 'text', value: '❌ 请提供两个工作区 ID' }
  const result = compareWorkspaces(store, args[0], args[1])
  if (!result) return { type: 'text', value: '❌ 未找到工作区' }

  const lines: string[] = []
  lines.push('📊 工作区对比')
  lines.push('═'.repeat(50))
  lines.push(`${result.workspaceA.name} vs ${result.workspaceB.name}`)
  lines.push('')
  lines.push(`共同文件: ${result.commonFiles.length}`)
  lines.push(`仅A有: ${result.uniqueToA.length}`)
  lines.push(`仅B有: ${result.uniqueToB.length}`)
  lines.push(`分支距离: ${result.branchDistance}`)
  lines.push(`时间差: ${formatDuration(Math.abs(result.timeDiff))}`)
  lines.push('')

  if (result.uniqueToA.length > 0) {
    lines.push('--- 仅A有的文件 ---')
    result.uniqueToA.slice(0, 5).forEach(f => lines.push(`  ${f}`))
    if (result.uniqueToA.length > 5) lines.push(`  ... 共 ${result.uniqueToA.length} 个`)
    lines.push('')
  }

  if (result.uniqueToB.length > 0) {
    lines.push('--- 仅B有的文件 ---')
    result.uniqueToB.slice(0, 5).forEach(f => lines.push(`  ${f}`))
    if (result.uniqueToB.length > 5) lines.push(`  ... 共 ${result.uniqueToB.length} 个`)
  }

  return { type: 'text', value: lines.join('\n') }
}

function handleMerge(store: WorkspaceStore, ids: string[]) {
  if (ids.length < 2) return { type: 'text', value: '❌ 请提供至少两个工作区 ID' }
  const merged = mergeWorkspaces(store, ids)
  return merged ? { type: 'text', value: `✅ 已合并工作区: ${merged.name}` } : { type: 'text', value: '❌ 合并失败' }
}

function handleDiff(store: WorkspaceStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供工作区 ID' }
  const ws = loadWorkspace(store, id)
  if (!ws) return { type: 'text', value: `❌ 未找到工作区 ${id}` }

  const lines: string[] = [`📊 ${ws.name} 差异:`]
  if (ws.diff) {
    const diffLines = ws.diff.split('\n')
    lines.push(...diffLines.slice(0, 50))
    if (diffLines.length > 50) lines.push(`... 共 ${diffLines.length} 行差异`)
  } else {
    lines.push('  无差异数据')
  }

  return { type: 'text', value: lines.join('\n') }
}

function listTags(store: WorkspaceStore): string {
  const allTags = new Set(store.workspaces.flatMap(w => w.tags))
  const lines: string[] = ['🏷️ 所有标签:']
  for (const tag of allTags) {
    const count = store.workspaces.filter(w => w.tags.includes(tag)).length
    lines.push(`  ${tag} (${count})`)
  }
  return lines.join('\n')
}

function listCategories(store: WorkspaceStore): string {
  const lines: string[] = ['📁 所有分类:']
  for (const cat of store.categories) {
    const count = store.workspaces.filter(w => w.category === cat).length
    lines.push(`  ${cat} (${count})`)
  }
  return lines.join('\n')
}

function handleTagAdd(store: WorkspaceStore, args: string[]) {
  const [id, ...tags] = args
  if (!id || tags.length === 0) return { type: 'text', value: '❌ 请提供工作区 ID 和标签' }
  const ws = store.workspaces.find(w => w.id === id)
  if (!ws) return { type: 'text', value: `❌ 未找到工作区 ${id}` }
  for (const tag of tags) {
    if (!ws.tags.includes(tag)) ws.tags.push(tag)
  }
  persistStore(store)
  return { type: 'text', value: `✅ 已添加标签: ${tags.join(', ')}` }
}

function handleTagRemove(store: WorkspaceStore, args: string[]) {
  const [id, ...tags] = args
  if (!id || tags.length === 0) return { type: 'text', value: '❌ 请提供工作区 ID 和标签' }
  const ws = store.workspaces.find(w => w.id === id)
  if (!ws) return { type: 'text', value: `❌ 未找到工作区 ${id}` }
  ws.tags = ws.tags.filter(t => !tags.includes(t))
  persistStore(store)
  return { type: 'text', value: `✅ 已移除标签: ${tags.join(', ')}` }
}

function handleSetCategory(store: WorkspaceStore, args: string[]) {
  const [id, category] = args
  if (!id || !category) return { type: 'text', value: '❌ 请提供工作区 ID 和分类' }
  if (!store.categories.includes(category)) {
    store.categories.push(category)
  }
  const ws = updateWorkspace(store, id, { category })
  return ws ? { type: 'text', value: `✅ 已设置分类为: ${category}` } : { type: 'text', value: `❌ 未找到工作区` }
}

function handleSetPriority(store: WorkspaceStore, args: string[]) {
  const [id, priority] = args
  if (!id || !['high', 'normal', 'low'].includes(priority)) return { type: 'text', value: '❌ 请提供工作区 ID 和优先级 (high/normal/low)' }
  const ws = updateWorkspace(store, id, { priority: priority as any })
  return ws ? { type: 'text', value: `✅ 已设置优先级为: ${priority}` } : { type: 'text', value: `❌ 未找到工作区` }
}

function listTemplates(store: WorkspaceStore): string {
  if (store.templates.length === 0) return '📋 没有模板'

  const lines: string[] = [`📋 工作区模板 (${store.templates.length} 个):`]
  for (const t of store.templates) {
    lines.push(`  [${t.id.slice(0, 8)}] ${t.name} - ${t.description}`)
  }
  return lines.join('\n')
}

function handleCreateTemplate(store: WorkspaceStore, rest: string) {
  if (!rest) return { type: 'text', value: '❌ 请提供模板名称' }
  const template = createTemplate(store, rest, '', '默认', [])
  return { type: 'text', value: `✅ 已创建模板: ${template.name}` }
}

function handleDeleteTemplate(store: WorkspaceStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供模板 ID' }
  const deleted = deleteTemplate(store, id)
  return deleted ? { type: 'text', value: `✅ 已删除模板` } : { type: 'text', value: `❌ 未找到模板` }
}

function handleUseTemplate(store: WorkspaceStore, id: string) {
  if (!id) return { type: 'text', value: '❌ 请提供模板 ID' }
  const ws = createWorkspaceFromTemplate(store, id)
  return ws ? { type: 'text', value: `✅ 已从模板创建工作区: ${ws.name}` } : { type: 'text', value: `❌ 未找到模板` }
}

function handleExport(store: WorkspaceStore, args: string[]) {
  const [id, format] = args
  if (!id) return { type: 'text', value: '❌ 请提供工作区 ID' }
  const path = exportWorkspace(store, id, (format as any) || 'json')
  return path ? { type: 'text', value: `✅ 已导出到: ${path}` } : { type: 'text', value: `❌ 导出失败` }
}

function handleExportAll(store: WorkspaceStore, format: string) {
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `all_workspaces_${timestamp}.json`
  const path = join(EXPORT_DIR, filename)
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
  return { type: 'text', value: `✅ 已导出所有工作区到: ${path}` }
}

function handleImport(store: WorkspaceStore, filePath: string) {
  if (!filePath) return { type: 'text', value: '❌ 请提供文件路径' }
  const ws = importWorkspace(store, filePath)
  return ws ? { type: 'text', value: `✅ 已导入工作区: ${ws.name}` } : { type: 'text', value: `❌ 导入失败` }
}

function formatStats(stats: WorkspaceStats): string {
  const lines: string[] = []
  lines.push('📊 工作区统计')
  lines.push('═'.repeat(40))
  lines.push(`总工作区数: ${stats.totalWorkspaces}`)
  lines.push(`总文件数: ${stats.totalFiles}`)
  lines.push(`总变更数: ${stats.totalChanges}`)
  lines.push(`平均每工作区文件: ${stats.avgFilesPerWorkspace}`)
  lines.push(`最大工作区: ${stats.largestWorkspace}`)
  lines.push(`最早工作区: ${stats.oldestWorkspace}`)
  lines.push(`常用分类: ${stats.mostUsedCategory}`)
  lines.push('')
  lines.push('--- 常用标签 ---')
  for (const t of stats.mostUsedTags.slice(0, 5)) {
    lines.push(`  ${t.tag}: ${t.count}次`)
  }
  return lines.join('\n')
}

function formatTimeline(store: WorkspaceStore): string {
  const workspaces = [...store.workspaces].sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime())
  const lines: string[] = ['📅 工作区时间线:']

  for (const w of workspaces) {
    const date = new Date(w.savedAt).toLocaleDateString('zh-CN')
    lines.push(`  ${date} 📋 ${w.name} (${w.files.length}个文件变更)`)
  }

  return lines.join('\n')
}

function formatActivity(stats: WorkspaceStats): string {
  const lines: string[] = ['📈 活跃度分析:']
  lines.push(`月均工作区: ${(stats.totalWorkspaces / Math.max(stats.workspacesByMonth.length, 1)).toFixed(1)}`)
  return lines.join('\n')
}

function handleBackup(store: WorkspaceStore) {
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

function handleRestore(store: WorkspaceStore, path: string) {
  if (!path) return { type: 'text', value: '❌ 请提供备份文件路径' }
  const success = restoreFromBackup(store, path)
  return success ? { type: 'text', value: `✅ 已从备份恢复` } : { type: 'text', value: `❌ 恢复失败` }
}

function formatSettings(settings: WorkspaceSettings): string {
  const lines: string[] = ['⚙️ 工作区设置:']
  lines.push(`  自动保存间隔: ${settings.autoSaveInterval / 1000}秒`)
  lines.push(`  最大工作区数: ${settings.maxWorkspaces}`)
  lines.push(`  默认分类: ${settings.defaultCategory}`)
  lines.push(`  自动归档天数: ${settings.archiveAfterDays}`)
  lines.push(`  差异上下文行数: ${settings.diffContextLines}`)
  lines.push(`  包含未跟踪文件: ${settings.includeUntracked ? '是' : '否'}`)
  lines.push(`  最大差异大小: ${settings.maxDiffSize / 1024 / 1024}MB`)
  return lines.join('\n')
}

function handleSetSetting(store: WorkspaceStore, args: string[]) {
  const [key, value] = args
  if (!key || !value) return { type: 'text', value: '❌ 请提供设置键和值' }

  switch (key) {
    case 'autoSaveInterval': store.settings.autoSaveInterval = parseInt(value) * 1000; break
    case 'maxWorkspaces': store.settings.maxWorkspaces = parseInt(value); break
    case 'defaultCategory': store.settings.defaultCategory = value; break
    case 'archiveAfterDays': store.settings.archiveAfterDays = parseInt(value); break
    case 'diffContextLines': store.settings.diffContextLines = parseInt(value); break
    default: return { type: 'text', value: `❌ 未知设置: ${key}` }
  }

  persistStore(store)
  return { type: 'text', value: `✅ 已设置 ${key} = ${value}` }
}

// ============================================================================
// Command Definition
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'workspace',
  description: '工作区管理 - 保存/恢复/对比/合并/模板/搜索/导出/归档/统计',
  aliases: ['/workspace', '/ws', '/save-work'],
  arguments: [
    { name: 'save', description: '保存当前工作区', required: false },
    { name: 'load', description: '恢复工作区', required: false },
    { name: 'list', description: '列出所有工作区', required: false },
    { name: 'search', description: '搜索工作区', required: false },
    { name: 'compare', description: '对比工作区', required: false },
    { name: 'merge', description: '合并工作区', required: false },
    { name: 'stats', description: '查看统计', required: false },
    { name: 'backup', description: '创建备份', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
