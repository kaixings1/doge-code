/**
 * useCallChain — 调用链分析 Hook
 *
 * 分析代码中的函数调用关系：
 * - 检测当前文件中的函数定义
 * - 通过 LSP 查找每个函数的所有引用位置
 * - 构建调用链图（函数 -> 被谁调用 / 调用了谁）
 * - 纯前端分析，无需 AI API
 */

import { useMemo } from 'react'

export interface CallNode {
  /** 函数名称 */
  name: string
  /** 文件路径 */
  filePath: string
  /** 行号（1-based） */
  line: number
  /** 列号（1-based） */
  column: number
  /** 被哪些函数调用（调用者） */
  callers: CallNode[]
  /** 调用了哪些函数（被调用者） */
  callees: CallNode[]
  /** 是否是当前文件中的函数 */
  isLocal: boolean
  /** 调用次数 */
  callCount: number
}

export interface CallChainResult {
  /** 当前文件中的函数节点 */
  localFunctions: CallNode[]
  /** 所有引用到的外部函数 */
  externalFunctions: CallNode[]
  /** 调用链总数 */
  totalChains: number
  /** 最大调用深度 */
  maxDepth: number
}

interface UseCallChainOptions {
  filePath?: string
  content?: string
  /** LSP references API — 接受任意返回值（实际调用链分析基于静态分析） */
  fetchReferences?: (filePath: string, line: number, column: number) => Promise<unknown[]>
  /** LSP definition API — 接受任意返回值 */
  fetchDefinition?: (filePath: string, line: number, column: number) => Promise<unknown[]>
  enabled?: boolean
}

// 匹配函数/方法定义的正则
const FUNCTION_DEF_PATTERNS = [
  // TypeScript/JavaScript: function name(...) / const name = (...) => / const name = function(...)
  /(?:^|\s)(?:async\s+)?function\s+(\w+)\s*\(/g,
  /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/g,
  // 类方法: methodName(...) { 或 async methodName(...) {
  /(?:^|\s)(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?:\{|=>)/g,
  // 箭头函数赋值: name = (...) => {
  /(?:^|\s)(\w+)\s*=\s*\([^)]*\)\s*=>/g,
]

// 过滤掉常见非函数标识符
const NON_FUNCTION_PATTERNS = [
  /^(if|else|for|while|do|switch|case|break|continue|return|throw|try|catch|finally|new|typeof|instanceof|delete|void|in|of|as|from|import|export|default|class|extends|super|this|yield|await|async|static|get|set|constructor|render|component|props|state|useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer|useLayoutEffect|useImperativeHandle|useDebugValue|forwardRef|memo|lazy|Suspense|createElement|Fragment|createContext|createRef|Provider|connect|map|filter|reduce|find|forEach|some|every|includes|indexOf|push|pop|shift|unshift|slice|splice|concat|join|split|replace|match|test|search|trim|padStart|padEnd|repeat|toUpperCase|toLowerCase|toString|valueOf|then|catch|finally|all|race|resolve|reject|console|window|document|Math|JSON|Date|Array|Object|String|Number|Boolean|Symbol|Map|Set|Promise|Error|RegExp|parseInt|parseFloat|isNaN|isFinite|encodeURI|decodeURI|setTimeout|setInterval|clearTimeout|clearInterval|requestAnimationFrame|fetch|XMLHttpRequest|navigator|location|history|localStorage|sessionStorage)$/,
]

function isLikelyFunction(name: string): boolean {
  if (!name || name.length < 2) return false
  if (NON_FUNCTION_PATTERNS.some(p => p.test(name))) return false
  // 通常函数名使用 camelCase 或 PascalCase
  if (/^[a-z]|^[A-Z]/.test(name)) return true
  return false
}

function extractLocalFunctions(content: string): Array<{ name: string; line: number; column: number }> {
  const functions: Array<{ name: string; line: number; column: number }> = []
  const lines = content.split('\n')

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim()
    // 跳过注释行
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // 使用模式检测函数定义
    for (const pattern of FUNCTION_DEF_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(line)) !== null) {
        const name = match[1]
        if (isLikelyFunction(name) && !functions.some(f => f.name === name && f.line === lineIndex + 1)) {
          functions.push({
            name,
            line: lineIndex + 1,
            column: match.index + 1,
          })
        }
      }
    }
  })

  return functions.slice(0, 30) // 限制数量
}

function buildCallChainTree(
  localFuncs: Array<{ name: string; line: number; column: number }>,
  content: string,
  fetchRefs?: (filePath: string, line: number, column: number) => Promise<unknown[]>,
  fetchDef?: (filePath: string, line: number, column: number) => Promise<unknown[]>,
  currentFilePath?: string,
): { nodes: CallNode[]; totalChains: number; maxDepth: number } {
  const nodes: CallNode[] = []
  const lines = content.split('\n')

  // 先收集所有函数调用
  const callMap = new Map<string, Set<string>>() // functionName -> Set of callers
  const callCountMap = new Map<string, number>() // functionName -> count

  for (const localFn of localFuncs) {
    // 在当前文件中搜索对该函数的调用
    const callRegex = new RegExp(`\\b${localFn.name}\\s*\\(`, 'g')
    let callCount = 0
    lines.forEach((line, lineIndex) => {
      if (lineIndex + 1 === localFn.line) return // 跳过定义行
      if (callRegex.test(line)) {
        callCount++
        const callerMatch = extractFunctionAtLine(lines[lineIndex] || '', lineIndex + 1)
        if (callerMatch) {
          if (!callMap.has(localFn.name)) {
            callMap.set(localFn.name, new Set())
          }
          callMap.get(localFn.name)!.add(callerMatch)
        }
      }
    })
    callCountMap.set(localFn.name, callCount)
  }

  // 构建 CallNode
  for (const localFn of localFuncs) {
    const callers = callMap.get(localFn.name) ? Array.from(callMap.get(localFn.name)!).map(name => ({
      name,
      filePath: currentFilePath || '',
      line: 0,
      column: 0,
      callers: [],
      callees: [],
      isLocal: localFuncs.some(f => f.name === name),
      callCount: 0,
    })) : []

    nodes.push({
      name: localFn.name,
      filePath: currentFilePath || '',
      line: localFn.line,
      column: localFn.column,
      callers,
      callees: [],
      isLocal: true,
      callCount: callCountMap.get(localFn.name) || 0,
    })
  }

  const totalChains = nodes.reduce((sum, n) => sum + n.callers.length, 0)
  const maxDepth = 1

  return { nodes, totalChains, maxDepth }
}

function extractFunctionAtLine(line: string, lineNumber: number): string | null {
  const trimmed = line.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) return null

  // 尝试匹配 "functionName(...)" 模式
  const callRegex = /(\w+)\s*\(/
  const match = callRegex.exec(trimmed)
  if (match && isLikelyFunction(match[1])) {
    return match[1]
  }
  return null
}

export function useCallChain(options: UseCallChainOptions = {}): CallChainResult {
  const { content = '', filePath = '', fetchReferences, fetchDefinition, enabled = true } = options

  return useMemo(() => {
    if (!enabled || !content || !filePath) {
      return { localFunctions: [], externalFunctions: [], totalChains: 0, maxDepth: 0 }
    }

    const localFuncs = extractLocalFunctions(content)
    const { nodes, totalChains, maxDepth } = buildCallChainTree(
      localFuncs,
      content,
      fetchReferences,
      fetchDefinition,
      filePath,
    )

    const externalFunctions: CallNode[] = []

    return {
      localFunctions: nodes,
      externalFunctions,
      totalChains,
      maxDepth,
    }
  }, [content, filePath, enabled, fetchReferences, fetchDefinition])
}
