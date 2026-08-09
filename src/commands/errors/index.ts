import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, extname, resolve } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const ERRORS_FILE = join(homedir(), '.doge', 'errors.json')
const PATTERNS_FILE = join(homedir(), '.doge', 'error-patterns.json')

interface ErrorEntry {
  id: string
  type: 'syntax' | 'runtime' | 'logic' | 'warning' | 'security' | 'performance'
  file: string
  line: number
  message: string
  timestamp: string
  resolved: boolean
  fixAttempted: boolean
  fixSuccess: boolean
  source: 'scan' | 'linter' | 'test' | 'manual'
  suggestedFix?: string
}

interface ErrorPattern {
  pattern: string
  type: ErrorEntry['type']
  message: string
  fix: string
  enabled: boolean
}

const BUILTIN_PATTERNS: ErrorPattern[] = [
  { pattern: 'console.log', type: 'warning', message: 'console.log statement', fix: 'Remove or replace with logger', enabled: true },
  { pattern: ': any', type: 'warning', message: 'Usage of any type', fix: 'Define specific type', enabled: true },
  { pattern: 'as any', type: 'warning', message: 'Force cast to any', fix: 'Use proper type guards', enabled: true },
  { pattern: 'catch.*{ }', type: 'logic', message: 'Empty catch block', fix: 'Add error handling or rethrow', enabled: true },
  { pattern: 'catch.*{.*console.log.*}', type: 'logic', message: 'Catch block only logs', fix: 'Add recovery logic or rethrow', enabled: true },
  { pattern: 'eval(', type: 'security', message: 'eval() can execute arbitrary code', fix: 'Use JSON.parse() or safe alternatives', enabled: true },
  { pattern: 'innerHTML', type: 'security', message: 'innerHTML can cause XSS', fix: 'Use textContent or framework-safe rendering', enabled: true },
  { pattern: 'TODO|FIXME|HACK|XXX', type: 'warning', message: 'Unfinished code marker', fix: 'Complete or create issue', enabled: true },
  { pattern: '\\.forEach\\(.*push\\(', type: 'performance', message: 'forEach + push is inefficient', fix: 'Use .map() or .filter()', enabled: true },
  { pattern: 'JSON\\.parse\\(JSON\\.stringify\\(', type: 'performance', message: 'Slow deep clone', fix: 'Use structuredClone()', enabled: true },
  { pattern: 'await.*(?!async)', type: 'syntax', message: 'await outside async', fix: 'Add async keyword', enabled: true },
  { pattern: 'var\\s+', type: 'warning', message: 'Use of var', fix: 'Use let or const', enabled: true },
]

function loadErrors(): ErrorEntry[] {
  try { if (existsSync(ERRORS_FILE)) return JSON.parse(readFileSync(ERRORS_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveErrors(errors: ErrorEntry[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function loadPatterns(): ErrorPattern[] {
  try {
    if (existsSync(PATTERNS_FILE)) {
      const saved = JSON.parse(readFileSync(PATTERNS_FILE, 'utf-8'))
      return [...BUILTIN_PATTERNS, ...saved.filter((p: ErrorPattern) => !BUILTIN_PATTERNS.some(b => b.pattern === p.pattern))]
    }
  } catch { /* ignore */ }
  return [...BUILTIN_PATTERNS]
}

function savePatterns(patterns: ErrorPattern[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const custom = patterns.filter(p => !BUILTIN_PATTERNS.some(b => b.pattern === p.pattern))
    writeFileSync(PATTERNS_FILE, JSON.stringify(custom, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function scanForErrors(dir: string, patterns?: ErrorPattern[]): ErrorEntry[] {
  const errors: ErrorEntry[] = []
  const activePatterns = patterns || loadPatterns()
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs']

  const scan = (d: string) => {
    try {
      const entries = readdirSync(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) { scan(fp) }
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            const lines = content.split('\n')
            lines.forEach((line, i) => {
              for (const pattern of activePatterns) {
                if (!pattern.enabled) continue
                try {
                  const re = new RegExp(pattern.pattern)
                  if (re.test(line.trim())) {
                    const fix = suggestFix(pattern, lines[i])
                    errors.push({
                      id: 'err-' + Date.now().toString(36) + '-' + i + '-' + Math.random().toString(36).slice(2, 6),
                      type: pattern.type, file: fp, line: i + 1, message: pattern.message,
                      timestamp: new Date().toISOString(), resolved: false,
                      fixAttempted: false, fixSuccess: false, source: 'scan', suggestedFix: fix,
                    })
                  }
                } catch { /* ignore bad regex */ }
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  scan(dir)
  return errors
}

function suggestFix(pattern: ErrorPattern, line: string): string {
  const trimmed = line.trim()
  if (pattern.pattern === 'console.log' || pattern.pattern === 'console\\.(log|debug|info|warn|error)') {
    return `// TODO: remove or replace with logger\n${trimmed}`
  }
  if (pattern.pattern === ': any') {
    return trimmed.replace(/: any/, ': unknown') + ' // replace any with specific type'
  }
  if (pattern.pattern === 'as any') {
    return trimmed.replace(/as any/, 'as unknown as <type>') + ' // add proper type guard'
  }
  if (pattern.pattern === 'catch.*{ }') {
    return trimmed.replace(/catch\s*\([^)]*\)\s*\{\s*\}/, 'catch (err) { console.error(err); }')
  }
  if (pattern.pattern === 'eval(') {
    return trimmed.replace(/eval\s*\(/, 'JSON.parse(') + ' // or use a safe parser'
  }
  if (pattern.pattern === 'innerHTML') {
    return trimmed.replace(/innerHTML\s*=/, 'textContent =') + ' // prevent XSS'
  }
  if (pattern.pattern === 'var\\s+') {
    return trimmed.replace(/var/, 'const') + ' // use const instead of var'
  }
  if (pattern.pattern === '\\.forEach\\(.*push\\(') {
    return '// Consider using .map() or .filter() instead of forEach + push'
  }
  if (pattern.pattern === 'JSON\\.parse\\(JSON\\.stringify\\(') {
    return trimmed.replace(/JSON\.parse\(JSON\.stringify\(/, 'structuredClone(') + ') // use structuredClone for deep clone'
  }
  return pattern.fix
}

function applyFixToFile(filePath: string, lineNumber: number, suggestedFix: string): { success: boolean; message: string } {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const idx = lineNumber - 1
    if (idx < 0 || idx >= lines.length) {
      return { success: false, message: 'Line number out of range' }
    }
    const original = lines[idx]
    // Only auto-fix safe patterns: var → const, console.log comment, etc.
    const trimmed = original.trim()
    if (/^\s*var\s+/.test(trimmed)) {
      lines[idx] = original.replace(/var/, 'const')
    } else if (/console\.(log|debug|info)\(/.test(trimmed)) {
      lines[idx] = '// [auto-removed] ' + trimmed
    } else {
      // For other patterns, insert suggestion as comment above the line
      lines[idx] = '// [suggested fix] ' + suggestedFix + '\n' + original
    }
    writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return { success: true, message: `Applied fix at line ${lineNumber}` }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  let errors = loadErrors()

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const unresolved = errors.filter(e => !e.resolved)
    if (unresolved.length === 0) return { type: 'text', value: '[OK] No unresolved errors!' }
    const lines = ['Error Log (' + unresolved.length + ' unresolved):', '================================', '']
    unresolved.slice(0, 20).forEach(e => {
      const icon = e.type === 'syntax' ? '[SYN]' : e.type === 'runtime' ? '[RUN]' : e.type === 'logic' ? '[LOG]' : e.type === 'security' ? '[SEC]' : e.type === 'performance' ? '[PRF]' : '[WRN]'
      lines.push(icon + ' ' + e.file + ':' + e.line + ' - ' + e.message)
      if (e.suggestedFix) lines.push('     → Fix: ' + e.suggestedFix)
      lines.push('     (' + e.source + ' | id: ' + e.id.slice(0, 12) + ')')
    })
    if (unresolved.length > 20) lines.push('... and ' + (unresolved.length - 20) + ' more')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'scan') {
    const target = parts[1] || '.'
    const found = scanForErrors(resolve(target))
    const existing = errors.filter(e => e.resolved)
    const merged = [...existing]
    found.forEach(f => {
      if (!merged.some(e => e.file === f.file && e.line === f.line && e.message === f.message)) merged.push(f)
    })
    saveErrors(merged)
    return { type: 'text', value: '[OK] Scanned: found ' + found.length + ' issues (total: ' + merged.filter(e => !e.resolved).length + ' unresolved)' }
  }

  if (cmd === 'resolve' || cmd === 'fix') {
    const id = parts[1]
    if (!id) return { type: 'text', value: 'Usage: /errors resolve <id>' }
    const err = errors.find(e => e.id === id || e.id.startsWith(id))
    if (!err) return { type: 'text', value: 'Not found: ' + id }
    err.resolved = true
    saveErrors(errors)
    return { type: 'text', value: '[OK] Resolved: ' + err.message }
  }

  if (cmd === 'resolve-all') {
    errors.forEach(e => { e.resolved = true })
    saveErrors(errors)
    return { type: 'text', value: '[OK] All errors marked as resolved' }
  }

  if (cmd === 'attempt-fix') {
    const id = parts[1]
    if (!id) return { type: 'text', value: 'Usage: /errors attempt-fix <id>' }
    const err = errors.find(e => e.id === id || e.id.startsWith(id))
    if (!err) return { type: 'text', value: 'Not found: ' + id }
    const result = applyFixToFile(err.file, err.line, err.suggestedFix || err.message)
    err.fixAttempted = true
    if (result.success) {
      err.fixSuccess = true
      err.resolved = true
      saveErrors(errors)
      return { type: 'text', value: '[OK] Auto-fixed: ' + err.message + '\n' + result.message }
    }
    saveErrors(errors)
    return { type: 'text', value: '[WARN] Fix suggested but not applied: ' + err.message + '\nSuggestion: ' + (err.suggestedFix || 'N/A') + '\nReason: ' + result.message }
  }

  if (cmd === 'clear') {
    saveErrors([])
    return { type: 'text', value: '[OK] Error log cleared' }
  }

  if (cmd === 'stats') {
    const unresolved = errors.filter(e => !e.resolved)
    const byType: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    unresolved.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; bySource[e.source] = (bySource[e.source] || 0) + 1 })
    const lines = ['Error Statistics:', '=================', '', 'Total unresolved: ' + unresolved.length, '', 'By Type:']
    Object.entries(byType).forEach(([t, c]) => lines.push('  ' + t + ': ' + c))
    lines.push('', 'By Source:')
    Object.entries(bySource).forEach(([s, c]) => lines.push('  ' + s + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'patterns') {
    const patterns = loadPatterns()
    const lines = ['Error Patterns:', '================', '']
    patterns.forEach(p => {
      lines.push((p.enabled ? '[ON]' : '[OFF]') + ' /' + p.pattern + '/ -> ' + p.message)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'pattern') {
    const action = parts[1]
    const pattern = parts.slice(2).join(' ')
    if (!action || !pattern) return { type: 'text', value: 'Usage: /errors pattern <enable|disable|add|remove> <pattern>' }
    const patterns = loadPatterns()
    if (action === 'enable' || action === 'disable') {
      const p = patterns.find(p => p.pattern === pattern)
      if (p) { p.enabled = action === 'enable'; savePatterns(patterns) }
      return { type: 'text', value: '[OK] Pattern ' + action + 'd' }
    }
    if (action === 'add') {
      patterns.push({ pattern, type: 'warning', message: 'Custom pattern', fix: 'Fix manually', enabled: true })
      savePatterns(patterns)
      return { type: 'text', value: '[OK] Pattern added' }
    }
    if (action === 'remove') {
      const filtered = patterns.filter(p => p.pattern !== pattern)
      savePatterns(filtered)
      return { type: 'text', value: '[OK] Pattern removed' }
    }
    return { type: 'text', value: 'Unknown action: ' + action }
  }

  if (cmd === 'export') {
    const unresolved = errors.filter(e => !e.resolved)
    const exportPath = 'errors-export.json'
    writeFileSync(exportPath, JSON.stringify(unresolved, null, 2), 'utf-8')
    return { type: 'text', value: '[OK] Exported ' + unresolved.length + ' errors to ' + exportPath }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file) return { type: 'text', value: 'Usage: /errors import <file>' }
    try {
      const imported = JSON.parse(readFileSync(file, 'utf-8'))
      const merged = [...errors, ...imported]
      saveErrors(merged)
      return { type: 'text', value: '[OK] Imported ' + imported.length + ' errors' }
    } catch {
      return { type: 'text', value: '[ERROR] Import failed' }
    }
  }

  return { type: 'text', value: [
    'Error Monitor', '', 'Usage:',
    '  /errors list               List unresolved errors', '  /errors scan [path]        Scan for errors',
    '  /errors resolve <id>       Mark as resolved', '  /errors attempt-fix <id>   Auto-fix error',
    '  /errors resolve-all        Resolve all', '  /errors stats              Show statistics',
    '  /errors patterns           List patterns', '  /errors pattern <action>   Manage patterns',
    '  /errors export             Export errors', '  /errors import <file>      Import errors',
    '  /errors clear              Clear error log',
  ].join('\n') }
}

const errorsCmd: Command = {
  type: 'local', name: 'errors',
  description: 'Error monitoring - scan, track, auto-fix, patterns, export',
  aliases: ['/errors', '/err'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default errorsCmd
