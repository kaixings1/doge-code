import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

interface ImportNode { module: string; importedBy: string[]; imports: string[] }

function buildImportMap(dir: string): ImportNode[] {
  const nodes: Record<string, ImportNode> = {}
  const fs = require('fs')
  const exts = ['.ts', '.tsx', '.js', '.jsx']
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          const module = fp.replace(/\\/g, '/')
          if (!nodes[module]) nodes[module] = { module, importedBy: [], imports: [] }
          try {
            const content = readFileSync(fp, 'utf-8')
            const imports = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) || []
            imports.forEach(imp => {
              const match = imp.match(/from\s+['"]([^'"]+)['"]/)
              if (match) {
                nodes[module]!.imports.push(match[1])
                if (!nodes[match[1]]) nodes[match[1]] = { module: match[1], importedBy: [], imports: [] }
                nodes[match[1]]!.importedBy.push(module)
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return Object.values(nodes).sort((a, b) => b.importedBy.length - a.importedBy.length)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Import Map', '', 'Usage:', '  /import-map                     Show import map', '  /import-map dot                  Graphviz DOT format', '  /import-map mermaid              Mermaid format', '  /import-map circular             Detect circular imports', '  /import-map orphans              Find unreferenced modules', '  /import-map external             External dependencies', '  /import-map depth <module>       Import depth tree', '  /import-map stats                Import statistics', '  /import-map save <file>          Save map', ''].join('\n') }

  const importMap = buildImportMap('.')

  if (cmd === 'stats') {
    const total = importMap.length
    const external = importMap.filter(n => n.module.startsWith('.') === false).length
    const internal = total - external
    const circular = importMap.filter(n => n.imports.some(i => importMap.some(m => m.module === i && m.imports.includes(n.module)))).length
    return { type: 'text', value: ['Import Statistics:', '==================', '', 'Total modules: ' + total, 'Internal: ' + internal, 'External: ' + external, 'Potential circular: ' + circular].join('\n') }
  }

  if (cmd === 'circular') {
    const circular: string[] = []
    importMap.forEach(n => {
      n.imports.forEach(imp => {
        const target = importMap.find(m => m.module === imp)
        if (target && target.imports.includes(n.module)) {
          const pair = [n.module, imp].sort().join(' <-> ')
          if (!circular.includes(pair)) circular.push(pair)
        }
      })
    })
    if (circular.length === 0) return { type: 'text', value: '[OK] No circular imports' }
    return { type: 'text', value: 'Circular Imports (' + circular.length + '):\n' + circular.join('\n') }
  }

  if (cmd === 'orphans') {
    const orphans = importMap.filter(n => n.importedBy.length === 0 && n.module.startsWith('.'))
    if (orphans.length === 0) return { type: 'text', value: '[OK] No orphaned modules' }
    return { type: 'text', value: 'Orphaned Modules (' + orphans.length + '):\n' + orphans.map(o => o.module).join('\n') }
  }

  if (cmd === 'external') {
    const external = importMap.filter(n => !n.module.startsWith('.'))
    if (external.length === 0) return { type: 'text', value: 'No external dependencies' }
    return { type: 'text', value: 'External Dependencies (' + external.length + '):\n' + external.map(e => e.module + ' (' + e.importedBy.length + ' users)').join('\n') }
  }

  if (cmd === 'dot') {
    let dot = 'digraph Imports {\n  rankdir=TB;\n  node [shape=box];\n'
    importMap.forEach(n => { n.imports.forEach(imp => { dot += '  "' + n.module + '" -> "' + imp + '";\n' }) })
    dot += '}'
    return { type: 'text', value: dot }
  }

  if (cmd === 'mermaid') {
    let mermaid = 'graph TD\n'
    importMap.slice(0, 20).forEach(n => { n.imports.slice(0, 5).forEach(imp => { mermaid += '  ' + n.module.replace(/[^a-zA-Z0-9]/g, '_') + '-->' + imp.replace(/[^a-zA-Z0-9]/g, '_') + '\n' }) })
    return { type: 'text', value: mermaid }
  }

  if (cmd === 'depth') {
    const target = parts[1]
    if (!target) return { type: 'text', value: 'Usage: /import-map depth <module>' }
    const node = importMap.find(n => n.module.includes(target))
    if (!node) return { type: 'text', value: 'Module not found: ' + target }
    return { type: 'text', value: 'Import Depth: ' + target + '\nImported by: ' + node.importedBy.length + ' modules\nImports: ' + node.imports.length + ' modules' }
  }

  if (cmd === 'save') {
    const file = parts[1] || 'import-map.json'
    require('fs').writeFileSync(file, JSON.stringify(importMap, null, 2), 'utf-8')
    return { type: 'text', value: '[OK] Saved to ' + file }
  }

  // Default: show top imported modules
  const lines = ['Import Map (' + importMap.length + ' modules):', '========================', '']
  importMap.slice(0, 20).forEach(n => lines.push(n.module + ' (imported by ' + n.importedBy.length + ', imports ' + n.imports.length + ')'))
  return { type: 'text', value: lines.join('\n') }
}

const importMap: Command = {
  type: 'local', name: 'import-map',
  description: 'Import map - stats/circular/orphans/external/dot/mermaid/depth/save',
  aliases: '/import-map, /im, /imports'.split(','),
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default importMap
