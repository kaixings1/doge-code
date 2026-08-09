import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readdir, stat, writeFile, access } from 'fs/promises'
import * as path from 'path'
import { getCachedDirEntries, setCachedDirEntries } from '../../utils/dirCache.js'

// ============================================================================
// Types
// ============================================================================

interface DiagramOptions {
  type: 'c4' | 'dependency' | 'sequence' | 'class' | 'mermaid'
  target?: string
  output?: string
  format: 'mermaid' | 'graphviz' | 'ascii'
  depth: number
}

interface DependencyNode {
  id: string
  name: string
  type: 'module' | 'class' | 'function' | 'interface'
  imports: string[]
  exported: boolean
}

interface DiagramResult {
  success: boolean
  diagram: string
  format: string
  nodeCount: number
  edgeCount: number
  errors: string[]
}

async function existsAsync(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Diagram Generators
// ============================================================================

/**
 * 从文件/目录生成依赖关系图
 */
async function generateDependencyGraph(target: string, depth: number, format: string): Promise<DiagramResult> {
  const nodes = new Map<string, DependencyNode>()
  const edges: [string, string][] = []

  const files = await collectSourceFiles(target)

  for (const file of files) {
    try {
      const content = await Bun.file(file).text()
      const imports = extractImports(content)

      const nodeId = getNodeId(file)
      nodes.set(nodeId, {
        id: nodeId,
        name: path.basename(file),
        type: 'module',
        imports,
        exported: content.includes('export'),
      })

      for (const imp of imports) {
        edges.push([nodeId, imp])
      }
    } catch {
      // skip unreadable files
    }
  }

  let diagram = ''
  const nodeCount = nodes.size
  const edgeCount = edges.length

  switch (format) {
    case 'mermaid':
      diagram = generateMermaidDependency(nodes, edges)
      break
    case 'graphviz':
      diagram = generateGraphvizDependency(nodes, edges)
      break
    case 'ascii':
      diagram = generateAsciiDependency(nodes, edges, depth)
      break
    default:
      diagram = generateMermaidDependency(nodes, edges)
  }

  return {
    success: true,
    diagram,
    format,
    nodeCount,
    edgeCount,
    errors: [],
  }
}

/**
 * 生成 C4 上下文图（动态分析）
 */
async function generateC4Context(projectPath: string, format: string): Promise<DiagramResult> {
  const entries: string[] = []
  const deps = new Set<string>()
  const externalApis = new Set<string>()

  try {
    if (await existsAsync(projectPath)) {
      const scanDirs = ['src', 'lib', 'engine', 'commands', 'services']
      const foundDirs: string[] = []

      for (const d of scanDirs) {
        const full = path.join(projectPath, d)
        if (await existsAsync(full)) {
          foundDirs.push(d)
          try {
            const dirFiles = getCachedDirEntries(full) ?? await readdir(full)
            if (!getCachedDirEntries(full)) setCachedDirEntries(full, dirFiles)
            const sliced = dirFiles.slice(0, 10)
            for (const f of sliced) {
              const fp = path.join(full, f)
              if (f.endsWith('.ts') || f.endsWith('.tsx')) {
                try {
                  const content = await Bun.file(fp).text()
                  const imports = extractImports(content)
                  for (const imp of imports) {
                    if (imp.startsWith('http')) {
                      externalApis.add(imp)
                    } else if (!imp.startsWith('.') && !imp.startsWith('..')) {
                      deps.add(imp.split('/')[0])
                    }
                  }
                } catch { /* skip */ }
              }
            }
          } catch { /* skip */ }
        }
      }

      const entryPaths = [
        path.join(projectPath, 'src', 'entrypoints'),
        path.join(projectPath, 'src', 'bootstrap-entry.ts'),
        path.join(projectPath, 'src', 'index.ts'),
        path.join(projectPath, 'src', 'main.ts'),
        path.join(projectPath, 'index.ts'),
      ]
      let entryPoint = ''
      for (const ep of entryPaths) {
        if (await existsAsync(ep)) { entryPoint = ep; break }
      }

      for (const d of foundDirs.slice(0, 6)) {
        entries.push(d)
      }

      if (format !== 'mermaid') {
        return {
          success: true,
          diagram: 'C4 Context: ' + path.basename(projectPath) + '\n\nContainers: ' + entries.join(', ') + '\nDependencies: ' + Array.from(deps).slice(0, 8).join(', ') + '\nExternal APIs: ' + Array.from(externalApis).slice(0, 5).join(', '),
          format,
          nodeCount: entries.length + deps.size + externalApis.size + 1,
          edgeCount: entries.length + externalApis.size,
          errors: [],
        }
      }

      const containerLabel = path.basename(projectPath).charAt(0).toUpperCase() + path.basename(projectPath).slice(1)
      const lines: string[] = ['graph TD']
      lines.push('  C[' + containerLabel + ']')
      if (entryPoint) {
        lines.push('  E[' + (entryPoint.split('/').pop() || '') + ']')
        lines.push('  E --> C')
      }

      for (const e of entries) {
        lines.push('  M_' + e.replace(/[^a-zA-Z0-9]/g, '') + '[' + e + ']')
        lines.push('  C --> M_' + e.replace(/[^a-zA-Z0-9]/g, ''))
      }

      for (const d of Array.from(deps).slice(0, 8)) {
        lines.push('  D_' + d.replace(/[^a-zA-Z0-9]/g, '') + '[' + d + ']')
        lines.push('  C --> D_' + d.replace(/[^a-zA-Z0-9]/g, ''))
      }

      for (const a of Array.from(externalApis).slice(0, 5)) {
        const label = a.replace(/https?:\/\//, '').split('/')[0].slice(0, 20)
        lines.push('  A_' + label.replace(/[^a-zA-Z0-9]/g, '') + '[' + label + ']')
        lines.push('  C --> A_' + label.replace(/[^a-zA-Z0-9]/g, ''))
      }

      return {
        success: true,
        diagram: lines.join('\n'),
        format,
        nodeCount: entries.length + deps.size + externalApis.size + 2,
        edgeCount: entries.length + externalApis.size + 1,
        errors: [],
      }
    }
  } catch { /* fallback */ }

  return {
    success: true,
    diagram: 'graph TD\n  APP[Application]\n  CLI[CLI]\n  CLI --> APP',
    format,
    nodeCount: 2,
    edgeCount: 1,
    errors: [],
  }
}

/**
 * 生成序列图（异步）
 */
async function generateSequenceDiagram(target: string, format: string): Promise<DiagramResult> {
  const participants = new Map<string, string>()
  const calls: Array<{ from: string; to: string; label: string }> = []

  try {
    const targetPath = path.isAbsolute(target) ? target : path.join(process.cwd(), target)
    const st = await stat(targetPath)

    if (st.isFile()) {
      const content = await Bun.file(targetPath).text()
      const imports = extractImports(content)
      const symbols = extractSymbolsFromFile(content)

      participants.set('User', 'User')
      participants.set(path.basename(targetPath), 'Target Module')

      for (const imp of imports.slice(0, 8)) {
        const name = imp.split('/').pop() || imp
        participants.set(name, name)
        calls.push({ from: 'User', to: name, label: 'imports' })
      }

      for (const sym of symbols.slice(0, 6)) {
        participants.set(sym.name, sym.kind + ': ' + sym.name)
        calls.push({ from: path.basename(targetPath), to: sym.name, label: 'defines' })
      }
    } else if (st.isDirectory()) {
      const files = (await collectSourceFiles(targetPath)).slice(0, 10)
      for (const f of files) {
        try {
          const content = await Bun.file(f).text()
          const imports = extractImports(content)
          const fname = path.basename(f)
          participants.set(fname, fname)

          for (const imp of imports.slice(0, 5)) {
            const name = imp.split('/').pop() || imp
            if (!participants.has(name)) participants.set(name, name)
            calls.push({ from: fname, to: name, label: 'imports' })
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* fallback */ }

  if (format !== 'mermaid') {
    return {
      success: true,
      diagram: 'Sequence diagram for: ' + target + '\n\n' +
        Array.from(participants.entries()).map(([k, v]) => '  ' + k + ': ' + v).join('\n') + '\n\n' +
        calls.map(c => '  ' + c.from + ' -> ' + c.to + ': ' + c.label).join('\n'),
      format,
      nodeCount: participants.size,
      edgeCount: calls.length,
      errors: [],
    }
  }

  const seqLines = ['sequenceDiagram']
  for (const [k] of participants) {
    seqLines.push('  participant ' + k.slice(0, 15) + ' as ' + k)
  }
  for (const c of calls.slice(0, 20)) {
    seqLines.push('  ' + c.from.slice(0, 15) + '->>' + c.to.slice(0, 15) + ': ' + c.label)
  }

  return {
    success: true,
    diagram: seqLines.join('\n'),
    format,
    nodeCount: participants.size,
    edgeCount: calls.length,
    errors: [],
  }
}

/**
 * 生成类图（异步）
 */
async function generateClassDiagram(target: string, format: string): Promise<DiagramResult> {
  const classes = new Map<string, { extends?: string; implements: string[]; methods: string[]; props: string[] }>()
  const interfaces = new Map<string, string[]>()

  try {
    const targetPath = path.isAbsolute(target) ? target : path.join(process.cwd(), target)
    const st = await stat(targetPath)

    const collectFromFile = async (fp: string) => {
      if (!fp.endsWith('.ts') && !fp.endsWith('.tsx') && !fp.endsWith('.js') && !fp.endsWith('.jsx')) return

      const content = await Bun.file(fp).text()
      const lines = content.split('\n')

      for (const line of lines) {
        const classRel = extractClassRelations(line)
        if (classRel) {
          classes.set(classRel.className, {
            extends: classRel.extendsName,
            implements: classRel.implementsNames,
            methods: [],
            props: [],
          })
        }

        const sym = extractSymbolFromLine(line)
        if (sym && sym.kind === 'interface') {
          interfaces.set(sym.name, [])
        }
      }
    }

    if (st.isFile()) {
      await collectFromFile(targetPath)
    } else if (st.isDirectory()) {
      const files = (await collectSourceFiles(targetPath)).slice(0, 20)
      for (const f of files) {
        try { await collectFromFile(f) } catch { /* skip */ }
      }
    }
  } catch { /* fallback */ }

  if (classes.size === 0) {
    return {
      success: true,
      diagram: format === 'mermaid'
        ? 'classDiagram\n    note for Project "No classes found in target"\n    note for Tip "Try targeting a .ts/.tsx file or directory"'
        : 'No classes found in target.',
      format,
      nodeCount: 0,
      edgeCount: 0,
      errors: target ? [] : ['No target specified'],
    }
  }

  if (format !== 'mermaid') {
    const classDefs = Array.from(classes.entries()).map(([name, data]) => {
      const parts = ['class ' + name]
      if (data.extends) parts.push('  extends: ' + data.extends)
      if (data.implements.length) parts.push('  implements: ' + data.implements.join(', '))
      return parts.join('\n')
    }).join('\n\n')
    return {
      success: true,
      diagram: 'Class diagram for: ' + target + '\n\n' + classDefs,
      format,
      nodeCount: classes.size,
      edgeCount: Array.from(classes.values()).filter(c => c.extends || c.implements.length).length,
      errors: [],
    }
  }

  const classLines = ['classDiagram']
  const addedEdges: string[] = []

  for (const [name, data] of classes) {
    classLines.push('  class ' + name + ' {')
    for (const m of data.methods.slice(0, 5)) {
      classLines.push('    +' + m + '()')
    }
    for (const p of data.props.slice(0, 5)) {
      classLines.push('    ' + p)
    }
    classLines.push('  }')

    if (data.extends) {
      const edge = '  ' + data.extends + ' <|-- ' + name
      if (!addedEdges.includes(edge)) {
        addedEdges.push(edge)
        classLines.push(edge)
      }
    }
    for (const iface of data.implements) {
      const edge = '  ' + iface + ' <|.. ' + name
      if (!addedEdges.includes(edge)) {
        addedEdges.push(edge)
        classLines.push(edge)
      }
    }
  }

  for (const [name] of interfaces) {
    classLines.push('  interface ' + name)
  }

  return {
    success: true,
    diagram: classLines.join('\n'),
    format,
    nodeCount: classes.size + interfaces.size,
    edgeCount: addedEdges.length,
    errors: [],
  }
}

// ============================================================================
// Mermaid/Graphviz/ASCII Generators
// ============================================================================

function generateMermaidDependency(
  nodes: Map<string, DependencyNode>,
  edges: [string, string][],
): string {
  const lines = ['graph TD']

  for (const [id, node] of nodes) {
    const shape = node.type === 'module' ? '[' : '{'
    const endShape = node.type === 'module' ? ']' : '}'
    lines.push('  ' + id + shape + node.name + endShape)
  }

  for (const [from, to] of edges) {
    lines.push('  ' + from + ' --> ' + to)
  }

  return lines.join('\n')
}

function generateGraphvizDependency(
  nodes: Map<string, DependencyNode>,
  edges: [string, string][],
): string {
  const lines = ['digraph dependencies {']
  lines.push('  rankdir=LR;')
  lines.push('  node [shape=box];')

  for (const [id, node] of nodes) {
    lines.push('  ' + id + ' [label="' + node.name + '"];')
  }

  for (const [from, to] of edges) {
    lines.push('  ' + from + ' -> ' + to + ';')
  }

  lines.push('}')
  return lines.join('\n')
}

function generateAsciiDependency(
  nodes: Map<string, DependencyNode>,
  edges: [string, string][],
  depth: number,
): string {
  const lines: string[] = ['Dependency Graph (depth=' + depth + ')']
  lines.push('='.repeat(50))

  const adjacency = new Map<string, string[]>()
  for (const [from, to] of edges) {
    if (!adjacency.has(from)) adjacency.set(from, [])
    adjacency.get(from)!.push(to)
  }

  const visited = new Set<string>()

  function printNode(nodeId: string, indent: number, maxDepth: number): void {
    if (indent > maxDepth || visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodes.get(nodeId)
    if (!node) return

    const prefix = '  '.repeat(indent)
    const marker = adjacency.has(nodeId) ? '├── ' : '└── '
    lines.push(prefix + marker + node.name)

    const children = adjacency.get(nodeId) || []
    for (const child of children) {
      printNode(child, indent + 1, maxDepth)
    }
  }

  const roots = Array.from(nodes.keys()).filter(id => !edges.some(([, to]) => to === id))
  for (const root of roots) {
    printNode(root, 0, depth)
  }

  return lines.join('\n')
}

// ============================================================================
// Helpers
// ============================================================================

async function collectSourceFiles(target: string): Promise<string[]> {
  const files: string[] = []

  if (!(await existsAsync(target))) return files

  const st = await stat(target)

  if (st.isFile()) {
    if (target.endsWith('.ts') || target.endsWith('.tsx') || target.endsWith('.js') || target.endsWith('.jsx')) {
      files.push(target)
    }
    return files
  }

  if (st.isDirectory()) {
    const entries = getCachedDirEntries(target) ?? await readdir(target)
    if (!getCachedDirEntries(target)) setCachedDirEntries(target, entries)
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue
      const fullPath = path.join(target, entry)
      files.push(...await collectSourceFiles(fullPath))
    }
  }

  return files
}

function extractImports(content: string): string[] {
  const imports: string[] = []

  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  const requireRegex = /require\(['"]([^'"]+)['"]\)/g
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

function extractSymbolFromLine(line: string): { kind: string; name: string } | null {
  const m = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(function|class|interface|type|enum|const|let|var)\s+(\w+)/)
  if (!m) return null
  return { kind: m[1], name: m[2] }
}

function extractSymbolsFromFile(content: string): Array<{ kind: string; name: string }> {
  const symbols: Array<{ kind: string; name: string }> = []
  for (const line of content.split('\n')) {
    const sym = extractSymbolFromLine(line)
    if (sym) symbols.push(sym)
  }
  return symbols
}

function extractClassRelations(line: string): { className: string; extendsName?: string; implementsNames: string[] } | null {
  const m = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w.,\s]+))?/)
  if (!m) return null
  const implementsNames = m[3] ? m[3].split(',').map(s => s.trim()).filter(Boolean) : []
  return {
    className: m[1],
    extendsName: m[2] || undefined,
    implementsNames,
  }
}

function getNodeId(filePath: string): string {
  return filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (!s || s.includes('--help')) {
    return {
      type: 'text',
      value: [
        '📊 架构图自动生成',
        '',
        '用法:',
        '  /diagram c4 [目录]         生成 C4 上下文图',
        '  /diagram dependency <目标> 生成依赖关系图',
        '  /diagram sequence <目标>   生成序列图',
        '  /diagram class <目标>      生成类图',
        '',
        '选项:',
        '  --format <类型>  输出格式: mermaid / graphviz / ascii（默认: mermaid）',
        '  --depth <深度>   依赖图深度（默认: 2）',
        '  --output <文件>  输出到文件',
        '  --json           JSON 格式输出',
        '',
        '示例:',
        '  /diagram dependency src/ --format mermaid',
        '  /diagram c4 --format mermaid',
        '  /diagram dependency src/ --format graphviz --output deps.dot',
      ].join('\n'),
    }
  }

  const parts = s.split(/\s+/)
  const diagramType = parts[0] || 'dependency'
  const targetPath = parts[1] || process.cwd()

  let format: DiagramOptions['format'] = 'mermaid'
  let depth = 2
  let output: string | undefined
  let json = false

  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === '--format' && i + 1 < parts.length) {
      format = parts[++i] as DiagramOptions['format']
    } else if (parts[i] === '--depth' && i + 1 < parts.length) {
      depth = parseInt(parts[++i]) || 2
    } else if (parts[i] === '--output' && i + 1 < parts.length) {
      output = parts[++i]
    } else if (parts[i] === '--json') {
      json = true
    }
  }

  let result: DiagramResult

  switch (diagramType) {
    case 'c4':
      result = await generateC4Context(targetPath, format)
      break
    case 'sequence':
      result = await generateSequenceDiagram(targetPath, format)
      break
    case 'class':
      result = await generateClassDiagram(targetPath, format)
      break
    case 'dependency':
      result = await generateDependencyGraph(targetPath, depth, format)
      break
    default:
      result = {
        success: false,
        diagram: '',
        format,
        nodeCount: 0,
        edgeCount: 0,
        errors: ['Unsupported diagram type: ' + diagramType],
      }
  }

  if (output && result.success) {
    try {
      await writeFile(output, result.diagram, 'utf-8')
      result.diagram = result.diagram + '\n\nSaved to: ' + output
    } catch (err) {
      result.errors.push('Write failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  if (json) {
    return {
      type: 'json',
      value: JSON.stringify(result, null, 2),
    }
  }

  if (!result.success) {
    return {
      type: 'text',
      value: 'Failed:\n' + result.errors.join('\n'),
    }
  }

  return {
    type: 'text',
    value: result.diagram,
  }
}

const diagramCommand: Command = {
  name: 'diagram',
  description: '架构图自动生成（C4/依赖/序列/类图，Mermaid/Graphviz/ASCII）',
  usage: 'diagram <type> [target] [--format <format>] [--depth <n>] [--output <file>] [--json]',
  examples: [
    { command: 'diagram dependency src/', description: '生成依赖关系图' },
    { command: 'diagram c4 .', description: '生成 C4 上下文图' },
    { command: 'diagram sequence src/engine/', description: '生成序列图' },
    { command: 'diagram class src/commands/', description: '生成类图' },
    { command: 'diagram dependency . --format graphviz', description: 'Graphviz 格式' },
  ],
  args: {
    type: { description: '图表类型: c4 / dependency / sequence / class', required: true },
    target: { description: '目标文件/目录', required: false },
    '--format': { description: '输出格式: mermaid / graphviz / ascii', required: false },
    '--depth': { description: '依赖图深度', required: false },
    '--output': { description: '输出文件路径', required: false },
    '--json': { description: 'JSON 格式输出', required: false },
  },
  isEnabled: () => true,
  supportsNonInteractive: true,
  call,
}

export default diagramCommand
