import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'dead-code')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface DeadItem {
  file: string
  line: number
  name: string
  kind: 'export' | 'variable' | 'import' | 'function' | 'class'
  reason: string
}

interface DeadCodeConfig {
  excludePatterns: string[]
  includeTestFiles: boolean
  scanExports: boolean
  scanImports: boolean
  scanVariables: boolean
  minConfidence: 'low' | 'medium' | 'high'
  tools: { tsPrune: boolean; depcheck: boolean; unimported: boolean }
}

interface DeadCodeRecord {
  date: string
  total: number
  byKind: Record<string, number>
  files: number
  toolsUsed: string[]
}

const DEFAULT_CONFIG: DeadCodeConfig = {
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '**/*.min.js', '**/generated/**'],
  includeTestFiles: false,
  scanExports: true,
  scanImports: true,
  scanVariables: true,
  minConfidence: 'medium',
  tools: { tsPrune: true, depcheck: true, unimported: false },
}

function loadConfig(): DeadCodeConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: DeadCodeConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): DeadCodeRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: DeadCodeRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function collectFiles(config: DeadCodeConfig): string[] {
  const files: string[] = []
  const fs = require('fs')
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs']
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
        const fp = join(d, entry.name)
        const relative = fp.replace(/\\/g, '/')
        if (config.excludePatterns.some(p => relative.includes(p.replace('**/', '')))) continue
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          if (!config.includeTestFiles && (entry.name.includes('.test.') || entry.name.includes('.spec.'))) continue
          files.push(fp)
        }
      }
    } catch { /* ignore */ }
  }
  scan('.')
  return files
}

function collectDefinitions(files: string[]): Map<string, { name: string; file: string; line: number; kind: DeadItem['kind'] }> {
  const defs = new Map<string, { name: string; file: string; line: number; kind: DeadItem['kind'] }>()
  files.forEach(file => {
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        const t = line.trim()
        const patterns: Array<[RegExp, DeadItem['kind']]> = [
          [/\bexport\s+(?:async\s+)?function\s+(\w+)/, 'function'],
          [/\bexport\s+const\s+(\w+)\s*[:=]/, 'variable'],
          [/\bexport\s+class\s+(\w+)/, 'class'],
          [/\bexport\s+interface\s+(\w+)/, 'function'],
          [/\bexport\s+type\s+(\w+)/, 'function'],
          [/\bexport\s+enum\s+(\w+)/, 'function'],
          [/\bexport\s+default\s+(?:function\s+)?(\w+)/, 'function'],
          [/\b(?:function|def|func|fn)\s+(\w+)/, 'function'],
          [/\bclass\s+(\w+)/, 'class'],
          [/\bconst\s+(\w+)\s*=\s*(?:async\s*)?\(?[^)]*\)?\s*=>/, 'function'],
          [/\bconst\s+(\w+)\s*[:=]\s*(?!import)/, 'variable'],
        ]
        for (const [pattern, kind] of patterns) {
          const match = t.match(pattern)
          if (match && !t.startsWith('import')) {
            const name = match[1]
            if (!defs.has(name)) defs.set(name, { name, file, line: i + 1, kind })
            break
          }
        }
      })
    } catch { /* ignore */ }
  })
  return defs
}

function countUsages(name: string, files: string[]): { count: number; files: string[] } {
  let count = 0
  const usedFiles = new Set<string>()
  files.forEach(file => {
    try {
      const content = readFileSync(file, 'utf-8')
      const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
      const matches = content.match(regex)
      if (matches) {
        count += matches.length
        usedFiles.add(file)
      }
    } catch { /* ignore */ }
  })
  return { count, files: Array.from(usedFiles) }
}

function staticAnalyze(config: DeadCodeConfig): DeadItem[] {
  const files = collectFiles(config)
  const defs = collectDefinitions(files)
  const items: DeadItem[] = []
  const allDefs = Array.from(defs.entries())
  allDefs.forEach(([name, def]) => {
    if (name === 'default' || name === 'Component' || name === 'Props' || name === 'State') return
    const usage = countUsages(name, files)
    // Definition counts as 1 usage (itself). If only found in its own file once, it's dead.
    const ownFileCount = (() => {
      try { return (readFileSync(def.file, 'utf-8').match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length } catch { return 0 }
    })()
    if (usage.count <= ownFileCount && def.file !== '') {
      items.push({ file: def.file, line: def.line, name, kind: def.kind, reason: 'Defined but not referenced outside its own file' })
    }
  })
  return items.slice(0, 100)
}

function toolAnalyze(config: DeadCodeConfig): DeadItem[] {
  const items: DeadItem[] = []
  if (config.tools.tsPrune) {
    const result = execSync('npx ts-prune 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 })
    result.split('\n').filter(Boolean).forEach(line => {
      const match = line.match(/(.+?):(\d+)\s+-\s+(.+)/)
      if (match) {
        const kind = match[3].includes('default export') ? 'export' : line.includes('used in module') ? 'import' : 'export'
        items.push({ file: match[1], line: parseInt(match[2]), name: match[3].split(' ')[0], kind: kind as DeadItem['kind'], reason: 'Unused export (ts-prune)' })
      }
    })
  }
  if (config.tools.depcheck) {
    const result = execSync('npx depcheck 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 })
    result.split('\n').forEach(line => {
      if (line.includes('Unused dependencies')) {
        line.split(':')[1]?.split(',').map((d: string) => d.trim()).filter(Boolean).forEach((dep: string) => {
          items.push({ file: 'package.json', line: 1, name: dep, kind: 'import', reason: 'Unused dependency (depcheck)' })
        })
      }
    })
  }
  return items.slice(0, 100)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🔍 死代码检测器', '', '📖 用法：', '  /dead-code                      查找死代码（静态+工具）', '  /dead-code static               仅静态分析', '  /dead-code tools                外部工具（ts-prune/depcheck）', '  /dead-code exports              未使用的导出', '  /dead-code imports              未使用的导入/依赖', '  /dead-code functions            未使用的函数', '  /dead-code classes              未使用的类', '  /dead-code files                包含死代码的文件', '  /dead-code stats                统计信息', '  /dead-code history              扫描历史', '  /dead-code config               查看/编辑配置', '  /dead-code set &lt;键&gt; &lt;值&gt;     设置配置值', '  /dead-code export [文件]        导出报告', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知配置：${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/dead-code set <键> <值>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}。可用键：${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'ℹ️ 暂无扫描历史。请先运行 /dead-code。' }
    const lines = ['📅 扫描历史：', '══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.total} items | ${h.files} files | tools: ${h.toolsUsed.join(', ')}`))
    return { type: 'text', value: lines.join('\n') }
  }

  const staticItems = cmd === 'tools' ? [] : staticAnalyze(config)
  const toolItems = cmd === 'static' ? [] : toolAnalyze(config)
  const items = [...staticItems, ...toolItems]

  if (cmd === 'static' || cmd === 'tools') {
    if (items.length === 0) return { type: 'text', value: `✅ ${labels[cmd] || cmd}分析未检测到死代码` }
    const labels: Record<string, string> = { static: '静态分析', tools: '外部工具' }
    const lines = [`🔍 死代码（${labels[cmd] || cmd}，${items.length}）：`, '══════════════════════', '']
    items.slice(0, 30).forEach((i, idx) => lines.push(`${idx + 1}. [${i.kind}] ${i.name} (${i.file}:${i.line})`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'exports' || cmd === 'imports' || cmd === 'functions' || cmd === 'classes') {
    const kindMap: Record<string, DeadItem['kind'][]> = { exports: ['export', 'function', 'class'], imports: ['import'], functions: ['function'], classes: ['class'] }
    const kinds = kindMap[cmd] || []
    const filtered = items.filter(i => kinds.includes(i.kind))
    if (filtered.length === 0) return { type: 'text', value: `✅ 未发现未使用的${cmd}` }
    const labels: Record<string, string> = { exports: '导出', imports: '导入', functions: '函数', classes: '类' }
    const lines = [`🔍 未使用的${labels[cmd] || cmd}（${filtered.length}）：`, '════════════════════════', '']
    filtered.slice(0, 30).forEach((i, idx) => lines.push(`${idx + 1}. ${i.name} (${i.file}:${i.line})`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'files') {
    const byFile: Record<string, number> = {}
    items.forEach(i => { byFile[i.file] = (byFile[i.file] || 0) + 1 })
    if (Object.keys(byFile).length === 0) return { type: 'text', value: '✅ 未发现死代码' }
    const lines = ['📁 包含死代码的文件（' + Object.keys(byFile).length + '）：', '══════════════════════════', '']
    Object.entries(byFile).sort((a: any, b: any) => b[1] - a[1]).forEach(([file, count]) => lines.push(`  ${file}: ${count}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'stats') {
    const byKind: Record<string, number> = {}
    items.forEach(i => { byKind[i.kind] = (byKind[i.kind] || 0) + 1 })
    const byFile = new Set(items.map(i => i.file))
    const lines = ['📊 死代码统计：', '════════════════════', '', '总计：' + items.length, '影响文件数：' + byFile.size, '', '按类型：']
    Object.entries(byKind).sort((a: any, b: any) => b[1] - a[1]).forEach(([k, c]) => lines.push(`  ${k}: ${c}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const file = parts[1] || 'dead-code-report.json'
    writeFileSync(file, JSON.stringify(items, null, 2), 'utf-8')
    return { type: 'text', value: `✅ 已导出：${file}` }
  }

  if (items.length === 0) {
    saveHistory({ date: new Date().toISOString(), total: 0, byKind: {}, files: 0, toolsUsed: ['static', 'tools'] })
    return { type: 'text', value: '✅ 未检测到死代码！\n使用的方法：静态分析 + 外部工具' }
  }

  saveHistory({ date: new Date().toISOString(), total: items.length, byKind: {}, files: new Set(items.map(i => i.file)).size, toolsUsed: ['static', 'tools'] })

  const lines = ['Dead Code Report (' + items.length + '):', '═══════════════════════════', '']
  items.slice(0, 30).forEach((i, idx) => {
    const icon = i.kind === 'export' ? '📤' : i.kind === 'import' ? '📥' : i.kind === 'class' ? '🏷️' : '🔧'
    lines.push(`${icon} ${idx + 1}. [${i.kind}] ${i.name}`)
    lines.push(`   📍 ${i.file}:${i.line}`)
    lines.push(`   ℹ️  ${i.reason}`)
  })
  if (items.length > 30) lines.push(`... 还有 ${items.length - 30} 个`)
  lines.push('', '💡 修复建议：', '  • 删除未使用的导出', '  • 移除未使用的依赖', '  • 考虑使用 tree-shaking 友好模式')
  return { type: 'text', value: lines.join('\n') }
}

const deadCode: Command = {
  type: 'local', name: 'dead-code',
  description: '死代码检测 - 静态/工具/导出/导入/函数/类/统计/历史/导出',
  aliases: ['/dead-code', '/dead', '/unused'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default deadCode
