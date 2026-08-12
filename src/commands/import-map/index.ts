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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📦 导入映射图', '', '📖 用法: ', '  /import-map                       显示导入映射图', '  /import-map dot                    Graphviz DOT 格式', '  /import-map mermaid                Mermaid 格式', '  /import-map circular               检测循环导入', '  /import-map orphans                查找孤立模块', '  /import-map external               外部依赖', '  /import-map depth <模块>           导入深度树', '  /import-map stats                  导入统计', '  /import-map save <文件>            保存映射图', ''].join('\n') }

  const importMap = buildImportMap('.')

  if (cmd === 'stats') {
    const total = importMap.length
    const external = importMap.filter(n => n.module.startsWith('.') === false).length
    const internal = total - external
    const circular = importMap.filter(n => n.imports.some(i => importMap.some(m => m.module === i && m.imports.includes(n.module)))).length
    return { type: 'text', value: ['📊 导入统计:', '==================', '', '模块总数: ' + total, '内部模块: ' + internal, '外部模块: ' + external, '可能的循环: ' + circular].join('\n') }
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
    if (circular.length === 0) return { type: 'text', value: '✅ 没有循环导入' }
    return { type: 'text', value: '🔄 循环导入 (' + circular.length + '):\n' + circular.join('\n') }
  }

  if (cmd === 'orphans') {
    const orphans = importMap.filter(n => n.importedBy.length === 0 && n.module.startsWith('.'))
    if (orphans.length === 0) return { type: 'text', value: '✅ 没有孤立模块' }
    return { type: 'text', value: '📭 孤立模块 (' + orphans.length + '):\n' + orphans.map(o => o.module).join('\n') }
  }

  if (cmd === 'external') {
    const external = importMap.filter(n => !n.module.startsWith('.'))
    if (external.length === 0) return { type: 'text', value: '没有外部依赖' }
    return { type: 'text', value: '📦 外部依赖 (' + external.length + '):\n' + external.map(e => e.module + ' (' + e.importedBy.length + ' 个使用者)').join('\n') }
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
    if (!target) return { type: 'text', value: '用法: /import-map depth <模块>' }
    const node = importMap.find(n => n.module.includes(target))
    if (!node) return { type: 'text', value: '未找到模块: ' + target }
    return { type: 'text', value: '导入深度: ' + target + '\n被导入: ' + node.importedBy.length + ' 个模块\n导入: ' + node.imports.length + ' 个模块' }
  }

  if (cmd === 'save') {
    const file = parts[1] || 'import-map.json'
    require('fs').writeFileSync(file, JSON.stringify(importMap, null, 2), 'utf-8')
    return { type: 'text', value: '✅ 已保存到 ' + file }
  }

  // Default: show top imported modules
  const lines = ['📦 导入映射图 (' + importMap.length + ' 个模块):', '========================', '']
  importMap.slice(0, 20).forEach(n => lines.push(n.module + ' (imported by ' + n.importedBy.length + ', imports ' + n.imports.length + ')'))
  return { type: 'text', value: lines.join('\n') }
}

const importMap: Command = {
  type: 'local', name: 'import-map',
  description: '导入映射图 - stats/circular/orphans/external/dot/mermaid/depth/save',
  aliases: '/import-map, /im, /imports'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default importMap
