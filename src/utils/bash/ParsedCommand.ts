import memoize from 'lodash-es/memoize.js'
import {
  extractOutputRedirections,
  splitCommandWithOperators,
} from './commands.js'
import type { Node } from './parser.js'
import {
  analyzeCommand,
  type TreeSitterAnalysis,
} from './treeSitterAnalysis.js'

export type OutputRedirection = {
  target: string
  operator: '>' | '>>'
}

/**
 * 解析命令的接口。
 * tree-sitter 和 regex 回退实现都遵循此接口。
 */
export interface IParsedCommand {
  readonly originalCommand: string
  toString(): string
  getPipeSegments(): string[]
  withoutOutputRedirections(): string
  getOutputRedirections(): OutputRedirection[]
  /**
   * 如果可用，返回 tree-sitter 分析数据。
   * 对于 regex 回退实现返回 null。
   */
  getTreeSitterAnalysis(): TreeSitterAnalysis | null
}

/**
 * @deprecated 旧版 regex/shell-quote 路径。仅在 tree-sitter 不可用时使用。
 * 主要安全网关是 parseForSecurity (ast.ts)。
 *
 * 基于正则表达式的回退实现，使用 shell-quote 解析器。
 * 在 tree-sitter 不可用时使用。
 * 为测试目的而导出。
 */
export class RegexParsedCommand_DEPRECATED implements IParsedCommand {
  readonly originalCommand: string

  constructor(command: string) {
    this.originalCommand = command
  }

  toString(): string {
    return this.originalCommand
  }

  getPipeSegments(): string[] {
    try {
      const parts = splitCommandWithOperators(this.originalCommand)
      const segments: string[] = []
      let currentSegment: string[] = []

      for (const part of parts) {
        if (part === '|') {
          if (currentSegment.length > 0) {
            segments.push(currentSegment.join(' '))
            currentSegment = []
          }
        } else {
          currentSegment.push(part)
        }
      }

      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(' '))
      }

      return segments.length > 0 ? segments : [this.originalCommand]
    } catch {
      return [this.originalCommand]
    }
  }

  withoutOutputRedirections(): string {
    if (!this.originalCommand.includes('>')) {
      return this.originalCommand
    }
    const { commandWithoutRedirections, redirections } =
      extractOutputRedirections(this.originalCommand)
    return redirections.length > 0
      ? commandWithoutRedirections
      : this.originalCommand
  }

  getOutputRedirections(): OutputRedirection[] {
    const { redirections } = extractOutputRedirections(this.originalCommand)
    return redirections
  }

  getTreeSitterAnalysis(): TreeSitterAnalysis | null {
    return null
  }
}

type RedirectionNode = OutputRedirection & {
  startIndex: number
  endIndex: number
}

function visitNodes(node: Node, visitor: (node: Node) => void): void {
  visitor(node)
  for (const child of node.children) {
    visitNodes(child, visitor)
  }
}

function extractPipePositions(rootNode: Node): number[] {
  const pipePositions: number[] = []
  visitNodes(rootNode, node => {
    if (node.type === 'pipeline') {
      for (const child of node.children) {
        if (child.type === '|') {
          pipePositions.push(child.startIndex)
        }
      }
    }
  })
  // visitNodes 是深度优先的。对于 `a | b && c | d`，外层的 `list` 将
  // 第二个管道嵌套为第一个的兄弟，因此外层的 `|` 在内部的之前被
  // 访问 — 位置顺序混乱。
  // getPipeSegments 从左到右遍历它们进行切片，因此在此排序。
  return pipePositions.sort((a, b) => a - b)
}

function extractRedirectionNodes(rootNode: Node): RedirectionNode[] {
  const redirections: RedirectionNode[] = []
  visitNodes(rootNode, node => {
    if (node.type === 'file_redirect') {
      const children = node.children
      const op = children.find(c => c.type === '>' || c.type === '>>')
      const target = children.find(c => c.type === 'word')
      if (op && target) {
        redirections.push({
          startIndex: node.startIndex,
          endIndex: node.endIndex,
          target: target.text,
          operator: op.type as '>' | '>>',
        })
      }
    }
  })
  return redirections
}

class TreeSitterParsedCommand implements IParsedCommand {
  readonly originalCommand: string
  // Tree-sitter 的 startIndex/endIndex 是 UTF-8 字节偏移量，但 JS
  // String.slice() 使用 UTF-16 码元索引。对于 ASCII 它们一致；
  // 对于多字节码点（例如 `—` U+2014：3 个 UTF-8 字节，1 个码元）
  // 它们会分歧，直接对字符串切片会落在令牌中间。使用 tree-sitter
  // 的字节偏移量对 UTF-8 Buffer 切片并解码回字符串，无论码点宽度如何都是正确的。
  private readonly commandBytes: Buffer
  private readonly pipePositions: number[]
  private readonly redirectionNodes: RedirectionNode[]
  private readonly treeSitterAnalysis: TreeSitterAnalysis

  constructor(
    command: string,
    pipePositions: number[],
    redirectionNodes: RedirectionNode[],
    treeSitterAnalysis: TreeSitterAnalysis,
  ) {
    this.originalCommand = command
    this.commandBytes = Buffer.from(command, 'utf8')
    this.pipePositions = pipePositions
    this.redirectionNodes = redirectionNodes
    this.treeSitterAnalysis = treeSitterAnalysis
  }

  toString(): string {
    return this.originalCommand
  }

  getPipeSegments(): string[] {
    if (this.pipePositions.length === 0) {
      return [this.originalCommand]
    }

    const segments: string[] = []
    let currentStart = 0

    for (const pipePos of this.pipePositions) {
      const segment = this.commandBytes
        .subarray(currentStart, pipePos)
        .toString('utf8')
        .trim()
      if (segment) {
        segments.push(segment)
      }
      currentStart = pipePos + 1
    }

    const lastSegment = this.commandBytes
      .subarray(currentStart)
      .toString('utf8')
      .trim()
    if (lastSegment) {
      segments.push(lastSegment)
    }

    return segments
  }

  withoutOutputRedirections(): string {
    if (this.redirectionNodes.length === 0) return this.originalCommand

    const sorted = [...this.redirectionNodes].sort(
      (a, b) => b.startIndex - a.startIndex,
    )

    let result = this.commandBytes
    for (const redir of sorted) {
      result = Buffer.concat([
        result.subarray(0, redir.startIndex),
        result.subarray(redir.endIndex),
      ])
    }
    return result.toString('utf8').trim().replace(/\s+/g, ' ')
  }

  getOutputRedirections(): OutputRedirection[] {
    return this.redirectionNodes.map(({ target, operator }) => ({
      target,
      operator,
    }))
  }

  getTreeSitterAnalysis(): TreeSitterAnalysis {
    return this.treeSitterAnalysis
  }
}

const getTreeSitterAvailable = memoize(async (): Promise<boolean> => {
  try {
    const { parseCommand } = await import('./parser.js')
    const testResult = await parseCommand('echo test')
    return testResult !== null
  } catch {
    return false
  }
})

/**
 * 从预解析的 AST 根节点构建 TreeSitterParsedCommand。让已经拥有
 * 语法树的调用者跳过 ParsedCommand.parse 会执行的冗余 native.parse 调用。
 */
export function buildParsedCommandFromRoot(
  command: string,
  root: Node,
): IParsedCommand {
  const pipePositions = extractPipePositions(root)
  const redirectionNodes = extractRedirectionNodes(root)
  const analysis = analyzeCommand(root, command)
  return new TreeSitterParsedCommand(
    command,
    pipePositions,
    redirectionNodes,
    analysis,
  )
}

async function doParse(command: string): Promise<IParsedCommand | null> {
  if (!command) return null

  const treeSitterAvailable = await getTreeSitterAvailable()
  if (treeSitterAvailable) {
    try {
      const { parseCommand } = await import('./parser.js')
      const data = await parseCommand(command)
      if (data) {
        // 原生 NAPI 解析器返回普通 JS 对象（无 WASM 句柄）；
        // 无需释放 — 直接提取。
        return buildParsedCommandFromRoot(command, data.rootNode)
      }
    } catch {
      // 回退到 regex 实现
    }
  }

  // 回退到 regex 实现
  return new RegexParsedCommand_DEPRECATED(command)
}

// 单条目缓存：旧调用方（bashCommandIsSafeAsync、
// buildSegmentWithoutRedirections）可能用相同的命令字符串
// 重复调用 ParsedCommand.parse。每次 parse() 约 1 次 native.parse + 约 6 次
// 树遍历，因此缓存最近使用的命令跳过冗余工作。
// 大小限制为 1 避免泄露 TreeSitterParsedCommand 实例。
let lastCmd: string | undefined
let lastResult: Promise<IParsedCommand | null> | undefined

/**
 * ParsedCommand 提供处理 shell 命令的方法。
 * 在可用时使用 tree-sitter 进行引号感知的解析，
 * 否则回退到基于正则表达式的解析。
 */
export const ParsedCommand = {
  /**
   * 解析命令字符串并返回 ParsedCommand 实例。
   * 如果完全解析失败则返回 null。
   */
  parse(command: string): Promise<IParsedCommand | null> {
    if (command === lastCmd && lastResult !== undefined) {
      return lastResult
    }
    lastCmd = command
    lastResult = doParse(command)
    return lastResult
  },
}
