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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📊 依赖关系图', '', '📖 用法: ', '  /graph                          显示项目依赖图', '  /graph mermaid                   Mermaid 格式', '  /graph dot                       Graphviz DOT 格式', '  /graph html                      HTML 可视化', '  /graph save <文件>               保存图表', '  /graph stats                     图表统计', '  /graph circular                  检测循环依赖', '  /graph orphans                   查找孤立模块', '  /graph tree                      树形视图', ''].join('\n') }

  const graph = buildDependencyGraph('.')

  if (cmd === 'stats') return { type: 'text', value: ['📊 图表统计:', '==================', '', '节点数: ' + graph.nodes.length, '边数: ' + graph.edges.length, '', '按类型:', '  模块: ' + graph.nodes.filter(n => n.type === 'module').length, '  类: ' + graph.nodes.filter(n => n.type === 'class').length, '  函数: ' + graph.nodes.filter(n => n.type === 'function').length].join('\n') }

  if (cmd === 'circular') return { type: 'text', value: '循环依赖检测: 使用 madge --circular .' }
  if (cmd === 'orphans') {
    const imported = new Set(graph.edges.map(e => e.to))
    const orphans = graph.nodes.filter(n => n.type === 'module' && !imported.has(n.name) && !n.name.includes('index'))
    if (orphans.length === 0) return { type: 'text', value: '✅ 没有孤立模块' }
    const lines = ['孤立模块 (' + orphans.length + '):', '========================', '']
    orphans.forEach(o => lines.push('  ' + o.file))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tree') {
    const lines = ['📁 模块树:', '============', '']
    const modules = graph.nodes.filter(n => n.type === 'module').slice(0, 20)
    modules.forEach(m => lines.push('  ' + m.file + ' (' + graph.edges.filter(e => e.from === m.id).length + ' imports)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'mermaid') {
    const mermaid = generateMermaid(graph)
    writeFileSync('dependency-graph.mmd', mermaid, 'utf-8')
    return { type: 'text', value: mermaid + '\n\n✅ 已保存到 dependency-graph.mmd' }
  }

  if (cmd === 'dot') {
    const dot = generateDot(graph)
    writeFileSync('dependency-graph.dot', dot, 'utf-8')
    return { type: 'text', value: dot + '\n\n✅ 已保存到 dependency-graph.dot\n渲染命令: dot -Tpng dependency-graph.dot -o graph.png' }
  }

  if (cmd === 'html') {
    const mermaid = generateMermaid(graph)
    const html = '<html><head><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script></head><body><div class="mermaid">' + mermaid + '</div><script>mermaid.initialize();</script></body></html>'
    writeFileSync('dependency-graph.html', html, 'utf-8')
    return { type: 'text', value: '✅ 已保存到 dependency-graph.html' }
  }

  if (cmd === 'save') {
    const file = parts[1] || 'dependency-graph.mmd'
    writeFileSync(file, generateMermaid(graph), 'utf-8')
    return { type: 'text', value: '✅ 已保存到 ' + file }
  }

  // 默认: 显示摘要
  return { type: 'text', value: ['📊 依赖关系图:', '=================', '', '模块: ' + graph.nodes.filter(n => n.type === 'module').length, '类: ' + graph.nodes.filter(n => n.type === 'class').length, '导入: ' + graph.edges.length, '', '使用 /graph mermaid, /graph dot, /graph html 进行可视化'].join('\n') }
}

const graph: Command = {
  type: 'local', name: 'graph',
  description: '依赖关系图 - mermaid/dot/html/stats/circular/orphans/tree/save',
  aliases: '/graph, /deps-graph, /dg'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default graph
