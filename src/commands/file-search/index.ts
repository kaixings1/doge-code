import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import iconv from 'iconv-lite'

interface SearchResult { file: string; line: number; text: string; context: string[] }

const ENCODINGS = ['utf-8', 'gbk', 'utf-16le', 'windows-1252', 'latin1'] as const

function searchInFile(pattern: string, file: string, context = 0): SearchResult[] {
  const results: SearchResult[] = []
  if (!existsSync(file)) return results
  try {
    const raw = readFileSync(file)

    const utf8Content = iconv.decode(raw, 'utf-8')
    const replacementRatio = (utf8Content.match(/\ufffd/g) || []).length / Math.max(utf8Content.length, 1)
    const encodingsToTry: readonly string[] = replacementRatio > 0.01
      ? ENCODINGS
      : ['utf-8']

    for (const enc of encodingsToTry) {
      let content: string
      try {
        content = enc === 'utf-8' ? utf8Content : iconv.decode(raw, enc)
      } catch {
        continue
      }

      const matches: SearchResult[] = []
      const regex = new RegExp(pattern, 'gi')
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        if (regex.test(line)) {
          const ctx = []
          for (let c = Math.max(0, i - context); c <= Math.min(lines.length - 1, i + context); c++) {
            if (c !== i) ctx.push('  ' + (c + 1) + ': ' + lines[c])
          }
          matches.push({ file, line: i + 1, text: line.trim(), context: ctx })
        }
        regex.lastIndex = 0
      })

      if (matches.length > 0) {
        return matches
      }
    }
  } catch { /* ignore */ }
  return results
}

function searchInDir(pattern: string, dir: string, exts: string[], context = 0): SearchResult[] {
  const results: SearchResult[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
      const fp = join(dir, entry.name)
      if (entry.isDirectory()) results.push(...searchInDir(pattern, fp, exts, context))
      else if (entry.isFile() && (exts.length === 0 || exts.includes(extname(entry.name)))) {
        results.push(...searchInFile(pattern, fp, context))
      }
    }
  } catch { /* ignore */ }
  return results
}

function countFiles(dir: string): number {
  let n = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
      if (entry.isDirectory()) n += countFiles(join(dir, entry.name))
      else n += 1
    }
  } catch { /* ignore */ }
  return n
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🔍 文件搜索', '', '📖 用法：', '  /file-search <模式>             在所有文件中搜索', '  /file-search <模式> <文件>      在指定文件中搜索', '  /file-search <模式> --ext .ts   在 .ts 文件中搜索', '  /file-search <模式> -C 2        显示 2 行上下文', '  /file-search count <模式>       统计匹配数', '  /file-search files <模式>       列出含匹配的文件', '  /file-search replace <原> <新>   预览替换', '  /file-search grep <模式>        同 search，列出文件:行号', '  /file-search stats              项目文件数', ''].join('\n') }

  if (cmd === 'count') {
    const pattern = parts[1]
    if (!pattern) return { type: 'text', value: '📖 用法：/file-search count <模式>' }
    const results = searchInDir(pattern, '.'.split(',').length ? '.' : '.', [])
    const byFile: Record<string, number> = {}
    results.forEach(r => { byFile[r.file] = (byFile[r.file] || 0) + 1 })
    const lines = ['📊 匹配统计：' + pattern, '总计：' + results.length, '']
    Object.entries(byFile).sort((a: any, b: any) => b[1] - a[1]).slice(0, 20).forEach(([f, c]) => lines.push('  ' + f + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'files') {
    const pattern = parts[1]
    if (!pattern) return { type: 'text', value: '📖 用法：/file-search files <模式>' }
    const results = searchInDir(pattern, '.', [])
    const files = [...new Set(results.map(r => r.file))]
    if (files.length === 0) return { type: 'text', value: 'ℹ️ 未找到匹配' }
    return { type: 'text', value: '📁 含匹配的文件（' + files.length + '）：\n' + files.join('\n') }
  }

  if (cmd === 'replace') {
    const pattern = parts[1]; const replacement = parts[2]
    if (!pattern || !replacement) return { type: 'text', value: '📖 用法：/file-search replace <模式> <替换>' }
    const results = searchInDir(pattern, '.', [])
    if (results.length === 0) return { type: 'text', value: 'ℹ️ 未找到匹配' }
    const lines = ['🔄 替换预览：' + pattern + ' → ' + replacement, '匹配数：' + results.length, '']
    results.slice(0, 15).forEach(r => {
      lines.push(r.file + ':' + r.line)
      lines.push('  - ' + r.text)
      lines.push('  + ' + r.text.replace(new RegExp(pattern, 'gi'), replacement))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'grep' || cmd === 'ripgrep' || cmd === 'rg') {
    const pattern = parts.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: '📖 用法：/file-search grep <模式>' }
    const results = searchInDir(pattern, '.', []).slice(0, 50)
    if (results.length === 0) return { type: 'text', value: 'ℹ️ 未找到匹配' }
    const lines = ['🔍 ' + pattern + '（' + results.length + ' 个匹配）', '']
    results.forEach(r => lines.push(r.file + ':' + r.line + ' - ' + r.text.slice(0, 80)))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'stats') {
    return { type: 'text', value: '📊 项目文件数：' + countFiles('.') }
  }

  // Default: search
  if (cmd === 'search' || cmd === 'find') {
    const pattern = parts.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: '📖 用法：/file-search <模式>' }
    const context = parseInt(parts.find(p => p.startsWith('-C'))?.slice(2) || '0')
    const extIdx = parts.indexOf('--ext')
    const exts = extIdx >= 0 ? [parts[extIdx + 1]] : []
    const results = searchInDir(pattern, '.', exts, context).slice(0, 50)
    if (results.length === 0) return { type: 'text', value: 'ℹ️ 未找到匹配：' + pattern }
    const lines = ['🔍 搜索：' + pattern + '（' + results.length + ' 个匹配）', '════════════════════════════════════', '']
    results.forEach(r => {
      lines.push(r.file + ':' + r.line + ' - ' + r.text.slice(0, 80))
      r.context.forEach(c => lines.push(c))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  // If cmd is the pattern itself
  const pattern = s
  if (pattern) {
    const results = searchInDir(pattern, '.', [], 1).slice(0, 30)
    if (results.length === 0) return { type: 'text', value: 'ℹ️ 未找到匹配：' + pattern }
    const lines = ['🔍 搜索：' + pattern + '（' + results.length + ' 个匹配）', '════════════════════════════════════', '']
    results.forEach(r => {
      lines.push(r.file + ':' + r.line + ' - ' + r.text.slice(0, 80))
      r.context.forEach(c => lines.push(c))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const fileSearch: Command = {
  type: 'local', name: 'file-search',
  description: '🔍 文件搜索 - 正则/搜索/统计/文件/替换/grep/rg/上下文',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default fileSearch
