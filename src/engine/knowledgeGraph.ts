/**
 * engine/knowledgeGraph.ts — 项目知识图谱（ULTRA 阶段 C1）
 *
 * 从代码自动构建"实体 + 关系"图谱，让 AI 真正"懂"项目结构：
 *
 * 实体（节点）：
 *   - file：文件
 *   - function / class / interface / type / enum / const / let / var：符号
 *
 * 关系（边）：
 *   - imports：文件 A import/require 文件 B
 *   - exports：文件 A 定义符号 S（A → S 的 defines 边）
 *   - extends：类继承
 *   - implements：类实现接口
 *   - calls：符号调用其它符号（近似：调用点文本匹配已定义符号名）
 *
 * 纯函数设计：buildKnowledgeGraph(files) 输入文件路径+内容，输出 Graph。
 * 不访问文件系统、不依赖外部服务，可单元测试。
 */

// ============================================================================
// Types
// ============================================================================

export type EntityType =
  | 'file'
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'let'
  | 'var'

export type RelationType = 'imports' | 'defines' | 'extends' | 'implements' | 'calls'

export interface GraphNode {
  /** 全局唯一 id：file 用 `file:<absPath>`，符号用 `<type>:<file>:<name>` */
  id: string
  type: EntityType
  name: string
  filePath: string
  line?: number
  context?: string
}

export interface GraphEdge {
  from: string
  to: string
  relation: RelationType
  filePath: string
  line?: number
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** 按文件索引节点（path → nodes） */
  nodesByFile: Map<string, GraphNode[]>
  /** 按 id 索引节点 */
  nodeById: Map<string, GraphNode>
  /** 邻接表（出边） */
  adjacency: Map<string, GraphEdge[]>
  builtAt: number
}

/** 输入文件描述 */
export interface GraphSourceFile {
  path: string
  content: string
}

export interface BuildOptions {
  /** 解析导入时的候选扩展名 */
  extensions?: string[]
  /** 是否提取 calls 调用关系（默认 true，开销略高） */
  extractCalls?: boolean
}

// ============================================================================
// 符号与导入解析
// ============================================================================

const SYMBOL_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(function|class|interface|type|enum|const|let|var)\s+(\w+)/

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.vue', '.py', '.go']

/**
 * 从一行源码解析符号声明
 */
export function extractSymbolFromLine(line: string): { kind: EntityType; name: string } | null {
  const m = line.match(SYMBOL_RE)
  if (!m) return null
  return { kind: m[1] as EntityType, name: m[2] }
}

/** 从源码解析 import/require 语句 */
export function extractImports(content: string): Array<{ specifier: string; names: string[] }> {
  const imports: Array<{ specifier: string; names: string[] }> = []
  const lines = content.split('\n')

  for (const line of lines) {
    // import X from './y' / import './y'
    let m = line.match(/import\s+(?:type\s+)?(?:[\w\s,*{}$]+\s+from\s+)?['"]([^'"]+)['"]/)
    if (m) {
      const names: string[] = []
      const nameM = line.match(/\{([^}]+)\}/)
      if (nameM) {
        for (const n of nameM[1].split(',')) {
          const trimmed = n.trim().split(/\s+as\s+/)[0].trim()
          if (trimmed) names.push(trimmed)
        }
      }
      const defaultM = line.match(/^import\s+(\w+)/)
      if (defaultM && defaultM[1] !== 'type') names.push(defaultM[1])
      imports.push({ specifier: m[1], names })
      continue
    }

    // const x = require('./y') / require('./y')
    m = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)
    if (m) {
      const varM = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*require/)
      imports.push({
        specifier: m[1],
        names: varM ? [varM[1]] : [],
      })
    }
  }

  return imports
}

/** 从源码解析类继承/实现关系 */
export function extractClassRelations(line: string): {
  className: string
  extendsName?: string
  implementsNames: string[]
} | null {
  const m = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w.,\s]+))?/)
  if (!m) return null
  const implementsNames = m[3]
    ? m[3].split(',').map(s => s.trim()).filter(Boolean)
    : []
  return {
    className: m[1],
    extendsName: m[2] || undefined,
    implementsNames,
  }
}

/**
 * 解析相对导入说明符 → 规范化 base 路径（不含扩展名）。
 * 例如 './utils' → 'src/utils'；调用方负责匹配 base+ext / base/index+ext。
 * 非相对导入（包名如 'react'）返回 null。
 */
export function resolveImportSpecifier(
  fromFile: string,
  specifier: string,
  _extensions: string[] = DEFAULT_EXTENSIONS,
): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null

  const fromDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''

  // 规范化路径段（处理 . / ..）
  const parts: string[] = []
  for (const seg of specifier.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  if (parts.length === 0) return null

  return fromDir ? `${fromDir}/${parts.join('/')}` : parts.join('/')
}

// ============================================================================
// 图谱构建
// ============================================================================

export function buildKnowledgeGraph(files: GraphSourceFile[], options: BuildOptions = {}): KnowledgeGraph {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  const extractCalls = options.extractCalls ?? true

  const graph: KnowledgeGraph = {
    nodes: [],
    edges: [],
    nodesByFile: new Map(),
    nodeById: new Map(),
    adjacency: new Map(),
    builtAt: Date.now(),
  }

  const addNode = (node: GraphNode): void => {
    if (graph.nodeById.has(node.id)) return
    graph.nodes.push(node)
    graph.nodeById.set(node.id, node)
    const list = graph.nodesByFile.get(node.filePath) ?? []
    list.push(node)
    graph.nodesByFile.set(node.filePath, list)
    if (!graph.adjacency.has(node.id)) graph.adjacency.set(node.id, [])
  }

  const addEdge = (edge: GraphEdge): void => {
    // 避免重复边
    const existing = graph.adjacency.get(edge.from) ?? []
    if (existing.some(e => e.to === edge.to && e.relation === edge.relation)) return
    graph.edges.push(edge)
    const list = graph.adjacency.get(edge.from) ?? []
    list.push(edge)
    graph.adjacency.set(edge.from, list)
  }

  // ─── 阶段 1：文件节点 + 符号节点 + defines 边 ───
  const fileNodes = new Map<string, string>() // filePath → nodeId
  const symbolByFile = new Map<string, Map<string, GraphNode>>() // filePath → name → node

  for (const file of files) {
    const fileId = `file:${file.path}`
    addNode({ id: fileId, type: 'file', name: file.path, filePath: file.path })
    fileNodes.set(file.path, fileId)
    symbolByFile.set(file.path, new Map())

    const lines = file.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const sym = extractSymbolFromLine(lines[i])
      if (!sym) continue
      const nodeId = `${sym.kind}:${file.path}:${sym.name}`
      const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n').slice(0, 200)
      const node: GraphNode = {
        id: nodeId,
        type: sym.kind,
        name: sym.name,
        filePath: file.path,
        line: i + 1,
        context,
      }
      addNode(node)
      symbolByFile.get(file.path)!.set(sym.name, node)
      addEdge({ from: fileId, to: nodeId, relation: 'defines', filePath: file.path, line: i + 1 })
    }
  }

  // ─── 阶段 2：imports 边 ───
  for (const file of files) {
    const fileId = fileNodes.get(file.path)!
    const imports = extractImports(file.content)
    for (const imp of imports) {
      const base = resolveImportSpecifier(file.path, imp.specifier, extensions)
      if (!base) continue
      // 匹配 base + ext / base/index + ext
      let targetPath: string | null = null
      for (const ext of extensions) {
        if (fileNodes.has(`${base}${ext}`)) { targetPath = `${base}${ext}`; break }
        if (fileNodes.has(`${base}/index${ext}`)) { targetPath = `${base}/index${ext}`; break }
      }
      if (!targetPath) {
        // 退而求其次：按去除扩展名的完整 base 匹配
        for (const p of fileNodes.keys()) {
          if (p.replace(/\.[^.]+$/, '') === base) {
            targetPath = p
            break
          }
        }
      }
      if (!targetPath) continue
      const targetId = fileNodes.get(targetPath)!
      addEdge({ from: fileId, to: targetId, relation: 'imports', filePath: file.path })
    }
  }

  // ─── 阶段 3：extends / implements 边 ───
  for (const file of files) {
    const syms = symbolByFile.get(file.path)!
    const lines = file.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const rel = extractClassRelations(lines[i])
      if (!rel) continue
      const classNode = syms.get(rel.className)
      if (!classNode) continue
      if (rel.extendsName) {
        const target = findSymbolAcrossFiles(rel.extendsName, symbolByFile, file.path)
        if (target) {
          addEdge({ from: classNode.id, to: target.id, relation: 'extends', filePath: file.path, line: i + 1 })
        }
      }
      for (const impl of rel.implementsNames) {
        const target = findSymbolAcrossFiles(impl, symbolByFile, file.path)
        if (target) {
          addEdge({ from: classNode.id, to: target.id, relation: 'implements', filePath: file.path, line: i + 1 })
        }
      }
    }
  }

  // ─── 阶段 4：calls 边（近似：行文本包含已定义符号名 + '('）───
  // 基于全图谱符号名检测（覆盖跨文件调用）；跳过声明/导入行
  if (extractCalls) {
    const globalSymbols = new Map<string, GraphNode>()
    for (const n of graph.nodes) {
      if (n.type === 'file') continue
      if (!globalSymbols.has(n.name)) globalSymbols.set(n.name, n)
    }

    for (const file of files) {
      const syms = symbolByFile.get(file.path)!
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // 跳过符号声明行与 import/require 行
        if (extractSymbolFromLine(line)) continue
        if (/^\s*(import|export\s+import|const\s+[\w$]+\s*=\s*require\s*\()/.test(line)) continue

        for (const [name, targetNode] of globalSymbols) {
          // 调用点：符号名 + ( （忽略跨文件同名的重复匹配）
          const callRe = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`)
          if (callRe.test(line)) {
            const caller = findEnclosingSymbol(lines, i, syms)
            if (caller && caller.id !== targetNode.id) {
              addEdge({ from: caller.id, to: targetNode.id, relation: 'calls', filePath: file.path, line: i + 1 })
            }
          }
        }
      }
    }
  }

  return graph
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 在当前文件查找符号（优先本文件，其次其它文件同名符号） */
function findSymbolAcrossFiles(
  name: string,
  symbolByFile: Map<string, Map<string, GraphNode>>,
  currentFile: string,
): GraphNode | null {
  const clean = name.split('.').pop() ?? name // 处理 A.B 形式 → B
  const local = symbolByFile.get(currentFile)?.get(clean)
  if (local) return local
  for (const [filePath, syms] of symbolByFile) {
    if (filePath === currentFile) continue
    const node = syms.get(clean)
    if (node) return node
  }
  return null
}

/** 找到包含指定行的最近符号（从该行向上查找最近的符号声明） */
function findEnclosingSymbol(
  lines: string[],
  lineIndex: number,
  syms: Map<string, GraphNode>,
): GraphNode | null {
  for (let i = lineIndex; i >= 0; i--) {
    const sym = extractSymbolFromLine(lines[i])
    if (sym) {
      return syms.get(sym.name) ?? null
    }
  }
  return null
}

// ============================================================================
// 查询 API
// ============================================================================

/** 文件的直接依赖（imports 目标） */
export function getDependencies(graph: KnowledgeGraph, filePath: string): string[] {
  const fileId = `file:${filePath}`
  return (graph.adjacency.get(fileId) ?? [])
    .filter(e => e.relation === 'imports')
    .map(e => e.to.replace(/^file:/, ''))
}

/** 直接依赖该文件的文件（反向） */
export function getDependents(graph: KnowledgeGraph, filePath: string): string[] {
  const fileId = `file:${filePath}`
  return graph.edges
    .filter(e => e.relation === 'imports' && e.to === fileId)
    .map(e => e.from.replace(/^file:/, ''))
}

/** 按符号名查找节点（全图谱） */
export function findSymbols(graph: KnowledgeGraph, name: string): GraphNode[] {
  return graph.nodes.filter(n => n.type !== 'file' && n.name === name)
}

/** 文件的全部符号 */
export function getFileSymbols(graph: KnowledgeGraph, filePath: string): GraphNode[] {
  return graph.nodesByFile.get(filePath)?.filter(n => n.type !== 'file') ?? []
}

/** BFS 查找两个文件/符号之间的最短路径 */
export function findPath(
  graph: KnowledgeGraph,
  from: string,
  to: string,
): GraphEdge[] | null {
  const fromId = from.includes(':') ? from : `file:${from}`
  const toId = to.includes(':') ? to : `file:${to}`
  if (!graph.nodeById.has(fromId) || !graph.nodeById.has(toId)) return null

  const visited = new Set<string>([fromId])
  const queue: Array<{ id: string; edges: GraphEdge[] }> = [{ id: fromId, edges: [] }]

  while (queue.length > 0) {
    const current = queue.shift()!
    const edges = graph.adjacency.get(current.id) ?? []
    for (const edge of edges) {
      if (visited.has(edge.to)) continue
      const pathEdges = [...current.edges, edge]
      if (edge.to === toId) return pathEdges
      visited.add(edge.to)
      queue.push({ id: edge.to, edges: pathEdges })
    }
  }
  return null
}

/** 与指定节点有关系的节点（出边+入边） */
export function getRelatedNodes(graph: KnowledgeGraph, nodeId: string): Array<{ node: GraphNode; relation: RelationType }> {
  const out = (graph.adjacency.get(nodeId) ?? []).map(e => {
    const node = graph.nodeById.get(e.to)
    return node ? { node, relation: e.relation } : null
  }).filter((x): x is { node: GraphNode; relation: RelationType } => x !== null)

  const inEdges = graph.edges.filter(e => e.to === nodeId)
  for (const e of inEdges) {
    const node = graph.nodeById.get(e.from)
    if (node) out.push({ node, relation: e.relation })
  }
  return out
}

/** 图谱统计 */
export function getGraphStats(graph: KnowledgeGraph): {
  files: number
  symbols: number
  edges: number
  imports: number
  calls: number
  relations: number
} {
  const nonFileNodes = graph.nodes.filter(n => n.type !== 'file')
  return {
    files: graph.nodes.filter(n => n.type === 'file').length,
    symbols: nonFileNodes.length,
    edges: graph.edges.length,
    imports: graph.edges.filter(e => e.relation === 'imports').length,
    calls: graph.edges.filter(e => e.relation === 'calls').length,
    relations: graph.edges.filter(e => e.relation === 'extends' || e.relation === 'implements').length,
  }
}

/** 生成可读的图谱报告 */
export function formatGraphReport(graph: KnowledgeGraph): string {
  const stats = getGraphStats(graph)
  const lines = [
    `# 项目知识图谱`,
    '',
    `- 文件: ${stats.files}`,
    `- 符号: ${stats.symbols}`,
    `- 边: ${stats.edges}（imports ${stats.imports} / calls ${stats.calls} / 继承实现 ${stats.relations}）`,
    '',
  ]

  for (const file of graph.nodes.filter(n => n.type === 'file')) {
    const syms = getFileSymbols(graph, file.name)
    if (syms.length === 0) continue
    lines.push(`## ${file.name}`)
    for (const s of syms.slice(0, 20)) {
      const outEdges = (graph.adjacency.get(s.id) ?? [])
        .filter(e => e.relation === 'calls')
        .map(e => {
          const target = graph.nodeById.get(e.to)
          return target ? `${target.name}(${target.filePath.split('/').pop()})` : e.to
        })
      const callsNote = outEdges.length > 0 ? ` → 调用 ${outEdges.slice(0, 5).join(', ')}` : ''
      lines.push(`- [${s.type}] ${s.name}${s.line ? ` (L${s.line})` : ''}${callsNote}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
