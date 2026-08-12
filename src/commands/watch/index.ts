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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['👁️ 文件监视器（高级）', '', '📖 用法：', '  /watch snapshot                 创建文件快照', '  /watch check                    检查快照后变更', '  /watch scan                     扫描变更（git status）', '  /watch status                   监视器状态', '  /watch logs                     查看变更日志', '  /watch clear                    清空日志', '  /watch config                   查看/编辑配置', '  /watch set <键> <值>            设置配置', '  /watch add-path <路径>          添加监视路径', '  /watch set-action <命令>        设置自动操作', '', '💡 实时监视：watch -n 2 /watch check', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/watch set <键> <值>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `✅ ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}。可用键：${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'add-path') {
    const path = parts[1]
    if (!path || !existsSync(path)) return { type: 'text', value: '❌ 路径未找到：' + path }
    if (!config.paths.includes(path)) config.paths.push(path)
    saveConfig(config)
    return { type: 'text', value: `✅ 正在监视：${path}\n当前路径：${config.paths.join(', ')}` }
  }

  if (cmd === 'set-action') {
    const action = parts.slice(1).join(' ')
    if (!action) return { type: 'text', value: '📖 用法：/watch set-action <命令>' }
    config.action = action
    saveConfig(config)
    return { type: 'text', value: `✅ 自动操作已设置：${action}` }
  }

  if (cmd === 'snapshot') {
    const snapshot = collectSnapshot(config)
    try {
      if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
      const data = Object.fromEntries(snapshot)
      writeFileSync(join(CONFIG_DIR, 'snapshot.json'), JSON.stringify(data, null, 2), 'utf-8')
    } catch { /* ignore */ }
    return { type: 'text', value: `✅ 快照已保存（${snapshot.size} 个文件）\n监视路径：${config.paths.join(', ')}\n扩展名：${config.extensions.join(', ')}` }
  }

  if (cmd === 'check' || cmd === '') {
    try {
      const snapshotFile = join(CONFIG_DIR, 'snapshot.json')
      if (!existsSync(snapshotFile)) return { type: 'text', value: 'ℹ️ 未找到快照。请先运行 /watch snapshot' }
      const before = new Map(Object.entries(JSON.parse(readFileSync(snapshotFile, 'utf-8'))))
      const after = collectSnapshot(config)
      const events = compareSnapshots(before, after, config)
      // Update snapshot
      writeFileSync(snapshotFile, JSON.stringify(Object.fromEntries(after), null, 2), 'utf-8')

      if (events.length === 0) return { type: 'text', value: '✅ 未检测到变更' }

      const lines = ['🔍 检测到变更（' + events.length + '）：', '══════════════════════', '']
      events.forEach(e => {
        const icon = e.event === 'create' ? '➕' : e.event === 'delete' ? '➖' : '✏️'
        lines.push(`${icon} ${e.file}（${e.size} 字节）`)
        log(`${e.event}: ${e.file}`)
      })
      lines.push('', '查看历史：/watch logs')

      // Run auto-action
      if (config.action) {
        lines.push('', `🔧 执行操作：${config.action}`)
        try {
          const output = execSync(config.action, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'ignore'] }).trim()
          lines.push('✅ ' + (output.slice(0, 200) || '操作完成'))
          log('action: ' + config.action)
        } catch (e: any) {
          lines.push('❌ 操作失败：' + (e.message || '').slice(0, 200))
        }
      }
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: '❌ 检查失败' } }
  }

  if (cmd === 'scan') {
    try {
      const output = execSync('git status --porcelain 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      if (!output.trim()) return { type: 'text', value: '✅ 无未提交变更' }
      const lines = output.split('\n').filter(Boolean)
      return { type: 'text', value: `📊 Git 变更（${lines.length}）：\n${lines.slice(0, 30).join('\n')}` }
    } catch { return { type: 'text', value: '❌ 非 Git 仓库' } }
  }

  if (cmd === 'status') {
    const snapshot = collectSnapshot(config)
    return { type: 'text', value: `📊 监视器状态：\n路径：${config.paths.join(', ')}\n文件数：${snapshot.size}\n扩展名：${config.extensions.join(', ')}\n事件：${config.events.join(', ')}\n操作：${config.action || '无'}\n间隔：${config.interval}ms` }
  }

  if (cmd === 'logs') {
    try {
      if (!existsSync(LOG_FILE)) return { type: 'text', value: 'ℹ️ 暂无日志' }
      const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean).slice(-30)
      return { type: 'text', value: '📋 监视日志：\n' + lines.join('\n') }
    } catch { return { type: 'text', value: 'ℹ️ 无日志' } }
  }

  if (cmd === 'clear') {
    try { if (existsSync(LOG_FILE)) writeFileSync(LOG_FILE, '', 'utf-8') } catch { /* ignore */ }
    return { type: 'text', value: '✅ 日志已清空' }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const watch: Command = {
  type: 'local', name: 'watch',
  description: '👁️ 文件监视 - 快照/检查/扫描/状态/日志/清空/配置/自动操作',
  aliases: ['/watch', '/w'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default watch
