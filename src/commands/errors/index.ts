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
    if (unresolved.length === 0) return { type: 'text', value: '✅ 无未解决问题！' }
    const lines = ['⚠️ 错误日志（' + unresolved.length + ' 个未解决）：', '═══════════════════════════════════', '']
    unresolved.slice(0, 20).forEach(e => {
      const icon = e.type === 'syntax' ? '🔤' : e.type === 'runtime' ? '⚡' : e.type === 'logic' ? '🧠' : e.type === 'security' ? '🔒' : e.type === 'performance' ? '⚡' : '⚠️'
      lines.push(icon + ' ' + e.file + ':' + e.line + ' - ' + e.message)
      if (e.suggestedFix) lines.push('     → 💡 修复：' + e.suggestedFix)
      lines.push('     (' + e.source + ' | id: ' + e.id.slice(0, 12) + ')')
    })
    if (unresolved.length > 20) lines.push('... 还有 ' + (unresolved.length - 20) + ' 个')
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
    return { type: 'text', value: '✅ 扫描完成：发现 ' + found.length + ' 个问题（未解决：' + merged.filter(e => !e.resolved).length + '）' }
  }

  if (cmd === 'resolve' || cmd === 'fix') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/errors resolve <id>' }
    const err = errors.find(e => e.id === id || e.id.startsWith(id))
    if (!err) return { type: 'text', value: '❌ 未找到：' + id }
    err.resolved = true
    saveErrors(errors)
    return { type: 'text', value: '✅ 已解决：' + err.message }
  }

  if (cmd === 'resolve-all') {
    errors.forEach(e => { e.resolved = true })
    saveErrors(errors)
    return { type: 'text', value: '✅ 已标记所有错误为已解决' }
  }

  if (cmd === 'attempt-fix') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/errors attempt-fix <id>' }
    const err = errors.find(e => e.id === id || e.id.startsWith(id))
    if (!err) return { type: 'text', value: '❌ 未找到：' + id }
    const result = applyFixToFile(err.file, err.line, err.suggestedFix || err.message)
    err.fixAttempted = true
    if (result.success) {
      err.fixSuccess = true
      err.resolved = true
      saveErrors(errors)
      return { type: 'text', value: '✅ 自动修复：' + err.message + '\n' + result.message }
    }
    saveErrors(errors)
    return { type: 'text', value: '⚠️ 建议修复但未应用：' + err.message + '\n建议：' + (err.suggestedFix || 'N/A') + '\n原因：' + result.message }
  }

  if (cmd === 'clear') {
    saveErrors([])
    return { type: 'text', value: '✅ 错误日志已清空' }
  }

  if (cmd === 'stats') {
    const unresolved = errors.filter(e => !e.resolved)
    const byType: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    unresolved.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; bySource[e.source] = (bySource[e.source] || 0) + 1 })
    const lines = ['📊 错误统计：', '════════════════', '', '未解决总数：' + unresolved.length, '', '按类型：']
    Object.entries(byType).forEach(([t, c]) => lines.push('  ' + t + ': ' + c))
    lines.push('', '按来源：')
    Object.entries(bySource).forEach(([s, c]) => lines.push('  ' + s + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'patterns') {
    const patterns = loadPatterns()
    const lines = ['📋 错误模式：', '════════════════', '']
    patterns.forEach(p => {
      lines.push((p.enabled ? '✅' : '❌') + ' /' + p.pattern + '/ → ' + p.message)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'pattern') {
    const action = parts[1]
    const pattern = parts.slice(2).join(' ')
    if (!action || !pattern) return { type: 'text', value: '📖 用法：/errors pattern <enable|disable|add|remove> <模式>' }
    const patterns = loadPatterns()
    if (action === 'enable' || action === 'disable') {
      const p = patterns.find(p => p.pattern === pattern)
      if (p) { p.enabled = action === 'enable'; savePatterns(patterns) }
      return { type: 'text', value: '✅ 模式已' + (action === 'enable' ? '启用' : '禁用') }
    }
    if (action === 'add') {
      patterns.push({ pattern, type: 'warning', message: '自定义模式', fix: '手动修复', enabled: true })
      savePatterns(patterns)
      return { type: 'text', value: '✅ 模式已添加' }
    }
    if (action === 'remove') {
      const filtered = patterns.filter(p => p.pattern !== pattern)
      savePatterns(filtered)
      return { type: 'text', value: '✅ 模式已移除' }
    }
    return { type: 'text', value: '❌ 未知操作：' + action }
  }

  if (cmd === 'export') {
    const unresolved = errors.filter(e => !e.resolved)
    const exportPath = 'errors-export.json'
    writeFileSync(exportPath, JSON.stringify(unresolved, null, 2), 'utf-8')
    return { type: 'text', value: '✅ 已导出 ' + unresolved.length + ' 个错误到 ' + exportPath }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file) return { type: 'text', value: '📖 用法：/errors import <文件>' }
    try {
      const imported = JSON.parse(readFileSync(file, 'utf-8'))
      const merged = [...errors, ...imported]
      saveErrors(merged)
      return { type: 'text', value: '✅ 已导入 ' + imported.length + ' 个错误' }
    } catch {
      return { type: 'text', value: '❌ 导入失败' }
    }
  }

  return { type: 'text', value: [
    '⚠️ 错误监控', '', '📖 用法：',
    '  /errors list              列出未解决问题', '  /errors scan [路径]       扫描错误',
    '  /errors resolve <id>      标记为已解决', '  /errors attempt-fix <id>  自动修复',
    '  /errors resolve-all       全部解决', '  /errors stats             统计信息',
    '  /errors patterns          列出模式', '  /errors pattern <操作>    管理模式',
    '  /errors export            导出错误', '  /errors import <文件>     导入错误',
    '  /errors clear             清空日志',
  ].join('\n') }
}

const errorsCmd: Command = {
  type: 'local', name: 'errors',
  description: '⚠️ 错误监控 - 扫描/追踪/自动修复/模式/导出',
  aliases: ['/errors', '/err'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default errorsCmd
