import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'duplicate')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface DuplicateBlock {
  id: string
  file1: string
  file2: string
  line1: number
  line2: number
  content: string
  length: number
  similarity: number
}

interface DuplicateConfig {
  minBlockLines: number
  minBlockChars: number
  minSimilarity: number
  excludePatterns: string[]
  includeFiles: string[]
  maxResults: number
}

interface DuplicateRecord {
  date: string
  totalBlocks: number
  filesWithDuplicates: number
  estimatedDuplication: number
  status: string
}

const DEFAULT_CONFIG: DuplicateConfig = {
  minBlockLines: 4,
  minBlockChars: 60,
  minSimilarity: 0.9,
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '**/*.min.js', '**/*.test.*', '**/*.spec.*'],
  includeFiles: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.css', '.scss'],
  maxResults: 50,
}

function loadConfig(): DuplicateConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: DuplicateConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): DuplicateRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: DuplicateRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function collectFiles(config: DuplicateConfig): string[] {
  const files: string[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
        const fp = join(d, entry.name)
        const relative = fp.replace(/\\/g, '/')
        if (config.excludePatterns.some(p => relative.includes(p.replace('**/', '')))) continue
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && config.includeFiles.includes(extname(entry.name))) files.push(fp)
      }
    } catch { /* ignore */ }
  }
  scan('.')
  return files
}

function normalizeCode(content: string): string[] {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('import ') && !l.startsWith('export {') && !l.startsWith('from '))
}

function similarity(a: string, b: string): number {
  if (a === b) return 1
  const wordsA = a.split(/\W+/).filter(Boolean)
  const wordsB = b.split(/\W+/).filter(Boolean)
  if (wordsA.length === 0 || wordsB.length === 0) return 0
  const setA = new Set(wordsA)
  const common = wordsB.filter(w => setA.has(w)).length
  return common / Math.max(wordsA.length, wordsB.length)
}

function findDuplicates(files: string[], config: DuplicateConfig): DuplicateBlock[] {
  const blocks: DuplicateBlock[] = []
  const fileContent: Array<{ file: string; lines: string[] }> = []
  files.forEach(f => {
    try { fileContent.push({ file: f, lines: normalizeCode(readFileSync(f, 'utf-8')) }) } catch { /* ignore */ }
  })

  const seen = new Set<string>()
  for (let i = 0; i < fileContent.length; i++) {
    for (let j = i + 1; j < fileContent.length; j++) {
      const a = fileContent[i]
      const b = fileContent[j]
      // Compare windows
      for (let ai = 0; ai < a.lines.length - config.minBlockLines + 1; ai++) {
        for (let bj = 0; bj < b.lines.length - config.minBlockLines + 1; bj++) {
          const windowLen = Math.min(config.minBlockLines + 4, Math.max(config.minBlockLines, Math.min(a.lines.length - ai, b.lines.length - bj)))
          const windowA = a.lines.slice(ai, ai + windowLen)
          const windowB = b.lines.slice(bj, bj + windowLen)
          const sim = similarity(windowA.join('\n'), windowB.join('\n'))
          const charLen = windowA.join('\n').length
          if (sim >= config.minSimilarity && charLen >= config.minBlockChars) {
            const id = a.file + '|' + b.file + '|' + ai + '|' + bj
            if (!seen.has(id)) {
              seen.add(id)
              blocks.push({
                id, file1: a.file, file2: b.file, line1: ai + 1, line2: bj + 1,
                content: windowA.slice(0, 6).join('\n'), length: windowLen, similarity: Math.round(sim * 100),
              })
            }
          }
        }
      }
    }
  }
  return blocks.slice(0, config.maxResults)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🔍 重复代码检测器', '', '📖 用法：', '  /duplicate                      查找重复代码', '  /duplicate list                 列出重复代码块', '  /duplicate files                包含重复代码的文件', '  /duplicate ratio                 重复率', '  /duplicate config                查看/编辑配置', '  /duplicate set <键> <值>         设置配置值', '  /duplicate history               扫描历史', '  /duplicate export [文件]         导出报告', '  /duplicate tips                  修复策略', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知配置：${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/duplicate set <键> <值>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}。可用键：${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'ℹ️ 无扫描历史。请先运行 /duplicate。' }
    const lines = ['📅 扫描历史：', '══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.totalBlocks} blocks | ${h.filesWithDuplicates} files | ${h.estimatedDuplication}% duplication`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tips') {
    return { type: 'text', value: ['💡 修复策略：', '════════════════', '', '1. 将共享逻辑提取为工具函数', '2. 为相似类创建基类', '3. 使用组合而非复制', '4. 提取共享组件', '5. 使用混入/装饰器处理横切关注点', '6. 将常量移至共享常量文件', '7. 使用模板/泛型遵循 DRY 原则'].join('\n') }
  }

  const files = collectFiles(config)
  const blocks = findDuplicates(files, config)

  if (cmd === 'files') {
    if (blocks.length === 0) return { type: 'text', value: '✅ 未找到重复代码' }
    const byFile: Record<string, number> = {}
    blocks.forEach(b => { byFile[b.file1] = (byFile[b.file1] || 0) + 1; byFile[b.file2] = (byFile[b.file2] || 0) + 1 })
    const lines = ['📁 包含重复代码的文件（' + Object.keys(byFile).length + '）：', '═══════════════════════════', '']
    Object.entries(byFile).sort((a: any, b: any) => b[1] - a[1]).forEach(([file, count]) => lines.push(`  ${file}: ${count}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'ratio') {
    let dupLines = 0
    blocks.forEach(b => { dupLines += b.length })
    const totalFiles = files.length
    const ratio = Math.round((dupLines / (totalFiles * 50 + 1)) * 100)
    const grade = ratio < 3 ? 'A' : ratio < 5 ? 'B' : ratio < 10 ? 'C' : 'D'
    return { type: 'text', value: `📊 重复率：\n重复块：${blocks.length}\n扫描文件：${totalFiles}\n估计重复率：${ratio}%\n评级：${grade}\n\n${ratio < 3 ? '✅ 重复率低' : ratio < 5 ? 'ℹ️ 可接受' : '⚠️ 建议重构'}` }
  }

  if (cmd === 'list' || cmd === '') {
    if (blocks.length === 0) {
      saveHistory({ date: new Date().toISOString(), totalBlocks: 0, filesWithDuplicates: 0, estimatedDuplication: 0, status: 'CLEAN' })
      return { type: 'text', value: '✅ 未找到重复代码！' }
    }
    saveHistory({ date: new Date().toISOString(), totalBlocks: blocks.length, filesWithDuplicates: new Set(blocks.flatMap(b => [b.file1, b.file2])).size, estimatedDuplication: Math.round(blocks.reduce((s, b) => s + b.length, 0) / (files.length || 1)), status: 'DUPLICATES' })
    const lines = ['🔁 重复代码块（' + blocks.length + '）：', '══════════════════════════', '']
    blocks.slice(0, 30).forEach((b, i) => {
      lines.push(`  ${i + 1}. ${b.file1}:${b.line1} ↔ ${b.file2}:${b.line2}`)
      lines.push(`     相似度：${b.similarity}%，行数：${b.length}`)
      lines.push(`     ${b.content.split('\n')[0].slice(0, 60)}`)
    })
    lines.push('', '操作：', '  /duplicate files - 涉及的文件', '  /duplicate ratio - 重复百分比', '  /duplicate tips  - 修复策略')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const file = parts[1] || 'duplicates-report.json'
    writeFileSync(file, JSON.stringify({ config, blocks, scanned: files.length }, null, 2), 'utf-8')
    return { type: 'text', value: `✅ [OK] 已导出：${file}` }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const duplicate: Command = {
  type: 'local', name: 'duplicate',
  description: '重复代码检测 - 列表/文件/比例/配置/历史/导出/建议',
  aliases: ['/duplicate', '/dup'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default duplicate
