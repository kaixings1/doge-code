import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { CodeVectorStore } from '../../engine/codeVectorStore.js'
import { ripGrep, getRipgrepStatus } from '../../utils/ripgrep.js'
import { getCwd } from '../../utils/cwd.js'
import { expandPath } from '../../utils/path.js'

// ============================================================================
// CodeSearch 命令 - 增强型代码搜索（正则 + 语义 + 语言过滤）
// ============================================================================

type SearchMode = 'regex' | 'semantic' | 'hybrid' | 'symbol'

const MODE_LABELS: Record<SearchMode, string> = {
  regex: '正则搜索 (ripgrep)',
  semantic: '语义搜索 (FTS5)',
  hybrid: '混合模式 (正则+语义)',
  symbol: '符号搜索',
}

const LANGUAGE_FILTERS = [
  'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'rb', 'php', 'swift', 'kt',
  'scala', 'ex', 'exs', 'lua', 'r', 'sql', 'sh', 'bash',
  'yaml', 'yml', 'json', 'toml', 'xml', 'html', 'css', 'scss',
] as const

type LanguageFilter = (typeof LANGUAGE_FILTERS)[number] | '' | 'all'

interface SearchResult {
  file: string
  line: number
  snippet: string
  score: number
  kind: string
  mode: SearchMode
}

const KINDS = ['function', 'class', 'interface', 'type', 'enum', 'const', 'let', 'var', 'content'] as const

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

const codeSearchUI: LocalJSXCommandCall = (_onDone, _context, args) => {
  const [query, setQuery] = React.useState('')
  const [mode, setMode] = React.useState<SearchMode>('hybrid')
  const [langFilter, setLangFilter] = React.useState<LanguageFilter>('all')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [indexStats, setIndexStats] = React.useState<{ files: number; symbols: number } | null>(null)
  const [rgAvailable, setRgAvailable] = React.useState<boolean | null>(null)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [showLangMenu, setShowLangMenu] = React.useState(false)
  const [indexing, setIndexing] = React.useState(false)

  const rootDir = expandPath(getCwd())

  // 检测 ripgrep 可用性
  React.useEffect(() => {
    getRipgrepStatus().then(status => {
      setRgAvailable(status.working)
    }).catch(() => setRgAvailable(false))
  }, [])

  // 初始化索引
  React.useEffect(() => {
    async function initStore() {
      setLoading(true)
      try {
        const store = new CodeVectorStore({ rootDir })
        await store.index()
        const stats = store.getStats()
        setIndexStats({ files: stats.filesIndexed, symbols: stats.symbolsIndexed })
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
    initStore()
  }, [rootDir])

  // 正则搜索
  async function regexSearch(searchQuery: string): Promise<SearchResult[]> {
    if (!rgAvailable) {
      return [{ file: '', line: 0, snippet: 'ripgrep 不可用，请使用语义搜索模式', score: 0, kind: 'content', mode: 'regex' }]
    }

    const args: string[] = ['--hidden', '--max-columns', '500']
    args.push('--glob', '!.git/**')
    args.push('--glob', '!node_modules/**')
    args.push('--glob', '!dist/**')
    args.push('--glob', '!build/**')

    // 语言过滤
    if (langFilter && langFilter !== 'all') {
      args.push('--type', langFilter)
    }

    args.push('-n')
    args.push(searchQuery)
    if (searchQuery.startsWith('-')) {
      args.push('--', searchQuery)
    }

    try {
      const lines = await ripGrep(args, rootDir, new AbortController().signal)
      return lines.map(line => {
        const colonIdx = line.indexOf(':')
        const secondColonIdx = line.indexOf(':', colonIdx + 1)
        const file = line.substring(0, colonIdx)
        const lineNum = secondColonIdx > 0 ? parseInt(line.substring(colonIdx + 1, secondColonIdx)) : 0
        const content = secondColonIdx > 0 ? line.substring(secondColonIdx + 1) : line
        return {
          file,
          line: lineNum,
          snippet: content.trim(),
          score: 1.0,
          kind: 'content',
          mode: 'regex' as SearchMode,
        }
      })
    } catch {
      return []
    }
  }

  // 语义搜索
  async function semanticSearch(searchQuery: string): Promise<SearchResult[]> {
    const store = new CodeVectorStore({ rootDir })
    let results: SearchResult[] = []

    if (langFilter && langFilter !== 'all') {
      // 语言过滤：先搜索再过滤
      const allResults = await store.search(searchQuery, 20)
      results = allResults
        .filter(r => r.file.endsWith(`.${langFilter}`))
        .map(r => ({ ...r, mode: 'semantic' as SearchMode }))
    } else {
      const allResults = await store.search(searchQuery, 15)
      results = allResults.map(r => ({ ...r, mode: 'semantic' as SearchMode }))
    }

    return results
  }

  // 符号搜索
  async function symbolSearch(searchQuery: string): Promise<SearchResult[]> {
    const store = new CodeVectorStore({ rootDir })
    const symbolResults = await store.searchSymbol(searchQuery)

    if (langFilter && langFilter !== 'all') {
      return symbolResults
        .filter(r => r.file.endsWith(`.${langFilter}`))
        .map(r => ({ ...r, mode: 'symbol' as SearchMode }))
    }

    return symbolResults.map(r => ({ ...r, mode: 'symbol' as SearchMode }))
  }

  // 执行搜索
  async function performSearch(searchQuery: string, searchMode: SearchMode) {
    if (!searchQuery.trim()) return
    setLoading(true)
    setError(null)
    setSelectedIndex(0)

    try {
      let searchResults: SearchResult[] = []

      switch (searchMode) {
        case 'regex':
          searchResults = await regexSearch(searchQuery)
          break
        case 'semantic':
          searchResults = await semanticSearch(searchQuery)
          break
        case 'symbol':
          searchResults = await symbolSearch(searchQuery)
          break
        case 'hybrid':
        default: {
          const [regexR, semanticR] = await Promise.all([
            regexSearch(searchQuery),
            semanticSearch(searchQuery),
          ])
          // 去重：相同文件+行号的合并
          const seen = new Set<string>()
          const combined: SearchResult[] = []
          for (const r of [...semanticR, ...regexR]) {
            const key = `${r.file}:${r.line}`
            if (!seen.has(key)) {
              seen.add(key)
              combined.push(r)
            }
          }
          combined.sort((a, b) => b.score - a.score)
          searchResults = combined.slice(0, 30)
          break
        }
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
      store.clearCache()
      await store.index()
      const stats = store.getStats()
      setIndexStats({ files: stats.filesIndexed, symbols: stats.symbolsIndexed })
      setIndexing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIndexing(false)
    }
  }

  // 键盘快捷键
  useInput((input, key) => {
    if (showLangMenu) {
      if (key.escape) {
        setShowLangMenu(false)
        return
      }
      if (input === 'a') {
        setLangFilter('all')
        setShowLangMenu(false)
        return
      }
      // 数字键选择语言
      if (!isNaN(Number(input)) && Number(input) >= 1 && Number(input) <= LANGUAGE_FILTERS.length) {
        const lang = LANGUAGE_FILTERS[Number(input) - 1]
        if (langFilter === lang) {
          setLangFilter('all')
        } else {
          setLangFilter(lang)
        }
        setShowLangMenu(false)
        return
      }
      return
    }

    if (key.return && query.trim() && !loading) {
      performSearch(query, mode)
    } else if (key.escape) {
      _onDone()
    } else if (input === 'l' && !query.trim() && !loading) {
      setShowLangMenu(true)
    } else if (input === 'r' && !query.trim() && !loading) {
      reindex()
    } else if (key.ctrl && input === 'c') {
      _onDone()
    } else if (key.upArrow || (key.shift && input === 'k')) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow || (key.shift && input === 'j')) {
      setSelectedIndex(i => Math.min(results.length - 1, i + 1))
    } else if (input === '1') {
      setMode('hybrid')
    } else if (input === '2') {
      setMode('regex')
    } else if (input === '3') {
      setMode('semantic')
    } else if (input === '4') {
      setMode('symbol')
    } else if (input === 'Backspace' || input === 'Delete') {
      setQuery(q => q.slice(0, -1))
    } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery(q => q + input)
    }
  })

  // 自动搜索
  React.useEffect(() => {
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => performSearch(query, mode), 300)
      return () => clearTimeout(timer)
    }
  }, [query, mode, langFilter])

  const langLabel = langFilter === 'all' ? '全部语言' : langFilter
  const relPath = (p: string) => p.replace(rootDir, '').replace(/^[/\\]/, '')

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题栏 */}
      <Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
        <Text bold color="blue">
           增强代码搜索 (Code Search)
        </Text>
        {indexStats && (
          <Text dimColor> | 索引: {indexStats.files} 文件, {indexStats.symbols} 符号</Text>
        )}
        {rgAvailable === false && (
          <Text color="yellow"> |  ripgrep 不可用</Text>
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
        <Text dimColor>| 按 1/2/3/4 切换 | L: 语言过滤({langLabel})</Text>
      </Box>

      {/* 语言过滤显示 */}
      {langFilter !== 'all' && (
        <Box marginBottom={1}>
          <Text color="cyan">语言过滤: [{langFilter}]</Text>
          <Text dimColor> (按 L 切换)</Text>
        </Box>
      )}

      {/* 语言选择菜单 */}
      {showLangMenu && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">选择语言过滤 (按数字键，A=全部，Esc=关闭):</Text>
          <Text dimColor> 0. 全部语言</Text>
          {LANGUAGE_FILTERS.slice(0, 15).map((lang, i) => (
            <Text key={lang} color={langFilter === lang ? 'green' : 'gray'}>
              {i + 1}. {lang}
            </Text>
          ))}
          <Text dimColor>... 共 {LANGUAGE_FILTERS.length} 种语言</Text>
        </Box>
      )}

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
          <Text dimColor>
            找到 {results.length} 个结果 (↑↓ 导航, Esc 退出)
            {langFilter !== 'all' && ` [${langFilter}]`}
          </Text>
          {results.slice(0, 20).map((result, idx) => {
            const color = KIND_COLORS[result.kind] || 'white'
            const isSelected = idx === selectedIndex
            const modeLabel = result.mode === 'regex' ? 'rg' : result.mode === 'semantic' ? 'fts5' : result.mode
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
                    ▸ {relPath(result.file)}:{result.line} [{result.kind}] [{modeLabel}] score={result.score.toFixed(2)}
                  </Text>
                )}
                {!isSelected && (
                  <Text dimColor>
                    {relPath(result.file)}:{result.line} <Text color={color}>[{result.kind}]</Text>
                    <Text dimColor> [{modeLabel}] {result.score.toFixed(2)}</Text>
                  </Text>
                )}
                <Box paddingLeft={isSelected ? 2 : 1}>
                  <Text dimColor>
                    {result.snippet.length > 120 ? result.snippet.slice(0, 120) + '...' : result.snippet}
                  </Text>
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
          快捷键: 输入搜索 | Enter确认 | Esc退出 | R重新索引 | L语言过滤 | 1/2/3/4切换模式 | ↑↓导航
        </Text>
      </Box>
    </Box>
  )
}

const codeSearchCommand: Command = {
  name: 'code-search',
  description: '增强型代码搜索（正则+语义+FTS5 BM25，支持30+语言过滤）',
  usage: 'code-search <query> [mode] [--lang <language>]',
  examples: [
    { command: 'code-search "useState"', description: '混合模式搜索 useState' },
    { command: 'code-search "error handler" --lang ts', description: '仅搜索 TypeScript 文件' },
    { command: 'code-search "API handler" symbol', description: '符号搜索（函数/类定义）' },
    { command: 'code-search "auth" semantic', description: '语义搜索（FTS5 BM25）' },
    { command: 'code-search "TODO" regex --lang py', description: '正则搜索 Python 文件中的 TODO' },
  ],
  args: {
    query: { description: '搜索关键词或正则表达式', required: true },
    mode: { description: '搜索模式: hybrid(默认), regex, semantic, symbol', required: false },
    '--lang': { description: '语言过滤: ts, py, go, rs, java, c, cpp 等30+语言', required: false },
  },
  isEnabled: () => true,
  supportsNonInteractive: false,
  call: codeSearchUI,
}

export default codeSearchCommand
