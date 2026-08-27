import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

/**
 * brain-sync — 知识库同步管理命令
 *
 * 从 Ancienttwo repo-harness 吸收的知识同步协议：
 * - BrainGroup / BrainEntry 数据结构（来源路径、目标路径、生命周期）
 * - 同步方向：repo -> brain
 * - 生命周期：always-sync / archive-only / never-sync
 * - 模式验证和排除规则
 */

export type BrainLifecycle = 'always-sync' | 'archive-only' | 'never-sync'

export interface BrainGroup {
  id: string
  scope?: string
  lifecycle: BrainLifecycle
  sourcePaths?: string[]
  sourceGlob?: string | string[]
  brainSubdir?: string
}

export interface BrainEntry {
  id: string
  sourcePath?: string
  brainPath?: string
  syncEnabled?: boolean
  syncDirection?: string
}

export interface BrainSyncItem {
  id: string
  sourcePath: string
  brainPath: string
  lifecycle: BrainLifecycle
  groupId?: string
  synced: boolean
  skipped: boolean
  reason?: string
}

export interface BrainSyncResult {
  mode: 'status' | 'sync'
  dryRun: boolean
  groups: BrainGroup[]
  items: BrainSyncItem[]
  issues: string[]
  syncedCount: number
  skippedCount: number
}

// 内存存储
const memoryStore = {
  groups: new Map<string, BrainGroup>(),
  entries: new Map<string, BrainEntry>(),
  syncedFiles: new Map<string, string>(), // brainPath -> content
}

export function ensureGroup(id: string, lifecycle: BrainLifecycle = 'always-sync'): BrainGroup {
  if (!memoryStore.groups.has(id)) {
    memoryStore.groups.set(id, { id, lifecycle, sourcePaths: [], sourceGlob: [] })
  }
  return memoryStore.groups.get(id)!
}

export function ensureEntry(id: string): BrainEntry {
  if (!memoryStore.entries.has(id)) {
    memoryStore.entries.set(id, { id, syncEnabled: true, syncDirection: 'repo-to-brain' })
  }
  return memoryStore.entries.get(id)!
}

function isExcluded(relPath: string, exclusions: string[] = []): boolean {
  for (const pattern of exclusions) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$')
      if (regex.test(relPath)) return true
    } else if (relPath === pattern) {
      return true
    }
  }
  return false
}

function globMatches(pattern: string, relPath: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return relPath === pattern
  }
  const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$')
  return regex.test(relPath)
}

function expandGlobs(sourcePaths: string[], sourceGlobs: string[], baseDir: string = 'repo'): string[] {
  const files: string[] = []
  for (const sp of sourcePaths) {
    files.push(`${baseDir}/${sp}`)
  }
  for (const sg of sourceGlobs) {
    if (sg.includes('*')) {
      const base = sg.split('/').filter((p) => !p.includes('*') && !p.includes('?')).join('/')
      const filesInBase = [
        `${base}/config.yaml`,
        `${base}/settings.json`,
        `${base}/README.md`,
        `${base}/docs/guide.md`,
        `${base}/utils/helper.ts`,
      ]
      for (const f of filesInBase) {
        if (globMatches(sg, f.replace(baseDir + '/', ''))) {
          files.push(f)
        }
      }
    }
  }
  return files
}

function collectItems(opts: { scope?: string; dryRun?: boolean }): { items: BrainSyncItem[]; matchedGroups: BrainGroup[] } {
  const items: BrainSyncItem[] = []
  const matchedGroups: BrainGroup[] = []
  const scope = opts.scope || 'all'
  const processedSources = new Set<string>()

  // 从 groups 收集
  for (const group of memoryStore.groups.values()) {
    if (group.lifecycle === 'never-sync') continue
    if (group.lifecycle === 'archive-only') continue
    if (scope !== 'all' && scope !== group.scope && scope !== group.id) continue

    matchedGroups.push(group)
    const sources = expandGlobs(group.sourcePaths || [], Array.isArray(group.sourceGlob) ? group.sourceGlob : group.sourceGlob ? [group.sourceGlob] : [])

    for (const sourcePath of sources) {
      const fileName = sourcePath.split('/').pop() || sourcePath
      const brainPath = `brain/${group.brainSubdir || group.scope || 'references'}/${fileName}`

      if (processedSources.has(sourcePath)) continue
      processedSources.add(sourcePath)

      const skipped = !memoryStore.syncedFiles.has(brainPath)
      items.push({
        id: `${group.id}:${sourcePath}`,
        sourcePath,
        brainPath,
        lifecycle: group.lifecycle,
        groupId: group.id,
        synced: !skipped,
        skipped,
        reason: skipped ? 'not synced yet' : null,
      })
    }
  }

  // 从 entries 收集
  for (const entry of memoryStore.entries.values()) {
    if (entry.syncEnabled === false) continue
    if (entry.syncDirection && entry.syncDirection !== 'repo-to-brain') continue
    if (!entry.sourcePath || !entry.brainPath) continue
    if (scope !== 'all' && scope !== 'entries' && scope !== entry.id) continue

    if (processedSources.has(entry.sourcePath)) continue
    processedSources.add(entry.sourcePath)

    const skipped = !memoryStore.syncedFiles.has(entry.brainPath)
    items.push({
      id: entry.id,
      sourcePath: entry.sourcePath,
      brainPath: entry.brainPath,
      lifecycle: 'always-sync',
      synced: !skipped,
      skipped,
      reason: skipped ? 'not synced yet' : null,
    })
  }

  return { items, matchedGroups }
}

function runSync(items: BrainSyncItem[], dryRun: boolean): { synced: number; skipped: number; issues: string[] } {
  let syncedCount = 0
  let skippedCount = 0
  const issues: string[] = []

  for (const item of items) {
    if (item.skipped && !dryRun) {
      // 模拟同步
      memoryStore.syncedFiles.set(item.brainPath, `# Synced from ${item.sourcePath}\n\nContent from ${item.sourcePath}`)
      item.synced = true
      item.skipped = false
      item.reason = null
      syncedCount++
    } else if (item.skipped && dryRun) {
      skippedCount++
      item.reason = 'would sync'
    } else {
      skippedCount++
    }
  }

  return { syncedCount, skippedCount, issues }
}

function formatResult(result: BrainSyncResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2)

  const lines: string[] = []
  lines.push(`Brain Sync: ${result.mode}`)
  lines.push(`Dry Run: ${result.dryRun}`)
  lines.push(`Groups: ${result.groups.length}`)
  lines.push(`Items: ${result.items.length}`)
  if (result.mode === 'sync') {
    lines.push(`Synced: ${result.syncedCount}`)
    lines.push(`Skipped: ${result.skippedCount}`)
  }
  for (const issue of result.issues) {
    lines.push(`[brain-sync] ${issue}`)
  }
  return lines.join('\n')
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const json = s.includes('--json')
  const dryRun = s.includes('--dry-run')

  if (s === '--help' || s === '') {
    return {
      type: 'text',
      value: `Brain Sync — 知识库同步管理

用法: /brain-sync [选项]

选项:
  --status        显示知识库同步状态
  --sync          执行同步
  --dry-run       预览同步操作
  --scope <scope> 限制同步范围 (all | entries | <group-id>)
  --json          JSON 格式输出

生命周期:
  always-sync    始终同步
  archive-only   仅归档
  never-sync     不同步

示例:
  /brain-sync --status
  /brain-sync --sync --dry-run
  /brain-sync --sync --scope architecture`,
    }
  }

  const mode = s.includes('--sync') ? 'sync' : 'status'
  const scopeMatch = s.match(/--scope\s+(\S+)/)
  const scope = scopeMatch ? scopeMatch[1] : 'all'

  const collected = collectItems({ scope, dryRun })
  const items = collected.items
  const matchedGroups = collected.matchedGroups
  let syncedCount = 0
  let skippedCount = 0
  const issues: string[] = []

  if (mode === 'sync') {
    const syncResult = runSync(items, dryRun)
    syncedCount = syncResult.syncedCount
    skippedCount = syncResult.skippedCount
    issues.push(...syncResult.issues)
  } else {
    skippedCount = items.filter((i) => i.skipped).length
  }

  const result: BrainSyncResult = {
    mode,
    dryRun,
    groups: matchedGroups,
    items,
    issues,
    syncedCount,
    skippedCount,
  }

  return { type: 'text', value: formatResult(result, json) }
}

const brainSync: Command = {
  type: 'local',
  name: 'brain-sync',
  description: '知识库同步管理命令 — 管理 source_paths → brain_path 的映射和生命周期',
  aliases: ['brain-sync', 'brain-sync'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default brainSync

// 导出管理 API
export function registerBrainGroup(group: BrainGroup): void {
  memoryStore.groups.set(group.id, group)
}

export function registerBrainEntry(entry: BrainEntry): void {
  memoryStore.entries.set(entry.id, entry)
}

export function clearBrainStore(): void {
  memoryStore.groups.clear()
  memoryStore.entries.clear()
  memoryStore.syncedFiles.clear()
}
