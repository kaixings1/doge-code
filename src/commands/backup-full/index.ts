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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Full Project Backup', '', '📖 Usage: ', '  /backup-full now [name]          Create full backup', '  /backup-full list               List backups', '  /backup-full restore <name>     Restore backup', '  /backup-full delete <name>      Delete backup', '  /backup-full info <name>        Backup details', '  /backup-full export <name>      Export as tar.gz', '  /backup-full import <file>      Import from tar.gz', '  /backup-full clean              Remove old backups', '  /backup-full size               Storage usage', '  /backup-full schedule <min>     Auto-backup schedule', '  /backup-full diff <name>        Compare with current', '  /backup-full verify <name>      Verify backup integrity', ''].join('\n') }

  if (cmd === 'now' || cmd === 'create') {
    const name = parts[1] || 'full-backup-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const fileCount = countFiles('.')
    const totalSize = getSize('.')
    const backupPath = join(getBackupDir(), name + '.tar.gz')
    try {
      execSync('tar -czf "' + backupPath + '" --exclude=node_modules --exclude=.git --exclude=dist --exclude=build --exclude=*.log .', { stdio: 'ignore', timeout: 120000 })
      return { type: 'text', value: '[OK] Backup created: ' + name + '.tar.gz\nFiles: ' + fileCount + '\nSize: ' + (totalSize / 1024 / 1024).toFixed(1) + ' MB' }
    } catch { return { type: 'text', value: '[ERROR] Backup failed' } }
  }

  if (cmd === 'list' || cmd === 'ls') {
    const backups = getBackups()
    if (backups.length === 0) return { type: 'text', value: 'No backups' }
    const lines = ['Backups:', '========', '']
    backups.forEach(b => lines.push(b.name + ' - ' + b.date.slice(0, 19) + ' (' + (b.size / 1024 / 1024).toFixed(1) + ' MB)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'restore') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /backup-full restore <name>' }
    const backupPath = join(getBackupDir(), name + '.tar.gz')
    if (!existsSync(backupPath)) return { type: 'text', value: 'Backup not found: ' + name }
    try { execSync('tar -xzf "' + backupPath + '"', { stdio: 'ignore', timeout: 120000 }); return { type: 'text', value: '[OK] Restored: ' + name } }
    catch { return { type: 'text', value: '[ERROR] Restore failed' } }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /backup-full delete <name>' }
    try { require('fs').unlinkSync(join(getBackupDir(), name + '.tar.gz')); return { type: 'text', value: '[OK] Deleted: ' + name } }
    catch { return { type: 'text', value: '[ERROR] Delete failed' } }
  }

  if (cmd === 'info' || cmd === 'show') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /backup-full info <name>' }
    const backupPath = join(getBackupDir(), name + '.tar.gz')
    if (!existsSync(backupPath)) return { type: 'text', value: 'Not found: ' + name }
    const stat = statSync(backupPath)
    return { type: 'text', value: 'Backup: ' + name + '\nSize: ' + (stat.size / 1024 / 1024).toFixed(1) + ' MB\nDate: ' + stat.mtime.toISOString().slice(0, 19) }
  }

  if (cmd === 'export') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /backup-full export <name>' }
    return { type: 'text', value: 'Backup already in: ' + join(getBackupDir(), name + '.tar.gz') }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
    try { execSync('cp "' + file + '" "' + getBackupDir() + '/"', { stdio: 'ignore' }); return { type: 'text', value: '[OK] Imported: ' + file } }
    catch { return { type: 'text', value: '[ERROR] Import failed' } }
  }

  if (cmd === 'clean') {
    const backups = getBackups()
    if (backups.length <= 3) return { type: 'text', value: 'Only ' + backups.length + ' backups. No cleanup needed.' }
    const toDelete = backups.slice(3)
    toDelete.forEach(b => { try { require('fs').unlinkSync(b.path) } catch { /* ignore */ } })
    return { type: 'text', value: '[OK] Cleaned ' + toDelete.length + ' old backups' }
  }

  if (cmd === 'size' || cmd === 'usage') {
    const backups = getBackups()
    const totalSize = backups.reduce((s, b) => s + b.size, 0)
    return { type: 'text', value: 'Storage: ' + backups.length + ' backups, ' + (totalSize / 1024 / 1024).toFixed(1) + ' MB total' }
  }

  if (cmd === 'schedule') {
    const interval = parts[1] || '60'
    return { type: 'text', value: 'Auto-backup every ' + interval + ' minutes.\nAdd to crontab: */' + interval + ' * * * * /path/to/backup-script.sh' }
  }

  if (cmd === 'diff') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /backup-full diff <name>' }
    try {
      const output = execSync('tar -tzf "' + join(getBackupDir(), name + '.tar.gz') + '" | head -30', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Backup contents (first 30):\n' + output }
    } catch { return { type: 'text', value: '[ERROR] Cannot read backup' } }
  }

  if (cmd === 'verify') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /backup-full verify <name>' }
    try {
      execSync('tar -tzf "' + join(getBackupDir(), name + '.tar.gz') + '" > /dev/null 2>&1', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Backup verified: ' + name }
    } catch { return { type: 'text', value: '[ERROR] Backup corrupted: ' + name } }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const backupFull: Command = {
  type: 'local', name: 'backup-full',
  description: 'Full backup - create/restore/list/delete/export/import/clean/verify/diff',
  aliases: '/backup-full, /bf, /bak'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default backupFull
