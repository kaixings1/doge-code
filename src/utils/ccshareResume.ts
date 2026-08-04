import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { LogOption, SerializedMessage } from '../types/logs.js'

/**
 * 从 URL 或裸字符串中提取 ccshare ID。
 *
 * 支持的输入格式：
 * - `https://go/ccshare/boris-20260311-211036` → `boris-20260311-211036`
 * - `https://example.com/ccshare?id=abc-123` → `abc-123`
 * - `boris-20260311-211036`（裸 ID）→ 原样返回
 *
 * @returns 提取到的 ID，无效输入返回 null
 */
export function parseCcshareId(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // URL 路径形式：/ccshare/<id> 或 ccshare:<id>
  const pathMatch = trimmed.match(/ccshare[\/:]([\w.-]+)/)
  if (pathMatch) return pathMatch[1]

  // URL 查询形式：?id=<id>
  const queryMatch = trimmed.match(/[?&]id=([\w.-]+)/)
  if (queryMatch) return queryMatch[1]

  // 裸 ID（形如 name-YYYYMMDD-HHMMSS，至少 8 字符）
  if (/^[\w.-]{8,}$/.test(trimmed)) return trimmed

  return null
}

function cachedPath(id: string): string {
  return join(homedir(), '.doge', 'ccshare', `${id}.json`)
}

function toLogOption(id: string, data: any): LogOption {
  const messages: SerializedMessage[] = Array.isArray(data.messages)
    ? (data.messages as SerializedMessage[])
    : []
  const first = messages[0]?.content
  const firstPrompt = typeof first === 'string' ? first.slice(0, 100) : ''
  return {
    date: data.date || new Date().toISOString().slice(0, 10),
    messages,
    fullPath: data.fullPath || cachedPath(id),
    value: Date.now(),
    created: new Date(data.createdAt || Date.now()),
    modified: new Date(data.updatedAt || Date.now()),
    firstPrompt,
    messageCount: messages.length,
    isSidechain: false,
  }
}

/**
 * 加载 ccshare 会话数据。
 *
 * 查找顺序：
 * 1. 本地缓存 `~/.doge/ccshare/<id>.json`
 * 2. 环境变量 `CCSHARE_API_URL` / `CLAUDE_CCSHARE_API_URL` 指定的 API（GET /<id>）
 *
 * @returns LogOption（供 loadConversationForResume 使用）
 */
export async function loadCcshare(id: string): Promise<LogOption> {
  // 1. 本地缓存
  const cache = cachedPath(id)
  if (existsSync(cache)) {
    try {
      const data = JSON.parse(readFileSync(cache, 'utf-8'))
      return toLogOption(id, data)
    } catch { /* 缓存损坏，尝试 API */ }
  }

  // 2. API 拉取
  const apiBase = process.env.CCSHARE_API_URL || process.env.CLAUDE_CCSHARE_API_URL
  if (apiBase) {
    try {
      const resp = await fetch(`${apiBase.replace(/\/$/, '')}/${encodeURIComponent(id)}`, {
        headers: { accept: 'application/json' },
      })
      if (resp.ok) {
        const data = await resp.json()
        return toLogOption(id, data)
      }
    } catch { /* fallthrough */ }
  }

  throw new Error(
    `无法加载 ccshare 会话: ${id}（本地缓存不存在且未配置 CCSHARE_API_URL 环境变量）`,
  )
}
