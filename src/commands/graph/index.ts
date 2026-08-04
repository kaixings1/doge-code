import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join, extname } from 'path'

interface GraphNode { id: string; name: string; type: 'module' | 'class' | 'function'; file: string }
interface GraphEdge { from: string; to: string; type: 'import' | 'call' | 'extends' | 'implements' }

function buildDependencyGraph(dir: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const fs = require('fs')
  const exts = ['.ts', '.tsx', '.js', '.jsx']
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          const nodeId = fp.replace(/\\/g, '/')
          nodes.push({ id: nodeId, name: entry.name, type: 'module', file: fp })
          try {
            const content = readFileSync(fp, 'utf-8')
            const imports = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) || []
            imports.forEach(imp => {
              const match = imp.match(/from\s+['"]([^'"]+)['"]/)
              if (match) edges.push({ from: nodeId, to: match[1], type: 'import' })
            })
            const classes = content.match(/class\s+(\w+)/g) || []
            classes.forEach(c => {
              const nameMatch = c.match(/class\s+(\w+)/)
              if (nameMatch) nodes.push({ id: nodeId + '#' + nameMatch[1], name: nameMatch[1], type: 'class', file: fp })
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return { nodes, edges }
}

function generateMermaid(graph: { nodes: GraphNode[]; edges: GraphEdge[] }): string {
  let mermaid = 'graph TD\n'
  graph.nodes.forEach(n => mermaid += '  ' + n.id.replace(/[^a-zA-Z0-9]/g, '_') + '[' + n.name + ']\n')
  graph.edges.forEach(e => {
    const from = e.from.replace(/[^a-zA-Z0-9]/g, '_')
    const to = e.to.replace(/[^a-zA-Z0-9]/g, '_')
    mermaid += '  ' + from + '-->' + to + '\n'
  })
  return mermaid
}

function generateDot(graph: { nodes: GraphNode[]; edges: GraphEdge[] }): string {
  let dot = 'digraph Dependencies {\n'
  dot += '  rankdir=TB;\n  node [shape=box];\n'
  graph.nodes.forEach(n => dot += '  "' + n.id + '" [label="' + n.name + '"];\n')
  graph.edges.forEach(e => dot += '  "' + e.from + '" -> "' + e.to + '";\n')
  dot += '}'
  return dot
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Dependency Graph', '', 'Usage:', '  /graph                          Show project graph', '  /graph mermaid                  Mermaid format', '  /graph dot                      Graphviz DOT format', '  /graph html                     HTML visualization', '  /graph save <file>              Save graph', '  /graph stats                    Graph statistics', '  /graph circular                 Detect circular deps', '  /graph orphans                  Find orphaned modules', '  /graph tree                     Tree view', ''].join('\n') }

  const graph = buildDependencyGraph('.')

  if (cmd === 'stats') return { type: 'text', value: ['Graph Statistics:', '==================', '', 'Nodes: ' + graph.nodes.length, 'Edges: ' + graph.edges.length, '', 'By Type:', '  Modules: ' + graph.nodes.filter(n => n.type === 'module').length, '  Classes: ' + graph.nodes.filter(n => n.type === 'class').length, '  Functions: ' + graph.nodes.filter(n => n.type === 'function').length].join('\n') }

  if (cmd === 'circular') return { type: 'text', value: 'Circular dependency detection: Use madge --circular .' }
  if (cmd === 'orphans') {
    const imported = new Set(graph.edges.map(e => e.to))
    const orphans = graph.nodes.filter(n => n.type === 'module' && !imported.has(n.name) && !n.name.includes('index'))
    if (orphans.length === 0) return { type: 'text', value: '[OK] No orphaned modules' }
    const lines = ['Orphaned Modules (' + orphans.length + '):', '========================', '']
    orphans.forEach(o => lines.push('  ' + o.file))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tree') {
    const lines = ['Module Tree:', '============', '']
    const modules = graph.nodes.filter(n => n.type === 'module').slice(0, 20)
    modules.forEach(m => lines.push('  ' + m.file + ' (' + graph.edges.filter(e => e.from === m.id).length + ' imports)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'mermaid') {
    const mermaid = generateMermaid(graph)
    writeFileSync('dependency-graph.mmd', mermaid, 'utf-8')
    return { type: 'text', value: mermaid + '\n\n[Saved to dependency-graph.mmd]' }
  }

  if (cmd === 'dot') {
    const dot = generateDot(graph)
    writeFileSync('dependency-graph.dot', dot, 'utf-8')
    return { type: 'text', value: dot + '\n\n[Saved to dependency-graph.dot]\nRender: dot -Tpng dependency-graph.dot -o graph.png' }
  }

  if (cmd === 'html') {
    const mermaid = generateMermaid(graph)
    const html = '<html><head><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script></head><body><div class="mermaid">' + mermaid + '</div><script>mermaid.initialize();</script></body></html>'
    writeFileSync('dependency-graph.html', html, 'utf-8')
    return { type: 'text', value: '[OK] Saved to dependency-graph.html' }
  }

  if (cmd === 'save') {
    const file = parts[1] || 'dependency-graph.mmd'
    writeFileSync(file, generateMermaid(graph), 'utf-8')
    return { type: 'text', value: '[OK] Saved to ' + file }
  }

  // Default: show summary
  return { type: 'text', value: ['Dependency Graph:', '=================', '', 'Modules: ' + graph.nodes.filter(n => n.type === 'module').length, 'Classes: ' + graph.nodes.filter(n => n.type === 'class').length, 'Imports: ' + graph.edges.length, '', 'Use /graph mermaid, /graph dot, /graph html for visualization'].join('\n') }
}

const graph: Command = {
  type: 'local', name: 'graph',
  description: 'Dependency graph - mermaid/dot/html/stats/circular/orphans/tree/save',
  aliases: '/graph, /deps-graph, /dg'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default graph
