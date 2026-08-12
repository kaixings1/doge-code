import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const BACKUP_DIR = join(homedir(), '.doge', 'symbol-backups')
const CONFIG_DIR = join(homedir(), '.doge', 'symbol')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface SymbolRef {
  file: string
  line: number
  text: string
  kind: 'definition' | 'reference' | 'import' | 'unknown'
}

interface SymbolConfig {
  caseSensitive: boolean
  wholeWordOnly: boolean
  includeTestFiles: boolean
  excludePatterns: string[]
  autoBackup: boolean
  confirmReplace: boolean
}

const DEFAULT_CONFIG: SymbolConfig = {
  caseSensitive: false,
  wholeWordOnly: true,
  includeTestFiles: false,
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '.next/**', '*.min.js'],
  autoBackup: true,
  confirmReplace: true,
}

function loadConfig(): SymbolConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: SymbolConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesSymbol(line: string, symbol: string, config: SymbolConfig): boolean {
  const flags = config.caseSensitive ? 'g' : 'gi'
  if (config.wholeWordOnly) {
    const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`, flags)
    return regex.test(line)
  }
  return line.toLowerCase().includes(symbol.toLowerCase())
}

function classifyRef(line: string, symbol: string): SymbolRef['kind'] {
  const t = line.trim()
  // Definitions
  if (new RegExp(`\\b(?:export\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+${escapeRegex(symbol)}\\b`).test(t)) return 'definition'
  if (new RegExp(`\\b(def|func|fn)\\s+${escapeRegex(symbol)}\\b`).test(t)) return 'definition'
  if (new RegExp(`\\b(?:import|require).*\\b${escapeRegex(symbol)}\\b`).test(t)) return 'import'
  // References
  if (new RegExp(`\\b${escapeRegex(symbol)}\\s*\\(`).test(t)) return 'reference'
  if (new RegExp(`\\b${escapeRegex(symbol)}\\b`).test(t)) return 'reference'
  return 'unknown'
}

function findSymbol(symbol: string, dir: string, config: SymbolConfig): SymbolRef[] {
  const refs: SymbolRef[] = []
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.c', '.cpp', '.h']
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git' || entry.name === 'coverage') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          const relative = fp.replace(/\\/g, '/')
          if (config.excludePatterns.some(p => relative.includes(p.replace('**/', '')))) continue
          if (!config.includeTestFiles && (entry.name.includes('.test.') || entry.name.includes('.spec.'))) continue
          try {
            const content = readFileSync(fp, 'utf-8')
            content.split('\n').forEach((line, i) => {
              if (matchesSymbol(line, symbol, config)) {
                refs.push({ file: fp, line: i + 1, text: line.trim(), kind: classifyRef(line, symbol) })
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return refs.slice(0, 200)
}

function createBackup(file: string, operation: string): string | null {
  try {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
    const name = basename(file).replace(/\./g, '_') + '-' + operation + '-' + Date.now() + '.bak'
    const backupPath = join(BACKUP_DIR, name)
    copyFileSync(file, backupPath)
    return backupPath
  } catch { return null }
}

function replaceInFile(file: string, oldName: string, newName: string, config: SymbolConfig): { changed: number; backups: string[] } {
  try {
    const content = readFileSync(file, 'utf-8')
    const flags = config.caseSensitive ? 'g' : 'gi'
    const pattern = config.wholeWordOnly ? new RegExp(`\\b${escapeRegex(oldName)}\\b`, flags) : new RegExp(escapeRegex(oldName), flags)
    const updated = content.replace(pattern, newName)
    if (updated !== content) {
      const backups: string[] = []
      if (config.autoBackup) { const bp = createBackup(file, 'rename'); if (bp) backups.push(bp) }
      writeFileSync(file, updated, 'utf-8')
      return { changed: 1, backups }
    }
    return { changed: 0, backups: [] }
  } catch { return { changed: 0, backups: [] } }
}

function getDefinition(refs: SymbolRef[]): SymbolRef | null {
  return refs.find(r => r.kind === 'definition') || null
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Symbol Navigator (Advanced)', '', '📖 📖 Usage: ', '  /symbol find <name>              Find all references', '  /symbol def <name>               Jump to definition', '  /symbol rename <old> <new>       Rename symbol safely', '  /symbol preview <old> <new>      Preview rename changes', '  /symbol extract <file> <s> <e>   Extract to function', '  /symbol inline <name>            Inline variable', '  /symbol usages <name>            Show usages by kind', '  /symbol graph <name>             Symbol usage graph', '  /symbol config                   Show/edit config', '  /symbol set <key> <value>        Set config value', '  /symbol backups                  List backups', '  /symbol restore <file>           Restore from backup', ''].join('\n') }

  if (cmd === 'config') {
    const key = s[1]; const value = s.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${config[key]}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = s[1]; const value = s.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /symbol set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${config[key]}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'def' || cmd === 'definition') {
    const sym = s[1]; if (!sym) return { type: 'text', value: 'Usage: /symbol def <name>' }
    const refs = findSymbol(sym, '.', config)
    const def = getDefinition(refs)
    if (!def) return { type: 'text', value: `No definition found for: ${sym}` }
    return { type: 'text', value: ['Definition: ' + sym, '════════════════', '', `${def.file}:${def.line}`, '', def.text.slice(0, 120), '', 'Usage count: ' + refs.filter(r => r.kind === 'reference').length].join('\n') }
  }

  if (cmd === 'find' || cmd === 'usages') {
    const sym = s[1]; if (!sym) return { type: 'text', value: 'Usage: /symbol ' + cmd + ' <name>' }
    const refs = findSymbol(sym, '.', config)
    if (refs.length === 0) return { type: 'text', value: 'No references found: ' + sym }
    const byKind: Record<string, number> = {}
    refs.forEach(r => { byKind[r.kind] = (byKind[r.kind] || 0) + 1 })
    const lines = ['Symbol: ' + sym + ' (' + refs.length + ' references)', '═════════════════════════════════', '', 'Kinds:', `  Definitions: ${byKind.definition || 0}`, `  References: ${byKind.reference || 0}`, `  Imports: ${byKind.import || 0}`, '', 'Files:']
    const files = new Set(refs.map(r => r.file))
    files.forEach(f => lines.push(`  ${f} (${refs.filter(r => r.file === f).length})`))
    lines.push('', 'References:')
    refs.slice(0, 30).forEach(r => {
      const icon = r.kind === 'definition' ? '📦' : r.kind === 'import' ? '📥' : '🔗'
      lines.push(`${icon} ${r.file}:${r.line} - ${r.text.slice(0, 60)}`)
    })
    if (refs.length > 30) lines.push(`... ${refs.length - 30} more`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'preview') {
    const oldName = s[1]; const newName = s[2]
    if (!oldName || !newName) return { type: 'text', value: 'Usage: /symbol preview <old> <new>' }
    const refs = findSymbol(oldName, '.', config)
    if (refs.length === 0) return { type: 'text', value: 'No references: ' + oldName }
    const files = new Set(refs.map(r => r.file))
    const lines = [`Preview: ${oldName} → ${newName} (${refs.length} refs in ${files.size} files)`, '═══════════════════════════════════════', '']
    refs.slice(0, 20).forEach(r => {
      const updated = config.wholeWordOnly ? r.text.replace(new RegExp(`\\b${escapeRegex(oldName)}\\b`, config.caseSensitive ? 'g' : 'gi'), newName) : r.text.replace(new RegExp(escapeRegex(oldName), config.caseSensitive ? 'g' : 'gi'), newName)
      lines.push(`${r.file}:${r.line}`)
      lines.push(`  - ${r.text.slice(0, 70)}`)
      lines.push(`  + ${updated.slice(0, 70)}`)
    })
    if (refs.length > 20) lines.push(`... ${refs.length - 20} more`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'rename') {
    const oldName = s[1]; const newName = s[2]
    if (!oldName || !newName) return { type: 'text', value: 'Usage: /symbol rename <old> <new>' }
    const refs = findSymbol(oldName, '.', config)
    if (refs.length === 0) return { type: 'text', value: 'No references: ' + oldName }
    let changed = 0
    let backups: string[] = []
    new Set(refs.map(r => r.file)).forEach((f: string) => {
      const result = replaceInFile(f, oldName, newName, config)
      changed += result.changed
      backups.push(...result.backups)
    })
    return { type: 'text', value: `[OK] Renamed ${oldName} → ${newName}\nFiles changed: ${changed}\nRefs replaced: ${refs.length}\nBackups: ${backups.length} (in ${BACKUP_DIR})` }
  }

  if (cmd === 'extract') {
    const file = s[1]; const start = parseInt(s[2]); const end = parseInt(s[3])
    if (!file || !start || !end) return { type: 'text', value: 'Usage: /symbol extract <file> <startLine> <endLine>' }
    try {
      if (!existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      if (start < 1 || end > lines.length) return { type: 'text', value: `Line range ${start}-${end} out of bounds (file has ${lines.length} lines)` }
      const extracted = lines.slice(start - 1, end).join('\n')
      const indent = lines[start - 1].match(/^\s*/)?.[0] || ''
      return { type: 'text', value: ['Extracted lines ' + start + '-' + end + ' from ' + file + ':', '═════════════════════════════════', '', extracted, '', 'Suggested new function:', '──────────────────────', 'function extractedFunction(params) {', extracted.split('\n').map(l => '  ' + l.trim()).join('\n'), '}'].join('\n') }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'inline') {
    const name = s[1]; if (!name) return { type: 'text', value: 'Usage: /symbol inline <name>' }
    const refs = findSymbol(name, '.', config)
    const def = getDefinition(refs)
    if (!def) return { type: 'text', value: `No definition found for: ${name}` }
    const defMatch = def.text.match(/(?:const|let|var)\s+\w+\s*=\s*(.+)$/)
    if (!defMatch) return { type: 'text', value: `Cannot inline: ${name} (not a simple variable assignment)` }
    const value = defMatch[1].replace(/;\s*$/, '')
    return { type: 'text', value: `Inline suggestion for "${name}":\n\nDefinition: ${def.text}\nValue: ${value}\nUsages: ${refs.filter(r => r.kind === 'reference').length}\n\nReplace usages of ${name} with: ${value}` }
  }

  if (cmd === 'graph') {
    const name = s[1]; if (!name) return { type: 'text', value: 'Usage: /symbol graph <name>' }
    const refs = findSymbol(name, '.', config)
    if (refs.length === 0) return { type: 'text', value: 'No references: ' + name }
    const lines = ['Usage Graph: ' + name, '═══════════════', '']
    const byFile: Record<string, number> = {}
    refs.forEach(r => { byFile[r.file] = (byFile[r.file] || 0) + 1 })
    const max = Math.max(...Object.values(byFile), 1)
    Object.entries(byFile).forEach(([file, count]) => {
      const bar = '█'.repeat(Math.round((count / max) * 30))
      lines.push(`  ${bar} ${count} ${file}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'backups') {
    try {
      if (!existsSync(BACKUP_DIR)) return { type: 'text', value: 'No backups' }
      const backups = readdirSync(BACKUP_DIR).sort().reverse().slice(0, 20)
      return { type: 'text', value: 'Backups (' + backups.length + '):\n' + backups.map(b => `  ${b}`).join('\n') + '\n\nLocation: ' + BACKUP_DIR }
    } catch { return { type: 'text', value: 'No backups' } }
  }

  if (cmd === 'restore') {
    const file = s[1]
    if (!file || !existsSync(join(BACKUP_DIR, file))) return { type: 'text', value: 'Usage: /symbol restore <backup-filename>' }
    try {
      const backupPath = join(BACKUP_DIR, file)
      const originalName = file.replace(/-(rename)-\d+\.bak$/, '').replace(/_/g, '.')
      copyFileSync(backupPath, originalName)
      return { type: 'text', value: `[OK] Restored: ${originalName} from ${file}` }
    } catch (err) { return { type: 'text', value: '[ERROR] Restore failed: ' + (err instanceof Error ? err.message : String(err)) } }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const symbol: Command = {
  type: 'local', name: 'symbol',
  description: 'Symbol ops - find/def/rename/preview/extract/inline/usages/graph/backups/restore',
  aliases: ['/symbol', '/sym', '/sr'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default symbol
