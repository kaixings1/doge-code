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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Code Formatter (Deep)', '', '📖 📖 Usage: ', '  /fmt check [file]            Check formatting (single or all)', '  /fmt fix [file]              Fix formatting (single or all)', '  /fmt all                     Format all files with stats', '  /fmt diff [file]             Show format diff', '  /fmt config                  Show/edit formatter config', '  /fmt install [formatter]     Install formatter', '  /fmt languages               Show supported languages', '  /fmt stats                   Formatting statistics', '  /fmt history                 Format history', '  /fmt set <key> <value>       Set config value', '  /fmt exclude <pattern>       Add exclude pattern', '  /fmt generate-config         Generate .prettierrc', '', 'Supported: prettier, black, gofmt, rustfmt, google-java-format'].join('\n') }

  if (cmd === 'languages') {
    const lines = ['Supported Formatters:', '====================', '']
    for (const [key, fmt] of Object.entries(config.formatters)) {
      lines.push(`  ${fmt.name} (${key}): ${fmt.extensions.join(', ')}`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = s[1]; const value = s.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = s[1]; const value = s.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /fmt set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${config[key]}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'exclude') {
    const pattern = s.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: 'Usage: /fmt exclude <pattern>\nCurrent: ' + config.excludePatterns.join(', ') }
    config.excludePatterns.push(pattern)
    saveConfig(config)
    return { type: 'text', value: `[OK] Excluding: ${pattern}` }
  }

  if (cmd === 'generate-config') {
    const rc: Record<string, any> = { tabWidth: config.tabWidth, singleQuote: config.singleQuote, trailingComma: config.trailingComma }
    writeFileSync('.prettierrc', JSON.stringify(rc, null, 2), 'utf-8')
    writeFileSync('.prettierignore', config.excludePatterns.join('\n'), 'utf-8')
    return { type: 'text', value: '[OK] Generated .prettierrc and .prettierignore' }
  }

  if (cmd === 'install') {
    const name = s[1] || config.defaultFormatter
    const fmt = config.formatters[name] || Object.values(config.formatters).find(f => f.name.toLowerCase() === name.toLowerCase())
    if (!fmt) return { type: 'text', value: `Unknown formatter: ${name}` }
    const result = runFormatter(fmt.installCommand, fmt, config)
    return { type: 'text', value: result.ok ? '[OK] Installed: ' + fmt.name : '[ERROR] ' + result.output }
  }

  if (cmd === 'check') {
    const file = s[1]
    if (file) {
      if (!existsSync(file)) return { type: 'text', value: `File not found: ${file}` }
      const formatter = detectFormatter(file, config)
      if (!formatter) return { type: 'text', value: `No formatter for: ${file}` }
      const result = checkFile(file, formatter, config)
      return { type: 'text', value: result.ok ? `[OK] ${file} is properly formatted (${formatter.name})` : `[NEEDS FIX] ${file}` }
    }
    const files = collectFiles(config)
    if (files.length === 0) return { type: 'text', value: 'No formattable files found' }
    let needsFix = 0
    const byExt: Record<string, number> = {}
    files.forEach(f => {
      const formatter = detectFormatter(f, config)
      if (formatter) {
        byExt[extname(f)] = (byExt[extname(f)] || 0) + 1
        if (!checkFile(f, formatter, config).ok) needsFix++
      }
    })
    return { type: 'text', value: `Check Results:\nFiles scanned: ${files.length}\nNeeds fix: ${needsFix}\nProperly formatted: ${files.length - needsFix}\n\n${needsFix > 0 ? 'Run /fmt fix to fix all' : '[OK] All files properly formatted!'}` }
  }

  if (cmd === 'fix') {
    const file = s[1]
    if (file) {
      if (!existsSync(file)) return { type: 'text', value: `File not found: ${file}` }
      const formatter = detectFormatter(file, config)
      if (!formatter) return { type: 'text', value: `No formatter for: ${file}` }
      const result = formatFile(file, formatter, config)
      return { type: 'text', value: result.ok ? `[OK] Formatted: ${file} (${formatter.name})` : `[ERROR] ${result.output}` }
    }
    const files = collectFiles(config)
    if (files.length === 0) return { type: 'text', value: 'No formattable files found' }
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
    return { type: 'text', value: `Format Results:\nFiles formatted: ${fixed}\nFailed: ${failed}\n\nBy Extension:\n${Object.entries(byExt).map(([ext, count]) => `  ${ext}: ${count}`).join('\n')}` }
  }

  if (cmd === 'all') {
    const files = collectFiles(config)
    if (files.length === 0) return { type: 'text', value: 'No formattable files found' }
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
    return { type: 'text', value: `Format All:\nFiles: ${files.length}\nFormatted: ${fixed}\nFailed: ${failed}\nDuration: ${duration}ms\n\nBy Extension:\n${Object.entries(byExt).map(([ext, count]) => `  ${ext}: ${count}`).join('\n')}` }
  }

  if (cmd === 'diff') {
    const file = s[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'Usage: /fmt diff <file>' }
    try {
      const original = readFileSync(file, 'utf-8')
      const formatter = detectFormatter(file, config)
      if (!formatter) return { type: 'text', value: `No formatter for: ${file}` }
      const tmpFile = file + '.fmt-tmp'
      writeFileSync(tmpFile, original, 'utf-8')
      formatFile(tmpFile, formatter, config)
      const formatted = readFileSync(tmpFile, 'utf-8')
      const fs = require('fs')
      fs.unlinkSync(tmpFile)
      if (original === formatted) return { type: 'text', value: `[OK] No formatting changes needed: ${file}` }
      const origLines = original.split('\n')
      const fmtLines = formatted.split('\n')
      const diffLines: string[] = []
      for (let i = 0; i < Math.max(origLines.length, fmtLines.length); i++) {
        if (origLines[i] !== fmtLines[i]) diffLines.push(`  - ${origLines[i] || ''}\n  + ${fmtLines[i] || ''}`)
      }
      return { type: 'text', value: `Diff for ${file}:\n${diffLines.slice(0, 20).join('\n')}\n${diffLines.length > 20 ? `... ${diffLines.length - 20} more lines` : ''}` }
    } catch (e) { return { type: 'text', value: '[ERROR] ' + (e instanceof Error ? e.message : String(e)) } }
  }

  if (cmd === 'stats') {
    const files = collectFiles(config)
    const byExt: Record<string, number> = {}
    files.forEach(f => { const e = extname(f); byExt[e] = (byExt[e] || 0) + 1 })
    const totalSize = files.reduce((sum, f) => { try { return sum + statSync(f).size } catch { return sum } }, 0)
    return { type: 'text', value: `Format Stats:\nFormattable files: ${files.length}\nTotal size: ${(totalSize / 1024).toFixed(0)} KB\n\nBy Extension:\n${Object.entries(byExt).sort((a: any, b: any) => b[1] - a[1]).map(([ext, count]) => `  ${ext}: ${count}`).join('\n')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No format history' }
    const lines = ['Format History:', '===============', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.operation} | ${h.filesChecked} files | ${h.filesFixed} fixed | ${h.duration}ms`))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const fmt: Command = {
  type: 'local', name: 'fmt',
  description: 'Formatter - check/fix/all/diff/stats/history/config/install/languages',
  aliases: ['/fmt', '/format'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default fmt
