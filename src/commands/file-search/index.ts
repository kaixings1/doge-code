import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

interface SearchResult { file: string; line: number; text: string; context: string[] }

function searchInFile(pattern: string, file: string, context = 0): SearchResult[] {
  const results: SearchResult[] = []
  if (!existsSync(file)) return results
  try {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    const regex = new RegExp(pattern, 'gi')
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        const ctx = []
        for (let c = Math.max(0, i - context); c <= Math.min(lines.length - 1, i + context); c++) {
          if (c !== i) ctx.push('  ' + (c + 1) + ': ' + lines[c])
        }
        results.push({ file, line: i + 1, text: line.trim(), context: ctx })
      }
      regex.lastIndex = 0
    })
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

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['File Search', '', 'Usage:', '  /file-search <pattern>           Search in all files', '  /file-search <pattern> <file>    Search in specific file', '  /file-search <pattern> --ext .ts  Search in .ts files', '  /file-search <pattern> -C 2     Show 2 lines context', '  /file-search count <pattern>     Count matches', '  /file-search files <pattern>     List files with matches', '  /file-search replace <pat> <rep> Preview replace', '  /file-search grep <pattern>      Use grep (faster)', '  /file-search ripgrep <pattern>   Use ripgrep (fastest)', '  /file-search stats               Search statistics', ''].join('\n') }

  if (cmd === 'count') {
    const pattern = parts[1]
    if (!pattern) return { type: 'text', value: 'Usage: /file-search count <pattern>' }
    const results = searchInDir(pattern, '.'.split(',').length ? '.' : '.', [])
    const byFile: Record<string, number> = {}
    results.forEach(r => { byFile[r.file] = (byFile[r.file] || 0) + 1 })
    const lines = ['Match Count: ' + pattern, 'Total: ' + results.length, '']
    Object.entries(byFile).sort((a: any, b: any) => b[1] - a[1]).slice(0, 20).forEach(([f, c]) => lines.push('  ' + f + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'files') {
    const pattern = parts[1]
    if (!pattern) return { type: 'text', value: 'Usage: /file-search files <pattern>' }
    const results = searchInDir(pattern, '.', [])
    const files = [...new Set(results.map(r => r.file))]
    if (files.length === 0) return { type: 'text', value: 'No matches found' }
    return { type: 'text', value: 'Files with matches (' + files.length + '):\n' + files.join('\n') }
  }

  if (cmd === 'replace') {
    const pattern = parts[1]; const replacement = parts[2]
    if (!pattern || !replacement) return { type: 'text', value: 'Usage: /file-search replace <pattern> <replacement>' }
    const results = searchInDir(pattern, '.', [])
    if (results.length === 0) return { type: 'text', value: 'No matches found' }
    const lines = ['Replace Preview: ' + pattern + ' -> ' + replacement, 'Matches: ' + results.length, '']
    results.slice(0, 15).forEach(r => {
      lines.push(r.file + ':' + r.line)
      lines.push('  - ' + r.text)
      lines.push('  + ' + r.text.replace(new RegExp(pattern, 'gi'), replacement))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'grep') {
    const pattern = parts.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: 'Usage: /file-search grep <pattern>' }
    try {
      const output = execSync('rg -n "' + pattern + '" . --max-count 50 2>/dev/null || grep -rn "' + pattern + '" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.java" --include="*.rs" --include="*.md" -l 2>/dev/null | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'No matches found' }
    } catch { return { type: 'text', value: 'No matches found' } }
  }

  if (cmd === 'ripgrep' || cmd === 'rg') {
    const pattern = parts.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: 'Usage: /file-search rg <pattern>' }
    try {
      const output = execSync('rg -n "' + pattern + '" . --max-count 50 2>/dev/null || echo "ripgrep not installed"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'No matches found' }
    } catch { return { type: 'text', value: 'No matches found' } }
  }

  if (cmd === 'stats') {
    try {
      const output = execSync('find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | wc -l', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Files in project: ' + output.trim() }
    } catch { return { type: 'text', value: 'Cannot count files' } }
  }

  // Default: search
  if (cmd === 'search' || cmd === 'find') {
    const pattern = parts.slice(1).join(' ')
    if (!pattern) return { type: 'text', value: 'Usage: /file-search <pattern>' }
    const context = parseInt(parts.find(p => p.startsWith('-C'))?.slice(2) || '0')
    const extIdx = parts.indexOf('--ext')
    const exts = extIdx >= 0 ? [parts[extIdx + 1]] : []
    const results = searchInDir(pattern, '.', exts, context).slice(0, 50)
    if (results.length === 0) return { type: 'text', value: 'No matches found for: ' + pattern }
    const lines = ['Search: ' + pattern + ' (' + results.length + ' matches)', '================================', '']
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
    if (results.length === 0) return { type: 'text', value: 'No matches found for: ' + pattern }
    const lines = ['Search: ' + pattern + ' (' + results.length + ' matches)', '================================', '']
    results.forEach(r => {
      lines.push(r.file + ':' + r.line + ' - ' + r.text.slice(0, 80))
      r.context.forEach(c => lines.push(c))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const fileSearch: Command = {
  type: 'local', name: 'file-search',
  description: 'File search - regex/search/count/files/replace/grep/rg/stats/context',
  aliases: '/file-search, /fs, /find, /search'.split(','),
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default fileSearch
