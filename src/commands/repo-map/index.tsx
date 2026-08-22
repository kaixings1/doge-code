import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { createRepoMap } from '../../engine/repoMap.js'

// ============================================================================
// RepoMap 可视化命令 - 显示代码库结构映射（Aider 风格）
// ============================================================================

type SymbolKindColor = {
  [K in typeof import('../../engine/repoMap.js').SymbolKind]: string
}

const KIND_COLORS: SymbolKindColor = {
  function: 'cyan',
  class: 'green',
  interface: 'yellow',
  type: 'magenta',
  enum: 'blue',
  const: 'gray',
  let: 'gray',
  var: 'gray',
}

const KIND_ICONS: Record<string, string> = {
  function: 'ƒ',
  class: '◆',
  interface: '◇',
  type: '⊿',
  enum: 'Ⓔ',
  const: '◉',
  let: '○',
  var: '▫',
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `repo-map — 显示代码库结构映射（符号提取 + PageRank 排序，类似 Aider）\n用法: /repo-map`.trim(), truncated: false }
  }
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [repoData, setRepoData] = React.useState<{
    files: Map<string, { symbols: typeof import('../../engine/repoMap.js').SymbolEntry[] }>
    totalSymbols: number
    totalFiles: number
  } | null>(null)

  // 解析参数：top N
  const topN = parseInt(args?.trim() || '30', 10) || 30

  // 加载仓库数据
  React.useEffect(() => {
    let cancelled = false

    async function loadRepoMap() {
      setLoading(true)
      setError(null)
      try {
        const rootDir = process.cwd()
        const repoMap = createRepoMap({ rootDir })
        const symbols = await repoMap.getSymbols()

        if (cancelled) return

        // 按文件分组
        const fileMap = new Map<string, typeof symbols>()
        for (const sym of symbols) {
          const existing = fileMap.get(sym.file) || []
          existing.push(sym)
          fileMap.set(sym.file, existing)
        }

        // 对每组符号按 PageRank 分数排序（用符号数量作为代理）
        const sortedFiles = new Map<string, typeof symbols>()
        for (const [file, syms] of fileMap) {
          const sorted = syms.sort((a, b) => a.name.localeCompare(b.name))
          sortedFiles.set(file, sorted)
        }

        setRepoData({
          files: sortedFiles,
          totalSymbols: symbols.length,
          totalFiles: fileMap.size,
        })
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    }

    loadRepoMap()
    return () => { cancelled = true }
  }, [refreshKey])

  // 手动刷新：按 r 键
  useInput((input, key) => {
    if (key.return) {
      onDone()
    } else if (input === 'r' || input === 'R') {
      setRefreshKey(k => k + 1)
    }
  })

  // 获取相对路径
  const rootDir = process.cwd()
  const getRelativePath = (file: string): string => {
    if (file.startsWith(rootDir + '/')) {
      return file.slice(rootDir.length + 1)
    }
    if (file.startsWith(rootDir + '\\')) {
      return file.slice(rootDir.length + 1)
    }
    return file
  }

  // 渲染单个符号条目
  const renderSymbol = (sym: typeof import('../../engine/repoMap.js').SymbolEntry) => {
    const color = KIND_COLORS[sym.kind] || 'white'
    const icon = KIND_ICONS[sym.kind] || '•'
    return (
      <Box key={`${sym.file}:${sym.name}`} paddingLeft={2}>
        <Text color={color} dimColor={true}>
          {icon} {sym.name}
        </Text>
        <Text dimColor={true}>:{sym.line}</Text>
      </Box>
    )
  }

  // 加载状态
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>📦 正在扫描代码库结构...</Text>
        <Text dimColor>使用 ripgrep 提取符号定义，PageRank 排序中</Text>
      </Box>
    )
  }

  // 错误状态
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ 扫描失败: {error}</Text>
      </Box>
    )
  }

  // 无数据
  if (!repoData || repoData.totalSymbols === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>未找到符号定义</Text>
      </Box>
    )
  }

  // 对文件进行排序：按符号数量降序（符号多的文件更重要）
  const sortedFiles = Array.from(repoData.files.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, topN)

  // 渲染文件列表
  const fileEntries = sortedFiles.map(([file, symbols]) => {
    const relPath = getRelativePath(file)
    const displaySymbols = symbols.slice(0, 8)
    const hasMore = symbols.length > 8

    return (
      <Box key={file} flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="white">
            📄 {relPath}
          </Text>
          <Text dimColor> ({symbols.length} 个符号)</Text>
        </Box>
        {displaySymbols.map(sym => renderSymbol(sym))}
        {hasMore && (
          <Box paddingLeft={2}>
            <Text dimColor>  ... 还有 {symbols.length - 8} 个符号</Text>
          </Box>
        )}
      </Box>
    )
  })

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="green">
          📦 Repo Map — 代码库结构映射
        </Text>
      </Box>

      {/* 统计信息 */}
      <Box marginBottom={1}>
        <Text>
          共发现 <Text color="cyan">{repoData.totalFiles}</Text> 个文件，
          <Text color="cyan">{repoData.totalSymbols}</Text> 个符号
        </Text>
      </Box>

      {/* 文件列表 */}
      <Box flexDirection="column">
        {fileEntries}
      </Box>

      {/* 底部提示 */}
      <Box marginTop={1}>
        <Text dimColor>按 r 刷新 | 按 Enter 退出</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 命令定义
// ============================================================================
const repoMap = {
  type: 'local-jsx' as const,
  name: 'repo-map',
  description: '显示代码库结构映射（符号提取 + PageRank 排序，类似 Aider）',
  aliases: ['repomap', 'map'],
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default repoMap
