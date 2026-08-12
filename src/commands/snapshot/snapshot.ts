import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const SNAPSHOTS_DIR = join(homedir(), '.doge', 'snapshots')

function ensureSnapshotsDir(): void {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
}

function getSnapshotPath(name: string): string {
  return join(SNAPSHOTS_DIR, `${sanitizeName(name)}.json`)
}

function listSnapshots(): string[] {
  if (!existsSync(SNAPSHOTS_DIR)) return []
  try {
    return readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .sort()
  } catch {
    return []
  }
}

function handleCreate(name: string, context: any): LocalCommandResult {
  if (!name) {
    return {
      type: 'text' as const,
      value: '用法: /snapshot create <name>\n\n示例:\n  /snapshot create my-snapshot\n  /snapshot create before-refactor',
    }
  }

  const messages = context.messages || []
  if (messages.length === 0) {
    return {
      type: 'text' as const,
      value: '⚠️ 当前会话没有消息可保存',
    }
  }

  ensureSnapshotsDir()
  const path = getSnapshotPath(name)

  try {
    const snapshot = {
      name: sanitizeName(name),
      createdAt: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map((m: any) => ({
        uuid: m.uuid,
        type: m.type,
        subtype: m.subtype,
        role: m.role,
        content: m.content,
        model: m.model,
        stop_reason: m.stop_reason,
        usage: m.usage,
      })),
    }
    writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8')
    return {
      type: 'text' as const,
      value: `✅ 已创建快照: ${name}\n   消息数: ${messages.length}\n   文件: ${path}`,
    }
  } catch (e: any) {
    return {
      type: 'text' as const,
      value: `❌ 创建快照失败: ${e.message}`,
    }
  }
}

function handleRestore(name: string, context: any): LocalCommandResult {
  if (!name) {
    return {
      type: 'text' as const,
      value: '用法: /snapshot restore <name>\n\n示例:\n  /snapshot restore my-snapshot',
    }
  }

  const path = getSnapshotPath(name)
  if (!existsSync(path)) {
    const available = listSnapshots()
    const hint = available.length > 0
      ? `\n可用快照: ${available.join(', ')}`
      : '\n使用 /snapshot list 查看所有快照'
    return {
      type: 'text' as const,
      value: `❌ 未找到快照: ${name}${hint}`,
    }
  }

  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    if (!data.messages || !Array.isArray(data.messages)) {
      return {
        type: 'text' as const,
        value: `❌ 快照文件格式无效: ${name}`,
      }
    }

    // Restore messages using setMessages
    context.setMessages(() => data.messages)

    return {
      type: 'text' as const,
      value: `✅ 已恢复快照: ${name}\n   消息数: ${data.messages.length}\n   创建时间: ${data.createdAt || '未知'}`,
    }
  } catch (e: any) {
    return {
      type: 'text' as const,
      value: `❌ 恢复快照失败: ${e.message}`,
    }
  }
}

function handleList(): LocalCommandResult {
  const snapshots = listSnapshots()

  if (snapshots.length === 0) {
    return {
      type: 'text' as const,
      value: '📋 没有保存的快照\n\n使用 /snapshot create <name> 创建快照',
    }
  }

  const lines = [`📋 已保存的快照 (${snapshots.length}):`, '']

  for (const name of snapshots) {
    try {
      const path = getSnapshotPath(name)
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      const msgCount = data.messageCount || data.messages?.length || '?'
      const created = data.createdAt
        ? new Date(data.createdAt).toLocaleString('zh-CN')
        : '未知时间'
      lines.push(`  • ${name} (${msgCount} 条消息, ${created})`)
    } catch {
      lines.push(`  • ${name} (格式损坏)`)
    }
  }

  lines.push('')
  lines.push('使用 /snapshot restore <name> 恢复快照')
  lines.push('使用 /snapshot delete <name> 删除快照')

  return { type: 'text' as const, value: lines.join('\n') }
}

function handleDelete(name: string): LocalCommandResult {
  if (!name) {
    return {
      type: 'text' as const,
      value: '用法: /snapshot delete <name>\n\n示例:\n  /snapshot delete my-snapshot',
    }
  }

  const path = getSnapshotPath(name)
  if (!existsSync(path)) {
    return {
      type: 'text' as const,
      value: `❌ 未找到快照: ${name}`,
    }
  }

  try {
    unlinkSync(path)
    return {
      type: 'text' as const,
      value: `✅ 已删除快照: ${name}`,
    }
  } catch (e: any) {
    return {
      type: 'text' as const,
      value: `❌ 删除快照失败: ${e.message}`,
    }
  }
}

const call: LocalCommandCall = async (args, context) => {
  const trimmed = args.trim()
  const parts = trimmed.split(/\s+/)
  const action = parts[0]?.toLowerCase() || 'list'
  const subArgs = parts.slice(1).join(' ')

  switch (action) {
    case 'create':
      return handleCreate(subArgs, context)
    case 'restore':
    case 'load':
      return handleRestore(subArgs, context)
    case 'delete':
    case 'remove':
      return handleDelete(subArgs)
    case 'list':
    case 'ls':
      return handleList()
    case 'help':
    case '--help':
    case '-h':
    default:
      return {
        type: 'text' as const,
        value: [
          '📸 会话快照管理',
          '',
          '📖 📖 用法: ',
          '  /snapshot create <name>      - 创建当前会话快照',
          '  /snapshot restore <name>     - 恢复快照',
          '  /snapshot list               - 列出所有快照',
          '  /snapshot delete <name>      - 删除快照',
          '',
          '快照存储位置: ~/.doge/snapshots/',
        ].join('\n'),
      }
  }
}

export default call
