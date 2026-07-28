/**
 * SemanticSearchPanel — 语义搜索面板
 *
 * 功能：
 * - 自然语言搜索输入框
 * - 搜索结果列表（匹配代码片段 + 文件路径 + 行号）
 * - 搜索结果点击跳转到代码位置
 * - 搜索历史记录
 * - 搜索过滤（按文件类型/目录）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'



/** 搜索结果项 */
interface SearchResult {
  filePath: string
  lineNumber: number
  column: number
  content: string
  score: number
  /** 匹配上下文（前后若干行） */
  context?: string
}

/** 搜索过滤选项 */
interface SearchFilters {
  fileTypes: string[]
  directories: string[]
  maxResults: number
}

/** 搜索历史项 */
interface SearchHistoryItem {
  query: string
  timestamp: number
  resultCount: number
}

interface SemanticSearchPanelProps {
  /** 工作目录 */
  cwd: string
  /** 主题颜色 */
  theme: ThemeColors
  /** 搜索结果点击回调（跳转到代码位置） */
  onResultClick: (filePath: string, lineNumber: number, column?: number) => void
  /** 搜索完成回调 */
  onSearchComplete?: (query: string, count: number) => void
  /** 是否默认展开 */
  defaultExpanded?: boolean
}

const SEARCH_HISTORY_KEY = 'doge-semantic-search-history'
const MAX_HISTORY = 20
const DEFAULT_MAX_RESULTS = 30

/**
 * 加载搜索历史
 */
function loadSearchHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 保存搜索历史
 */
function saveSearchHistory(history: SearchHistoryItem[]): void {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {
    // ignore
  }
}

/**
 * 高亮匹配文本
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const qLower = query.toLowerCase()
  const idx = lower.indexOf(qLower)
  if (idx === -1) return text

  return (
    <>
      {text.slice(0, idx)}
      <span style={{ backgroundColor: '#FFD70044', color: '#FFD700', fontWeight: 600 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  )
}

export function SemanticSearchPanel({
  cwd,
  theme,
  onResultClick,
  onSearchComplete,
  defaultExpanded = false,
}: SemanticSearchPanelProps): JSX.Element {
  const c = theme
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [history, setHistory] = useState<SearchHistoryItem[]>(loadSearchHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [filters, setFilters] = useState<SearchFilters>({
    fileTypes: [],
    directories: [],
    maxResults: DEFAULT_MAX_RESULTS,
  })
  const [showFilters, setShowFilters] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 执行语义搜索
  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const result = await window.dogeAPI?.semanticSearch({
        query: searchQuery.trim(),
        cwd,
        maxResults: filters.maxResults,
        fileTypes: filters.fileTypes.length > 0 ? filters.fileTypes : undefined,
        directories: filters.directories.length > 0 ? filters.directories : undefined,
      })

      if (result.success && result.results) {
        setResults(result.results)
        onSearchComplete?.(searchQuery, result.results.length)

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
        setError(result.error || '搜索失败')
        setResults([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索请求失败')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [cwd, filters, history, onSearchComplete])

  // 防抖搜索
  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(value)
    }, 400)
  }, [executeSearch])

  // 从历史点击
  const handleHistoryClick = useCallback((item: SearchHistoryItem) => {
    setQuery(item.query)
    setShowHistory(false)
    executeSearch(item.query)
  }, [executeSearch])

  // 清除历史
  const handleClearHistory = useCallback(() => {
    setHistory([])
    saveSearchHistory([])
  }, [])

  // 折叠/展开面板头部
  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${c.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: c.bgPanel,
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    display: expanded ? 'flex' : 'none',
    flexDirection: 'column',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 面板头部 */}
      <div style={headerStyle} onClick={() => setExpanded(p => !p)}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          语义搜索
        </span>
        <span style={{ fontSize: '10px', color: c.textFaint }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>

      {expanded && (
        <div style={bodyStyle}>
          {/* 搜索输入框 */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}` }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => handleInputChange(e.target.value)}
                onFocus={() => setShowHistory(true)}
                onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                placeholder="自然语言搜索代码..."
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  backgroundColor: c.inputBg,
                  border: `1px solid ${c.border}`,
                  borderRadius: '3px',
                  color: c.text,
                  fontSize: '11px',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowFilters(p => !p)}
                style={{
                  padding: '4px 8px',
                  border: `1px solid ${showFilters ? c.accent : c.border}`,
                  borderRadius: '3px',
                  backgroundColor: showFilters ? c.accentDim : c.bgPanel,
                  color: showFilters ? c.accent : c.textMuted,
                  cursor: 'pointer',
                  fontSize: '10px',
                }}
                title="过滤选项"
              >⚙</button>
            </div>

            {/* 过滤面板 */}
            {showFilters && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10px', color: c.textFaint }}>
                  文件类型（逗号分隔，留空=全部）
                </div>
                <input
                  value={filters.fileTypes.join(', ')}
                  onChange={e => setFilters(p => ({ ...p, fileTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  placeholder=".ts, .tsx, .js"
                  style={{
                    padding: '3px 6px',
                    backgroundColor: c.inputBg,
                    border: `1px solid ${c.border}`,
                    borderRadius: '3px',
                    color: c.text,
                    fontSize: '10px',
                    outline: 'none',
                  }}
                />
                <div style={{ fontSize: '10px', color: c.textFaint }}>
                  最大结果数
                </div>
                <input
                  type="number"
                  value={filters.maxResults}
                  onChange={e => setFilters(p => ({ ...p, maxResults: Math.min(100, Math.max(5, Number(e.target.value))) }))}
                  min={5}
                  max={100}
                  style={{
                    padding: '3px 6px',
                    backgroundColor: c.inputBg,
                    border: `1px solid ${c.border}`,
                    borderRadius: '3px',
                    color: c.text,
                    fontSize: '10px',
                    outline: 'none',
                    width: '60px',
                  }}
                />
              </div>
            )}
          </div>

          {/* 搜索历史下拉 */}
          {showHistory && history.length > 0 && !query && (
            <div style={{
              position: 'absolute',
              top: '70px',
              left: '12px',
              right: '12px',
              backgroundColor: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
            }}>
              <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: c.textFaint }}>搜索历史</span>
                <span
                  onClick={handleClearHistory}
                  style={{ fontSize: '10px', color: c.errorText, cursor: 'pointer' }}
                >清除</span>
              </div>
              {history.map((item, i) => (
                <div
                  key={`${item.query}-${i}`}
                  onMouseDown={() => handleHistoryClick(item)}
                  style={{
                    padding: '4px 12px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: c.textMuted,
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${c.borderSubtle}`,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.query}</span>
                  <span style={{ color: c.textFaint, fontSize: '9px', marginLeft: '8px' }}>{item.resultCount} 条</span>
                </div>
              ))}
            </div>
          )}

          {/* 搜索状态 */}
          {isSearching && (
            <div style={{ padding: '8px 12px', color: c.textMuted, fontSize: '11px', textAlign: 'center' }}>
              搜索中...
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <div style={{ padding: '6px 12px', color: c.errorText, fontSize: '10px' }}>
              {error}
            </div>
          )}

          {/* 搜索结果统计 */}
          {!isSearching && results.length > 0 && (
            <div style={{ padding: '4px 12px', color: c.textFaint, fontSize: '10px', borderBottom: `1px solid ${c.borderSubtle}` }}>
              找到 {results.length} 个匹配
            </div>
          )}

          {/* 搜索结果列表 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div
                key={`${r.filePath}-${r.lineNumber}-${i}`}
                onClick={() => onResultClick(r.filePath, r.lineNumber, r.column)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${c.borderSubtle}`,
                  fontSize: '11px',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = c.hoverBg }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                {/* 文件路径 + 行号 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: c.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={r.filePath}>
                    {r.filePath.replace(cwd + '/', '')}
                  </span>
                  <span style={{ color: c.textFaint, fontSize: '9px', marginLeft: '8px', flexShrink: 0 }}>
                    L{r.lineNumber}:{r.column}
                  </span>
                </div>
                {/* 匹配内容 */}
                <div style={{ color: c.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '10px' }}>
                  {highlightMatch(r.content, query)}
                </div>
                {/* 相关度评分 */}
                <div style={{ color: c.textFaint, fontSize: '9px', marginTop: '2px' }}>
                  相关度: {(r.score * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>

          {/* 空状态 */}
          {!isSearching && results.length === 0 && query.length >= 2 && !error && (
            <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
              未找到匹配结果
            </div>
          )}
          {!isSearching && results.length === 0 && query.length < 2 && (
            <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
              输入至少 2 个字符开始搜索
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SemanticSearchPanel
