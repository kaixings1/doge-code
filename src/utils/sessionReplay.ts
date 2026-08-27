/**
 * utils/sessionReplay.ts — 会话时间旅行 / 重放（吸收自 OpenClaude / DeepSeek-Reasonix）
 *
 * 提供：
 * - loadSession(sessionId): 加载完整会话消息
 * - replayTo(sessionId, messageUuid): 重放到指定消息（含该消息）
 * - getMessageChain(sessionId, messageUuid): 获取某消息的完整祖先链
 * - findMessage(sessionId, predicate): 按条件查找消息
 *
 * 吸收自 OpenClaude 的 /replay 命令 + DeepSeek-Reasonix 的会话重放机制。
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { UUID } from '../types/ids.js'
import type { Message, UserMessage, AssistantMessage } from '../types/message.js'

const SESSIONS_DIR = (() => {
  try {
    const { homedir } = require('os')
    return join(homedir(), '.claude', 'projects')
  } catch {
    return ''
  }
})()

export interface ReplayOptions {
  /** 包含 system 消息（默认 false，重放通常跳过 system） */
  includeSystem?: boolean
  /** 最多返回消息数（默认 unlimited） */
  maxMessages?: number
}

export interface ReplayResult {
  sessionId: string
  messages: Message[]
  /** 重放起点在完整会话中的索引 */
  startIndex: number
  /** 实际返回的消息数 */
  count: number
}

/**
 * 加载完整会话的所有消息。
 * 解析 session JSONL 文件，返回按时间排序的消息数组。
 */
export function loadSession(sessionId: string): Message[] {
  const sessionFile = findSessionFile(sessionId)
  if (!sessionFile) return []

  try {
    const content = readFileSync(sessionFile, 'utf-8')
    const messages: Message[] = []
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (isTranscriptEntry(parsed)) {
          messages.push(parsed)
        }
      } catch {
        // 跳过无法解析的行
      }
    }
    return messages
  } catch {
    return []
  }
}

/**
� * 重放会话到指定消息 UUID（包含该消息及之前的所有消息）。
 * 返回从会话开始到目标消息的完整对话链。
 */
export function replayTo(sessionId: string, messageUuid: UUID, options: ReplayOptions = {}): ReplayResult {
  const messages = loadSession(sessionId)
  const includeSystem = options.includeSystem ?? false

  // 找到目标消息的索引
  let targetIndex = -1
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const uuid = (msg as any)?.uuid ?? (msg as any)?.message?.uuid
    if (uuid === messageUuid) {
      targetIndex = i
      break
    }
  }

  if (targetIndex < 0) {
    return { sessionId, messages: [], startIndex: 0, count: 0 }
  }

  // 过滤 system 消息 + 应用上限
  let result = messages.slice(0, targetIndex + 1)
  if (!includeSystem) {
    result = result.filter((m) => {
      const type = (m as any)?.type ?? (m as any)?.message?.type
      return type !== 'system'
    })
  }
  if (options.maxMessages && options.maxMessages > 0) {
    result = result.slice(-options.maxMessages)
  }

  const startIndex = includeSystem ? 0 : result.findIndex((m) => {
    const type = (m as any)?.type ?? (m as any)?.message?.type
    return type !== 'system'
  })

  return {
    sessionId,
    messages: result,
    startIndex: Math.max(0, startIndex),
    count: result.length,
  }
}

/**
 * 获取指定消息�完整祖先链（从会话开始到该消息）。
 * 通过 parentUuid 递归追踪。
 */
export function getMessageChain(sessionId: string, messageUuid: UUID): Message[] {
  const messages = loadSession(sessionId)
  const messageMap = new Map<string, Message>()
  for (const msg of messages) {
    const uuid = (msg as any)?.uuid ?? (msg as any)?.message?.uuid
    if (uuid) messageMap.set(uuid, msg)
  }

  const chain: Message[] = []
  let currentUuid: string | undefined = messageUuid
  const visited = new Set<string>()

  while (currentUuid && !visited.has(currentUuid)) {
    visited.add(currentUuid)
    const msg = messageMap.get(currentUuid)
    if (!msg) break
    chain.unshift(msg)
    currentUuid = (msg as any)?.parentUuid
  }

  return chain
}

/**
 * 在会话中按条件查找消息。
 */
export function findMessage(
  sessionId: string,
  predicate: (msg: Message, index: number) => boolean,
): { message: Message; index: number } | null {
  const messages = loadSession(sessionId)
  for (let i = 0; i < messages.length; i++) {
    if (predicate(messages[i], i)) {
      return { message: messages[i], index: i }
    }
  }
  return null
}

/**
 * 查找会话中最后一条 assistant 消息（通常用于续接对话）。
 */
export function findLastAssistantMessage(sessionId: string): { message: Message; index: number } | null {
  return findMessage(sessionId, (msg) => {
    const type = (msg as any)?.type ?? (msg as any)?.message?.type
    return type === 'assistant'
  })
}

// ============ 内部工具函数 ============

function findSessionFile(sessionId: string): string | null {
  if (!SESSIONS_DIR || !existsSync(SESSIONS_DIR)) return null

  try {
    const entries = readdirSync(SESSIONS_DIR)
    for (const entry of entries) {
      const candidate = join(SESSIONS_DIR, entry, sessionId, 'transcripts', 'transcript.jsonl')
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // 目录不可读
  }

  return null
}

function isTranscriptEntry(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const obj = parsed as Record<string, unknown>
  const type = obj.type ?? obj.message?.type
  return ['user', 'assistant', 'system', 'attachment'].includes(type as string)
}
