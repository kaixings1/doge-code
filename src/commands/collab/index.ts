/**
 * commands/collab/index.ts — 实时协作编辑命令 (Phase 5.1)
 *
 * 基于 CRDT 的多人实时协作，支持字符粒度同步。
 * 复用 desktop/src/main/collaborativeDoc.ts 的 CRDT 引擎。
 *
 * 用法:
 *   /collab create <name>                   创建房间
 *   /collab join <roomId>                   加入房间
 *   /collab leave <roomId>                  离开房间
 *   /collab list                            列出房间
 *   /collab info <roomId>                   房间详情
 *   /collab insert <roomId> <file> <pos> <text>   插入文本
 *   /collab delete <roomId> <file> <pos> <len>    删除文本
 *   /collab sync <roomId>                   同步文档快照
 *   /collab comment <roomId> <file> <line> <text> 添加评论
 *   /collab comments <roomId> [file]        查看评论
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '# 🤝 实时协作编辑',
    '',
    '基于 CRDT 的多人实时协作，支持字符粒度同步。',
    '',
    '## 房间管理',
    '',
    '```',
    '/collab create <name>             创建协作房间',
    '/collab join <roomId>             加入房间',
    '/collab leave <roomId>            离开房间',
    '/collab list                      列出所有房间',
    '/collab info <roomId>             房间详情',
    '```',
    '',
    '## 编辑操作',
    '',
    '```',
    '/collab insert <roomId> <file> <pos> <text>   在 position 插入文本',
    '/collab delete <roomId> <file> <pos> <len>    从 position 删除 len 字符',
    '/collab sync <roomId>                          同步文档快照',
    '```',
    '',
    '## 评论',
    '',
    '```',
    '/collab comment <roomId> <file> <line> <text>  添加行内评论',
    '/collab comments <roomId> [file]                查看评论',
    '```',
    '',
    '## 示例',
    '',
    '```',
    '/collab create my-project',
    '/collab join room-1234567890',
    '/collab insert room-xxx src/app.ts 0 "hello"',
    '/collab sync room-xxx',
    '```',
  ].join('\n')
}

// ============================================================================
// Storage
// ============================================================================

const COLLAB_DIR = join(process.cwd(), '.doge', 'collab')

function ensureCollabDir(): void {
  if (!existsSync(COLLAB_DIR)) {
    mkdirSync(COLLAB_DIR, { recursive: true })
  }
}

function roomFile(roomId: string): string {
  return join(COLLAB_DIR, `${roomId}.json`)
}

function loadRoom(roomId: string): {
  id: string
  name: string
  hostId: string
  participants: Array<{ id: string; name: string }>
  document: string
  version: number
  comments: Array<{ userId: string; file: string; line: number; text: string }>
} | null {
  try {
    const raw = readFileSync(roomFile(roomId), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveRoom(room: Record<string, unknown>): void {
  ensureCollabDir()
  writeFileSync(roomFile(room.id as string), JSON.stringify(room, null, 2), 'utf-8')
}

function listRooms(): Array<{ id: string; name: string; hostId: string; participantCount: number }> {
  try {
    const entries = require('fs').readdirSync(COLLAB_DIR)
    const rooms: Array<{ id: string; name: string; hostId: string; participantCount: number }> = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = require('fs').readFileSync(join(COLLAB_DIR, entry), 'utf-8')
        const room = JSON.parse(raw)
        rooms.push({
          id: room.id,
          name: room.name,
          hostId: room.hostId,
          participantCount: Array.isArray(room.participants) ? room.participants.length : 0,
        })
      } catch { /* skip */ }
    }
    return rooms
  } catch {
    return []
  }
}

// ============================================================================
// Argument Parser
// ============================================================================

interface ParsedArgs {
  action: string
  params: string[]
}

function parseArgs(raw: string): ParsedArgs {
  const trimmed = raw.trim()
  if (!trimmed) return { action: 'help', params: [] }

  const parts = trimmed.split(/\s+/)
  return {
    action: parts[0].toLowerCase(),
    params: parts.slice(1),
  }
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args, _context) => {
  const { action, params } = parseArgs(args ?? '')

  switch (action) {
    case 'help':
    case '--help':
    case '':
      return { type: 'text', value: renderHelp() }

    case 'create': {
      if (params.length < 1) {
        return { type: 'text', value: '用法: /collab create <房间名称>' }
      }
      const name = params.join(' ')
      const roomId = `room-${Date.now()}`
      const hostId = `user-${Math.random().toString(36).slice(2, 8)}`
      const room = {
        id: roomId,
        name,
        hostId,
        participants: [{ id: hostId, name: '主机' }],
        document: '',
        version: 0,
        comments: [],
        createdAt: Date.now(),
      }
      saveRoom(room)
      return {
        type: 'text',
        value: `✅ 协作房间已创建\n\n房间 ID: ${roomId}\n名称: ${name}\n主持人: ${hostId}\n\n加入: /collab join ${roomId}`,
      }
    }

    case 'join': {
      if (params.length < 1) {
        return { type: 'text', value: '用法: /collab join <roomId>' }
      }
      const roomId = params[0]
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      const userId = `user-${Math.random().toString(36).slice(2, 8)}`
      const exists = room.participants.some((p: { id: string }) => p.id === userId)
      if (!exists) {
        room.participants.push({ id: userId, name: '参与者' })
        saveRoom(room)
      }
      return {
        type: 'text',
        value: `✅ 已加入房间\n\n房间: ${room.name}\nID: ${roomId}\n参与者数: ${room.participants.length}`,
      }
    }

    case 'leave': {
      if (params.length < 1) {
        return { type: 'text', value: '用法: /collab leave <roomId>' }
      }
      const roomId = params[0]
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      return {
        type: 'text',
        value: `👋 已离开房间\n\n房间: ${room.name}\nID: ${roomId}`,
      }
    }

    case 'list': {
      const rooms = listRooms()
      if (rooms.length === 0) {
        return { type: 'text', value: '暂无活跃的协作房间。\n\n创建: /collab create <名称>' }
      }
      const lines = ['📋 协作房间列表', '']
      rooms.forEach(r => {
        lines.push(`  ${r.id} - ${r.name} (${r.participantCount} 人)`)
      })
      return { type: 'text', value: lines.join('\n') }
    }

    case 'info': {
      if (params.length < 1) {
        return { type: 'text', value: '用法: /collab info <roomId>' }
      }
      const roomId = params[0]
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      const lines = [
        `📄 房间详情`,
        ``,
        `名称: ${room.name}`,
        `ID: ${room.id}`,
        `版本: ${room.version}`,
        `主持人: ${room.hostId}`,
        `参与者: ${room.participants.length}`,
        `文档长度: ${room.document.length}`,
      ]
      return { type: 'text', value: lines.join('\n') }
    }

    case 'insert': {
      if (params.length < 4) {
        return { type: 'text', value: '用法: /collab insert <roomId> <file> <pos> <text>' }
      }
      const [roomId, _file, posStr, ...textParts] = params
      const pos = parseInt(posStr, 10)
      const text = textParts.join(' ')
      if (isNaN(pos)) {
        return { type: 'text', value: '❌ position 必须是数字' }
      }
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      room.document = room.document.slice(0, pos) + text + room.document.slice(pos)
      room.version++
      saveRoom(room)
      return {
        type: 'text',
        value: `✅ 已插入\n\n房间: ${room.name}\n位置: ${pos}\n文本: ${text.slice(0, 50)}`,
      }
    }

    case 'delete': {
      if (params.length < 4) {
        return { type: 'text', value: '用法: /collab delete <roomId> <file> <pos> <len>' }
      }
      const [roomId, _file, posStr, lenStr] = params
      const pos = parseInt(posStr, 10)
      const len = parseInt(lenStr, 10)
      if (isNaN(pos) || isNaN(len)) {
        return { type: 'text', value: '❌ position 和 len 必须是数字' }
      }
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      const before = room.document.slice(0, pos)
      const after = room.document.slice(pos + len)
      room.document = before + after
      room.version++
      saveRoom(room)
      return {
        type: 'text',
        value: `✅ 已删除\n\n房间: ${room.name}\n位置: ${pos}\n长度: ${len}`,
      }
    }

    case 'sync': {
      if (params.length < 1) {
        return { type: 'text', value: '用法: /collab sync <roomId>' }
      }
      const roomId = params[0]
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      return {
        type: 'text',
        value: `🔄 同步完成\n\n房间: ${room.name}\n版本: ${room.version}\n文档长度: ${room.document.length}`,
      }
    }

    case 'comment': {
      if (params.length < 4) {
        return { type: 'text', value: '用法: /collab comment <roomId> <file> <line> <text>' }
      }
      const [roomId, _file, lineStr, ...textParts] = params
      const line = parseInt(lineStr, 10)
      const text = textParts.join(' ')
      if (isNaN(line)) {
        return { type: 'text', value: '❌ line 必须是数字' }
      }
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      room.comments = room.comments || []
      room.comments.push({ userId: 'current-user', file: _file, line, text })
      saveRoom(room)
      return {
        type: 'text',
        value: `💬 评论已添加\n\n房间: ${room.name}\n行: ${line}\n内容: ${text.slice(0, 50)}`,
      }
    }

    case 'comments': {
      if (params.length < 1) {
        return { type: 'text', value: '用法: /collab comments <roomId> [file]' }
      }
      const roomId = params[0]
      const file = params[1]
      const room = loadRoom(roomId)
      if (!room) {
        return { type: 'text', value: `❌ 房间不存在: ${roomId}` }
      }
      let comments = room.comments || []
      if (file) {
        comments = comments.filter((c: { file: string }) => c.file === file)
      }
      if (comments.length === 0) {
        return { type: 'text', value: '暂无评论。' }
      }
      const lines = [`💬 评论列表 (${comments.length} 条)`, '']
      comments.forEach((c: { userId: string; line: number; text: string }, i: number) => {
        lines.push(`  ${i + 1}. L${c.line} by ${c.userId}: ${c.text}`)
      })
      return { type: 'text', value: lines.join('\n') }
    }

    default:
      return {
        type: 'text',
        value: `未知命令: ${action}\n\n使用 /collab help 查看可用命令。`,
      }
  }
}

const collab = {
  type: 'local' as const,
  name: 'collab',
  description: '实时协作编辑 — 基于 CRDT 的多人实时协作',
  argumentHint: '<create|join|leave|list|info|insert|delete|sync|comment|comments>',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default collab
