/**
 * engine/codeExplainer.ts — 智能代码解释引擎（Phase 5.2）
 *
 * 复用已有基础设施：
 * - semanticSearch.ts 的 extractSymbols() / tokenize() / analyzeQuery()
 * - knowledgeGraph.ts 的 buildKnowledgeGraph()（关系图谱）
 * - api-doc/index.ts 的 TS Compiler API（类型结构）
 *
 * 输出结构化上下文，供 LLM 生成自然语言解释。
 */

import { extractSymbols, tokenize, analyzeQuery } from './semanticSearch.js'
import { buildKnowledgeGraph, type GraphNode, type GraphEdge } from './knowledgeGraph.js'

// ============================================================================
// Types
// ============================================================================

export interface ExplainContext {
  /** 目标文件内容 */
  filePath: string
  content: string
  /** 目标行范围 [start, end]（1-based） */
  lineRange?: { start: number; end: number }
  /** 提取的符号列表 */
  symbols: Array<{ name: string; kind: string; line: number }>
  /** 相关代码片段（来自语义搜索） */
  contextChunks: Array<{ content: string; lineStart: number; lineEnd: number; score: number }>
  /** 知识图谱中的关系 */
  relations: {
    imports: string[]
    calls: string[]
    extends?: string
    implements: string[]
  }
  /** 查询关键词 */
  queryTerms: string[]
  /** 目标符号（从查询中提取） */
  targetSymbols: string[]
}

export interface ExplainOptions {
  /** 目标文件路径 */
  filePath: string
  /** 目标行号或范围（如 "42" 或 "10-20"） */
  lineRange?: string
  /** 自然语言查询（可选，用于语义上下文） */
  query?: string
  /** 要解释的特定符号名 */
  symbolName?: string
}

// ============================================================================
// 文件内容提取
// ============================================================================

export async function readFileContent(filePath: string): Promise<string> {
  try {
    const content = await Bun.file(filePath).text()
    return content
  } catch {
    return ''
  }
}

// ============================================================================
// 行范围解析
// ============================================================================

export function parseLineRange(rangeStr?: string): { start: number; end: number } | undefined {
  if (!rangeStr) return undefined
  const rangeMatch = rangeStr.match(/^(\d+)(?:-(\d+))?$/)
  if (!rangeMatch) return undefined
  const start = parseInt(rangeMatch[1])
  const end = rangeMatch[2] ? parseInt(rangeMatch[2]) : start
  return { start, end: Math.max(start, end) }
}

// ============================================================================
// 上下文组装（纯函数）
// ============================================================================

export function assembleExplainContext(
  filePath: string,
  content: string,
  lineRange?: { start: number; end: number },
  query?: string,
  symbolName?: string,
): ExplainContext {
  // 1. 提取符号
  const symbols = extractSymbols(content)

  // 2. 过滤目标行范围的内容
  const lines = content.split('\n')
  const effectiveRange = lineRange || { start: 1, end: lines.length }
  const startLine = Math.max(0, effectiveRange.start - 1)
  const endLine = Math.min(lines.length, effectiveRange.end)
  const selectedContent = lines.slice(startLine, endLine).join('\n')

  // 3. 上下文块：目标行前后各 5 行
  const contextStart = Math.max(0, startLine - 5)
  const contextEnd = Math.min(lines.length, endLine + 5)
  const contextChunks = [
    {
      content: lines.slice(contextStart, contextEnd).join('\n'),
      lineStart: contextStart + 1,
      lineEnd: contextEnd,
      score: 1.0,
    },
  ]

  // 4. 知识图谱关系
  const graph = buildKnowledgeGraph([{ path: filePath, content, mtimeMs: 0, size: content.length, chunks: [], symbols }])
  const nodeId = `file:${filePath}`
  const outgoingEdges = graph.edges.filter(e => e.from === nodeId)
  const incomingEdges = graph.edges.filter(e => e.to === nodeId)

  const imports: string[] = []
  const calls: string[] = []
  const extendsList: string[] = []
  const implementsList: string[] = []

  for (const edge of outgoingEdges) {
    if (edge.type === 'imports') {
      const targetNode = graph.nodes.find(n => n.id === edge.to)
      if (targetNode) imports.push(targetNode.name)
    }
    if (edge.type === 'calls') {
      const targetNode = graph.nodes.find(n => n.id === edge.to)
      if (targetNode) calls.push(targetNode.name)
    }
    if (edge.type === 'extends') {
      const targetNode = graph.nodes.find(n => n.id === edge.to)
      if (targetNode) extendsList.push(targetNode.name)
    }
    if (edge.type === 'implements') {
      const targetNode = graph.nodes.find(n => n.id === edge.to)
      if (targetNode) implementsList.push(targetNode.name)
    }
  }

  // 5. 查询分析
  let queryTerms: string[] = []
  let targetSymbols: string[] = []
  if (query) {
    const analysis = analyzeQuery(query)
    queryTerms = analysis.terms
    targetSymbols = analysis.targets
  }
  if (symbolName) {
    targetSymbols.push(symbolName)
  }

  return {
    filePath,
    content: selectedContent,
    lineRange: effectiveRange,
    symbols: symbols.filter(s => {
      if (!lineRange) return true
      return s.line >= effectiveRange.start && s.line <= effectiveRange.end
    }),
    contextChunks,
    relations: {
      imports: [...new Set(imports)],
      calls: [...new Set(calls)],
      extends: extendsList[0],
      implements: [...new Set(implementsList)],
    },
    queryTerms,
    targetSymbols,
  }
}

// ============================================================================
// LLM Prompt 组装
// ============================================================================

export function buildExplainPrompt(ctx: ExplainContext): string {
  const parts: string[] = []

  parts.push('# 代码解释请求')
  parts.push('')
  parts.push(`## 目标文件: ${ctx.filePath}`)

  if (ctx.lineRange) {
    parts.push(`## 目标行范围: ${ctx.lineRange.start}-${ctx.lineRange.end}`)
  }

  if (ctx.targetSymbols.length > 0) {
    parts.push(`## 目标符号: ${ctx.targetSymbols.join(', ')}`)
  }

  if (ctx.queryTerms.length > 0) {
    parts.push(`## 查询关键词: ${ctx.queryTerms.join(', ')}`)
  }

  parts.push('')
  parts.push('## 代码内容')
  parts.push('```')
  parts.push(ctx.content)
  parts.push('```')
  parts.push('')

  if (ctx.symbols.length > 0) {
    parts.push('## 涉及的符号')
    for (const sym of ctx.symbols.slice(0, 20)) {
      parts.push(`- ${sym.kind} ${sym.name} (行 ${sym.line})`)
    }
    parts.push('')
  }

  if (ctx.contextChunks.length > 0) {
    parts.push('## 上下文代码')
    for (const chunk of ctx.contextChunks) {
      parts.push(`\`\`\` (行 ${chunk.lineStart}-${chunk.lineEnd})`)
      parts.push(chunk.content)
      parts.push('```')
    }
    parts.push('')
  }

  if (ctx.relations.imports.length > 0 || ctx.relations.calls.length > 0 || ctx.relations.extends || ctx.relations.implements.length > 0) {
    parts.push('## 关系图谱')
    if (ctx.relations.imports.length > 0) {
      parts.push(`- 导入: ${ctx.relations.imports.join(', ')}`)
    }
    if (ctx.relations.calls.length > 0) {
      parts.push(`- 调用: ${ctx.relations.calls.join(', ')}`)
    }
    if (ctx.relations.extends) {
      parts.push(`- 继承: ${ctx.relations.extends}`)
    }
    if (ctx.relations.implements.length > 0) {
      parts.push(`- 实现: ${ctx.relations.implements.join(', ')}`)
    }
    parts.push('')
  }

  parts.push('## 请解释')
  parts.push('请用中文解释以上代码：')
  parts.push('1. 这段代码的主要功能和用途')
  parts.push('2. 关键逻辑的执行流程')
  if (ctx.targetSymbols.length > 0) {
    parts.push(`3. ${ctx.targetSymbols.join(', ')} 的具体作用`)
  }
  parts.push('4. 可能的边界情况或需要注意的地方')
  parts.push('')
  parts.push('请保持简洁，控制在 200 字以内。')

  return parts.join('\n')
}

// ============================================================================
// 格式化输出
// ============================================================================

export function formatExplainResult(ctx: ExplainContext, explanation: string): string {
  const lines: string[] = []
  lines.push('📖 代码解释')
  lines.push('═'.repeat(50))
  lines.push('')
  lines.push(`📄 ${ctx.filePath}`)
  if (ctx.lineRange) {
    lines.push(`📍 行 ${ctx.lineRange.start}-${ctx.lineRange.end}`)
  }
  if (ctx.targetSymbols.length > 0) {
    lines.push(`🎯 目标: ${ctx.targetSymbols.join(', ')}`)
  }
  lines.push('')
  lines.push('─'.repeat(50))
  lines.push(explanation)
  lines.push('─'.repeat(50))
  lines.push('')
  if (ctx.relations.imports.length > 0) {
    lines.push(`📥 导入: ${ctx.relations.imports.join(', ')}`)
  }
  if (ctx.relations.calls.length > 0) {
    lines.push(`📞 调用: ${ctx.relations.calls.join(', ')}`)
  }
  if (ctx.symbols.length > 0) {
    lines.push(`🏷️  符号: ${ctx.symbols.slice(0, 5).map(s => `${s.kind} ${s.name}`).join(', ')}`)
  }
  return lines.join('\n')
}

// ============================================================================
// 快速解释（无 LLM，基于 AST 的静态分析）
// ============================================================================

export function quickExplain(ctx: ExplainContext): string {
  const parts: string[] = []
  const lines = ctx.content.split('\n')

  parts.push(`该代码段共 ${lines.length} 行，位于 ${ctx.filePath}`)

  if (ctx.symbols.length > 0) {
    const kinds = new Map<string, number>()
    for (const s of ctx.symbols) {
      kinds.set(s.kind, (kinds.get(s.kind) || 0) + 1)
    }
    parts.push(`定义了 ${ctx.symbols.length} 个符号：${Array.from(kinds.entries()).map(([k, c]) => `${c} 个 ${k}`).join('、')}`)
  }

  if (ctx.relations.imports.length > 0) {
    parts.push(`依赖 ${ctx.relations.imports.length} 个外部模块`)
  }
  if (ctx.relations.calls.length > 0) {
    parts.push(`调用了 ${ctx.relations.calls.length} 个函数/方法`)
  }
  if (ctx.relations.extends) {
    parts.push(`继承自 ${ctx.relations.extends}`)
  }
  if (ctx.relations.implements.length > 0) {
    parts.push(`实现接口 ${ctx.relations.implements.join(', ')}`)
  }

  // 检测常见模式
  const hasAsync = lines.some(l => /async\s/.test(l))
  const hasTry = lines.some(l => /try\s*\{/.test(l))
  const hasExport = lines.some(l => /export\s/.test(l))
  const hasClass = lines.some(l => /class\s/.test(l))

  const patterns: string[] = []
  if (hasAsync) patterns.push('异步操作')
  if (hasTry) patterns.push('错误处理')
  if (hasExport) patterns.push('对外导出')
  if (hasClass) patterns.push('面向对象')
  if (patterns.length > 0) {
    parts.push(`代码模式：${patterns.join('、')}`)
  }

  return parts.join('；') + '。'
}
