// ============================================================================
// Memory Search Command - Enhanced Version
// 跨会话记忆搜索：高级过滤/搜索历史/语义搜索/知识图谱/导出/分析/聚类/推荐/去重
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join, resolve, basename, extname } from 'path'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface MemoryMatch {
  file: string
  line: number
  content: string
  context: string
  relevance: number
  tags: string[]
  category: string
  lastModified: number
}

interface SearchHistory {
  version: string
  searches: Array<{
    timestamp: string
    query: string
    results: number
    duration: number
  }>
}

interface SavedSearch {
  id: string
  name: string
  query: string
  filters: SearchFilters
  createdAt: string
  lastRun?: string
  resultCount?: number
}

interface SearchFilters {
  query: string
  fileTypes: string[]
  directories: string[]
  excludeDirs: string[]
  dateFrom?: number
  dateTo?: number
  minRelevance: number
  tags: string[]
  caseSensitive: boolean
  useRegex: boolean
  wholeWord: boolean
  maxResults: number
  sortBy: 'relevance' | 'date' | 'name'
  sortOrder: 'asc' | 'desc'
}

interface SearchStats {
  totalSearches: number
  uniqueQueries: number
  avgResults: number
  avgDuration: number
  topQueries: Array<{ query: string; count: number }>
  topFileTypes: Array<{ type: string; count: number }>
  searchesByMonth: Array<{ month: string; count: number }>
}

interface KnowledgeNode {
  id: string
  label: string
  type: 'file' | 'tag' | 'keyword' | 'category'
  weight: number
  connections: string[]
}

interface KnowledgeGraph {
  nodes: KnowledgeNode[]
  edges: Array<{ source: string; target: string; weight: number }>
}

interface ExportConfig {
  format: 'json' | 'csv' | 'md' | 'html'
  includeContext: boolean
  includeStats: boolean
  groupBy: 'file' | 'tag' | 'date'
}

// ============================================================================
// Constants
// ============================================================================

const MEMORY_DIR = join(process.cwd(), '.doge', 'memory-search')
const HISTORY_FILE = join(MEMORY_DIR, 'history.json')
const SAVED_SEARCHES_FILE = join(MEMORY_DIR, 'saved-searches.json')
const STATS_FILE = join(MEMORY_DIR, 'stats.json')

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  fileTypes: ['.md', '.txt', '.json'],
  directories: [],
  excludeDirs: ['node_modules', 'dist', 'build', '.git'],
  minRelevance: 0,
  tags: [],
  caseSensitive: false,
  useRegex: false,
  wholeWord: false,
  maxResults: 50,
  sortBy: 'relevance',
  sortOrder: 'desc',
}

// ============================================================================
// File Discovery
// ============================================================================

function findMemoryFiles(dir: string, depth = 5, filters: SearchFilters = DEFAULT_FILTERS): string[] {
  const results: string[] = []
  if (depth <= 0) return results

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build' || entry.startsWith('.')) continue
      if (filters.excludeDirs.includes(entry)) continue

      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...findMemoryFiles(fullPath, depth - 1, filters))
        } else {
          const ext = extname(entry).toLowerCase()
          if (filters.fileTypes.length === 0 || filters.fileTypes.includes(ext)) {
            // Date filter
            if (filters.dateFrom && stat.mtimeMs < filters.dateFrom) continue
            if (filters.dateTo && stat.mtimeMs > filters.dateTo) continue
            results.push(fullPath)
          }
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return results
}

function getAllMemoryFiles(filters: SearchFilters = DEFAULT_FILTERS): string[] {
  const files: string[] = []

  // Home directory memories
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir && existsSync(join(homeDir, '.doge'))) {
    files.push(...findMemoryFiles(join(homeDir, '.doge'), 5, filters))
  }

  // Project memories
  files.push(...findMemoryFiles(process.cwd(), 5, filters))

  // Custom directories
  for (const dir of filters.directories) {
    const resolved = resolve(dir)
    if (existsSync(resolved)) {
      files.push(...findMemoryFiles(resolved, 5, filters))
    }
  }

  return [...new Set(files)]
}

// ============================================================================
// Search Engine
// ============================================================================

function searchInFile(filePath: string, filters: SearchFilters): MemoryMatch[] {
  const matches: MemoryMatch[] = []
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let isMatch = false
      let relevance = 0

      if (filters.useRegex) {
        try {
          const regex = new RegExp(filters.query, filters.caseSensitive ? 'g' : 'gi')
          if (regex.test(line)) {
            isMatch = true
            relevance = 10
          }
        } catch {
          // Invalid regex
        }
      } else if (filters.wholeWord) {
        const pattern = filters.caseSensitive
          ? `\\b${escapeRegex(filters.query)}\\b`
          : `\\b${escapeRegex(filters.query)}\\b`
        const regex = new RegExp(pattern, filters.caseSensitive ? 'g' : 'gi')
        if (regex.test(line)) {
          isMatch = true
          relevance = 8
        }
      } else {
        const searchLine = filters.caseSensitive ? line : line.toLowerCase()
        const searchQuery = filters.caseSensitive ? filters.query : filters.query.toLowerCase()

        if (searchLine.includes(searchQuery)) {
          isMatch = true
          // Calculate relevance based on match position and frequency
          const occurrences = searchLine.split(searchQuery).length - 1
          relevance = Math.min(occurrences * 2, 10)

          // Boost for matches at the beginning of a line
          if (searchLine.startsWith(searchQuery)) relevance += 3

          // Boost for heading matches
          if (line.startsWith('#')) relevance += 5

          // Boost for exact matches
          if (searchLine === searchQuery) relevance += 10
        }
      }

      if (isMatch && relevance >= filters.minRelevance) {
        const contextStart = Math.max(0, i - 2)
        const contextEnd = Math.min(lines.length, i + 3)
        const context = lines.slice(contextStart, contextEnd).join('\n')

        // Extract tags from the line
        const tags = extractTags(line)

        matches.push({
          file: filePath,
          line: i + 1,
          content: line.trim(),
          context,
          relevance,
          tags,
          category: extractCategory(filePath),
          lastModified: statSync(filePath).mtimeMs,
        })
      }
    }
  } catch {
    // skip
  }

  return matches
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractTags(line: string): string[] {
  const tags: string[] = []
  const tagPattern = /#([a-zA-Z0-9_\u4e00-\u9fff]+)/g
  let match
  while ((match = tagPattern.exec(line)) !== null) {
    tags.push(match[1])
  }
  return tags
}

function extractCategory(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length > 1) return parts[parts.length - 2]
  return 'root'
}

function searchAll(filters: SearchFilters): MemoryMatch[] {
  const files = getAllMemoryFiles(filters)
  const allMatches: MemoryMatch[] = []

  for (const file of files) {
    const matches = searchInFile(file, filters)
    allMatches.push(...matches)
  }

  // Sort results
  allMatches.sort((a, b) => {
    let cmp = 0
    switch (filters.sortBy) {
      case 'relevance': cmp = a.relevance - b.relevance; break
      case 'date': cmp = a.lastModified - b.lastModified; break
      case 'name': cmp = a.file.localeCompare(b.file); break
    }
    return filters.sortOrder === 'asc' ? cmp : -cmp
  })

  return allMatches.slice(0, filters.maxResults)
}

// ============================================================================
// History Management
// ============================================================================

function loadHistory(): SearchHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return { version: '1.0', searches: [] }
}

function saveHistory(history: SearchHistory): void {
  try {
    mkdirSync(MEMORY_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addSearchToHistory(query: string, results: number, duration: number): void {
  const history = loadHistory()
  history.searches.push({
    timestamp: new Date().toISOString(),
    query,
    results,
    duration,
  })

  // Keep only last 1000 searches
  if (history.searches.length > 1000) {
    history.searches = history.searches.slice(-1000)
  }

  saveHistory(history)
}

// ============================================================================
// Saved Searches
// ============================================================================

function loadSavedSearches(): SavedSearch[] {
  try {
    if (existsSync(SAVED_SEARCHES_FILE)) {
      return JSON.parse(readFileSync(SAVED_SEARCHES_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return []
}

function saveSavedSearches(searches: SavedSearch[]): void {
  try {
    mkdirSync(MEMORY_DIR, { recursive: true })
    writeFileSync(SAVED_SEARCHES_FILE, JSON.stringify(searches, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function createSavedSearch(name: string, query: string, filters: SearchFilters): SavedSearch {
  const searches = loadSavedSearches()
  const search: SavedSearch = {
    id: `ss-${Date.now().toString(36)}`,
    name,
    query,
    filters,
    createdAt: new Date().toISOString(),
  }
  searches.push(search)
  saveSavedSearches(searches)
  return search
}

function deleteSavedSearch(id: string): boolean {
  const searches = loadSavedSearches()
  const idx = searches.findIndex(s => s.id === id)
  if (idx === -1) return false
  searches.splice(idx, 1)
  saveSavedSearches(searches)
  return true
}

// ============================================================================
// Statistics
// ============================================================================

function calculateStats(): SearchStats {
  const history = loadHistory()
  const queries = new Map<string, number>()
  const fileTypes = new Map<string, number>()
  const months = new Map<string, number>()

  let totalResults = 0
  let totalDuration = 0

  for (const search of history.searches) {
    queries.set(search.query, (queries.get(search.query) || 0) + 1)
    totalResults += search.results
    totalDuration += search.duration

    const month = search.timestamp.slice(0, 7)
    months.set(month, (months.get(month) || 0) + 1)
  }

  return {
    totalSearches: history.searches.length,
    uniqueQueries: queries.size,
    avgResults: history.searches.length > 0 ? Math.round(totalResults / history.searches.length) : 0,
    avgDuration: history.searches.length > 0 ? Math.round(totalDuration / history.searches.length) : 0,
    topQueries: [...queries.entries()].map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topFileTypes: [...fileTypes.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    searchesByMonth: [...months.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
  }
}

// ============================================================================
// Knowledge Graph
// ============================================================================

function buildKnowledgeGraph(matches: MemoryMatch[]): KnowledgeGraph {
  const nodes: KnowledgeNode[] = []
  const edges: Array<{ source: string; target: string; weight: number }> = []
  const nodeMap = new Map<string, KnowledgeNode>()

  for (const match of matches) {
    // File node
    const fileId = `file:${match.file}`
    if (!nodeMap.has(fileId)) {
      const node: KnowledgeNode = { id: fileId, label: basename(match.file), type: 'file', weight: 0, connections: [] }
      nodeMap.set(fileId, node)
      nodes.push(node)
    }
    nodeMap.get(fileId)!.weight += match.relevance

    // Tag nodes
    for (const tag of match.tags) {
      const tagId = `tag:${tag}`
      if (!nodeMap.has(tagId)) {
        const node: KnowledgeNode = { id: tagId, label: `#${tag}`, type: 'tag', weight: 0, connections: [] }
        nodeMap.set(tagId, node)
        nodes.push(node)
      }
      nodeMap.get(tagId)!.weight += match.relevance

      // Edge: file -> tag
      edges.push({ source: fileId, target: tagId, weight: match.relevance })
      nodeMap.get(fileId)!.connections.push(tagId)
      nodeMap.get(tagId)!.connections.push(fileId)
    }
  }

  return { nodes, edges }
}

function renderKnowledgeGraph(graph: KnowledgeGraph): string {
  const lines: string[] = ['📊 知识图谱:']

  const tags = graph.nodes.filter(n => n.type === 'tag').sort((a, b) => b.weight - a.weight).slice(0, 10)
  const files = graph.nodes.filter(n => n.type === 'file').sort((a, b) => b.weight - a.weight).slice(0, 5)

  lines.push('')
  lines.push('--- 热门标签 ---')
  for (const tag of tags) {
    lines.push(`  #${tag.label} (${tag.weight}) - 关联 ${tag.connections.length} 个文件`)
  }

  lines.push('')
  lines.push('--- 相关文件 ---')
  for (const file of files) {
    lines.push(`  ${file.label} (相关度: ${file.weight})`)
  }

  return lines.join('\n')
}

// ============================================================================
// Output Formatters
// ============================================================================

function formatTextReport(matches: MemoryMatch[], query: string, duration: number): string {
  if (matches.length === 0) {
    return `🔍 未找到包含 "${query}" 的记忆。`
  }

  const lines: string[] = [`🔍 记忆搜索: "${query}"`, `   找到 ${matches.length} 个匹配 (${duration}ms)`, '']

  // Group by file
  const byFile = new Map<string, MemoryMatch[]>()
  for (const match of matches) {
    if (!byFile.has(match.file)) byFile.set(match.file, [])
    byFile.get(match.file)!.push(match)
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`\n📄 ${file} (${fileMatches.length} 个匹配)`)
    for (const match of fileMatches.slice(0, 5)) {
      lines.push(`   第 ${match.line} 行: ${match.content.slice(0, 80)}`)
      if (match.tags.length > 0) lines.push(`     标签: ${match.tags.map(t => `#${t}`).join(' ')}`)
    }
    if (fileMatches.length > 5) lines.push(`   ... 和另外 ${fileMatches.length - 5} 个匹配`)
  }

  return lines.join('\n')
}

function formatMarkdownReport(matches: MemoryMatch[], query: string): string {
  if (matches.length === 0) return `# 记忆搜索: ${query}\n\n未找到匹配结果。`

  const lines: string[] = [`# 记忆搜索: "${query}"`, ``, `找到 ${matches.length} 个匹配`, '']

  const byFile = new Map<string, MemoryMatch[]>()
  for (const match of matches) {
    if (!byFile.has(match.file)) byFile.set(match.file, [])
    byFile.get(match.file)!.push(match)
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`## ${file}`)
    for (const match of fileMatches) {
      lines.push(`- **第 ${match.line} 行**: ${match.content}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatHTMLReport(matches: MemoryMatch[], query: string): string {
  const rows = matches.map(m =>
    `<tr><td>${basename(m.file)}</td><td>${m.line}</td><td>${m.content}</td><td>${m.relevance}</td></tr>`
  ).join('\n')

  return `<!DOCTYPE html>
<html><head><title>记忆搜索: ${query}</title>
<style>body{font-family:sans-serif} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f0f0f0}</style>
</head><body>
<h1>记忆搜索: "${query}"</h1>
<p>找到 ${matches.length} 个匹配</p>
<table><tr><th>文件</th><th>行号</th><th>内容</th><th>相关度</th></tr>
${rows}</table></body></html>`
}

function formatCSVReport(matches: MemoryMatch[]): string {
  const lines = ['文件,行号,内容,相关度,标签,分类']
  for (const m of matches) {
    lines.push(`"${m.file}",${m.line},"${m.content.replace(/"/g, '""')}",${m.relevance},"${m.tags.join(';')}","${m.category}"`)
  }
  return lines.join('\n')
}

// ============================================================================
// Export
// ============================================================================

function exportResults(matches: MemoryMatch[], query: string, config: ExportConfig): string {
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `memory_search_${timestamp}`

  if (config.format === 'json') {
    const path = join(MEMORY_DIR, `${filename}.json`)
    writeFileSync(path, JSON.stringify({ query, count: matches.length, matches }, null, 2), 'utf-8')
    return path
  }

  if (config.format === 'csv') {
    const path = join(MEMORY_DIR, `${filename}.csv`)
    writeFileSync(path, formatCSVReport(matches), 'utf-8')
    return path
  }

  if (config.format === 'md') {
    const path = join(MEMORY_DIR, `${filename}.md`)
    writeFileSync(path, formatMarkdownReport(matches, query), 'utf-8')
    return path
  }

  // HTML
  const path = join(MEMORY_DIR, `${filename}.html`)
  writeFileSync(path, formatHTMLReport(matches, query), 'utf-8')
  return path
}

// ============================================================================
// Semantic Search - 语义搜索
// ============================================================================

function getRelatedKeywords(query: string): string[] {
  const related: string[] = []
  const keywords = query.toLowerCase().split(/\s+/)

  const synonymMap: Record<string, string[]> = {
    'api': ['接口', 'endpoint', 'rest', 'graphql', 'http'],
    'database': ['数据库', 'db', 'sql', 'mysql', 'postgres', 'mongodb'],
    'auth': ['认证', '登录', 'token', 'jwt', 'oauth', 'session'],
    'test': ['测试', 'unit', 'integration', 'e2e', 'jest', 'vitest'],
    'deploy': ['部署', 'ci', 'cd', 'docker', 'kubernetes', 'k8s'],
    'config': ['配置', 'setting', 'env', 'environment', '变量'],
    'error': ['错误', 'exception', 'bug', 'issue', 'fail'],
    'performance': ['性能', '优化', '缓存', 'cache', 'speed', 'slow'],
    'security': ['安全', '漏洞', 'xss', 'csrf', 'injection', '加密'],
    'design': ['设计', '架构', 'pattern', '模式', 'structure'],
    'frontend': ['前端', 'ui', 'css', 'html', 'react', 'vue'],
    'backend': ['后端', 'server', 'api', 'service', 'microservice'],
    'refactor': ['重构', '重写', 'cleanup', 'clean', 'improve'],
    'document': ['文档', 'doc', 'readme', 'wiki', 'comment'],
    'git': ['git', 'commit', 'branch', 'merge', 'pull', 'push'],
  }

  for (const keyword of keywords) {
    for (const [key, synonyms] of Object.entries(synonymMap)) {
      if (keyword === key || synonyms.includes(keyword)) {
        related.push(keyword, ...synonyms)
      }
    }
  }

  return [...new Set(related)]
}

function semanticSearch(query: string, filters: SearchFilters): MemoryMatch[] {
  const relatedKeywords = getRelatedKeywords(query)
  const allMatches: MemoryMatch[] = []
  const seenFiles = new Set<string>()

  // Search with original query
  const originalMatches = searchAll({ ...filters, query })
  for (const match of originalMatches) {
    const key = `${match.file}:${match.line}`
    if (!seenFiles.has(key)) {
      allMatches.push(match)
      seenFiles.add(key)
    }
  }

  // Search with related keywords
  for (const keyword of relatedKeywords) {
    if (keyword === query.toLowerCase()) continue
    const matches = searchInFile(keyword, { ...filters, query: keyword })
    for (const match of matches) {
      const key = `${match.file}:${match.line}`
      if (!seenFiles.has(key)) {
        match.relevance = Math.max(match.relevance - 2, 1) // Lower relevance for related matches
        allMatches.push(match)
        seenFiles.add(key)
      }
    }
  }

  return allMatches.slice(0, filters.maxResults)
}

// ============================================================================
// Memory Clustering - 记忆聚类
// ============================================================================

interface Cluster {
  id: string
  name: string
  keywords: string[]
  files: string[]
  matchCount: number
  avgRelevance: number
}

function clusterMatches(matches: MemoryMatch[]): Cluster[] {
  const clusters: Cluster[] = []
  const assignedFiles = new Set<string>()

  // Group by category
  const byCategory = new Map<string, MemoryMatch[]>()
  for (const match of matches) {
    if (!byCategory.has(match.category)) byCategory.set(match.category, [])
    byCategory.get(match.category)!.push(match)
  }

  for (const [category, categoryMatches] of byCategory) {
    const cluster: Cluster = {
      id: `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: category,
      keywords: [...new Set(categoryMatches.flatMap(m => m.tags))].slice(0, 5),
      files: [...new Set(categoryMatches.map(m => m.file))],
      matchCount: categoryMatches.length,
      avgRelevance: categoryMatches.reduce((sum, m) => sum + m.relevance, 0) / categoryMatches.length,
    }
    clusters.push(cluster)
  }

  return clusters.sort((a, b) => b.matchCount - a.matchCount)
}

function renderClusters(clusters: Cluster[]): string {
  const lines: string[] = ['📊 记忆聚类:']
  lines.push('')

  for (const cluster of clusters) {
    lines.push(`  📁 ${cluster.name} (${cluster.matchCount} 个匹配, ${cluster.files.length} 个文件)`)
    if (cluster.keywords.length > 0) {
      lines.push(`     关键词: ${cluster.keywords.join(', ')}`)
    }
    lines.push(`     平均相关度: ${cluster.avgRelevance.toFixed(1)}`)
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Memory Statistics Dashboard - 记忆统计面板
// ============================================================================

function renderStatsDashboard(stats: SearchStats, files: string[]): string {
  const lines: string[] = []
  lines.push('📊 记忆统计面板')
  lines.push('═'.repeat(50))
  lines.push('')
  lines.push(`记忆文件总数: ${files.length}`)
  lines.push(`总搜索次数: ${stats.totalSearches}`)
  lines.push(`唯一查询数: ${stats.uniqueQueries}`)
  lines.push(`平均每次结果: ${stats.avgResults}`)
  lines.push(`平均搜索耗时: ${stats.avgDuration}ms`)
  lines.push('')

  if (stats.topQueries.length > 0) {
    lines.push('--- 热门查询 TOP10 ---')
    for (const q of stats.topQueries) {
      lines.push(`  "${q.query}": ${q.count}次`)
    }
    lines.push('')
  }

  if (stats.searchesByMonth.length > 0) {
    lines.push('--- 月度搜索趋势 ---')
    for (const m of stats.searchesByMonth) {
      lines.push(`  ${m.month}: ${m.count}次搜索`)
    }
    lines.push('')
  }

  // File type distribution
  const fileTypes = new Map<string, number>()
  for (const file of files) {
    const ext = extname(file).toLowerCase() || '(无扩展名)'
    fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1)
  }

  lines.push('--- 文件类型分布 ---')
  for (const [type, count] of [...fileTypes.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type}: ${count} 个文件`)
  }

  return lines.join('\n')
}

// ============================================================================
// Memory Recommendations - 记忆推荐
// ============================================================================

function getRecommendations(): string[] {
  const history = loadHistory()
  const recommendations: string[] = []

  // Based on search history patterns
  if (history.searches.length > 5) {
    const recentQueries = history.searches.slice(-5).map(s => s.query)
    const uniqueQueries = [...new Set(recentQueries)]

    if (uniqueQueries.length === 1) {
      recommendations.push(`你一直在搜索 "${uniqueQueries[0]}"，试试搜索相关关键词？`)
    }

    if (history.searches.length > 20) {
      const avgResults = history.searches.reduce((sum, s) => sum + s.results, 0) / history.searches.length
      if (avgResults < 5) {
        recommendations.push('搜索结果较少，试试使用更通用的关键词')
      } else if (avgResults > 50) {
        recommendations.push('搜索结果较多，试试添加更多过滤条件')
      }
    }
  }

  // Based on file changes
  const files = getAllMemoryFiles()
  const recentFiles: Array<{ file: string; time: number }> = []
  for (const file of files) {
    try {
      const stat = statSync(file)
      recentFiles.push({ file, time: stat.mtimeMs })
    } catch {
      // skip
    }
  }

  recentFiles.sort((a, b) => b.time - a.time)
  if (recentFiles.length > 0) {
    const newest = recentFiles[0]
    const daysSinceUpdate = Math.floor((Date.now() - newest.time) / 86400000)
    if (daysSinceUpdate > 7) {
      recommendations.push(`距离上次更新记忆已 ${daysSinceUpdate} 天，考虑整理一下？`)
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('试试搜索 "TODO" 找到待办事项')
    recommendations.push('使用 --graph 生成知识图谱')
    recommendations.push('使用 --tags 查看所有标签')
  }

  return recommendations
}

function renderRecommendations(): string {
  const recommendations = getRecommendations()
  const lines: string[] = ['💡 搜索建议:']
  lines.push('')
  for (const rec of recommendations) {
    lines.push(`  • ${rec}`)
  }
  return lines.join('\n')
}

// ============================================================================
// Memory Deduplication - 记忆去重
// ============================================================================

interface DuplicateGroup {
  content: string
  files: Array<{ file: string; line: number }>
}

function findDuplicates(): DuplicateGroup[] {
  const files = getAllMemoryFiles()
  const contentMap = new Map<string, Array<{ file: string; line: number }>>()

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.length < 10) continue // Skip short lines

        if (!contentMap.has(line)) contentMap.set(line, [])
        contentMap.get(line)!.push({ file, line: i + 1 })
      }
    } catch {
      // skip
    }
  }

  const duplicates: DuplicateGroup[] = []
  for (const [content, locations] of contentMap) {
    if (locations.length > 1) {
      duplicates.push({ content, files: locations })
    }
  }

  return duplicates.sort((a, b) => b.files.length - a.files.length)
}

function renderDuplicates(duplicates: DuplicateGroup[]): string {
  if (duplicates.length === 0) return '✅ 没有发现重复内容'

  const lines: string[] = [`🔍 发现 ${duplicates.length} 组重复内容:`]
  lines.push('')

  for (const dup of duplicates.slice(0, 10)) {
    lines.push(`  "${dup.content.slice(0, 60)}..."`)
    for (const loc of dup.files) {
      lines.push(`    ${loc.file}:${loc.line}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Memory Archive - 记忆归档
// ============================================================================

function archiveOldMemories(daysOld = 30): string {
  const files = getAllMemoryFiles()
  const threshold = Date.now() - daysOld * 24 * 60 * 60 * 1000
  let archived = 0

  const archiveDir = join(MEMORY_DIR, 'archive')
  try { mkdirSync(archiveDir, { recursive: true }) } catch { /* ignore */ }

  for (const file of files) {
    try {
      const stat = statSync(file)
      if (stat.mtimeMs < threshold) {
        const dest = join(archiveDir, basename(file))
        copyFileSync(file, dest)
        archived++
      }
    } catch {
      // skip
    }
  }

  return archived > 0 ? `✅ 已归档 ${archived} 个过期记忆文件` : '📋 没有需要归档的文件'
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🔍 跨会话记忆搜索 - 增强版',
    '',
    '搜索所有 CLAUDE.md 和记忆文件中的内容。',
    '',
    '📖 用法: ',
    '  /memory-search <关键词> [选项]',
    '',
    '搜索选项:',
    '  --json                    JSON 格式输出',
    '  --md                      Markdown 格式输出',
    '  --html                    HTML 格式输出',
    '  --csv                     CSV 格式输出',
    '  --export <文件>           导出结果到文件',
    '  --regex                   使用正则表达式',
    '  --case-sensitive          区分大小写',
    '  --whole-word              全词匹配',
    '  --min-relevance <n>       最小相关度 (0-10)',
    '  --max-results <n>         最大结果数',
    '  --sort <relevance|date|name> 排序方式',
    '  --file-types <类型>       文件类型过滤 (.md,.txt)',
    '  --exclude <目录>          排除目录',
    '',
    '高级功能:',
    '  --history                 搜索历史',
    '  --stats                   搜索统计',
    '  --saved                  已保存搜索',
    '  --save <名称>             保存当前搜索',
    '  --run <ID>                运行已保存搜索',
    '  --delete-search <ID>      删除已保存搜索',
    '  --graph                   生成知识图谱',
    '  --timeline                记忆时间线',
    '  --tags                    列出所有标签',
    '  --semantic                语义搜索（包含同义词）',
    '  --cluster                 按分类聚类结果',
    '  --recommend               搜索建议',
    '  --duplicates              查找重复内容',
    '  --archive [天数]           归档过期记忆文件',
    '',
    '💡 示例: ',
    '  /memory-search "API设计"',
    '  /memory-search "数据库" --json',
    '  /memory-search "function\\s+\\w+" --regex',
    '  /memory-search "TODO" --file-types .md --sort relevance',
    '  /memory-search --stats',
    '  /memory-search "架构" --graph',
  ].join('\n')
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  // History mode
  if (s.includes('--history')) {
    const history = loadHistory()
    const lines: string[] = [`📋 搜索历史 (${history.searches.length} 次):`]
    for (const search of history.searches.slice(-20).reverse()) {
      lines.push(`  ${search.timestamp}: "${search.query}" (${search.results} 结果, ${search.duration}ms)`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Stats mode
  if (s.includes('--stats')) {
    const stats = calculateStats()
    const lines: string[] = ['📊 搜索统计:']
    lines.push(`总搜索次数: ${stats.totalSearches}`)
    lines.push(`唯一查询: ${stats.uniqueQueries}`)
    lines.push(`平均结果: ${stats.avgResults}`)
    lines.push(`平均耗时: ${stats.avgDuration}ms`)
    lines.push('')
    lines.push('--- 热门查询 ---')
    for (const q of stats.topQueries.slice(0, 5)) {
      lines.push(`  "${q.query}": ${q.count}次`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Saved searches
  if (s.includes('--saved')) {
    const searches = loadSavedSearches()
    if (searches.length === 0) return { type: 'text', value: '📋 没有已保存的搜索' }

    const lines: string[] = [`📋 已保存搜索 (${searches.length} 个):`]
    for (const search of searches) {
      lines.push(`  [${search.id}] ${search.name} - "${search.query}"`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Tags
  if (s.includes('--tags')) {
    const files = getAllMemoryFiles()
    const allTags = new Map<string, number>()
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8')
        const tags = content.matchAll(/#[a-zA-Z0-9_\u4e00-\u9fff]+/g)
        for (const tag of tags) {
          allTags.set(tag[0], (allTags.get(tag[0]) || 0) + 1)
        }
      } catch {
        // skip
      }
    }

    const sorted = [...allTags.entries()].sort((a, b) => b[1] - a[1])
    const lines: string[] = [`🏷️ 记忆标签 (${sorted.length} 个):`]
    for (const [tag, count] of sorted.slice(0, 30)) {
      lines.push(`  ${tag}: ${count}次`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Graph mode
  if (s.includes('--graph')) {
    const query = s.replace('--graph', '').trim()
    if (!query) return { type: 'text', value: '❌ 请提供搜索关键词' }
    const start = Date.now()
    const filters = { ...DEFAULT_FILTERS, query, maxResults: 100 }
    const matches = searchAll(filters)
    const graph = buildKnowledgeGraph(matches)
    return { type: 'text', value: renderKnowledgeGraph(graph) }
  }

  // Timeline mode
  if (s.includes('--timeline')) {
    const files = getAllMemoryFiles()
    const fileDates: Array<{ file: string; date: number }> = []
    for (const file of files) {
      try {
        const stat = statSync(file)
        fileDates.push({ file, date: stat.mtimeMs })
      } catch {
        // skip
      }
    }
    fileDates.sort((a, b) => b.date - a.date)

    const lines: string[] = ['📅 记忆时间线:']
    for (const fd of fileDates.slice(0, 20)) {
      lines.push(`  ${new Date(fd.date).toLocaleDateString('zh-CN')} ${basename(fd.file)}`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Recommendations
  if (s.includes('--recommend')) {
    return { type: 'text', value: renderRecommendations() }
  }

  // Duplicates
  if (s.includes('--duplicates')) {
    const duplicates = findDuplicates()
    return { type: 'text', value: renderDuplicates(duplicates) }
  }

  // Archive
  if (s.includes('--archive')) {
    const days = parseInt(s.match(/--archive\s+(\d+)/)?.[1] || '30')
    return { type: 'text', value: archiveOldMemories(days) }
  }

  // Cluster
  if (s.includes('--cluster')) {
    const query = s.replace('--cluster', '').trim()
    if (!query) return { type: 'text', value: '❌ 请提供搜索关键词' }
    const matches = searchAll({ ...DEFAULT_FILTERS, query, maxResults: 100 })
    const clusters = clusterMatches(matches)
    return { type: 'text', value: renderClusters(clusters) }
  }

  // Semantic search
  if (s.includes('--semantic')) {
    const query = s.replace('--semantic', '').trim()
    if (!query) return { type: 'text', value: '❌ 请提供搜索关键词' }
    const start = Date.now()
    const matches = semanticSearch(query, { ...DEFAULT_FILTERS, maxResults: 50 })
    const duration = Date.now() - start
    addSearchToHistory(query, matches.length, duration)
    return { type: 'text', value: formatTextReport(matches, query, duration) }
  }

  // Parse search options
  const filters = { ...DEFAULT_FILTERS }
  const queryParts: string[] = []

  const parts = s.split(/\s+/)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--json') filters.query = filters.query // handled below
    else if (parts[i] === '--regex') filters.useRegex = true
    else if (parts[i] === '--case-sensitive') filters.caseSensitive = true
    else if (parts[i] === '--whole-word') filters.wholeWord = true
    else if (parts[i] === '--min-relevance' && parts[i + 1]) { filters.minRelevance = parseInt(parts[i + 1]); i++ }
    else if (parts[i] === '--max-results' && parts[i + 1]) { filters.maxResults = parseInt(parts[i + 1]); i++ }
    else if (parts[i] === '--sort' && parts[i + 1]) { filters.sortBy = parts[i + 1] as any; i++ }
    else if (parts[i] === '--file-types' && parts[i + 1]) { filters.fileTypes = parts[i + 1].split(','); i++ }
    else if (parts[i] === '--exclude' && parts[i + 1]) { filters.excludeDirs.push(parts[i + 1]); i++ }
    else if (parts[i] === '--export' && parts[i + 1]) { /* handled below */ i++ }
    else if (!parts[i].startsWith('--')) queryParts.push(parts[i])
  }

  filters.query = queryParts.join(' ')

  if (!filters.query) {
    return { type: 'text', value: '❌ 请提供搜索关键词。\n\n' + renderHelp() }
  }

  // Execute search
  const start = Date.now()
  const matches = searchAll(filters)
  const duration = Date.now() - start

  // Add to history
  addSearchToHistory(filters.query, matches.length, duration)

  // Export if requested
  const exportMatch = s.match(/--export\s+(\S+)/)
  if (exportMatch) {
    const path = exportResults(matches, filters.query, { format: exportMatch[1].endsWith('.csv') ? 'csv' : exportMatch[1].endsWith('.md') ? 'md' : exportMatch[1].endsWith('.html') ? 'html' : 'json', includeContext: true, includeStats: false, groupBy: 'file' })
    return { type: 'text', value: `✅ 已导出 ${matches.length} 个结果到: ${path}` }
  }

  // Format output
  if (s.includes('--json')) {
    return { type: 'json', value: JSON.stringify({ query: filters.query, count: matches.length, duration, matches }, null, 2) }
  }

  if (s.includes('--md')) {
    return { type: 'text', value: formatMarkdownReport(matches, filters.query) }
  }

  if (s.includes('--html')) {
    return { type: 'text', value: formatHTMLReport(matches, filters.query) }
  }

  if (s.includes('--csv')) {
    return { type: 'text', value: formatCSVReport(matches) }
  }

  return { type: 'text', value: formatTextReport(matches, filters.query, duration) }
}

// ============================================================================
// Command Registration
// ============================================================================

const memorySearch = {
  type: 'local' as const,
  name: 'memory-search',
  description: '跨会话记忆搜索 - 高级过滤/正则/知识图谱/导出/统计',
  aliases: ['/memory-search', '/mem-search', '/ms'],
  arguments: [
    { name: 'keyword', description: '搜索关键词', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--md', description: 'Markdown 格式输出', required: false },
    { name: '--html', description: 'HTML 格式输出', required: false },
    { name: '--csv', description: 'CSV 格式输出', required: false },
    { name: '--export', description: '导出结果到文件', required: false },
    { name: '--regex', description: '使用正则表达式', required: false },
    { name: '--case-sensitive', description: '区分大小写', required: false },
    { name: '--whole-word', description: '全词匹配', required: false },
    { name: '--graph', description: '生成知识图谱', required: false },
    { name: '--timeline', description: '记忆时间线', required: false },
    { name: '--stats', description: '搜索统计', required: false },
    { name: '--history', description: '搜索历史', required: false },
    { name: '--tags', description: '列出所有标签', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default memorySearch
