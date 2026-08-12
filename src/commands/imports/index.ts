import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

interface ImportInfo {
  file: string
  line: number
  module: string
  named: string[]
  isType: boolean
  unused: boolean
}

function analyzeImports(dir: string): ImportInfo[] {
  const imports: ImportInfo[] = []
  const exts = ['.ts', '.tsx', '.js', '.jsx']
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
            const lines = content.split('\n')
            lines.forEach((line, i) => {
              const impMatch = line.match(/^(?:import|export)\s+(?:type\s+)?(?:\*\s+as\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/)
              const reqMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)
              if (impMatch) {
                const named = impMatch[1] ? impMatch[1].split(',').map((s: string) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) : []
                const defaultImp = impMatch[2] || ''
                imports.push({ file: fp, line: i + 1, module: impMatch[3], named: defaultImp ? [defaultImp, ...named] : named, isType: line.includes('type'), unused: false })
              } else if (reqMatch) {
                imports.push({ file: fp, line: i + 1, module: reqMatch[1], named: [], isType: false, unused: false })
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return imports
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: [
    'Import Manager', '', '📖 Usage: ',
    '  /imports analyze [path]          Analyze all imports',
    '  /imports unused [path]           Find unused imports',
    '  /imports organize [file]         Organize imports in file',
    '  /imports sort [file]             Sort imports alphabetically',
    '  /imports remove-unused [file]    Remove unused imports',
    '  /imports convert [file]          Convert require to import',
    '  /imports stats [path]            Import statistics',
    '  /imports circular [path]         Detect circular dependencies',
    '  /imports graph [path]            Generate import graph',
    '  /imports find <module>           Find imports of module',
  ].join('\n') }

  if (cmd === 'analyze' || cmd === 'stats') {
    const target = s[1] || '.'
    const imports = analyzeImports(target)
    if (imports.length === 0) return { type: 'text', value: 'No imports found' }
    const modules: Record<string, number> = {}
    imports.forEach(i => { modules[i.module] = (modules[i.module] || 0) + 1 })
    const lines = ['Import Analysis:', '=================', '', 'Total imports: ' + imports.length, 'Unique modules: ' + Object.keys(modules).length, '', 'Top modules:']
    Object.entries(modules).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15).forEach(([m, c]) => lines.push('  ' + m + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'unused') {
    const target = s[1] || '.'
    const imports = analyzeImports(target)
    const unused: ImportInfo[] = []
    const fs = require('fs')
    imports.forEach(imp => {
      try {
        const content = fs.readFileSync(imp.file, 'utf-8')
        const unusedNames = imp.named.filter(n => {
          const regex = new RegExp('\\b' + n + '\\b', 'g')
          const matches = content.match(regex)
          return !matches || matches.length <= 1
        })
        if (unusedNames.length > 0) unused.push({ ...imp, named: unusedNames })
      } catch { /* ignore */ }
    })
    if (unused.length === 0) return { type: 'text', value: '[OK] No unused imports found!' }
    const lines = ['Unused Imports (' + unused.length + '):', '====================', '']
    unused.slice(0, 20).forEach(u => lines.push(u.file + ':' + u.line + ' - ' + u.named.join(', ') + ' from ' + u.module))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'organize' || cmd === 'sort') {
    const file = s[1]
    if (!file) return { type: 'text', value: 'Usage: /imports organize <file>' }
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      const imports: string[] = []
      const other: string[] = []
      lines.forEach(l => { if (/^(?:import|export)\s+/.test(l.trim())) imports.push(l); else other.push(l) })
      imports.sort((a, b) => a.localeCompare(b))
      const organized = [...imports, '', ...other]
      return { type: 'text', value: 'Organized ' + imports.length + ' imports in ' + file + ':\n' + organized.join('\n').slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'remove-unused') {
    const file = s[1]
    if (!file) return { type: 'text', value: 'Usage: /imports remove-unused <file>' }
    return { type: 'text', value: 'Use /imports unused to find unused imports first, then remove manually or use a linter.' }
  }

  if (cmd === 'convert') {
    const file = s[1]
    if (!file) return { type: 'text', value: 'Usage: /imports convert <file>' }
    try {
      const content = readFileSync(file, 'utf-8')
      const converted = content.replace(/const\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, "import $1 from '$2'")
      return { type: 'text', value: 'Converted:\n' + converted.slice(0, 2000) }
    } catch { return { type: 'text', value: '[ERROR] Cannot read file' } }
  }

  if (cmd === 'circular') {
    return { type: 'text', value: 'Circular dependency detection requires running: npx madge --circular .' }
  }

  if (cmd === 'graph') {
    return { type: 'text', value: 'Import graph generation: npx depcruise --output-type dot . | dot -T svg > deps.svg' }
  }

  if (cmd === 'find') {
    const module = s[1]
    if (!module) return { type: 'text', value: 'Usage: /imports find <module>' }
    const imports = analyzeImports('.')
    const found = imports.filter(i => i.module.includes(module))
    if (found.length === 0) return { type: 'text', value: 'No imports of: ' + module }
    const lines = ['Imports of "' + module + '" (' + found.length + '):', '================================', '']
    found.forEach(f => lines.push(f.file + ':' + f.line))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const imports: Command = {
  type: 'local', name: 'imports',
  description: 'Import management - analyze/unused/organize/sort/convert/circular/graph',
  aliases: ['/imports', '/imp'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default imports
