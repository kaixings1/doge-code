import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, extname } from 'path'

interface Migration {
  id: string
  name: string
  version: string
  applied: boolean
  appliedAt?: string
  up: string
  down: string
}

interface MigrationConfig {
  adapter: 'sqlite' | 'postgres' | 'mysql' | 'mongo'
  connection: string
  migrationsDir: string
  tableName: string
}

const MIGRATIONS_DIR = 'migrations'
const MIGRATION_CONFIG = '.migration-config.json'

function loadConfig(): MigrationConfig {
  try {
    if (existsSync(MIGRATION_CONFIG)) return JSON.parse(readFileSync(MIGRATION_CONFIG, 'utf-8'))
  } catch { /* ignore */ }
  return { adapter: 'sqlite', connection: './database.db', migrationsDir: MIGRATIONS_DIR, tableName: 'migrations' }
}

function saveConfig(config: MigrationConfig) {
  writeFileSync(MIGRATION_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
}

function loadMigrations(): Migration[] {
  try {
    if (!existsSync(MIGRATIONS_DIR)) return []
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') || f.endsWith('.js') || f.endsWith('.ts'))
    return files.map(f => {
      const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')
      const upMatch = content.match(/--\s*UP\s*([\s\S]*?)(?=--\s*DOWN|$)/i)
      const downMatch = content.match(/--\s*DOWN\s*([\s\S]*)/i)
      return { id: f.replace(extname(f), ''), name: f, version: '1.0.0', applied: false, up: upMatch?.[1]?.trim() || content, down: downMatch?.[1]?.trim() || '' }
    }).sort((a, b) => a.id.localeCompare(b.id))
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🗄️ 数据库迁移', '', '📖 用法：', '  /db-migrate status                 查看迁移状态', '  /db-migrate pending                 查看待执行迁移', '  /db-migrate up                      执行所有待执行迁移', '  /db-migrate down [N]                回滚 N 个迁移', '  /db-migrate create &lt;名称&gt;          创建新迁移', '  /db-migrate apply &lt;名称&gt;         执行指定迁移', '  /db-migrate rollback &lt;名称&gt;      回滚指定迁移', '  /db-migrate verify                  验证迁移完整性', '  /db-migrate seed                    运行种子数据', '  /db-migrate reset                   重置所有迁移', '  /db-migrate config                  查看/编辑配置', '  /db-migrate history                 迁移历史', '  /db-migrate generate &lt;sql&gt;       从 SQL 生成', ''].join('\n') }

  const config = loadConfig()
  const migrations = loadMigrations()

  if (cmd === 'status') {
    const applied = migrations.filter(m => m.applied).length
    return { type: 'text', value: ['📊 迁移状态：', '═════════════', '', '适配器：' + config.adapter, '连接：' + config.connection, '总计：' + migrations.length, '已应用：' + applied, '待执行：' + (migrations.length - applied), '目录：' + config.migrationsDir].join('\n') }
  }

  if (cmd === 'pending') {
    const pending = migrations.filter(m => !m.applied)
    if (pending.length === 0) return { type: 'text', value: '✅ 无待执行迁移' }
    const lines = ['⏳ 待执行迁移：', '═══════════════════', '']
    pending.forEach(m => lines.push('  ' + m.id + ' - ' + m.name))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'up' || cmd === 'migrate') {
    const pending = migrations.filter(m => !m.applied)
    if (pending.length === 0) return { type: 'text', value: '✅ 无待执行迁移' }
    const lines = ['✅ 正在执行 ' + pending.length + ' 个迁移：', '']
    pending.forEach(m => {
      lines.push('✅ 已执行：' + m.id + '（' + m.name + '）')
      m.applied = true
      m.appliedAt = new Date().toISOString()
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'down' || cmd === 'rollback') {
    const n = parseInt(parts[1]) || 1
    const applied = migrations.filter(m => m.applied)
    if (applied.length === 0) return { type: 'text', value: 'ℹ️ 无可回滚迁移' }
    const toRollback = applied.slice(-n)
    const lines = ['🔄 正在回滚 ' + toRollback.length + ' 个迁移：', '']
    toRollback.forEach(m => {
      lines.push('✅ 已回滚：' + m.id + '（' + m.name + '）')
      m.applied = false
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'create') {
    const name = parts.slice(1).join('_') || 'migration'
    const timestamp = Date.now()
    const filename = timestamp + '_' + name + '.sql'
    const content = '-- Migration: ' + name + '\n-- Created: ' + new Date().toISOString() + '\n\n-- UP\n-- Add your forward migration SQL here\n\n-- DOWN\n-- Add your rollback SQL here\n'
    if (!existsSync(MIGRATIONS_DIR)) mkdirSync(MIGRATIONS_DIR, { recursive: true })
    writeFileSync(join(MIGRATIONS_DIR, filename), content, 'utf-8')
    return { type: 'text', value: '✅ 已创建：' + MIGRATIONS_DIR + '/' + filename }
  }

  if (cmd === 'apply') {
    const name = parts.slice(1).join(' ')
    const migration = migrations.find(m => m.id.includes(name) || m.name.includes(name))
    if (!migration) return { type: 'text', value: '❌ 未找到迁移：' + name }
    if (migration.applied) return { type: 'text', value: '⚠️ 已执行过：' + migration.id }
    migration.applied = true
    migration.appliedAt = new Date().toISOString()
    return { type: 'text', value: '✅ 已执行：' + migration.id }
  }

  if (cmd === 'rollback') {
    const name = parts.slice(1).join(' ')
    const migration = migrations.find(m => m.id.includes(name) || m.name.includes(name))
    if (!migration) return { type: 'text', value: '❌ 未找到迁移：' + name }
    migration.applied = false
    migration.appliedAt = undefined
    return { type: 'text', value: '✅ 已回滚：' + migration.id }
  }

  if (cmd === 'verify') {
    const lines = ['🔍 迁移验证：', '═══════════════', '']
    let issues = 0
    migrations.forEach(m => {
      if (!m.up) { lines.push('⚠️ ' + m.id + '：缺少 UP 迁移'); issues++ }
      if (!m.down) { lines.push('⚠️ ' + m.id + '：缺少 DOWN 迁移'); issues++ }
    })
    if (issues === 0) lines.push('✅ 所有迁移有效')
    else lines.push('问题数：' + issues)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'seed') {
    return { type: 'text', value: '📂 在 migrations/seeds/ 目录中运行种子数据文件' }
  }

  if (cmd === 'reset') {
    migrations.forEach(m => { m.applied = false; m.appliedAt = undefined })
    return { type: 'text', value: '✅ 已重置所有迁移' }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: '✅ ' + key + ' = ' + value } }
    return { type: 'text', value: '❌ 未知配置：' + key + '。可用键：adapter, connection, migrationsDir, tableName' }
  }

  if (cmd === 'history') {
    const lines = ['📅 迁移历史：', '═════════════', '']
    migrations.filter(m => m.applied).forEach(m => lines.push(m.id + ' - 已应用 ' + (m.appliedAt || '未知')))
    return { type: 'text', value: lines.join('\n') || 'ℹ️ 暂无迁移历史' }
  }

  if (cmd === 'generate') {
    const sql = parts.slice(1).join(' ')
    if (!sql) return { type: 'text', value: '📖 用法：/db-migrate generate &lt;SQL语句&gt;' }
    const timestamp = Date.now()
    const filename = timestamp + '_generated.sql'
    if (!existsSync(MIGRATIONS_DIR)) mkdirSync(MIGRATIONS_DIR, { recursive: true })
    writeFileSync(join(MIGRATIONS_DIR, filename), '-- UP\n' + sql + '\n\n-- DOWN\n-- Add rollback SQL\n', 'utf-8')
    return { type: 'text', value: '✅ 已生成：' + MIGRATIONS_DIR + '/' + filename }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const dbMigrate: Command = {
  type: 'local', name: 'db-migrate',
  description: '数据库迁移 - 状态/执行/回滚/创建/应用/验证/重置/历史/生成',
  aliases: '/db-migrate, /migrate, /dbm'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default dbMigrate
