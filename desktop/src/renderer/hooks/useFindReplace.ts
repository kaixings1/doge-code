/**
 * useFindReplace - 查找替换 Hook
 *
 * 管理：
 * - 搜索查询和替换文本
 * - 匹配结果列表
 * - 当前匹配索引
 * - 选项（大小写/正则/全词）
 * - Monaco findMatches API 集成
 */

import { useState, useCallback, useMemo } from 'react'
import { FindReplaceEngine, MatchResult } from '../utils/FindReplaceEngine.js'

export interface UseFindReplaceReturn {
  query: string
  replacement: string
  matches: MatchResult[]
  currentMatchIndex: number
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  setQuery: (q: string) => void
  setReplacement: (r: string) => void
  setCurrentMatchIndex: (i: number) => void
  toggleCaseSensitive: () => void
  toggleWholeWord: () => void
  toggleRegex: () => void
  replaceOne: (text: string) => { result: string; count: number }
  replaceAll: (text: string) => { result: string; count: number }
  find: (text: string) => void
  nextMatch: () => void
  prevMatch: () => void
  totalMatches: number
}

export function useFindReplace(initialText: string = ''): UseFindReplaceReturn {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)

  const toggleCaseSensitive = useCallback(() => setCaseSensitive(p => !p), [])
  const toggleWholeWord = useCallback(() => setWholeWord(p => !p), [])
  const toggleRegex = useCallback(() => setUseRegex(p => !p), [])

  const find = useCallback((text: string) => {
    if (!query) { setMatches([]); setCurrentMatchIndex(-1); return }
    const results = FindReplaceEngine.find(text, query, { caseSensitive, wholeWord, useRegex })
    setMatches(results)
    setCurrentMatchIndex(results.length > 0 ? 0 : -1)
  }, [query, caseSensitive, wholeWord, useRegex])

  const nextMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentMatchIndex(p => (p + 1) % matches.length)
  }, [matches.length])

  const prevMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentMatchIndex(p => (p - 1 + matches.length) % matches.length)
  }, [matches.length])

  const replaceOne = useCallback((text: string) => {
    if (matches.length === 0 || currentMatchIndex < 0) return { result: text, count: 0 }
    const match = matches[currentMatchIndex]
    const before = text.slice(0, match.index)
    const after = text.slice(match.index + match.length)
    const result = before + replacement + after
    return { result, count: 1 }
  }, [matches, currentMatchIndex, replacement])

  const replaceAll = useCallback((text: string) => {
    const { result, count } = FindReplaceEngine.replaceAll(text, query, replacement, { caseSensitive, wholeWord, useRegex })
    return { result, count }
  }, [query, replacement, caseSensitive, wholeWord, useRegex])

  const totalMatches = matches.length

  return {
    query, replacement, matches, currentMatchIndex,
    caseSensitive, wholeWord, useRegex,
    setQuery, setReplacement, setCurrentMatchIndex,
    toggleCaseSensitive, toggleWholeWord, toggleRegex,
    replaceOne, replaceAll, find,
    nextMatch, prevMatch, totalMatches,
  }
}
