import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

interface SymbolRef { file: string; line: number; text: string }

function findSymbol(symbol: string, dir: string): SymbolRef[] {
  const refs: SymbolRef[] = []
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs']
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            content.split('\n').forEach((line, i) => { if (line.includes(symbol)) refs.push({ file: fp, line: i + 1, text: line.trim() }) })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return refs.slice(0, 50)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: [
    'Symbol Rename', '', 'Usage:',
    '  /symbol find <name>              Find all references',
    '  /symbol rename <old> <new>       Rename symbol',
    '  /symbol preview <old> <new>      Preview changes',
    '  /symbol extract <file> <start> <end>  Extract to function',
    '  /symbol inline <name>            Inline variable',
    '  /symbol info <name>              Show symbol info',
    '  /symbol usages <name>            Show all usages',
  ].join('\n') }

  if (cmd === 'find' || cmd === 'usages' || cmd === 'info') {
    const sym = s[1]; if (!sym) return { type: 'text', value: 'Usage: /symbol ' + cmd + ' <name>' }
    const refs = findSymbol(sym, '.')
    if (refs.length === 0) return { type: 'text', value: 'No references found: ' + sym }
    const lines = ['Symbol: ' + sym + ' (' + refs.length + ' references)', '================================', '']
    refs.forEach(r => lines.push(r.file + ':' + r.line + ' - ' + r.text.slice(0, 60)))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'preview') {
    const oldName = s[1]; const newName = s[2]
    if (!oldName || !newName) return { type: 'text', value: 'Usage: /symbol preview <old> <new>' }
    const refs = findSymbol(oldName, '.')
    if (refs.length === 0) return { type: 'text', value: 'No references: ' + oldName }
    const lines = ['Preview: ' + oldName + ' -> ' + newName + ' (' + refs.length + ' refs)', '================================', '']
    refs.slice(0, 15).forEach(r => lines.push(r.file + ':' + r.line + ' - ' + r.text.slice(0, 50)))
    if (refs.length > 15) lines.push('... ' + (refs.length - 15) + ' more')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'rename') {
    const oldName = s[1]; const newName = s[2]
    if (!oldName || !newName) return { type: 'text', value: 'Usage: /symbol rename <old> <new>' }
    const refs = findSymbol(oldName, '.')
    if (refs.length === 0) return { type: 'text', value: 'No references: ' + oldName }
    let changed = 0
    const fs = require('fs')
    new Set(refs.map(r => r.file)).forEach((f: string) => {
      try {
        let content = fs.readFileSync(f, 'utf-8')
        const updated = content.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newName)
        if (updated !== content) { fs.writeFileSync(f, updated, 'utf-8'); changed++ }
      } catch { /* ignore */ }
    })
    return { type: 'text', value: '[OK] Renamed ' + oldName + ' -> ' + newName + ' in ' + changed + ' files (' + refs.length + ' refs)' }
  }

  if (cmd === 'extract') {
    const file = s[1]; const start = parseInt(s[2]); const end = parseInt(s[3])
    if (!file || !start || !end) return { type: 'text', value: 'Usage: /symbol extract <file> <startLine> <endLine>' }
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      const extracted = lines.slice(start - 1, end).join('\n')
      return { type: 'text', value: 'Extracted lines ' + start + '-' + end + ' from ' + file + ':\n\n' + extracted + '\n\nUse this to create a new function.' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'inline') {
    const name = s[1]; if (!name) return { type: 'text', value: 'Usage: /symbol inline <name>' }
    return { type: 'text', value: 'To inline "' + name + '", find its definition and replace usages with the value.' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const symbol: Command = {
  type: 'local', name: 'symbol',
  description: 'Symbol operations - find/rename/preview/extract/inline/usages',
  aliases: ['/symbol', '/sym', '/sr'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default symbol
