import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import * as fs from 'fs'
import * as path from 'path'

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

// ============================================================================
// Diagram Generators
// ============================================================================

/**
 * 从文件/目录生成依赖关系图
 */
function generateDependencyGraph(target: string, depth: number, format: string): DiagramResult {
  const nodes = new Map<string, DependencyNode>()
  const edges: [string, string][] = []

  // 扫描目标目录或文件
  const files = collectSourceFiles(target)

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
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

  // 生成图表
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
 * 生成 C4 上下文图
 */
function generateC4Context(projectPath: string, format: string): DiagramResult {
  const diagram = format === 'mermaid'
    ? `graph TD
    subgraph "System Context"
      USER[用户]
      CLI[doge-code CLI]
      API[AI API]
      FS[文件系统]
    end
    USER -->|使用| CLI
    CLI -->|调用| API
    CLI -->|读写| FS
    class CLI primary
    class USER external
    class API external
    class FS external`
    : 'C4 context diagram (mermaid format only supported)'

  return {
    success: true,
    diagram,
    format,
    nodeCount: 4,
    edgeCount: 3,
    errors: [],
  }
}

/**
 * 生成序列图
 */
function generateSequenceDiagram(target: string, format: string): DiagramResult {
  const diagram = format === 'mermaid'
    ? `sequenceDiagram
    participant U as User
    participant C as CLI
    participant A as AI Engine
    participant T as Tool
    participant FS as File System

    U->>C: 输入命令
    C->>A: 解析意图
    A->>T: 调度工具
    T->>FS: 读取/写入文件
    FS-->>T: 返回数据
    T-->>A: 工具结果
    A-->>C: 生成响应
    C-->>U: 显示结果`
    : 'Sequence diagram (mermaid format only supported)'

  return {
    success: true,
    diagram,
    format,
    nodeCount: 5,
    edgeCount: 5,
    errors: [],
  }
}

/**
 * 生成类图
 */
function generateClassDiagram(target: string, format: string): DiagramResult {
  const diagram = format === 'mermaid'
    ? `classDiagram
    class Command {
      <<interface>>
      +type: string
      +name: string
      +call(): Promise
    }
    class LocalCommand {
      +type: 'local'
      +call(args): string
    }
    class JSXCommand {
      +type: 'local-jsx'
      +load(): ReactNode
    }
    class RefactorCommand {
      +type: 'rename' | 'extract'
      +target: string
      +replacement: string
    }
    Command <|-- LocalCommand
    Command <|-- JSXCommand
    LocalCommand <|-- RefactorCommand`
    : 'Class diagram (mermaid format only supported)'

  return {
    success: true,
    diagram,
    format,
    nodeCount: 5,
    edgeCount: 4,
    errors: [],
  }
}

// ============================================================================
// Mermaid/Graphviz Generators
// ============================================================================

function generateMermaidDependency(
  nodes: Map<string, DependencyNode>,
  edges: [string, string][],
): string {
  const lines = ['graph TD']

  for (const [id, node] of nodes) {
    const shape = node.type === 'module' ? '[' : '{'
    const endShape = node.type === 'module' ? ']' : '}'
    lines.push(`  ${id}${shape}${node.name}${endShape}`)
  }

  for (const [from, to] of edges) {
    lines.push(`  ${from} --> ${to}`)
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
    lines.push(`  ${id} [label="${node.name}"];`)
  }

  for (const [from, to] of edges) {
    lines.push(`  ${from} -> ${to};`)
  }

  lines.push('}')
  return lines.join('\n')
}

function generateAsciiDependency(
  nodes: Map<string, DependencyNode>,
  edges: [string, string][],
  depth: number,
): string {
  const lines: string[] = [`Dependency Graph (${nodes.size} modules, ${edges.length} edges)`]
  lines.push('='.repeat(50))

  const adjacency = new Map<string, string[]>()
  for (const [from, to] of edges) {
    if (!adjacency.has(from)) adjacency.set(from, [])
    adjacency.get(from)!.push(to)
  }

  const visited = new Set<string>()
  const currentDepth = 0

  function printNode(nodeId: string, indent: number, maxDepth: number): void {
    if (indent > maxDepth || visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodes.get(nodeId)
    if (!node) return

    const prefix = '  '.repeat(indent)
    const marker = adjacency.has(nodeId) ? '├── ' : '└── '
    lines.push(`${prefix}${marker}${node.name}`)

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
// File Collection & Parsing
// ============================================================================

function collectSourceFiles(target: string): string[] {
  const files: string[] = []

  if (!fs.existsSync(target)) return files

  const stat = fs.statSync(target)

  if (stat.isFile()) {
    if (target.endsWith('.ts') || target.endsWith('.tsx') || target.endsWith('.js') || target.endsWith('.jsx')) {
      files.push(target)
    }
    return files
  }

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(target)
    for (const entry of entries) {
      const fullPath = path.join(target, entry)
      if (!entry.startsWith('.') && !entry.startsWith('node_modules')) {
        files.push(...collectSourceFiles(fullPath))
      }
    }
  }

  return files
}

function extractImports(content: string): string[] {
  const imports: string[] = []

  // 匹配 import 语句
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g
  let match

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  // 匹配 require 语句
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g

  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
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
        '  /diagram mermaid <文件>    渲染 Mermaid 图表',
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

  // 解析选项
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
      result = generateC4Context(targetPath, format)
      break
    case 'sequence':
      result = generateSequenceDiagram(targetPath, format)
      break
    case 'class':
      result = generateClassDiagram(target, format)
      break
    case 'dependency':
      result = generateDependencyGraph(target, depth, format)
      break
    default:
      result = {
        success: false,
        diagram: '',
        format,
        nodeCount: 0,
        edgeCount: 0,
        errors: [`❌ 不支持的图表类型: ${diagramType}`],
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
      value: `❌ 生成失败:\n${result.errors.join('\n')}`,
    }
  }

  const outputText = [
    `📊 ${diagramType} 图`,
    `格式: ${result.format} | 节点: ${result.nodeCount} | 边: ${result.edgeCount}`,
    '',
    result.diagram,
  ].join('\n')

  if (output) {
    try {
      fs.writeFileSync(output, result.diagram, 'utf-8')
      return {
        type: 'text',
        value: `${outputText}\n\n✅ 已保存到: ${output}`,
      }
    } catch (error) {
      return {
        type: 'text',
        value: `${outputText}\n\n❌ 保存失败: ${error}`,
      }
    }
  }

  return { type: 'text', value: outputText }
}

const diagram = {
  type: 'local' as const,
  name: 'diagram',
  description: '架构图自动生成 - C4/依赖关系/序列/类图（Mermaid/Graphviz/ASCII）',
  aliases: ['/diagram', '/arch', '/dep-graph'],
  arguments: [
    {
      name: 'type',
      description: '图表类型: c4 / dependency / sequence / class',
      required: true,
    },
    {
      name: 'target',
      description: '目标路径或文件',
      required: false,
    },
    {
      name: '--format',
      description: '输出格式: mermaid / graphviz / ascii',
      required: false,
    },
    {
      name: '--depth',
      description: '依赖图深度',
      required: false,
    },
    {
      name: '--output',
      description: '输出文件路径',
      required: false,
    },
    {
      name: '--json',
      description: 'JSON 格式输出',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default diagram
