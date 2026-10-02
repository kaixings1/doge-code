/**
 * Memory Manager — Persistent Curated Memory (MEMORY.md + USER.md)
 *
 * Inspired by Hermes Agent's memory_tool.py.
 *
 * Two stores:
 *   - MEMORY.md: agent's personal notes (environment facts, project conventions,
 *     tool quirks, things learned)
 *   - USER.md: what the agent knows about the user (preferences, communication
 *     style, expectations, workflow habits)
 *
 * Design:
 *   - Both files are injected into the system prompt as a frozen snapshot at
 *     session start.
 *   - Mid-session writes update files on disk immediately but do NOT change the
 *     system prompt — this preserves prefix cache for the entire session.
 *   - Character limits (not tokens) because char counts are model-independent.
 *   - Entries separated by \u00a7 (section sign). Can be multiline.
 *   - Single "memory" tool has actions: add, replace, remove
 */

import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'
import { registerBundledSkill } from '../bundledSkills.js'

const MAX_FILE_SIZE = 32_000  // characters, not tokens

export type MemoryStore = 'agent' | 'user'

function storePath(store: MemoryStore): string {
  const name = store === 'agent' ? 'MEMORY.md' : 'USER.md'
  return join(getClaudeConfigHomeDir(), 'memory', name)
}

function atomicWrite(path: string, content: string): Promise<void> {
  const dir = dirname(path)
  const tmp = path + '.tmp'
  return mkdir(dir, { recursive: true })
    .then(() => writeFile(tmp, content, 'utf-8'))
    .then(() => rename(tmp, path))
}

/**
 * Read the full content of a memory store.
 */
export async function readMemory(store: MemoryStore): Promise<string> {
  try {
    const path = storePath(store)
    if (!existsSync(path)) return ''
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Read both memory stores and build a combined system prompt block.
 * This is the "frozen snapshot" — called once at session start.
 */
export async function buildMemorySnapshot(): Promise<string> {
  const [agentMem, userMem] = await Promise.all([
    readMemory('agent'),
    readMemory('user'),
  ])

  const parts: string[] = []
  if (agentMem.trim()) {
    parts.push('## Agent Memory\n\nThings I have learned about this project and environment:\n\n' + agentMem.trim())
  }
  if (userMem.trim()) {
    parts.push('## User Memory\n\nThings I know about the user:\n\n' + userMem.trim())
  }

  return parts.join('\n\n---\n\n')
}

/**
 * Add an entry to a memory store.
 * Appends at the end, separated by section sign.
 */
export async function addMemory(
  store: MemoryStore,
  entry: string,
): Promise<string> {
  const path = storePath(store)
  const existing = await readMemory(store)
  const trimmed = entry.trim()
  if (!trimmed) return ''

  const separator = existing.trim() ? '\n\u00a7\n' : ''
  const newContent = existing + separator + trimmed

  if (newContent.length > MAX_FILE_SIZE) {
    return '错误：记忆存储已满（上限 ' + MAX_FILE_SIZE + ' 字符）。请使用 /memory-manage replace 或 remove 释放空间。'
  }

  await atomicWrite(path, newContent)
  logForDebugging('[memoryManager] 已向 ' + store + ' 记忆添加条目 (' + trimmed.slice(0, 60) + '...)')
  return '已添加到 ' + store + ' 记忆。'
}

/**
 * Replace an entry in a memory store.
 * Uses substring matching to find the entry to replace.
 */
export async function replaceMemory(
  store: MemoryStore,
  oldSubstring: string,
  newEntry: string,
): Promise<string> {
  const content = await readMemory(store)
  if (!content) return '错误：记忆存储为空。'

  // Split by section sign and find the matching entry
  const entries = content.split('\u00a7').map(e => e.trim())
  const idx = entries.findIndex(e => e.includes(oldSubstring.trim()))

  if (idx === -1) {
    return '错误：未找到包含 "' + oldSubstring.slice(0, 40) + '" 的条目。'
  }

  entries[idx] = newEntry.trim()
  const newContent = entries.join('\n\u00a7\n')

  if (newContent.length > MAX_FILE_SIZE) {
    return '错误：结果超过 ' + MAX_FILE_SIZE + ' 字符上限。'
  }

  await atomicWrite(storePath(store), newContent)
  return '已替换 ' + store + ' 记忆中的条目。'
}

/**
 * Remove an entry from a memory store.
 * Uses substring matching.
 */
export async function removeMemory(
  store: MemoryStore,
  substring: string,
): Promise<string> {
  const content = await readMemory(store)
  if (!content) return '错误：记忆存储为空。'

  const entries = content.split('\u00a7').map(e => e.trim())
  const filtered = entries.filter(e => !e.includes(substring.trim()))

  if (filtered.length === entries.length) {
    return '错误：未找到包含 "' + substring.slice(0, 40) + '" 的条目。'
  }

  const removed = entries.length - filtered.length
  const newContent = filtered.join('\n\u00a7\n')
  await atomicWrite(storePath(store), newContent)
  return '已从 ' + store + ' 记忆中移除 ' + removed + ' 个条目。'
}

/**
 * Register the add/replace/remove interactive skill
 */
export function registerMemoryManagerSkill(): void {
  registerBundledSkill({
    name: 'memory-manage',
    description: '管理持久化记忆（MEMORY.md 用于项目知识，USER.md 用于用户偏好）。支持添加、替换、删除条目。',
    whenToUse: 'When you want to save project knowledge or user preferences between sessions. Use for facts that would otherwise need rediscovery.',
    argumentHint: '<add|replace|remove> <store: agent|user> <content>',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const trimmed = args.trim()
      if (!trimmed) {
        const snapshot = await buildMemorySnapshot()
        return [{
          type: 'text',
          text: '当前记忆快照：\n\n' + (snapshot || '(empty)') + '\n\n用法：/memory-manage add|replace|remove agent|user <内容>',
        }]
      }

      const parts = trimmed.split(/\s+/)
      const action = parts[0]
      const store = parts[1] as MemoryStore
      const content = parts.slice(2).join(' ')

      if (store !== 'agent' && store !== 'user') {
        return [{ type: 'text', text: '错误：store 必须是 "agent"（MEMORY.md）或 "user"（USER.md）。' }]
      }

      let result: string
      switch (action) {
        case 'add':
          result = await addMemory(store, content)
          break
        case 'replace':
          if (parts.length < 4) return [{ type: 'text', text: '错误：replace 需要旧文本和新文本。用法：/memory-manage replace agent "旧文本" "新文本"' }]
          const oldText = parts[2]
          const newText = parts.slice(3).join(' ')
          result = await replaceMemory(store, oldText, newText)
          break
        case 'remove':
          result = await removeMemory(store, content)
          break
        default:
          return [{ type: 'text', text: '错误：action 必须是 add、replace 或 remove。' }]
      }

      return [{ type: 'text', text: result }]
    },
  })
}
