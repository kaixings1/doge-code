/**
 * /session-tag — 会话标签管理命令
 *
 * 为历史会话添加、删除、列出标签，支持按标签过滤。
 * 标签数据存储在 ~/.doge/session-tags.json，格式：{ [sessionId]: string[] }
 */

import type { Command, LocalCommandCall, LocalCommandResult } from '../types/command.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  type Candidate,
  getProjectsDir,
  listCandidates,
  readSessionLite,
  parseSessionInfoFromLite,
} from '../utils/listSessionsImpl.js'

// ---------------------------------------------------------------------------
// 标签持久化
// ---------------------------------------------------------------------------

/** 标签存储文件路径：~/.doge/session-tags.json */
function getTagsFilePath(): string {
  return join(homedir(), '.doge', 'session-tags.json')
}

type TagStore = Record<string, string[]>

/** 加载标签存储，失败时返回空对象 */
function loadTags(): TagStore {
  try {
    const path = getTagsFilePath()
    if (!existsSync(path)) return {}
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw)
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as TagStore
    }
    return {}
  } catch {
    return {}
  }
}

/** 持久化标签存储 */
function saveTags(store: TagStore): void {
  try {
    const path = getTagsFilePath()
    const dir = join(homedir(), '.doge')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
  } catch {
    // ignore write failures
  }
}

// ---------------------------------------------------------------------------
// 会话枚举（复用 session-search 的模式）
// ---------------------------------------------------------------------------

/** 收集所有候选会话 */
async function gatherAllCandidates(): Promise<Candidate[]> {
  const projectsDir = getProjectsDir()
  let names: string[]
  try {
    const fs = await import('fs/promises')
    names = await fs.readdir(projectsDir)
  } catch {
    return []
  }

  const allCandidates: Candidate[] = []
  await Promise.all(
    names.map(async name => {
      const projectPath = join(projectsDir, name)
      try {
        const fs = await import('fs/promises')
        const s = await fs.stat(projectPath)
        if (!s.isDirectory()) return
      } catch {
        return
      }
      const candidates = await listCandidates(projectPath, true)
      for (const c of candidates) {
        c.projectPath = name
      }
      allCandidates.push(...candidates)
    }),
  )

  // 按 sessionId 去重，保留最新 mtime
  const byId = new Map<string, Candidate>()
  for (const c of allCandidates) {
    const existing = byId.get(c.sessionId)
    if (!existing || c.mtime > existing.mtime) {
      byId.set(c.sessionId, c)
    }
  }

  return [...byId.values()]
}

// ---------------------------------------------------------------------------
// 会话标题解析（用于友好展示）
// ---------------------------------------------------------------------------

interface SessionDisplayInfo {
  sessionId: string
  title: string
  projectPath: string | undefined
  lastModified: number
}

/** 从候选会话中提取显示信息 */
async function resolveSessionTitle(c: Candidate): Promise<SessionDisplayInfo> {
  const lite = await readSessionLite(c.filePath)
  if (lite) {
    const info = parseSessionInfoFromLite(c.sessionId, lite, c.projectPath)
    if (info) {
      return {
        sessionId: c.sessionId,
        title: info.customTitle || info.summary || info.firstPrompt || info.sessionId,
        projectPath: c.projectPath,
        lastModified: c.mtime,
      }
    }
  }
  return {
    sessionId: c.sessionId,
    title: c.sessionId,
    projectPath: c.projectPath,
    lastModified: c.mtime,
  }
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

type TagAction =
  | { kind: 'add'; sessionId: string; tag: string }
  | { kind: 'remove'; sessionId: string; tag: string }
  | { kind: 'list' }
  | { kind: 'filter'; tag: string }
  | { kind: 'help' }

function parseArgs(args: string): TagAction {
  const trimmed = args.trim()
  if (!trimmed) return { kind: 'help' }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { kind: 'help' }

  // 解析 --add <tag> --session <sessionId>
  let action: 'add' | 'remove' | 'list' | 'filter' | null = null
  let tagValue = ''
  let sessionId = ''

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--add' && i + 1 < parts.length) {
      action = 'add'
      tagValue = parts[++i]!
    } else if (p === '--remove' && i + 1 < parts.length) {
      action = 'remove'
      tagValue = parts[++i]!
    } else if ((p === '--session' || p === '-s') && i + 1 < parts.length) {
      sessionId = parts[++i]!
    } else if (p === '--list' || p === '-l') {
      action = 'list'
    } else if ((p === '--filter' || p === '-f') && i + 1 < parts.length) {
      action = 'filter'
      tagValue = parts[++i]!
    }
    i++
  }

  if (action === null) return { kind: 'help' }

  if (action === 'add' || action === 'remove') {
    return {
      kind: action,
      sessionId,
      tag: tagValue,
    }
  }

  if (action === 'filter') {
    return { kind: 'filter', tag: tagValue }
  }

  return { kind: 'list' }
}

// ---------------------------------------------------------------------------
// 格式化输出
// ---------------------------------------------------------------------------

function formatSessionLine(
  info: SessionDisplayInfo,
  tags: string[],
  showTags = true,
): string {
  const date = new Date(info.lastModified).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const projectLabel = info.projectPath ? `[${info.projectPath}] ` : ''
  const tagLabel = showTags && tags.length > 0 ? ` 🏷 ${tags.join(', ')}` : ''
  return `  ${projectLabel}${info.title}\n    ID: ${info.sessionId} | ${date}${tagLabel}`
}

// ---------------------------------------------------------------------------
// 命令实现
// ---------------------------------------------------------------------------

const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const action = parseArgs(args)
  const store = loadTags()

  // --help
  if (action.kind === 'help') {
    return {
      type: 'text',
      value: [
        '用法: /session-tag [选项]',
        '',
        '选项:',
        '  --add <标签> --session <会话ID>    为指定会话添加标签',
        '  --remove <标签> --session <会话ID> 从指定会话移除标签',
        '  --list                              列出所有标签及对应会话',
        '  --filter <标签>                     显示带有指定标签的会话',
        '',
        '会话 ID 可以使用前 8 位缩写（与 /session-search 一致）',
        '',
        '💡 💡 示例: ',
        '  /session-tag --add bugfix --session abc12345',
        '  /session-tag --remove bugfix --session abc12345',
        '  /session-tag --list',
        '  /session-tag --filter bugfix',
      ].join('\n'),
    }
  }

  // --list：列出所有带标签的会话
  if (action.kind === 'list') {
    const sessionIds = Object.keys(store).filter(id => store[id] && store[id].length > 0)

    if (sessionIds.length === 0) {
      return {
        type: 'text',
        value: [
          '尚未为任何会话添加标签。',
          '',
          '使用 /session-tag --add <标签> --session <会话ID> 添加标签。',
          '运行 /session-search 查看会话 ID。',
        ].join('\n'),
      }
    }

    const candidates = await gatherAllCandidates()
    const candidateMap = new Map(candidates.map(c => [c.sessionId, c]))

    const lines: string[] = [`会话标签 (${sessionIds.length} 个会话有标签)`, '']

    // 按标签分组展示
    const allTags = new Set<string>()
    for (const id of sessionIds) {
      for (const t of store[id]!) {
        allTags.add(t)
      }
    }

    // 展示：每个标签下列出对应会话
    for (const tag of [...allTags].sort()) {
      lines.push(`🏷 ${tag}`)
      for (const id of sessionIds) {
        const tags = store[id]
        if (!tags || !tags.includes(tag)) continue
        const c = candidateMap.get(id)
        if (c) {
          const info = await resolveSessionTitle(c)
          lines.push(`    ${info.title}`)
          lines.push(`    ID: ${id} | [${info.projectPath ?? 'unknown'}]`)
        } else {
          lines.push(`    ID: ${id} (会话文件不存在)`)
        }
      }
      lines.push('')
    }

    return { type: 'text', value: lines.join('\n') }
  }

  // --filter <tag>：显示带指定标签的会话
  if (action.kind === 'filter') {
    const targetTag = action.tag.toLowerCase()
    const matchedIds = Object.keys(store).filter(
      id => store[id]?.some(t => t.toLowerCase() === targetTag),
    )

    if (matchedIds.length === 0) {
      return {
        type: 'text',
        value: `未找到带标签 "${action.tag}" 的会话。`,
      }
    }

    const candidates = await gatherAllCandidates()
    const candidateMap = new Map(candidates.map(c => [c.sessionId, c]))

    const lines: string[] = [`标签 "${action.tag}" 的会话 (${matchedIds.length} 个)`, '']

    for (const id of matchedIds) {
      const c = candidateMap.get(id)
      if (c) {
        const info = await resolveSessionTitle(c)
        lines.push(formatSessionLine(info, store[id]!))
      } else {
        lines.push(`  ID: ${id} (会话文件不存在)`)
      }
      lines.push('')
    }

    return { type: 'text', value: lines.join('\n') }
  }

  // --add 或 --remove：需要 sessionId
  if (!action.sessionId) {
    return {
      type: 'text',
      value: [
        '错误：--add 和 --remove 需要 --session <会话ID> 参数。',
        '',
        '运行 /session-search 查看会话 ID。',
        '会话 ID 可以使用前 8 位缩写。',
      ].join('\n'),
    }
  }

  // 支持缩写匹配：用前 8 位匹配 sessionId
  const sessionId = action.sessionId
  const allCandidates = await gatherAllCandidates()

  let matchedId: string | null = null

  // 首先尝试精确匹配
  if (store[sessionId]) {
    matchedId = sessionId
  } else {
    // 尝试前缀匹配
    const matches = allCandidates.filter(c => c.sessionId.startsWith(sessionId))
    if (matches.length === 1) {
      matchedId = matches[0]!.sessionId
    } else if (matches.length > 1) {
      return {
        type: 'text',
        value: `前缀 "${sessionId}" 匹配到 ${matches.length} 个会话，请提供更长的 ID。`,
      }
    } else {
      // 在 store 中也查找前缀匹配
      const storeMatches = Object.keys(store).filter(id => id.startsWith(sessionId))
      if (storeMatches.length === 1) {
        matchedId = storeMatches[0]!
      } else if (storeMatches.length > 1) {
        return {
          type: 'text',
          value: `前缀 "${sessionId}" 匹配到 ${storeMatches.length} 个已标记会话，请提供更长的 ID。`,
        }
      }
    }
  }

  if (!matchedId) {
    return {
      type: 'text',
      value: `未找到会话 ID "${sessionId}"。运行 /session-search 查看可用会话。`,
    }
  }

  if (action.kind === 'add') {
    const tags = store[matchedId] ?? []
    if (tags.includes(action.tag)) {
      return {
        type: 'text',
        value: `会话 ${matchedId} 已有标签 "${action.tag}"。`,
      }
    }
    store[matchedId] = [...tags, action.tag]
    saveTags(store)

    const c = allCandidates.find(c => c.sessionId === matchedId)
    const info = c ? await resolveSessionTitle(c) : null
    const title = info?.title ?? matchedId

    return {
      type: 'text',
      value: `已为 "${title}" (${matchedId}) 添加标签 "${action.tag}"。\n当前标签: ${store[matchedId]!.join(', ')}`,
    }
  }

  // remove
  const tags = store[matchedId] ?? []
  if (!tags.includes(action.tag)) {
    return {
      type: 'text',
      value: `会话 ${matchedId} 没有标签 "${action.tag}"。`,
    }
  }
  const newTags = tags.filter(t => t !== action.tag)
  if (newTags.length === 0) {
    delete store[matchedId]
  } else {
    store[matchedId] = newTags
  }
  saveTags(store)

  const c = allCandidates.find(c => c.sessionId === matchedId)
  const info = c ? await resolveSessionTitle(c) : null
  const title = info?.title ?? matchedId

  return {
    type: 'text',
    value: newTags.length > 0
      ? `已从 "${title}" (${matchedId}) 移除标签 "${action.tag}"。\n剩余标签: ${newTags.join(', ')}`
      : `已从 "${title}" (${matchedId}) 移除标签 "${action.tag}"。\n该会话已无标签。`,
  }
}

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

const sessionTag: Command = {
  type: 'local',
  name: 'session-tag',
  description: '管理会话标签（添加/删除/列出/按标签过滤）',
  aliases: ['stag', 'session-t'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default sessionTag
