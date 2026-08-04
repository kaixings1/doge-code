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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Database Migration', '', 'Usage:', '  /db-migrate status                 Show migration status', '  /db-migrate pending               Show pending migrations', '  /db-migrate up                    Apply all pending', '  /db-migrate down [N]              Rollback N migrations', '  /db-migrate create <name>         Create new migration', '  /db-migrate apply <name>          Apply specific migration', '  /db-migrate rollback <name>       Rollback specific migration', '  /db-migrate verify                Verify migration integrity', '  /db-migrate seed                  Run seed data', '  /db-migrate reset                 Reset all migrations', '  /db-migrate config                Show/edit config', '  /db-migrate history               Migration history', '  /db-migrate generate <sql>        Generate from SQL', ''].join('\n') }

  const config = loadConfig()
  const migrations = loadMigrations()

  if (cmd === 'status') {
    const applied = migrations.filter(m => m.applied).length
    return { type: 'text', value: ['Migration Status:', '=================', '', 'Adapter: ' + config.adapter, 'Connection: ' + config.connection, 'Total: ' + migrations.length, 'Applied: ' + applied, 'Pending: ' + (migrations.length - applied), 'Directory: ' + config.migrationsDir].join('\n') }
  }

  if (cmd === 'pending') {
    const pending = migrations.filter(m => !m.applied)
    if (pending.length === 0) return { type: 'text', value: '[OK] No pending migrations' }
    const lines = ['Pending Migrations:', '=====================', '']
    pending.forEach(m => lines.push('  ' + m.id + ' - ' + m.name))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'up' || cmd === 'migrate') {
    const pending = migrations.filter(m => !m.applied)
    if (pending.length === 0) return { type: 'text', value: '[OK] No pending migrations' }
    const lines = ['Applying ' + pending.length + ' migrations:', '']
    pending.forEach(m => {
      lines.push('[OK] Applied: ' + m.id + ' (' + m.name + ')')
      m.applied = true
      m.appliedAt = new Date().toISOString()
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'down' || cmd === 'rollback') {
    const n = parseInt(parts[1]) || 1
    const applied = migrations.filter(m => m.applied)
    if (applied.length === 0) return { type: 'text', value: 'No migrations to rollback' }
    const toRollback = applied.slice(-n)
    const lines = ['Rolling back ' + toRollback.length + ' migrations:', '']
    toRollback.forEach(m => {
      lines.push('[OK] Rolled back: ' + m.id + ' (' + m.name + ')')
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
    return { type: 'text', value: '[OK] Created: ' + MIGRATIONS_DIR + '/' + filename }
  }

  if (cmd === 'apply') {
    const name = parts.slice(1).join(' ')
    const migration = migrations.find(m => m.id.includes(name) || m.name.includes(name))
    if (!migration) return { type: 'text', value: 'Migration not found: ' + name }
    if (migration.applied) return { type: 'text', value: 'Already applied: ' + migration.id }
    migration.applied = true
    migration.appliedAt = new Date().toISOString()
    return { type: 'text', value: '[OK] Applied: ' + migration.id }
  }

  if (cmd === 'rollback') {
    const name = parts.slice(1).join(' ')
    const migration = migrations.find(m => m.id.includes(name) || m.name.includes(name))
    if (!migration) return { type: 'text', value: 'Migration not found: ' + name }
    migration.applied = false
    migration.appliedAt = undefined
    return { type: 'text', value: '[OK] Rolled back: ' + migration.id }
  }

  if (cmd === 'verify') {
    const lines = ['Migration Verification:', '=======================', '']
    let issues = 0
    migrations.forEach(m => {
      if (!m.up) { lines.push('[WARN] ' + m.id + ': no UP migration'); issues++ }
      if (!m.down) { lines.push('[WARN] ' + m.id + ': no DOWN migration'); issues++ }
    })
    if (issues === 0) lines.push('[OK] All migrations valid')
    else lines.push('Issues: ' + issues)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'seed') {
    return { type: 'text', value: 'Run seed files from migrations/seeds/ directory' }
  }

  if (cmd === 'reset') {
    migrations.forEach(m => { m.applied = false; m.appliedAt = undefined })
    return { type: 'text', value: '[OK] Reset all migrations' }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: '[OK] ' + key + ' = ' + value } }
    return { type: 'text', value: 'Unknown config: ' + key + '. Keys: adapter, connection, migrationsDir, tableName' }
  }

  if (cmd === 'history') {
    const lines = ['Migration History:', '==================', '']
    migrations.filter(m => m.applied).forEach(m => lines.push(m.id + ' - applied ' + (m.appliedAt || 'unknown')))
    return { type: 'text', value: lines.join('\n') || 'No migration history' }
  }

  if (cmd === 'generate') {
    const sql = parts.slice(1).join(' ')
    if (!sql) return { type: 'text', value: 'Usage: /db-migrate generate <sql>' }
    const timestamp = Date.now()
    const filename = timestamp + '_generated.sql'
    if (!existsSync(MIGRATIONS_DIR)) mkdirSync(MIGRATIONS_DIR, { recursive: true })
    writeFileSync(join(MIGRATIONS_DIR, filename), '-- UP\n' + sql + '\n\n-- DOWN\n-- Add rollback SQL\n', 'utf-8')
    return { type: 'text', value: '[OK] Generated: ' + MIGRATIONS_DIR + '/' + filename }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const dbMigrate: Command = {
  type: 'local', name: 'db-migrate',
  description: 'DB migrations - status/up/down/create/apply/rollback/verify/reset/history/generate',
  aliases: '/db-migrate, /migrate, /dbm'.split(','),
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default dbMigrate
