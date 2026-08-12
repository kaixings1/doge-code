import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'grep')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface SearchOptions {
  caseInsensitive: boolean
  recursive: boolean
  context: number
  filesOnly: boolean
  count: boolean
  lineNumbers: boolean
  regex: boolean
  includeExts: string[]
  excludePatterns: string[]
  maxResults: number
  followSymlinks: boolean
}

interface SearchResult {
  file: string
  line: number
  text: string
  contextLines: string[]
}

interface SearchRecord {
  date: string
  pattern: string
  results: number
  files: number
  duration: number
}

const DEFAULT_OPTIONS: SearchOptions = {
  caseInsensitive: true,
  recursive: true,
  context: 0,
  filesOnly: false,
  count: false,
  lineNumbers: true,
  regex: false,
  includeExts: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.css', '.html', '.md', '.json', '.yml', '.yaml'],
  excludePatterns: ['node_modules', 'dist', 'build', '.git', 'coverage', '.next'],
  maxResults: 100,
  followSymlinks: false,
}

function loadConfig(): SearchOptions {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_OPTIONS, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_OPTIONS }
}

function saveConfig(config: SearchOptions) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): SearchRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: SearchRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function searchInFile(pattern: RegExp, file: string, options: SearchOptions): SearchResult[] {
  const results: SearchResult[] = []
  try {
    const lines = readFileSync(file, 'utf-8').split('\n')
    lines.forEach((line, i) => {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        const ctx: string[] = []
        if (options.context > 0) {
          for (let c = Math.max(0, i - options.context); c <= Math.min(lines.length - 1, i + options.context); c++) {
            if (c !== i) ctx.push(`${c + 1}: ${lines[c].slice(0, 100)}`)
          }
        }
        results.push({ file, line: i + 1, text: line.trim().slice(0, 150), contextLines: ctx })
      }
    })
  } catch { /* ignore */ }
  return results
}

function searchInDir(pattern: RegExp, dir: string, options: SearchOptions): SearchResult[] {
  const results: SearchResult[] = []
  const fs = require('fs')
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (options.excludePatterns.includes(entry.name)) continue
      const fp = join(dir, entry.name)
      if (entry.isDirectory() && options.recursive) results.push(...searchInDir(pattern, fp, options))
      else if (entry.isFile() && options.includeExts.includes(extname(entry.name))) {
        results.push(...searchInFile(pattern, fp, options))
        if (results.length >= options.maxResults) return results
      }
    }
  } catch { /* ignore */ }
  return results
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Advanced Grep', '', '📖 Usage: ', '  /grep <pattern>                  Search with default config', '  /grep -i <pattern>               Case insensitive (default on)', '  /grep -s <pattern>               Case sensitive', '  /grep -C <N> <pattern>           Show N context lines', '  /grep -l <pattern>               Files only', '  /grep -c <pattern>               Count per file', '  /grep -r <pattern>               Use regex pattern', '  /grep --ext <exts> <pattern>     Filter by extensions', '  /grep config                     Show/edit config', '  /grep set <key> <val>            Set config value', '  /grep history                    Search history', '  /grep stats                      Search statistics', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /grep set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No search history' }
    const lines = ['Search History:', '═══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | "${h.pattern}" | ${h.results} results | ${h.duration}ms`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'stats') {
    const history = loadHistory()
    const totalSearches = history.length
    const totalResults = history.reduce((sum, h) => sum + h.results, 0)
    return { type: 'text', value: `🔍 Search Stats:\nTotal searches: ${totalSearches}\nTotal results: ${totalResults}\nAvg results/search: ${totalSearches ? Math.round(totalResults / totalSearches) : 0}\nRecent pattern: ${history[history.length - 1]?.pattern || 'none'}` }
  }

  // Parse flags
  const options: SearchOptions = { ...config }
  const flagParts = parts.filter(p => p.startsWith('-') || p.startsWith('--'))
  const restParts = parts.filter(p => !p.startsWith('-') && !p.startsWith('--') && p !== cmd)

  if (flagParts.includes('-s')) options.caseInsensitive = false
  if (flagParts.includes('-l')) options.filesOnly = true
  if (flagParts.includes('-c')) options.count = true
  if (flagParts.includes('-r')) options.regex = true
  if (flagParts.includes('-i')) options.caseInsensitive = true
  const ctxIdx = flagParts.indexOf('-C')
  if (ctxIdx >= 0 && flagParts[ctxIdx + 1]) options.context = parseInt(flagParts[ctxIdx + 1]) || 0
  const extIdx = flagParts.indexOf('--ext')
  if (extIdx >= 0 && flagParts[extIdx + 1]) options.includeExts = flagParts[extIdx + 1].split(/[,\s]+/)

  const pattern = restParts.join(' ')
  if (!pattern) return { type: 'text', value: 'Usage: /grep <pattern> [flags]\nFlags: -i, -s, -C <N>, -l, -c, -r, --ext <exts>' }

  const regex = options.regex ? new RegExp(pattern, options.caseInsensitive ? 'gi' : 'g') : new RegExp(escapeRegex(pattern), options.caseInsensitive ? 'gi' : 'g')
  const start = Date.now()
  const results = searchInDir(regex, '.', options)
  const duration = Date.now() - start

  saveHistory({ date: new Date().toISOString(), pattern, results: results.length, files: new Set(results.map(r => r.file)).size, duration })

  if (options.count) {
    const byFile: Record<string, number> = {}
    results.forEach(r => { byFile[r.file] = (byFile[r.file] || 0) + 1 })
    return { type: 'text', value: Object.entries(byFile).map(([f, c]) => `${f}: ${c}`).join('\n') || 'No matches' }
  }

  if (options.filesOnly) {
    const files = [...new Set(results.map(r => r.file))]
    return { type: 'text', value: files.length > 0 ? files.join('\n') : 'No matches' }
  }

  if (results.length === 0) return { type: 'text', value: 'No matches found for: ' + pattern }

  const lines = [`Search: "${pattern}" (${results.length} matches in ${new Set(results.map(r => r.file)).size} files, ${duration}ms)`, '═══════════════════════════════════════', '']
  results.slice(0, 30).forEach(r => {
    lines.push(`${r.file}:${r.line} - ${r.text}`)
    r.contextLines.forEach(c => lines.push(`  ${c}`))
  })
  if (results.length > 30) lines.push(`... ${results.length - 30} more (run with -l for files only)`)
  return { type: 'text', value: lines.join('\n') }
}

const grep: Command = {
  type: 'local', name: 'grep',
  description: 'Grep - search/context/regex/count/files-only/config/history/stats',
  aliases: ['/grep', '/g', '/rg'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default grep
