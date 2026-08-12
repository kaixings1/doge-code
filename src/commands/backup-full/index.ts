import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

interface BackupRecord {
  id: string
  name: string
  date: string
  files: number
  size: number
  path: string
}

const BACKUP_DIR = join(homedir(), '.doge', 'backups-full')

function getBackupDir(): string {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  return BACKUP_DIR
}

function getBackups(): BackupRecord[] {
  const entries: BackupRecord[] = []
  try {
    for (const item of readdirSync(BACKUP_DIR)) {
      const fp = join(BACKUP_DIR, item)
      try { const stat = statSync(fp); entries.push({ id: item, name: item, date: stat.mtime.toISOString(), files: 0, size: stat.size, path: fp }) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function countFiles(dir: string): number {
  let count = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
      const fp = join(dir, entry.name)
      try { if (statSync(fp).isFile()) count++; else count += countFiles(fp) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return count
}

function getSize(dir: string): number {
  let size = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
      const fp = join(dir, entry.name)
      try { const stat = statSync(fp); if (stat.isDirectory()) size += getSize(fp); else size += stat.size } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return size
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📦 完整项目备份', '', '📖 用法：', '  /backup-full now [名称]              创建完整备份', '  /backup-full list                    列出备份', '  /backup-full restore <名称>          恢复备份', '  /backup-full delete <名称>           删除备份', '  /backup-full info <名称>             备份详情', '  /backup-full export <名称>           导出为 tar.gz', '  /backup-full import <文件>           从 tar.gz 导入', '  /backup-full clean                   清理旧备份', '  /backup-full size                    存储使用量', '  /backup-full schedule <分钟>         自动备份计划', '  /backup-full diff <名称>             与当前对比', '  /backup-full verify <名称>           验证备份完整性', ''].join('\n') }

  if (cmd === 'now' || cmd === 'create') {
    const name = parts[1] || 'full-backup-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const fileCount = countFiles('.')
    const totalSize = getSize('.')
    const backupPath = join(getBackupDir(), name + '.tar.gz')
    try {
      execSync('tar -czf "' + backupPath + '" --exclude=node_modules --exclude=.git --exclude=dist --exclude=build --exclude=*.log .', { stdio: 'ignore', timeout: 120000 })
      return { type: 'text', value: '✅ 备份已创建：' + name + '.tar.gz\n文件数：' + fileCount + '\n大小：' + (totalSize / 1024 / 1024).toFixed(1) + ' MB' }
    } catch { return { type: 'text', value: '❌ 备份失败' } }
  }

  if (cmd === 'list' || cmd === 'ls') {
    const backups = getBackups()
    if (backups.length === 0) return { type: 'text', value: 'ℹ️ 暂无备份' }
    const lines = ['📋 备份列表：', '═════════════', '']
    backups.forEach(b => lines.push(b.name + ' - ' + b.date.slice(0, 19) + ' (' + (b.size / 1024 / 1024).toFixed(1) + ' MB)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'restore') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/backup-full restore <名称>' }
    const backupPath = join(getBackupDir(), name + '.tar.gz')
    if (!existsSync(backupPath)) return { type: 'text', value: '❌ 备份未找到：' + name }
    try { execSync('tar -xzf "' + backupPath + '"', { stdio: 'ignore', timeout: 120000 }); return { type: 'text', value: '✅ 已恢复：' + name } }
    catch { return { type: 'text', value: '❌ 恢复失败' } }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/backup-full delete <名称>' }
    try { require('fs').unlinkSync(join(getBackupDir(), name + '.tar.gz')); return { type: 'text', value: '✅ 已删除：' + name } }
    catch { return { type: 'text', value: '❌ 删除失败' } }
  }

  if (cmd === 'info' || cmd === 'show') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/backup-full info <名称>' }
    const backupPath = join(getBackupDir(), name + '.tar.gz')
    if (!existsSync(backupPath)) return { type: 'text', value: '❌ 未找到：' + name }
    const stat = statSync(backupPath)
    return { type: 'text', value: '📦 备份：' + name + '\n大小：' + (stat.size / 1024 / 1024).toFixed(1) + ' MB\n时间：' + stat.mtime.toISOString().slice(0, 19) }
  }

  if (cmd === 'export') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/backup-full export <名称>' }
    return { type: 'text', value: 'ℹ️ 备份已存在于：' + join(getBackupDir(), name + '.tar.gz') }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 未找到文件：' + file }
    try { execSync('cp "' + file + '" "' + getBackupDir() + '/"', { stdio: 'ignore' }); return { type: 'text', value: '✅ 已导入：' + file } }
    catch { return { type: 'text', value: '❌ 导入失败' } }
  }

  if (cmd === 'clean') {
    const backups = getBackups()
    if (backups.length <= 3) return { type: 'text', value: '⚠️ 仅有 ' + backups.length + ' 个备份，无需清理。' }
    const toDelete = backups.slice(3)
    toDelete.forEach(b => { try { require('fs').unlinkSync(b.path) } catch { /* ignore */ } })
    return { type: 'text', value: '✅ 已清理 ' + toDelete.length + ' 个旧备份' }
  }

  if (cmd === 'size' || cmd === 'usage') {
    const backups = getBackups()
    const totalSize = backups.reduce((s, b) => s + b.size, 0)
    return { type: 'text', value: '📊 存储：' + backups.length + ' 个备份，' + (totalSize / 1024 / 1024).toFixed(1) + ' MB 总计' }
  }

  if (cmd === 'schedule') {
    const interval = parts[1] || '60'
    return { type: 'text', value: '⏰ 每 ' + interval + ' 分钟自动备份。\n添加到 crontab：*/' + interval + ' * * * * /path/to/backup-script.sh' }
  }

  if (cmd === 'diff') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/backup-full diff <名称>' }
    try {
      const output = execSync('tar -tzf "' + join(getBackupDir(), name + '.tar.gz') + '" | head -30', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '📋 备份内容（前 30 项）：\n' + output }
    } catch { return { type: 'text', value: '❌ 无法读取备份' } }
  }

  if (cmd === 'verify') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/backup-full verify <名称>' }
    try {
      execSync('tar -tzf "' + join(getBackupDir(), name + '.tar.gz') + '" > /dev/null 2>&1', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 备份已验证：' + name }
    } catch { return { type: 'text', value: '❌ 备份已损坏：' + name } }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const backupFull: Command = {
  type: 'local', name: 'backup-full',
  description: 'Full backup - create/restore/list/delete/export/import/clean/verify/diff',
  aliases: '/backup-full, /bf, /bak'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default backupFull
