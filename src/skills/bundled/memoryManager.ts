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
    return 'Error: memory store full (' + MAX_FILE_SIZE + ' char limit). Use /memory-manage replace or remove to free space.'
  }

  await atomicWrite(path, newContent)
  logForDebugging('[memoryManager] Added entry to ' + store + ' memory (' + trimmed.slice(0, 60) + '...)')
  return 'Added to ' + store + ' memory.'
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
  if (!content) return 'Error: memory store is empty.'

  // Split by section sign and find the matching entry
  const entries = content.split('\u00a7').map(e => e.trim())
  const idx = entries.findIndex(e => e.includes(oldSubstring.trim()))

  if (idx === -1) {
    return 'Error: no entry containing "' + oldSubstring.slice(0, 40) + '" found.'
  }

  entries[idx] = newEntry.trim()
  const newContent = entries.join('\n\u00a7\n')

  if (newContent.length > MAX_FILE_SIZE) {
    return 'Error: result exceeds ' + MAX_FILE_SIZE + ' char limit.'
  }

  await atomicWrite(storePath(store), newContent)
  return 'Replaced entry in ' + store + ' memory.'
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
  if (!content) return 'Error: memory store is empty.'

  const entries = content.split('\u00a7').map(e => e.trim())
  const filtered = entries.filter(e => !e.includes(substring.trim()))

  if (filtered.length === entries.length) {
    return 'Error: no entry containing "' + substring.slice(0, 40) + '" found.'
  }

  const removed = entries.length - filtered.length
  const newContent = filtered.join('\n\u00a7\n')
  await atomicWrite(storePath(store), newContent)
  return 'Removed ' + removed + ' entr' + (removed > 1 ? 'ies' : 'y') + ' from ' + store + ' memory.'
}

/**
 * Register the add/replace/remove interactive skill
 */
export function registerMemoryManagerSkill(): void {
  registerBundledSkill({
    name: 'memory-manage',
    description: 'Manage persistent memory (MEMORY.md for project knowledge, USER.md for user preferences). Supports add, replace, remove entries.',
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
          text: 'Current memory snapshot:\n\n' + (snapshot || '(empty)') + '\n\nUsage: /memory-manage add|replace|remove agent|user <content>',
        }]
      }

      const parts = trimmed.split(/\s+/)
      const action = parts[0]
      const store = parts[1] as MemoryStore
      const content = parts.slice(2).join(' ')

      if (store !== 'agent' && store !== 'user') {
        return [{ type: 'text', text: 'Error: store must be "agent" (MEMORY.md) or "user" (USER.md).' }]
      }

      let result: string
      switch (action) {
        case 'add':
          result = await addMemory(store, content)
          break
        case 'replace':
          if (parts.length < 4) return [{ type: 'text', text: 'Error: replace needs old text and new text. Usage: /memory-manage replace agent "old text" "new text"' }]
          const oldText = parts[2]
          const newText = parts.slice(3).join(' ')
          result = await replaceMemory(store, oldText, newText)
          break
        case 'remove':
          result = await removeMemory(store, content)
          break
        default:
          return [{ type: 'text', text: 'Error: action must be add, replace, or remove.' }]
      }

      return [{ type: 'text', text: result }]
    },
  })
}
