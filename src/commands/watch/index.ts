import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'watch')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const LOG_FILE = join(CONFIG_DIR, 'watch.log')

interface WatchConfig {
  paths: string[]
  events: ('create' | 'modify' | 'delete')[]
  extensions: string[]
  action: string
  ignorePatterns: string[]
  interval: number
  runOnStart: boolean
  notify: boolean
}

interface ChangeEvent {
  timestamp: string
  event: 'create' | 'modify' | 'delete'
  file: string
  size: number
}

const DEFAULT_CONFIG: WatchConfig = {
  paths: ['.'],
  events: ['create', 'modify', 'delete'],
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.json', '.md'],
  action: '',
  ignorePatterns: ['node_modules', 'dist', 'build', '.git', 'coverage'],
  interval: 2000,
  runOnStart: false,
  notify: true,
}

function loadConfig(): WatchConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: WatchConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function log(message: string) {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean).slice(-100)
    lines.push(`[${new Date().toISOString()}] ${message}`)
    writeFileSync(LOG_FILE, lines.join('\n') + '\n', 'utf-8')
  } catch { /* ignore */ }
}

function collectSnapshot(config: WatchConfig): Map<string, number> {
  const snapshot = new Map<string, number>()
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (config.ignorePatterns.includes(entry.name)) continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && config.extensions.includes(extname(entry.name))) {
          try { snapshot.set(fp, statSync(fp).mtimeMs) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  config.paths.forEach(p => { if (existsSync(p)) scan(p) })
  return snapshot
}

function compareSnapshots(before: Map<string, number>, after: Map<string, number>, config: WatchConfig): ChangeEvent[] {
  const events: ChangeEvent[] = []
  const allKeys = new Set([...before.keys(), ...after.keys()])
  allKeys.forEach(key => {
    const beforeTime = before.get(key)
    const afterTime = after.get(key)
    if (beforeTime === undefined && afterTime !== undefined) {
      if (config.events.includes('create')) events.push({ timestamp: new Date().toISOString(), event: 'create', file: key, size: statSync(key).size })
    } else if (beforeTime !== undefined && afterTime === undefined) {
      if (config.events.includes('delete')) events.push({ timestamp: new Date().toISOString(), event: 'delete', file: key, size: 0 })
    } else if (beforeTime !== undefined && afterTime !== undefined && beforeTime !== afterTime) {
      if (config.events.includes('modify')) events.push({ timestamp: new Date().toISOString(), event: 'modify', file: key, size: statSync(key).size })
    }
  })
  return events
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['File Watcher (Advanced)', '', 'Usage:', '  /watch snapshot                 Take a snapshot of files', '  /watch check                    Check for changes since snapshot', '  /watch scan                     Scan for changes (git status)', '  /watch status                   Watcher status', '  /watch logs                     View change logs', '  /watch clear                    Clear logs', '  /watch config                   Show/edit config', '  /watch set <key> <val>          Set config value', '  /watch add-path <path>          Add watch path', '  /watch set-action <cmd>         Set auto-action', '', 'Note: For real-time watching, use: watch -n 2 /watch check', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /watch set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'add-path') {
    const path = parts[1]
    if (!path || !existsSync(path)) return { type: 'text', value: 'Path not found: ' + path }
    if (!config.paths.includes(path)) config.paths.push(path)
    saveConfig(config)
    return { type: 'text', value: `[OK] Watching: ${path}\nCurrent paths: ${config.paths.join(', ')}` }
  }

  if (cmd === 'set-action') {
    const action = parts.slice(1).join(' ')
    if (!action) return { type: 'text', value: 'Usage: /watch set-action <command>' }
    config.action = action
    saveConfig(config)
    return { type: 'text', value: `[OK] Action set: ${action}` }
  }

  if (cmd === 'snapshot') {
    const snapshot = collectSnapshot(config)
    try {
      if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
      const data = Object.fromEntries(snapshot)
      writeFileSync(join(CONFIG_DIR, 'snapshot.json'), JSON.stringify(data, null, 2), 'utf-8')
    } catch { /* ignore */ }
    return { type: 'text', value: `[OK] Snapshot saved (${snapshot.size} files)\nWatching: ${config.paths.join(', ')}\nExtensions: ${config.extensions.join(', ')}` }
  }

  if (cmd === 'check' || cmd === '') {
    try {
      const snapshotFile = join(CONFIG_DIR, 'snapshot.json')
      if (!existsSync(snapshotFile)) return { type: 'text', value: 'No snapshot found. Run /watch snapshot first.' }
      const before = new Map(Object.entries(JSON.parse(readFileSync(snapshotFile, 'utf-8'))))
      const after = collectSnapshot(config)
      const events = compareSnapshots(before, after, config)
      // Update snapshot
      writeFileSync(snapshotFile, JSON.stringify(Object.fromEntries(after), null, 2), 'utf-8')

      if (events.length === 0) return { type: 'text', value: '[OK] No changes detected' }

      const lines = ['Changes Detected (' + events.length + '):', '══════════════════════', '']
      events.forEach(e => {
        const icon = e.event === 'create' ? '➕' : e.event === 'delete' ? '➖' : '✏️'
        lines.push(`${icon} ${e.event.toUpperCase()} ${e.file} (${e.size} bytes)`)
        log(`${e.event}: ${e.file}`)
      })
      lines.push('', 'View history: /watch logs')

      // Run auto-action
      if (config.action) {
        lines.push('', `Running action: ${config.action}`)
        try {
          const output = execSync(config.action, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'ignore'] }).trim()
          lines.push('✅ ' + (output.slice(0, 200) || 'Action completed'))
          log('action: ' + config.action)
        } catch (e: any) {
          lines.push('❌ Action failed: ' + (e.message || '').slice(0, 200))
        }
      }
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: '[ERROR] Check failed' } }
  }

  if (cmd === 'scan') {
    try {
      const output = execSync('git status --porcelain 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      if (!output.trim()) return { type: 'text', value: '[OK] No uncommitted changes' }
      const lines = output.split('\n').filter(Boolean)
      return { type: 'text', value: `Git Changes (${lines.length}):\n${lines.slice(0, 30).join('\n')}` }
    } catch { return { type: 'text', value: 'Not a git repository' } }
  }

  if (cmd === 'status') {
    const snapshot = collectSnapshot(config)
    return { type: 'text', value: `Watcher Status:\nPaths: ${config.paths.join(', ')}\nFiles tracked: ${snapshot.size}\nExtensions: ${config.extensions.join(', ')}\nEvents: ${config.events.join(', ')}\nAction: ${config.action || '(none)'}\nInterval: ${config.interval}ms` }
  }

  if (cmd === 'logs') {
    try {
      if (!existsSync(LOG_FILE)) return { type: 'text', value: 'No logs yet' }
      const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean).slice(-30)
      return { type: 'text', value: 'Watch Logs:\n' + lines.join('\n') }
    } catch { return { type: 'text', value: 'No logs' } }
  }

  if (cmd === 'clear') {
    try { if (existsSync(LOG_FILE)) writeFileSync(LOG_FILE, '', 'utf-8') } catch { /* ignore */ }
    return { type: 'text', value: '[OK] Logs cleared' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const watch: Command = {
  type: 'local', name: 'watch',
  description: 'Watch - snapshot/check/scan/status/logs/clear/config/set-action',
  aliases: ['/watch', '/w'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default watch
