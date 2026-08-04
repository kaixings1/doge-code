/**
 * SemanticSearchPanel — 语义代码搜索面板
 *
 * 功能：
 * - 自然语言搜索代码库
 * - 搜索结果展示（文件路径、行号、内容、相关度评分）
 * - 搜索历史记录
 * - 搜索过滤（文件类型、目录、最大结果数）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface SemanticSearchResult {
  filePath: string
  lineNumber: number
  column: number
  content: string
  score: number
  context?: string
}

interface SearchHistoryItem {
  query: string
  timestamp: number
  resultCount: number
}

interface SearchFilters {
  maxResults: number
  fileTypes: string[]
  directories: string[]
}

interface SemanticSearchPanelProps {
  cwd: string
  theme: ThemeColors
  onSelectResult?: (result: SemanticSearchResult) => void
}

const MAX_HISTORY = 20
const STORAGE_KEY = 'doge-semantic-search-history'

export function SemanticSearchPanel({ cwd, theme, onSelectResult }: SemanticSearchPanelProps): JSX.Element {
  const c = theme
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [history, setHistory] = useState<SearchHistoryItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SearchFilters>({
    maxResults: 20,
    fileTypes: [],
    directories: [],
  })
  const [indexInfo, setIndexInfo] = useState<{ fileCount: number; chunkCount: number; lastIndexedAt: number } | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 加载索引状态
  const loadIndexStatus = useCallback(async () => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.indexStatus?.()
      if (res?.success && res.stats) {
        setIndexInfo({ fileCount: res.stats.fileCount, chunkCount: res.stats.chunkCount, lastIndexedAt: res.stats.lastIndexedAt })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadIndexStatus() }, [loadIndexStatus])

  const handleRebuild = useCallback(async () => {
    setRebuilding(true)
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.indexRebuild?.(true)
      if (res?.success && res.stats) {
        setIndexInfo({ fileCount: res.stats.fileCount, chunkCount: res.stats.chunkCount, lastIndexedAt: res.stats.lastIndexedAt })
      }
    } catch { /* ignore */ }
    setRebuilding(false)
  }, [])

  // 加载搜索历史
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setHistory(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  const saveSearchHistory = useCallback((items: SearchHistoryItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
    } catch { /* ignore */ }
  }, [])

  // 执行语义搜索
  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.semanticSearch?.({
        query: searchQuery.trim(),
        cwd,
        maxResults: filters.maxResults,
        fileTypes: filters.fileTypes.length > 0 ? filters.fileTypes : undefined,
        directories: filters.directories.length > 0 ? filters.directories : undefined,
      })

      if (result?.success && result?.results) {
        setResults(result.results)

        // 添加到历史
        const newItem: SearchHistoryItem = {
          query: searchQuery,
          timestamp: Date.now(),
          resultCount: result.results.length,
        }
        const newHistory = [newItem, ...history.filter(h => h.query !== searchQuery)].slice(0, MAX_HISTORY)
        setHistory(newHistory)
        saveSearchHistory(newHistory)
      } else {
        setError(result?.error || '搜索失败')
        setResults([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索请求失败')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [cwd, filters, history, saveSearchHistory])

  // 防抖搜索
  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => { executeSearch(value) }, 500)
  }, [executeSearch])

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 索引状态 */}
      {indexInfo && (
        <div style={{ padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.bgPanel }}>
          <span style={{ color: c.textFaint, fontSize: '9px' }}>
            📚 {indexInfo.fileCount} 文件 · {indexInfo.chunkCount} chunks
          </span>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            style={{
              padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px',
              background: 'transparent', color: c.accent, cursor: rebuilding ? 'default' : 'pointer',
              fontSize: '9px', opacity: rebuilding ? 0.5 : 1,
            }}
          >
            {rebuilding ? '重建中...' : '⟳ 重建'}
          </button>
        </div>
      )}

      {/* 搜索框 */}
      <div style={{ padding: '8px', borderBottom: `1px solid ${c.border}` }}>
        <input
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          placeholder="语义搜索（自然语言）..."
          style={{
            width: '100%', padding: '6px 8px', background: c.inputBg,
            border: `1px solid ${c.border}`, borderRadius: '4px',
            color: c.text, fontSize: '11px', outline: 'none',
          }}
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ padding: '6px 8px', background: c.errorBg, color: c.errorText, fontSize: '10px' }}>
          {error}
        </div>
      )}

      {/* 搜索结果 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {isSearching ? (
          <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>搜索中...</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>
            {query ? '无匹配结果' : '输入关键词开始搜索'}
          </div>
        ) : (
          results.map((r, i) => (
            <div
              key={`${r.filePath}-${r.lineNumber}-${i}`}
              onClick={() => onSelectResult?.(r)}
              style={{
                padding: '4px 8px', cursor: 'pointer',
                borderBottom: `1px solid ${c.borderSubtle}`,
              }}
              title={r.filePath}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.filePath.replace(cwd + '/', '')}:L{r.lineNumber}
                </span>
                <span style={{ color: c.accent, fontSize: '9px', flexShrink: 0 }}>
                  {(r.score * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ color: c.textFaint, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 搜索历史 */}
      {history.length > 0 && (
        <div style={{ borderTop: `1px solid ${c.border}`, maxHeight: '100px', overflowY: 'auto' }}>
          <div style={{ padding: '4px 8px', fontSize: '9px', color: c.textMuted }}>搜索历史</div>
          {history.slice(0, 5).map((h, i) => (
            <div
              key={i}
              onClick={() => { setQuery(h.query); executeSearch(h.query) }}
              style={{ padding: '2px 8px', cursor: 'pointer', color: c.textFaint, fontSize: '10px' }}
            >
              {h.query} ({h.resultCount})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
