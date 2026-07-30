/**
 * usePreAnalysis — 轻量静态分析 Hook
 *
 * 在文件内容中检测可改进模式，返回建议列表。
 * 纯前端 regex 分析，无需调用 AI API。
 */

import { useMemo } from 'react'

export interface Suggestion {
  id: string
  type: 'todo' | 'long-func' | 'duplicate' | 'complex' | 'unused' | 'deprecated'
  severity: 'info' | 'warning' | 'suggestion'
  message: string
  /** 可选：一键采纳时执行的工具调用描述 */
  action?: string
  /** 匹配的行号 */
  line?: number
}

interface UsePreAnalysisOptions {
  /** 文件扩展名，用于调整分析规则 */
  extension?: string
  /** 是否启用分析 */
  enabled?: boolean
}

export function usePreAnalysis(
  content: string,
  options: UsePreAnalysisOptions = {}
): Suggestion[] {
  const { extension = '', enabled = true } = options

  return useMemo(() => {
    if (!enabled || !content) return []

    const suggestions: Suggestion[] = []
    const lines = content.split('\n')

    // 检测 TODO/FIXME/HACK
    const todoPattern = /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b|\bOPTIMIZE\b/i
    lines.forEach((line, i) => {
      if (todoPattern.test(line)) {
        const match = line.match(todoPattern)
        suggestions.push({
          id: `todo-${i}`,
          type: 'todo',
          severity: 'info',
          message: `第 ${i + 1} 行: ${match?.[0] || '标记'} — ${line.trim().slice(0, 60)}`,
          line: i + 1,
        })
      }
    })

    // 检测超长函数（简单启发式：连续 > 80 行无 top-level return/export）
    let funcStart = -1
    let funcDepth = 0
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('function ') || trimmed.startsWith('async function ') ||
          trimmed.startsWith('def ') || trimmed.startsWith('class ')) {
        funcStart = i
        funcDepth = 0
      }
      funcDepth += (trimmed.match(/\{/g) || []).length
      funcDepth -= (trimmed.match(/\}/g) || []).length
      if (funcStart >= 0 && funcDepth <= 0 && i > funcStart + 80) {
        suggestions.push({
          id: `long-func-${funcStart}`,
          type: 'long-func',
          severity: 'warning',
          message: `第 ${funcStart + 1} 行: 函数超过 80 行 (${i - funcStart + 1} 行)，建议拆分`,
          line: funcStart + 1,
          action: '建议拆分为多个小函数',
        })
        funcStart = -1
      }
    })

    // 检测重复代码（简化版：查找完全相同的连续 3+ 行）
    const seen = new Map<string, number[]>()
    for (let i = 0; i < lines.length - 2; i++) {
      const triple = lines.slice(i, i + 3).map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#')).join('\n')
      if (triple.length > 30) {
        const existing = seen.get(triple)
        if (existing) {
          existing.push(i + 1)
        } else {
          seen.set(triple, [i + 1])
        }
      }
    }
    for (const [block, lineNums] of seen) {
      if (lineNums.length > 1) {
        suggestions.push({
          id: `dup-${lineNums[0]}`,
          type: 'duplicate',
          severity: 'suggestion',
          message: `第 ${lineNums.join(', ')} 行: 发现 ${lineNums.length} 处重复代码块，建议提取为公共函数`,
          line: lineNums[0],
        })
      }
    }

    // 检测深度嵌套（> 4 层缩进）
    let maxNest = 0
    lines.forEach((line, i) => {
      const indent = line.length - line.trimStart().length
      const nest = Math.floor(indent / 2)
      if (nest > maxNest) maxNest = nest
      if (nest > 4) {
        suggestions.push({
          id: `complex-${i}`,
          type: 'complex',
          severity: 'warning',
          message: `第 ${i + 1} 行: 嵌套深度 ${nest} 层，建议简化逻辑或提取函数`,
          line: i + 1,
        })
      }
    })

    // 检测 deprecated API（常见标记）
    const deprecatedPatterns = [
      { pattern: /@deprecated/i, label: 'deprecated 注解' },
      { pattern: /\bcomponentWillMount\b/i, label: 'componentWillMount (已废弃)' },
      { pattern: /\bcomponentWillReceiveProps\b/i, label: 'componentWillReceiveProps (已废弃)' },
      { pattern: /\bUNSAFE_componentWillMount\b/i, label: 'UNSAFE_componentWillMount' },
    ]
    lines.forEach((line, i) => {
      for (const dp of deprecatedPatterns) {
        if (dp.pattern.test(line)) {
          suggestions.push({
            id: `deprecated-${i}-${dp.label}`,
            type: 'deprecated',
            severity: 'warning',
            message: `第 ${i + 1} 行: 使用 ${dp.label}`,
            line: i + 1,
          })
        }
      }
    })

    // 限制建议数量
    return suggestions.slice(0, 20)
  }, [content, extension, enabled])
}
