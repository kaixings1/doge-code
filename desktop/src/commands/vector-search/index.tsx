import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { CodeVectorStore } from '../../engine/codeVectorStore.js'

// ============================================================================
// VectorSearch 命令 - 代码库语义搜索（SQLite FTS5 BM25）
// ============================================================================

type SearchMode = 'all' | 'content' | 'symbol'

const MODE_LABELS: Record<SearchMode, string> = {
  all: '全文 + 符号',
  content: '全文内容',
  symbol: '符号名称',
}

const KIND_COLORS: Record<string, string> = {
  function: 'cyan',
  class: 'green',
  interface: 'yellow',
  type: 'magenta',
  enum: 'blue',
  const: 'gray',
  let: 'gray',
  var: 'gray',
  content: 'white',
}


// vectorSearchCommand 定义已移至文件末尾（TDZ 安全）
const vectorSearchUI: LocalJSXCommandCall = (_onDone, _context, args) => {
  const [query, setQuery] = React.useState(args?.trim() || '')
  const [results, setResults] = React.useState<
    Array<{ file: string; line: number; snippet: string; score: number; kind: string }>
  >([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [stats, setStats] = React.useState<{ filesIndexed: number; symbolsIndexed: number } | null>(null)
  const [mode, setMode] = React.useState<SearchMode>('all')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [indexing, setIndexing] = React.useState(false)

  const rootDir = process.cwd()

  // 初始化：自动索引 + 显示统计
  React.useEffect(() => {
    async function initStore() {
      setLoading(true)
      setError(null)
      try {
        const store = new CodeVectorStore({ rootDir })
        const indexResult = await store.index()
        const storeStats = store.getStats()
        setStats({
          filesIndexed: storeStats.filesIndexed,
          symbolsIndexed: storeStats.symbolsIndexed,
        })
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
    initStore()
  }, [rootDir])

  // 执行搜索
  async function performSearch(searchQuery: string, searchMode: SearchMode) {
    if (!searchQuery.trim()) return

    setLoading(true)
    setError(null)
    setSelectedIndex(0)
    try {
      const store = new CodeVectorStore({ rootDir })
      const storeStats = store.getStats()
      setStats({
        filesIndexed: storeStats.filesIndexed,
        symbolsIndexed: storeStats.symbolsIndexed,
      })

      let searchResults: typeof results = []
      if (searchMode === 'content') {
        const r = await store.search(searchQuery, 10)
        searchResults = r.map(item => ({
          file: item.file,
          line: item.line,
          snippet: item.snippet,
          score: item.score,
          kind: item.kind,
        }))
      } else if (searchMode === 'symbol') {
        const r = await store.searchSymbol(searchQuery)
        searchResults = r.map(item => ({
          file: item.file,
          line: item.line,
          snippet: item.snippet,
          score: item.score,
          kind: item.kind,
        }))
      } else {
        const [contentR, symbolR] = await Promise.all([
          store.search(searchQuery, 5),
          store.searchSymbol(searchQuery),
        ])
        searchResults = [
          ...contentR.map(item => ({ ...item, score: item.score * 0.9 })),
          ...symbolR.map(item => ({ ...item, score: 0.8 })),
        ]
          .sort((a, b) => b.score - a.score)
          .slice(0, 15)
      }
      setResults(searchResults)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  // 重新索引
  async function reindex() {
    setIndexing(true)
    setError(null)
    try {
      const store = new CodeVectorStore({ rootDir })
      // 清除缓存强制重新索引
      store.clearCache()
      await store.index()
      const storeStats = store.getStats()
      setStats({
        filesIndexed: storeStats.filesIndexed,
        symbolsIndexed: storeStats.symbolsIndexed,
      })
      setIndexing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIndexing(false)
    }
  }

  // 键盘快捷键
  useInput((input, key) => {
    if (key.return) {
      if (query.trim() && !loading) {
        performSearch(query, mode)
      }
    } else if (key.escape) {
      _onDone()
    } else if (input === 'r' && !query.trim() && !loading) {
      reindex()
    } else if (key.ctrl && input === 'c') {
      _onDone()
    } else if (key.upArrow || (key.shift && input === 'k')) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow || (key.shift && input === 'j')) {
      setSelectedIndex(i => Math.min(results.length - 1, i + 1))
    } else if (input === '1') {
      setMode('all')
    } else if (input === '2') {
      setMode('content')
    } else if (input === '3') {
      setMode('symbol')
    } else if (input === 'Backspace' || input === 'Delete') {
      setQuery(q => q.slice(0, -1))
    } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery(q => q + input)
    }
  })

  // 自动搜索（当query变化时）
  React.useEffect(() => {
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => performSearch(query, mode), 300)
      return () => clearTimeout(timer)
    }
  }, [query, mode])

  // 渲染
  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题栏 */}
      <Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
        <Text bold color="blue">
           向量搜索 (SQLite FTS5 + BM25)
        </Text>
        {stats && (
          <Text dimColor> | 索引: {stats.filesIndexed} 文件, {stats.symbolsIndexed} 符号</Text>
        )}
      </Box>

      {/* 搜索模式 */}
      <Box marginBottom={1}>
        <Text dimColor>模式: </Text>
        {(Object.keys(MODE_LABELS) as SearchMode[]).map(m => (
          <Text key={m} color={mode === m ? 'green' : 'gray'} bold={mode === m}>
            {mode === m ? '▸ ' : '  '}{MODE_LABELS[m]}{' '}
          </Text>
        ))}
        <Text dimColor>| 按 1/2/3 切换模式</Text>
      </Box>

      {/* 输入框 */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text color={query ? 'white' : 'gray'}>
          {query || '输入搜索关键词 (至少2字符自动搜索)...'}
        </Text>
        <Text color="blue">_</Text>
      </Box>

      {/* 加载/索引状态 */}
      {(loading || indexing) && (
        <Box marginBottom={1}>
          <Text color="yellow">{indexing ? '正在索引代码库...' : '搜索中...'}</Text>
        </Box>
      )}

      {/* 错误信息 */}
      {error && (
        <Box borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
          <Text color="red"> {error}</Text>
        </Box>
      )}

      {/* 搜索结果 */}
      {results.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>找到 {results.length} 个结果 (↑↓ 导航, Esc 退出)</Text>
          {results.map((result, idx) => {
            const color = KIND_COLORS[result.kind] || 'white'
            const isSelected = idx === selectedIndex
            const relPath = result.file.replace(rootDir, '').replace(/^[/\\]/, '')
            return (
              <Box
                key={`${result.file}:${result.line}:${idx}`}
                flexDirection="column"
                paddingX={isSelected ? 1 : 0}
                borderStyle={isSelected ? 'single' : undefined}
                borderColor={isSelected ? 'green' : undefined}
              >
                {isSelected && (
                  <Text color="green" dimColor>
                    ▸ {relPath}:{result.line} [{result.kind}] score={result.score.toFixed(2)}
                  </Text>
                )}
                {!isSelected && (
                  <Text dimColor>
                    {relPath}:{result.line} <Text color={color}>[{result.kind}]</Text>
                    <Text dimColor> {result.score.toFixed(2)}</Text>
                  </Text>
                )}
                <Box paddingLeft={isSelected ? 2 : 1}>
                  <Text dimColor>{result.snippet.length > 120 ? result.snippet.slice(0, 120) + '...' : result.snippet}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {/* 空状态 */}
      {!loading && !error && results.length === 0 && query.trim().length >= 2 && (
        <Box marginTop={1}>
          <Text dimColor>未找到匹配结果。尝试不同的关键词或切换搜索模式。</Text>
        </Box>
      )}

      {/* 帮助信息 */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          快捷键: 输入搜索 | Enter确认 | Esc退出 | R重新索引 | 1/2/3切换模式 | ↑↓导航
        </Text>
      </Box>
    </Box>
  )
}

export const vectorSearchCommand: Command = {
  name: 'vector-search',
  description: '使用 SQLite FTS5 进行代码库语义搜索（BM25 排序）',
  usage: 'vector-search <query> [mode]',
  examples: [
    { command: 'vector-search "useState"', description: '搜索 useState 相关代码' },
    { command: 'vector-search "API handler" symbol', description: '仅搜索符号名称' },
    { command: 'vector-search "authentication" content', description: '全文内容搜索' },
  ],
  args: {
    query: { description: '搜索关键词', required: true },
    mode: { description: '搜索模式: all(默认), content, symbol', required: false },
  },
  isEnabled: () => true,
  supportsNonInteractive: false,
  call: vectorSearchUI,
}