import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'fmt')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface FormatterConfig {
  name: string
  command: string
  extensions: string[]
  installCommand: string
}

interface FmtConfig {
  formatters: Record<string, FormatterConfig>
  defaultFormatter: string
  excludePatterns: string[]
  fixOnSave: boolean
  maxFileSize: number
  checkOnCommit: boolean
  useNpxFallback: boolean
  tabWidth: number
  singleQuote: boolean
  trailingComma: string
}

interface FmtHistory {
  date: string
  operation: 'check' | 'fix' | 'all'
  filesChecked: number
  filesFixed: number
  filesNeedingFix: number
  byExtension: Record<string, number>
  duration: number
}

const DEFAULT_CONFIG: FmtConfig = {
  formatters: {
    prettier: { name: 'Prettier', command: 'prettier', extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md', '.yml', '.yaml', '.graphql'], installCommand: 'npm install -D prettier' },
    black: { name: 'Black', command: 'black', extensions: ['.py'], installCommand: 'pip install black' },
    gofmt: { name: 'gofmt', command: 'gofmt', extensions: ['.go'], installCommand: 'Install Go toolchain' },
    rustfmt: { name: 'Rustfmt', command: 'rustfmt', extensions: ['.rs'], installCommand: 'rustup component add rustfmt' },
    googleJavaFormat: { name: 'Google Java Format', command: 'google-java-format', extensions: ['.java'], installCommand: 'Install google-java-format' },
  },
  defaultFormatter: 'prettier',
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '.next/**', '**/*.min.js', '**/vendor/**', '**/generated/**'],
  fixOnSave: false,
  maxFileSize: 100000,
  checkOnCommit: true,
  useNpxFallback: true,
  tabWidth: 2,
  singleQuote: true,
  trailingComma: 'es5',
}

function loadConfig(): FmtConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: FmtConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): FmtHistory[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(entry: FmtHistory) {
  const history = loadHistory()
  history.push(entry)
  if (history.length > 100) history.splice(0, history.length - 100)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function detectFormatter(file: string, config: FmtConfig): FormatterConfig | null {
  const ext = extname(file).toLowerCase()
  for (const fmt of Object.values(config.formatters)) {
    if (fmt.extensions.includes(ext)) return fmt
  }
  return null
}

function collectFiles(config: FmtConfig): string[] {
  const files: string[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git' || entry.name === 'coverage') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile()) {
          const relative = fp.replace(/\\/g, '/').replace(/^\.\//, '')
          if (config.excludePatterns.some(p => relative.includes(p.replace('**/', '')))) continue
          try { if (statSync(fp).size > config.maxFileSize) return } catch { return }
          if (detectFormatter(fp, config)) files.push(fp)
        }
      }
    } catch { /* ignore */ }
  }
  scan('.')
  return files
}

function formatFile(file: string, formatter: FormatterConfig, config: FmtConfig): { ok: boolean; output: string } {
  try {
    if (formatter.name === 'Prettier') {
      const quoteFlag = config.singleQuote ? '--single-quote' : ''
      const trailingFlag = `--trailing-comma ${config.trailingComma}`
      execSync(`${formatter.command} --write ${quoteFlag} ${trailingFlag} "${file}" 2>&1`, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 })
    } else {
      execSync(`${formatter.command} "${file}" 2>&1`, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 })
    }
    return { ok: true, output: '' }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
}

function checkFile(file: string, formatter: FormatterConfig, config: FmtConfig): { ok: boolean; output: string } {
  try {
    if (formatter.name === 'Prettier') execSync(`${formatter.command} --check "${file}" 2>&1`, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 })
    else return { ok: true, output: '' }
    return { ok: true, output: '' }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
}

function runFormatter(cmd: string, formatter: FormatterConfig, config: FmtConfig): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd + ' 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 }).trim()
    return { ok: true, output }
  } catch (e: any) {
    if (config.useNpxFallback && formatter.name === 'Prettier') {
      try { return { ok: true, output: execSync('npx ' + cmd + ' 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 }).trim() } }
      catch { /* ignore */ }
    }
    return { ok: false, output: e.message || 'Command failed' }
  }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🎨 代码格式化（高级）', '', '📖 用法：', '  /fmt check [文件]            检查格式（单个或全部）', '  /fmt fix [文件]              修复格式（单个或全部）', '  /fmt all                     格式化全部文件并统计', '  /fmt diff [文件]             显示格式差异', '  /fmt config                  查看/编辑格式化配置', '  /fmt install [格式化器]       安装格式化器', '  /fmt languages               查看支持的语言', '  /fmt stats                   格式化统计', '  /fmt history                 格式化历史', '  /fmt set <键> <值>           设置配置', '  /fmt exclude <模式>          添加排除模式', '  /fmt generate-config         生成 .prettierrc', '', '支持：prettier, black, gofmt, rustfmt, google-java-format'].join('\n') }

  if (cmd === 'languages') {
    const lines = ['📋 支持的格式化器：', '════════════════════', '']
    for (const [key, fmt] of Object.entries(config.formatters)) {
      lines.push(`  ${fmt.name} (${key}): ${fmt.extensions.join(', ')}`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = s[1]; const value = s.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}` }
  }

  if (cmd === 'set') {
    const key = s[1]; const value = s.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/fmt set <键> <值>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `✅ ${key} = ${config[key]}` } }
    return { type: 'text', value: `❌ 未知键：${key}。可用键：${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'exclude') {
    const pattern = s.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: '📖 用法：/fmt exclude <模式>\n当前：' + config.excludePatterns.join(', ') }
    config.excludePatterns.push(pattern)
    saveConfig(config)
    return { type: 'text', value: `✅ 已排除：${pattern}` }
  }

  if (cmd === 'generate-config') {
    const rc: Record<string, any> = { tabWidth: config.tabWidth, singleQuote: config.singleQuote, trailingComma: config.trailingComma }
    writeFileSync('.prettierrc', JSON.stringify(rc, null, 2), 'utf-8')
    writeFileSync('.prettierignore', config.excludePatterns.join('\n'), 'utf-8')
    return { type: 'text', value: '✅ 已生成 .prettierrc 和 .prettierignore' }
  }

  if (cmd === 'install') {
    const name = s[1] || config.defaultFormatter
    const fmt = config.formatters[name] || Object.values(config.formatters).find(f => f.name.toLowerCase() === name.toLowerCase())
    if (!fmt) return { type: 'text', value: `❌ 未知格式化器：${name}` }
    const result = runFormatter(fmt.installCommand, fmt, config)
    return { type: 'text', value: result.ok ? '✅ 已安装：' + fmt.name : '❌ ' + result.output }
  }

  if (cmd === 'check') {
    const file = s[1]
    if (file) {
      if (!existsSync(file)) return { type: 'text', value: `❌ 文件未找到：${file}` }
      const formatter = detectFormatter(file, config)
      if (!formatter) return { type: 'text', value: `⚠️ 无格式化器：${file}` }
      const result = checkFile(file, formatter, config)
      return { type: 'text', value: result.ok ? `✅ ${file} 格式正确（${formatter.name}）` : `🔧 ${file} 需要修复` }
    }
    const files = collectFiles(config)
    if (files.length === 0) return { type: 'text', value: 'ℹ️ 无可格式化文件' }
    let needsFix = 0
    const byExt: Record<string, number> = {}
    files.forEach(f => {
      const formatter = detectFormatter(f, config)
      if (formatter) {
        byExt[extname(f)] = (byExt[extname(f)] || 0) + 1
        if (!checkFile(f, formatter, config).ok) needsFix++
      }
    })
    return { type: 'text', value: `📊 检查结果：\n扫描文件：${files.length}\n需修复：${needsFix}\n格式正确：${files.length - needsFix}\n\n${needsFix > 0 ? '💡 运行 /fmt fix 修复全部' : '✅ 所有文件格式正确！'}` }
  }

  if (cmd === 'fix') {
    const file = s[1]
    if (file) {
      if (!existsSync(file)) return { type: 'text', value: `❌ 文件未找到：${file}` }
      const formatter = detectFormatter(file, config)
      if (!formatter) return { type: 'text', value: `⚠️ 无格式化器：${file}` }
      const result = formatFile(file, formatter, config)
      return { type: 'text', value: result.ok ? `✅ 已格式化：${file}（${formatter.name}）` : `❌ ${result.output}` }
    }
    const files = collectFiles(config)
    if (files.length === 0) return { type: 'text', value: 'ℹ️ 无可格式化文件' }
    let fixed = 0
    let failed = 0
    const byExt: Record<string, number> = {}
    files.forEach(f => {
      const formatter = detectFormatter(f, config)
      if (formatter) {
        byExt[extname(f)] = (byExt[extname(f)] || 0) + 1
        const result = formatFile(f, formatter, config)
        if (result.ok) fixed++; else failed++
      }
    })
    saveHistory({ date: new Date().toISOString(), operation: 'fix', filesChecked: files.length, filesFixed: fixed, filesNeedingFix: failed, byExtension: byExt, duration: 0 })
    return { type: 'text', value: `📊 格式化结果：\n已格式化：${fixed}\n失败：${failed}\n\n按扩展名：\n${Object.entries(byExt).map(([ext, count]) => `  ${ext}: ${count}`).join('\n')}` }
  }

  if (cmd === 'all') {
    const files = collectFiles(config)
    if (files.length === 0) return { type: 'text', value: 'ℹ️ 无可格式化文件' }
    const start = Date.now()
    let fixed = 0
    let failed = 0
    const byExt: Record<string, number> = {}
    files.forEach(f => {
      const formatter = detectFormatter(f, config)
      if (formatter) {
        byExt[extname(f)] = (byExt[extname(f)] || 0) + 1
        if (formatFile(f, formatter, config).ok) fixed++; else failed++
      }
    })
    const duration = Date.now() - start
    saveHistory({ date: new Date().toISOString(), operation: 'all', filesChecked: files.length, filesFixed: fixed, filesNeedingFix: failed, byExtension: byExt, duration })
    return { type: 'text', value: `📊 格式化全部：\n文件数：${files.length}\n已格式化：${fixed}\n失败：${failed}\n耗时：${duration}ms\n\n按扩展名：\n${Object.entries(byExt).map(([ext, count]) => `  ${ext}: ${count}`).join('\n')}` }
  }

  if (cmd === 'diff') {
    const file = s[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '📖 用法：/fmt diff <文件>' }
    try {
      const original = readFileSync(file, 'utf-8')
      const formatter = detectFormatter(file, config)
      if (!formatter) return { type: 'text', value: `⚠️ 无格式化器：${file}` }
      const tmpFile = file + '.fmt-tmp'
      writeFileSync(tmpFile, original, 'utf-8')
      formatFile(tmpFile, formatter, config)
      const formatted = readFileSync(tmpFile, 'utf-8')
      const fs = require('fs')
      fs.unlinkSync(tmpFile)
      if (original === formatted) return { type: 'text', value: `✅ ${file} 无需格式变更` }
      const origLines = original.split('\n')
      const fmtLines = formatted.split('\n')
      const diffLines: string[] = []
      for (let i = 0; i < Math.max(origLines.length, fmtLines.length); i++) {
        if (origLines[i] !== fmtLines[i]) diffLines.push(`  - ${origLines[i] || ''}\n  + ${fmtLines[i] || ''}`)
      }
      return { type: 'text', value: `📊 ${file} 的差异：\n${diffLines.slice(0, 20).join('\n')}\n${diffLines.length > 20 ? `... 还有 ${diffLines.length - 20} 行` : ''}` }
    } catch (e) { return { type: 'text', value: '❌ ' + (e instanceof Error ? e.message : String(e)) } }
  }

  if (cmd === 'stats') {
    const files = collectFiles(config)
    const byExt: Record<string, number> = {}
    files.forEach(f => { const e = extname(f); byExt[e] = (byExt[e] || 0) + 1 })
    const totalSize = files.reduce((sum, f) => { try { return sum + statSync(f).size } catch { return sum } }, 0)
    return { type: 'text', value: `📊 格式化统计：\n可格式化文件：${files.length}\n总大小：${(totalSize / 1024).toFixed(0)} KB\n\n按扩展名：\n${Object.entries(byExt).sort((a: any, b: any) => b[1] - a[1]).map(([ext, count]) => `  ${ext}: ${count}`).join('\n')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'ℹ️ 无格式化历史' }
    const lines = ['📅 格式化历史：', '═══════════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.operation} | ${h.filesChecked} 文件 | ${h.filesFixed} 已修复 | ${h.duration}ms`))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const fmt: Command = {
  type: 'local', name: 'fmt',
  description: '🎨 格式化器 - 检查/修复/全部/差异/统计/历史/配置/安装/语言',
  aliases: ['/fmt', '/format'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default fmt
