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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [searchMode, setSearchMode] = useState<'semantic' | 'symbol'>('semantic')
  const [symbolQuery, setSymbolQuery] = useState('')
  const [symbolResults, setSymbolResults] = useState<Array<{ filePath: string; name: string; kind: string; line: number; score: number }>>([])
  const [isSymbolSearching, setIsSymbolSearching] = useState(false)
  const symbolDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 复制结果列表为 Markdown
  const handleCopyResults = useCallback(async () => {
    if (results.length === 0) return
    const lines = results.map((r, i) => {
      const rel = r.filePath.replace(cwd + '/', '').replace(cwd + '\\', '')
      return `${i + 1}. \`${rel}:${r.lineNumber}\` — ${r.content}（相关度 ${(r.score * 100).toFixed(0)}%）`
    })
    const md = `## 语义搜索结果（${results.length} 条）\n\n${lines.join('\n')}`
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }, [results, cwd])

  // 全部展开/折叠
  const handleToggleAllGroups = useCallback((collapse: boolean) => {
    const dirs = new Set(results.map(r => {
      const rel = r.filePath.replace(cwd + '/', '').replace(cwd + '\\', '')
      return rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : rel.includes('\\') ? rel.slice(0, rel.lastIndexOf('\\')) : '(根目录)'
    }))
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (collapse) dirs.forEach(d => next.add(d))
      else dirs.forEach(d => next.delete(d))
      return next
    })
  }, [results, cwd])

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

  // 符号检索（按函数/类/接口/变量名精确匹配）
  const executeSymbolSearch = useCallback(async (value: string) => {
    if (!value.trim()) { setSymbolResults([]); return }
    setIsSymbolSearching(true)
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.indexSymbolSearch?.({ query: value.trim(), maxResults: 30 })
      if (result?.success && result?.results) setSymbolResults(result.results)
      else setSymbolResults([])
    } catch { setSymbolResults([]) }
    setIsSymbolSearching(false)
  }, [])

  const handleSymbolInputChange = useCallback((value: string) => {
    setSymbolQuery(value)
    if (symbolDebounceRef.current) clearTimeout(symbolDebounceRef.current)
    symbolDebounceRef.current = setTimeout(() => { executeSymbolSearch(value) }, 300)
  }, [executeSymbolSearch])

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 索引状态 */}
      {indexInfo && (
        <div style={{ padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.bgPanel }}>
          <span style={{ color: c.textFaint, fontSize: '9px' }}>
            📚 {indexInfo.fileCount} 文件 · {indexInfo.chunkCount} chunks
          </span>
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            {results.length > 0 && (
              <>
                <button
                  onClick={() => handleToggleAllGroups(true)}
                  title="折叠全部分组"
                  style={{
                    padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                    background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '9px',
                  }}
                >
                  ⏹ 全折叠
                </button>
                <button
                  onClick={() => handleToggleAllGroups(false)}
                  title="展开全部分组"
                  style={{
                    padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                    background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '9px',
                  }}
                >
                  ⏺ 全展开
                </button>
                <button
                  onClick={handleCopyResults}
                  title="复制结果列表为 Markdown"
                  style={{
                    padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                    background: copied ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: copied ? '#10b981' : c.accent, cursor: 'pointer', fontSize: '9px',
                  }}
                >
                  {copied ? '✅ 已复制' : '📋 复制'}
                </button>
              </>
            )}
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
        </div>
      )}

      {/* 搜索框 */}
      <div style={{ padding: '8px', borderBottom: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {/* 模式切换 */}
        <div style={{ display: 'flex', gap: '3px' }}>
          <button
            onClick={() => setSearchMode('semantic')}
            style={{
              padding: '2px 8px', border: `1px solid ${searchMode === 'semantic' ? c.accent : c.border}`, borderRadius: '3px',
              background: searchMode === 'semantic' ? c.accentDim : 'transparent',
              color: searchMode === 'semantic' ? c.accent : c.textMuted,
              cursor: 'pointer', fontSize: '9px', fontWeight: searchMode === 'semantic' ? 600 : 400,
            }}
            title="自然语言语义搜索（BM25 索引）"
          >
            🧠 语义
          </button>
          <button
            onClick={() => setSearchMode('symbol')}
            style={{
              padding: '2px 8px', border: `1px solid ${searchMode === 'symbol' ? c.accent : c.border}`, borderRadius: '3px',
              background: searchMode === 'symbol' ? c.accentDim : 'transparent',
              color: searchMode === 'symbol' ? c.accent : c.textMuted,
              cursor: 'pointer', fontSize: '9px', fontWeight: searchMode === 'symbol' ? 600 : 400,
            }}
            title="按符号名检索（函数/类/接口/变量，精确匹配）"
          >
            ⚙ 符号
          </button>
        </div>
        {searchMode === 'semantic' ? (
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
        ) : (
          <input
            value={symbolQuery}
            onChange={e => handleSymbolInputChange(e.target.value)}
            placeholder="符号检索（如: handlePreviewFile / fetchUserData）"
            style={{
              width: '100%', padding: '6px 8px', background: c.inputBg,
              border: `1px solid ${c.border}`, borderRadius: '4px',
              color: c.text, fontSize: '11px', outline: 'none', fontFamily: 'monospace',
            }}
          />
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ padding: '6px 8px', background: c.errorBg, color: c.errorText, fontSize: '10px' }}>
          {error}
        </div>
      )}

      {/* 搜索结果 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {searchMode === 'symbol' ? (
          isSymbolSearching ? (
            <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>符号检索中...</div>
          ) : symbolResults.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>
              {symbolQuery ? '未找到匹配符号（可先点「⟳ 重建」重建索引）' : '输入符号名开始检索'}
            </div>
          ) : (
            <div>
              <div style={{ padding: '3px 8px', fontSize: '9px', color: c.textMuted, borderBottom: `1px solid ${c.borderSubtle}` }}>
                ⚙ 符号结果（{symbolResults.length} 个）
              </div>
              {symbolResults.map((s, i) => {
                const kindColor = s.kind === 'class' || s.kind === 'interface' ? '#8b5cf6' : s.kind === 'function' || s.kind === 'method' || s.kind === 'component' ? '#10b981' : '#f59e0b'
                const rel = s.filePath.replace(cwd + '/', '').replace(cwd + '\\', '')
                return (
                  <div
                    key={`${s.filePath}-${s.name}-${s.line}-${i}`}
                    onClick={() => onSelectResult?.({ filePath: s.filePath, lineNumber: s.line, column: 1, content: s.name, score: s.score / 100 })}
                    style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: `1px solid ${c.borderSubtle}` }}
                    title={`${s.filePath}:${s.line}\n点击跳转`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                        <span style={{ color: kindColor, fontSize: '9px', flexShrink: 0, border: `1px solid ${kindColor}44`, borderRadius: '2px', padding: '0 3px' }}>{s.kind}</span>
                        <span style={{ color: c.accent, fontFamily: 'monospace', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      </span>
                      <span style={{ color: c.textFaint, fontSize: '9px', flexShrink: 0, marginLeft: '6px' }}>{s.score}%</span>
                    </div>
                    <div style={{ color: c.textFaint, fontSize: '9px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rel}:{s.line}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : isSearching ? (
          <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>搜索中...</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>
            {query ? '无匹配结果' : '输入关键词开始搜索'}
          </div>
        ) : (
          (() => {
            // 按父目录分组聚类
            const groups = new Map<string, SemanticSearchResult[]>()
            for (const r of results) {
              const rel = r.filePath.replace(cwd + '/', '').replace(cwd + '\\', '')
              const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : rel.includes('\\') ? rel.slice(0, rel.lastIndexOf('\\')) : '(根目录)'
              const arr = groups.get(dir) || []
              arr.push(r)
              groups.set(dir, arr)
            }
            return Array.from(groups.entries()).map(([dir, items]) => {
              const isCollapsed = collapsedGroups.has(dir)
              return (
                <div key={dir}>
                  {/* 组头 */}
                  <div
                    onClick={() => setCollapsedGroups(prev => {
                      const next = new Set(prev)
                      if (next.has(dir)) next.delete(dir)
                      else next.add(dir)
                      return next
                    })}
                    style={{
                      padding: '3px 8px', cursor: 'pointer', fontSize: '9px',
                      color: c.accent, fontWeight: 600,
                      background: c.bgPanel, borderBottom: `1px solid ${c.borderSubtle}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      position: 'sticky', top: 0, zIndex: 1,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isCollapsed ? '▶' : '▼'} {dir === '(根目录)' ? dir : dir}
                    </span>
                    <span style={{ color: c.textFaint, flexShrink: 0, marginLeft: '6px' }}>{items.length}</span>
                  </div>
                  {!isCollapsed && items.map((r, i) => (
                    <div
                      key={`${r.filePath}-${r.lineNumber}-${i}`}
                      onClick={() => onSelectResult?.(r)}
                      style={{
                        padding: '4px 8px', paddingLeft: '16px', cursor: 'pointer',
                        borderBottom: `1px solid ${c.borderSubtle}`,
                      }}
                      title={r.filePath}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.filePath.replace(cwd + '/', '').replace(cwd + '\\', '').split('/').pop()}:L{r.lineNumber}
                        </span>
                        <span style={{ color: c.accent, fontSize: '9px', flexShrink: 0 }}>
                          {(r.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ color: c.textFaint, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.content}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })
          })()
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
