/**
 * FindReplaceEngine - 查找/替换引擎
 *
 * 纯 TS 类，支持：
 * - 普通文本查找
 * - 正则查找
 * - 全词匹配
 * - 区分大小写
 * - 替换
 * - 全部替换
 */

export interface MatchResult {
  index: number
  length: number
  text: string
  line: number
  column: number
}

export interface FindOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
}

export class FindReplaceEngine {
  static find(text: string, query: string, options: FindOptions = {}): MatchResult[] {
    if (!query) return []
    const { caseSensitive = false, wholeWord = false, useRegex = false } = options

    let pattern: RegExp
    if (useRegex) {
      const flags = caseSensitive ? 'g' : 'gi'
      try {
        pattern = new RegExp(query, flags)
      } catch {
        return []
      }
    } else {
      const escaped = query.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')
      const wordBoundary = wholeWord ? '\\b' : ''
      const flags = caseSensitive ? 'g' : 'gi'
      pattern = new RegExp(wordBoundary + escaped + wordBoundary, flags)
    }

    const results: MatchResult[] = []
    const lines = text.split('\n')
    let globalIndex = 0

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(line)) !== null) {
        results.push({
          index: globalIndex + match.index,
          length: match[0].length,
          text: match[0],
          line: lineIdx + 1,
          column: match.index + 1,
        })
        if (!useRegex) break
      }
      globalIndex += line.length + 1
    }

    return results
  }

  static replace(text: string, query: string, replacement: string, options: FindOptions = {}): { result: string; count: number } {
    if (!query) return { result: text, count: 0 }
    const { caseSensitive = false, wholeWord = false, useRegex = false } = options

    let pattern: RegExp
    if (useRegex) {
      const flags = caseSensitive ? 'g' : 'gi'
      try {
        pattern = new RegExp(query, flags)
      } catch {
        return { result: text, count: 0 }
      }
    } else {
      const escaped = query.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')
      const wordBoundary = wholeWord ? '\\b' : ''
      const flags = caseSensitive ? 'g' : 'gi'
      pattern = new RegExp(wordBoundary + escaped + wordBoundary, flags)
    }

    const count = (text.match(pattern) || []).length
    const result = text.replace(pattern, replacement)
    return { result, count }
  }

  static replaceAll(text: string, query: string, replacement: string, options: FindOptions = {}): { result: string; count: number } {
    return FindReplaceEngine.replace(text, query, replacement, { ...options })
  }
}
