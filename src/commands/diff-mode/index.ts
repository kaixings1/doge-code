// ============================================================================
// Diff Mode 命令 - 增强版
// 并排差异视图：内联diff/三向合并/词级高亮/评论/过滤/书签/历史/导出
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, basename, resolve } from 'path'

// ============================================================================
// 类型与接口
// ============================================================================

interface DiffOptions {
  staged: boolean
  file?: string
  commits?: number
  contextLines: number
  ignoreWhitespace: boolean
  ignoreCase: boolean
  wordDiff: boolean
  colorOutput: boolean
  collapseUnchanged: boolean
  minCollapseLines: number
  filterFiles?: string[]
  excludeFiles?: string[]
}

interface DiffComment {
  id: string
  file: string
  line: number
  author: string
  content: string
  timestamp: string
  resolved: boolean
  replies: Array<{
    id: string
    author: string
    content: string
    timestamp: string
  }>
}

interface DiffBookmark {
  id: string
  file: string
  line: number
  label: string
  timestamp: string
}

interface DiffHistory {
  version: string
  entries: Array<{
    timestamp: string
    command: string
    files: string[]
    additions: number
    deletions: number
  }>
}

interface DiffStats {
  filesChanged: number
  additions: number
  deletions: number
  totalLines: number
  largestFile: string
  mostChanges: FileChange[]
  byExtension: Array<{ ext: string; count: number; additions: number; deletions: number }>
}

interface FileChange {
  file: string
  additions: number
  deletions: number
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
}

interface ThreeWayMergeResult {
  base: string
  ours: string
  theirs: string
  conflicts: Array<{
    startLine: number
    endLine: number
    baseContent: string
    oursContent: string
    theirsContent: string
    resolved: boolean
  }>
  merged: string
}

interface WordDiffResult {
  type: 'equal' | 'insert' | 'delete'
  text: string
  oldWord?: string
  newWord?: string
}

// ============================================================================
// 常量定义
// ============================================================================

const DIFF_DIR = join(process.cwd(), '.doge', 'diff-mode')
const COMMENTS_FILE = join(DIFF_DIR, 'comments.json')
const BOOKMARKS_FILE = join(DIFF_DIR, 'bookmarks.json')
const HISTORY_FILE = join(DIFF_DIR, 'history.json')

const DEFAULT_OPTIONS: DiffOptions = {
  staged: false,
  contextLines: 3,
  ignoreWhitespace: false,
  ignoreCase: false,
  wordDiff: false,
  colorOutput: true,
  collapseUnchanged: false,
  minCollapseLines: 5,
}

// ============================================================================
// Git 辅助函数
// ============================================================================

function getDiff(options: DiffOptions): string {
  let cmd = 'git diff --no-color'

  if (options.staged) cmd += ' --staged'
  if (options.contextLines !== 3) cmd += ` --unified=${options.contextLines}`
  if (options.ignoreWhitespace) cmd += ' --ignore-all-space'
  if (options.ignoreCase) cmd += ' --ignore-case'

  if (options.commits) {
    cmd = `git diff HEAD~${options.commits} HEAD --no-color`
    if (options.contextLines !== 3) cmd += ` --unified=${options.contextLines}`
  }

  if (options.file) cmd += ` -- ${options.file}`

  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number }
    if (e.stdout) return e.stdout
    return ''
  }
}

function getDiffStat(options: DiffOptions): string {
  let cmd = 'git diff --stat --no-color'
  if (options.staged) cmd += ' --staged'
  if (options.commits) cmd = `git diff HEAD~${options.commits} HEAD --stat --no-color`
  if (options.file) cmd += ` -- ${options.file}`

  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024, timeout: 15000 })
  } catch (err: unknown) {
    const e = err as { stdout?: string }
    if (e.stdout) return e.stdout
    return ''
  }
}

function getChangedFiles(options: DiffOptions): string[] {
  let cmd = 'git diff --name-only --no-color'
  if (options.staged) cmd += ' --staged'
  if (options.commits) cmd = `git diff HEAD~${options.commits} HEAD --name-only --no-color`
  if (options.file) cmd += ` -- ${options.file}`

  try {
    const output = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', timeout: 10000 })
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function getBranchDiff(branchA: string, branchB: string): string {
  try {
    return execSync(`git diff ${branchA}...${branchB} --no-color`, { cwd: process.cwd(), encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
  } catch (err: unknown) {
    const e = err as { stdout?: string }
    return e.stdout || ''
  }
}

// ============================================================================
// Diff 解析器
// ============================================================================

interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: Array<{
    type: 'context' | 'add' | 'remove'
    text: string
    oldNum?: number
    newNum?: number
  }>
}

interface ParsedDiff {
  file: string
  oldFile: string
  newFile: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: DiffHunk[]
  additions: number
  deletions: number
}

function parseUnifiedDiff(diffText: string): ParsedDiff[] {
  const results: ParsedDiff[] = []
  const lines = diffText.split('\n')

  let current: ParsedDiff | null = null
  let currentHunk: DiffHunk | null = null
  let oldNum = 0
  let newNum = 0

  for (const line of lines) {
    // File header
    if (line.startsWith('diff --git')) {
      if (current) results.push(current)
      const match = line.match(/diff --git a\/(.*) b\/(.*)/)
      current = {
        file: match?.[2] || '',
        oldFile: match?.[1] || '',
        newFile: match?.[2] || '',
        status: 'modified',
        hunks: [],
        additions: 0,
        deletions: 0,
      }
      currentHunk = null
      continue
    }

    // Status detection
    if (line.startsWith('new file mode')) current!.status = 'added'
    if (line.startsWith('deleted file mode')) current!.status = 'deleted'
    if (line.startsWith('rename from') || line.startsWith('similarity index')) current!.status = 'renamed'

    // Hunk header
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match && current) {
        oldNum = parseInt(match[1], 10)
        newNum = parseInt(match[3], 10)
        currentHunk = {
          oldStart: oldNum,
          oldLines: parseInt(match[2] || '1', 10),
          newStart: newNum,
          newLines: parseInt(match[4] || '1', 10),
          lines: [],
        }
        current.hunks.push(currentHunk)
      }
      continue
    }

    if (!current || !currentHunk) continue

    // Content lines
    if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'remove', text: line.slice(1), oldNum: oldNum++ })
      current.deletions++
    } else if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'add', text: line.slice(1), newNum: newNum++ })
      current.additions++
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({ type: 'context', text: line.slice(1), oldNum: oldNum++, newNum: newNum++ })
    }
  }

  if (current) results.push(current)
  return results
}

// ============================================================================
// Renderers
// ============================================================================

function renderSideBySide(parsed: ParsedDiff[], options: DiffOptions): string {
  const output: string[] = []

  for (const diff of parsed) {
    output.push('')
    output.push(`\x1b[1m${'─'.repeat(80)}\x1b[0m`)
    output.push(`\x1b[1m📄 ${diff.file}\x1b[0m`)
    output.push(`   \x1b[32m+${diff.additions}\x1b[0m \x1b[31m-${diff.deletions}\x1b[0m (${diff.status})`)
    output.push('')

    const numWidth = 4
    const contentWidth = 35

    for (const hunk of diff.hunks) {
      output.push(`  \x1b[36m@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\x1b[0m`)

      const maxRows = hunk.lines.length
      for (let i = 0; i < maxRows; i++) {
        const line = hunk.lines[i]

        if (line.type === 'remove') {
          const oldNum = (line.oldNum ?? '').toString().padStart(numWidth)
          const content = (line.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
          output.push(` \x1b[31m${oldNum}\x1b[0m \x1b[31m${content}\x1b[0m \x1b[31m-\x1b[0m│  ${' '.repeat(numWidth)} ${' '.repeat(contentWidth)}`)
        } else if (line.type === 'add') {
          const newNum = (line.newNum ?? '').toString().padStart(numWidth)
          const content = (line.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
          output.push(` ${' '.repeat(numWidth)} ${' '.repeat(contentWidth)}  \x1b[32m+\x1b[0m\x1b[32m ${newNum}\x1b[0m \x1b[32m${content}\x1b[0m`)
        } else {
          const oldNum = (line.oldNum ?? '').toString().padStart(numWidth)
          const newNum = (line.newNum ?? '').toString().padStart(numWidth)
          const content = (line.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
          output.push(` \x1b[2m${oldNum}\x1b[0m \x1b[2m${content}\x1b[0m  │ \x1b[2m${newNum}\x1b[0m \x1b[2m${content}\x1b[0m`)
        }
      }
      output.push('')
    }
  }

  return output.join('\n')
}

function renderInline(parsed: ParsedDiff[]): string {
  const output: string[] = []

  for (const diff of parsed) {
    output.push('')
    output.push(`\x1b[1m📄 ${diff.file}\x1b[0m`)
    output.push(`   \x1b[32m+${diff.additions}\x1b[0m \x1b[31m-${diff.deletions}\x1b[0m`)
    output.push('')

    for (const hunk of diff.hunks) {
      output.push(`  \x1b[36m@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\x1b[0m`)
      for (const line of hunk.lines) {
        if (line.type === 'remove') {
          output.push(`\x1b[31m- ${line.text}\x1b[0m`)
        } else if (line.type === 'add') {
          output.push(`\x1b[32m+ ${line.text}\x1b[0m`)
        } else {
          output.push(`  ${line.text}`)
        }
      }
      output.push('')
    }
  }

  return output.join('\n')
}

function renderWordDiff(textA: string, textB: string): WordDiffResult[] {
  const wordsA = textA.split(/(\s+)/)
  const wordsB = textB.split(/(\s+)/)
  const results: WordDiffResult[] = []

  // Simple LCS-based diff
  const dp: number[][] = Array(wordsA.length + 1).fill(null).map(() => Array(wordsB.length + 1).fill(0))

  for (let i = 1; i <= wordsA.length; i++) {
    for (let j = 1; j <= wordsB.length; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find differences
  let i = wordsA.length, j = wordsB.length
  const ops: WordDiffResult[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      ops.unshift({ type: 'equal', text: wordsA[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', text: wordsB[j - 1], newWord: wordsB[j - 1] })
      j--
    } else if (i > 0) {
      ops.unshift({ type: 'delete', text: wordsA[i - 1], oldWord: wordsA[i - 1] })
      i--
    }
  }

  return ops
}

function renderCollapsed(parsed: ParsedDiff[], minLines: number): string {
  const output: string[] = []

  for (const diff of parsed) {
    output.push('')
    output.push(`\x1b[1m📄 ${diff.file}\x1b[0m \x1b[32m+${diff.additions}\x1b[0m \x1b[31m-${diff.deletions}\x1b[0m`)

    for (const hunk of diff.hunks) {
      const contextLines = hunk.lines.filter(l => l.type === 'context')
      const changedLines = hunk.lines.filter(l => l.type !== 'context')

      if (contextLines.length > minLines * 2 + changedLines.length) {
        // Show beginning context
        output.push(`  \x1b[36m@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\x1b[0m`)
        for (let i = 0; i < minLines && i < contextLines.length; i++) {
          output.push(`  ${contextLines[i].text}`)
        }
        output.push(`  \x1b[2m... (${contextLines.length - minLines * 2} 行未显示) ...\x1b[0m`)

        // Show changes
        for (const line of changedLines) {
          if (line.type === 'remove') output.push(`\x1b[31m- ${line.text}\x1b[0m`)
          else if (line.type === 'add') output.push(`\x1b[32m+ ${line.text}\x1b[0m`)
        }

        // Show ending context
        for (let i = contextLines.length - minLines; i < contextLines.length; i++) {
          output.push(`  ${contextLines[i].text}`)
        }
      } else {
        output.push(`  \x1b[36m@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\x1b[0m`)
        for (const line of hunk.lines) {
          if (line.type === 'remove') output.push(`\x1b[31m- ${line.text}\x1b[0m`)
          else if (line.type === 'add') output.push(`\x1b[32m+ ${line.text}\x1b[0m`)
          else output.push(`  ${line.text}`)
        }
      }
      output.push('')
    }
  }

  return output.join('\n')
}

// ============================================================================
// Statistics
// ============================================================================

function calculateStats(parsed: ParsedDiff[]): DiffStats {
  let additions = 0
  let deletions = 0
  const fileChanges: FileChange[] = []
  const byExt = new Map<string, { count: number; additions: number; deletions: number }>()

  for (const diff of parsed) {
    additions += diff.additions
    deletions += diff.deletions
    fileChanges.push({
      file: diff.file,
      additions: diff.additions,
      deletions: diff.deletions,
      changeType: diff.status,
    })

    const ext = diff.file.includes('.') ? diff.file.slice(diff.file.lastIndexOf('.')) : '(无)'
    const extData = byExt.get(ext) || { count: 0, additions: 0, deletions: 0 }
    extData.count++
    extData.additions += diff.additions
    extData.deletions += diff.deletions
    byExt.set(ext, extData)
  }

  return {
    filesChanged: parsed.length,
    additions,
    deletions,
    totalLines: additions + deletions,
    largestFile: [...fileChanges].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))[0]?.file || '',
    mostChanges: fileChanges.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)).slice(0, 10),
    byExtension: [...byExt.entries()].map(([ext, data]) => ({ ext, ...data })).sort((a, b) => b.count - a.count),
  }
}

function formatStats(stats: DiffStats): string {
  const lines: string[] = []
  lines.push('📊 变更统计')
  lines.push('═'.repeat(40))
  lines.push(`变更文件: ${stats.filesChanged}`)
  lines.push(`新增行: \x1b[32m+${stats.additions}\x1b[0m`)
  lines.push(`删除行: \x1b[31m-${stats.deletions}\x1b[0m`)
  lines.push(`总变更: ${stats.totalLines}`)
  lines.push(`最大文件: ${stats.largestFile}`)
  lines.push('')

  if (stats.mostChanges.length > 0) {
    lines.push('--- 变更最多文件 ---')
    for (const fc of stats.mostChanges.slice(0, 5)) {
      lines.push(`  ${fc.file}: +${fc.additions}/-${fc.deletions} (${fc.changeType})`)
    }
    lines.push('')
  }

  if (stats.byExtension.length > 0) {
    lines.push('--- 按文件类型 ---')
    for (const ext of stats.byExtension) {
      lines.push(`  ${ext.ext}: ${ext.count} 文件, +${ext.additions}/-${ext.deletions}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Comments
// ============================================================================

function loadComments(): DiffComment[] {
  try {
    if (existsSync(COMMENTS_FILE)) {
      return JSON.parse(readFileSync(COMMENTS_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return []
}

function saveComments(comments: DiffComment[]): void {
  try {
    mkdirSync(DIFF_DIR, { recursive: true })
    writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addComment(file: string, line: number, content: string): DiffComment {
  const comments = loadComments()
  const comment: DiffComment = {
    id: `comment-${Date.now()}`,
    file,
    line,
    author: process.env.USER || 'anonymous',
    content,
    timestamp: new Date().toISOString(),
    resolved: false,
    replies: [],
  }
  comments.push(comment)
  saveComments(comments)
  return comment
}

function resolveComment(commentId: string): boolean {
  const comments = loadComments()
  const comment = comments.find(c => c.id === commentId)
  if (!comment) return false
  comment.resolved = true
  saveComments(comments)
  return true
}

function renderComments(comments: DiffComment[], file?: string): string {
  const filtered = file ? comments.filter(c => c.file === file) : comments
  if (filtered.length === 0) return '📋 没有评论'

  const lines: string[] = [`📋 评论 (${filtered.length} 条):`]
  for (const c of filtered) {
    const status = c.resolved ? '✅' : '💬'
    lines.push(`  ${status} [${c.id}] ${c.file}:${c.line}`)
    lines.push(`     ${c.author}: ${c.content}`)
    if (c.replies.length > 0) {
      for (const reply of c.replies) {
        lines.push(`       ↳ ${reply.author}: ${reply.content}`)
      }
    }
  }
  return lines.join('\n')
}

// ============================================================================
// Bookmarks
// ============================================================================

function loadBookmarks(): DiffBookmark[] {
  try {
    if (existsSync(BOOKMARKS_FILE)) {
      return JSON.parse(readFileSync(BOOKMARKS_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return []
}

function saveBookmarks(bookmarks: DiffBookmark[]): void {
  try {
    mkdirSync(DIFF_DIR, { recursive: true })
    writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarks, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addBookmark(file: string, line: number, label: string): DiffBookmark {
  const bookmarks = loadBookmarks()
  const bookmark: DiffBookmark = {
    id: `bm-${Date.now()}`,
    file,
    line,
    label,
    timestamp: new Date().toISOString(),
  }
  bookmarks.push(bookmark)
  saveBookmarks(bookmarks)
  return bookmark
}

function removeBookmark(id: string): boolean {
  const bookmarks = loadBookmarks()
  const idx = bookmarks.findIndex(b => b.id === id)
  if (idx === -1) return false
  bookmarks.splice(idx, 1)
  saveBookmarks(bookmarks)
  return true
}

function renderBookmarks(bookmarks: DiffBookmark[]): string {
  if (bookmarks.length === 0) return '📋 没有书签'

  const lines: string[] = [`📋 书签 (${bookmarks.length} 个):`]
  for (const b of bookmarks) {
    lines.push(`  🔖 [${b.id.slice(0, 8)}] ${b.file}:${b.line} - ${b.label}`)
  }
  return lines.join('\n')
}

// ============================================================================
// History
// ============================================================================

function loadHistory(): DiffHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return { version: '1.0', entries: [] }
}

function saveHistory(history: DiffHistory): void {
  try {
    mkdirSync(DIFF_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addHistoryEntry(command: string, files: string[], additions: number, deletions: number): void {
  const history = loadHistory()
  history.entries.push({
    timestamp: new Date().toISOString(),
    command,
    files,
    additions,
    deletions,
  })

  if (history.entries.length > 100) {
    history.entries = history.entries.slice(-100)
  }

  saveHistory(history)
}

function renderHistory(): string {
  const history = loadHistory()
  if (history.entries.length === 0) return '📋 没有历史记录'

  const lines: string[] = [`📋 查看历史 (${history.entries.length} 条):`]
  for (const entry of history.entries.slice(-10).reverse()) {
    lines.push(`  ${entry.timestamp}: ${entry.command} (${entry.files.length} 文件, +${entry.additions}/-${entry.deletions})`)
  }
  return lines.join('\n')
}

// ============================================================================
// 导出功能
// ============================================================================

function exportDiff(diffText: string, format: 'txt' | 'html' | 'json' | 'md', options: DiffOptions): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `diff_${timestamp}`

  if (format === 'txt') {
    const path = join(DIFF_DIR, `${filename}.txt`)
    writeFileSync(path, diffText, 'utf-8')
    return path
  }

  if (format === 'json') {
    const parsed = parseUnifiedDiff(diffText)
    const path = join(DIFF_DIR, `${filename}.json`)
    writeFileSync(path, JSON.stringify(parsed, null, 2), 'utf-8')
    return path
  }

  if (format === 'md') {
    const lines = ['# 变更差异', '', '```diff', diffText, '```']
    const path = join(DIFF_DIR, `${filename}.md`)
    writeFileSync(path, lines.join('\n'), 'utf-8')
    return path
  }

  // HTML
  const escaped = diffText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!DOCTYPE html>
<html><head><title>差异报告</title>
<style>body{font-family:monospace;white-space:pre-wrap;background:#1e1e1e;color:#d4d4d4;padding:20px}
.add{color:#4ec9b0;background:#0a2a0a}.del{color:#f44747;background:#2a0a0a}
.hunk{color:#569cd6}</style></head><body>${escaped}</body></html>`
  const path = join(DIFF_DIR, `${filename}.html`)
  writeFileSync(path, html, 'utf-8')
  return path
}

// ============================================================================
// Three-Way Merge
// ============================================================================

function threeWayMerge(base: string, ours: string, theirs: string): ThreeWayMergeResult {
  const baseLines = base.split('\n')
  const oursLines = ours.split('\n')
  const theirsLines = theirs.split('\n')

  const conflicts: ThreeWayMergeResult['conflicts'] = []
  const merged: string[] = []

  // Simple line-by-line merge
  const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length)

  for (let i = 0; i < maxLen; i++) {
    const baseLine = baseLines[i] || ''
    const oursLine = oursLines[i] || ''
    const theirsLine = theirsLines[i] || ''

    if (oursLine === theirsLine) {
      merged.push(oursLine)
    } else if (oursLine === baseLine) {
      merged.push(theirsLine)
    } else if (theirsLine === baseLine) {
      merged.push(oursLine)
    } else {
      // Conflict
      conflicts.push({
        startLine: i + 1,
        endLine: i + 1,
        baseContent: baseLine,
        oursContent: oursLine,
        theirsContent: theirsLine,
        resolved: false,
      })
      merged.push(`<<<<<<< OURS`)
      merged.push(oursLine)
      merged.push(`=======`)
      merged.push(theirsLine)
      merged.push(`>>>>>>> THEIRS`)
    }
  }

  return { base, ours, theirs, conflicts, merged: merged.join('\n') }
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📊 并排差异视图 - 增强版',
    '',
    '显示 git diff 的并排对比视图，支持多种格式和高级功能。',
    '',
    '📖 用法: ',
    '  /diff-mode [选项]',
    '',
    '视图模式:',
    '  --side-by-side            并排视图（默认）',
    '  --inline                  内联视图',
    '  --word-diff               词级差异',
    '  --collapsed               折叠未变更部分',
    '  --stat                    只显示统计',
    '  --highlight               语法高亮模式',
    '',
    '范围选项:',
    '  --staged                  已暂存的变更',
    '  --file <路径>             特定文件',
    '  --commits <n>             最近 n 次提交',
    '  --branch <A>..<B>         分支对比',
    '  --commit <SHA>            指定提交',
    '  --context <n>             上下文行数',
    '',
    '过滤选项:',
    '  --ignore-whitespace       忽略空白',
    '  --ignore-case             忽略大小写',
    '  --filter <模式>           文件过滤（glob）',
    '  --exclude <模式>          排除文件',
    '  --search <关键词>         在差异中搜索',
    '',
    '高级功能:',
    '  --comments                查看评论',
    '  --comment <文件> <行> <内容>  添加评论',
    '  --resolve <评论ID>        解决评论',
    '  --bookmarks               查看书签',
    '  --bookmark <文件> <行> <标签> 添加书签',
    '  --rm-bookmark <ID>        移除书签',
    '  --history                 查看历史',
    '  --export <格式>           导出 (txt/html/json/md)',
    '  --stats                   变更统计',
    '  --blame                   显示 blame 信息',
    '  --patch                   生成补丁文件',
    '  --interactive             交互模式',
    '',
    '💡 示例: ',
    '  /diff-mode',
    '  /diff-mode --staged --highlight',
    '  /diff-mode --file src/index.ts --word-diff',
    '  /diff-mode --commits 3 --collapsed',
    '  /diff-mode --branch main..feature',
    '  /diff-mode --stat --export html',
    '  /diff-mode --search "TODO"',
    '  /diff-mode --blame --file src/index.ts',
  ].join('\n')
}

// ============================================================================
// 差异语法高亮
// ============================================================================

const SYNTAX_PATTERNS: Record<string, Array<{ pattern: RegExp; color: string }>> = {
  javascript: [
    { pattern: /\b(function|const|let|var|return|if|else|for|while|class|import|export|default|async|await|try|catch|throw|new|this)\b/g, color: '\x1b[35m' },
    { pattern: /(\/\/.*$)/gm, color: '\x1b[32m' },
    { pattern: /(\/\*[\s\S]*?\*\/)/g, color: '\x1b[32m' },
    { pattern: /(["'`])(?:(?!\1).)*\1/g, color: '\x1b[33m' },
    { pattern: /\b(\d+\.?\d*)\b/g, color: '\x1b[36m' },
  ],
  typescript: [
    { pattern: /\b(function|const|let|var|return|if|else|for|while|class|import|export|default|async|await|try|catch|throw|new|this|interface|type|enum|implements|extends)\b/g, color: '\x1b[35m' },
    { pattern: /(\/\/.*$)/gm, color: '\x1b[32m' },
    { pattern: /(["'`])(?:(?!\1).)*\1/g, color: '\x1b[33m' },
  ],
  python: [
    { pattern: /\b(def|class|if|else|elif|for|while|import|from|return|try|except|raise|with|as|lambda|yield|pass|break|continue)\b/g, color: '\x1b[35m' },
    { pattern: /(#.*$)/gm, color: '\x1b[32m' },
    { pattern: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, color: '\x1b[33m' },
  ],
}

function getSyntaxForFile(fileName: string): Array<{ pattern: RegExp; color: string }> {
  if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) return SYNTAX_PATTERNS.typescript
  if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) return SYNTAX_PATTERNS.javascript
  if (fileName.endsWith('.py')) return SYNTAX_PATTERNS.python
  return []
}

function highlightLine(line: string, syntax: Array<{ pattern: RegExp; color: string }>): string {
  let result = line
  for (const { pattern, color } of syntax) {
    result = result.replace(pattern, `${color}$1\x1b[0m`)
  }
  return result
}

function renderWithHighlighting(parsed: ParsedDiff[], options: DiffOptions): string {
  const output: string[] = []

  for (const diff of parsed) {
    const syntax = getSyntaxForFile(diff.file)
    output.push('')
    output.push(`\x1b[1m${'─'.repeat(80)}\x1b[0m`)
    output.push(`\x1b[1m📄 ${diff.file}\x1b[0m`)
    output.push(`   \x1b[32m+${diff.additions}\x1b[0m \x1b[31m-${diff.deletions}\x1b[0m`)
    output.push('')

    const numWidth = 4
    const contentWidth = 35

    for (const hunk of diff.hunks) {
      output.push(`  \x1b[36m@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\x1b[0m`)

      for (const line of hunk.lines) {
        const oldNum = (line.oldNum ?? '').toString().padStart(numWidth)
        const newNum = (line.newNum ?? '').toString().padStart(numWidth)
        const content = (line.text ?? '').slice(0, contentWidth).padEnd(contentWidth)

        if (line.type === 'remove') {
          const highlighted = highlightLine(content, syntax)
          output.push(` \x1b[31m${oldNum}\x1b[0m \x1b[31m${highlighted}\x1b[0m \x1b[31m-\x1b[0m│`)
        } else if (line.type === 'add') {
          const highlighted = highlightLine(content, syntax)
          output.push(` ${' '.repeat(numWidth)} ${' '.repeat(contentWidth)}  \x1b[32m+\x1b[0m\x1b[32m ${newNum}\x1b[0m \x1b[32m${highlighted}\x1b[0m`)
        } else {
          const highlighted = highlightLine(content, syntax)
          output.push(` \x1b[2m${oldNum}\x1b[0m \x1b[2m${highlighted}\x1b[0m  │ \x1b[2m${newNum}\x1b[0m \x1b[2m${highlighted}\x1b[0m`)
        }
      }
      output.push('')
    }
  }

  return output.join('\n')
}

// ============================================================================
// Diff Search - 差异内搜索
// ============================================================================

function searchInDiff(parsed: ParsedDiff[], keyword: string): string {
  const lines: string[] = [`🔍 在差异中搜索: "${keyword}"`]
  let count = 0

  for (const diff of parsed) {
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.text.toLowerCase().includes(keyword.toLowerCase())) {
          const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          lines.push(`  ${diff.file}:${line.oldNum || line.newNum || ''} ${marker} ${line.text}`)
          count++
        }
      }
    }
  }

  if (count === 0) return `🔍 未找到包含 "${keyword}" 的差异`
  lines.push(`\n共 ${count} 处匹配`)
  return lines.join('\n')
}

// ============================================================================
// Diff Blame Integration - 差异Blame集成
// ============================================================================

function getBlameInfo(file: string, line: number): string {
  try {
    const output = execSync(`git blame -L ${line},${line} --date=short ${file}`, { encoding: 'utf-8', timeout: 5000 })
    return output.trim()
  } catch {
    return ''
  }
}

function renderBlameDiff(parsed: ParsedDiff[]): string {
  const output: string[] = []

  for (const diff of parsed) {
    output.push('')
    output.push(`\x1b[1m📄 ${diff.file}\x1b[0m`)

    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add' && line.newNum) {
          const blame = getBlameInfo(diff.file, line.newNum)
          const shortBlame = blame.split(' ')[0]?.slice(0, 7) || '未知'
          if (line.type === 'add') {
            output.push(`\x1b[32m+ [${shortBlame}] ${line.text}\x1b[0m`)
          }
        } else if (line.type === 'remove') {
          output.push(`\x1b[31m- ${line.text}\x1b[0m`)
        } else {
          output.push(`  ${line.text}`)
        }
      }
    }
  }

  return output.join('\n')
}

// ============================================================================
// 补丁生成
// ============================================================================

function generatePatch(parsed: ParsedDiff[]): string {
  const lines: string[] = ['# 生成的补丁文件', `# 日期: ${new Date().toISOString()}`, '']

  for (const diff of parsed) {
    lines.push(`--- a/${diff.oldFile}`)
    lines.push(`+++ b/${diff.newFile}`)

    for (const hunk of diff.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
      for (const line of hunk.lines) {
        if (line.type === 'context') lines.push(` ${line.text}`)
        else if (line.type === 'add') lines.push(`+${line.text}`)
        else if (line.type === 'remove') lines.push(`-${line.text}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

function exportPatch(parsed: ParsedDiff[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const patchContent = generatePatch(parsed)
  const path = join(DIFF_DIR, `patch_${timestamp}.patch`)
  mkdirSync(DIFF_DIR, { recursive: true })
  writeFileSync(path, patchContent, 'utf-8')
  return path
}

// ============================================================================
// Commit-specific Diff - 指定提交差异
// ============================================================================

function getCommitDiff(commitHash: string): string {
  try {
    return execSync(`git show ${commitHash} --no-color`, { cwd: process.cwd(), encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
  } catch (err: unknown) {
    const e = err as { stdout?: string }
    return e.stdout || ''
  }
}

function getCommitInfo(commitHash: string): string {
  try {
    const info = execSync(`git log -1 --format="%H%n%an%n%ae%n%ad%n%s" ${commitHash}`, { encoding: 'utf-8', timeout: 5000 })
    return info.trim()
  } catch {
    return ''
  }
}

function renderCommitDiff(commitHash: string): string {
  const info = getCommitInfo(commitHash)
  const diffText = getCommitDiff(commitHash)

  if (!diffText) return `❌ 无法获取提交 ${commitHash} 的差异`

  const lines = info.split('\n')
  const output: string[] = []
  output.push(`📋 提交: ${lines[0]?.slice(0, 7) || commitHash}`)
  output.push(`  作者: ${lines[1]}`)
  output.push(`  日期: ${lines[3]}`)
  output.push(`  说明: ${lines[4]}`)
  output.push('')

  const parsed = parseUnifiedDiff(diffText)
  output.push(renderSideBySide(parsed, DEFAULT_OPTIONS))

  return output.join('\n')
}

// ============================================================================
// Interactive Diff Mode - 交互模式
// ============================================================================

function renderInteractiveHelp(): string {
  return [
    '📊 交互模式快捷键:',
    '  ↑↓        选择文件',
    '  Enter     查看文件差异',
    '  n/p       下一个/上一个文件',
    '  s         切换视图模式',
    '  f         过滤文件',
    '  /         搜索',
    '  c         添加评论',
    '  b         添加书签',
    '  q/Esc     退出',
  ].join('\n')
}

// ============================================================================
// Help Text (保留在文件末尾)
// ============================================================================

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  // Parse options
  const options: DiffOptions = { ...DEFAULT_OPTIONS }

  if (s.includes('--staged')) options.staged = true
  if (s.includes('--ignore-whitespace')) options.ignoreWhitespace = true
  if (s.includes('--ignore-case')) options.ignoreCase = true
  if (s.includes('--word-diff')) options.wordDiff = true
  if (s.includes('--collapsed')) options.collapseUnchanged = true

  const fileMatch = s.match(/--file\s+(\S+)/)
  if (fileMatch) options.file = fileMatch[1]

  const commitsMatch = s.match(/--commits\s+(\d+)/)
  if (commitsMatch) options.commits = parseInt(commitsMatch[1], 10)

  const contextMatch = s.match(/--context\s+(\d+)/)
  if (contextMatch) options.contextLines = parseInt(contextMatch[1], 10)

  // Comments
  if (s.includes('--comments')) {
    const comments = loadComments()
    return { type: 'text', value: renderComments(comments, options.file) }
  }

  const commentMatch = s.match(/--comment\s+(\S+)\s+(\d+)\s+(.+)/)
  if (commentMatch) {
    const comment = addComment(commentMatch[1], parseInt(commentMatch[2]), commentMatch[3])
    return { type: 'text', value: `✅ 已添加评论: ${comment.id}` }
  }

  const resolveMatch = s.match(/--resolve\s+(\S+)/)
  if (resolveMatch) {
    const resolved = resolveComment(resolveMatch[1])
    return { type: 'text', value: resolved ? '✅ 已解决评论' : '❌ 未找到评论' }
  }

  // Bookmarks
  if (s.includes('--bookmarks')) {
    return { type: 'text', value: renderBookmarks(loadBookmarks()) }
  }

  const bookmarkMatch = s.match(/--bookmark\s+(\S+)\s+(\d+)\s+(.+)/)
  if (bookmarkMatch) {
    const bm = addBookmark(bookmarkMatch[1], parseInt(bookmarkMatch[2]), bookmarkMatch[3])
    return { type: 'text', value: `✅ 已添加书签: ${bm.id}` }
  }

  const rmBookmarkMatch = s.match(/--rm-bookmark\s+(\S+)/)
  if (rmBookmarkMatch) {
    const removed = removeBookmark(rmBookmarkMatch[1])
    return { type: 'text', value: removed ? '✅ 已移除书签' : '❌ 未找到书签' }
  }

  // History
  if (s.includes('--history')) {
    return { type: 'text', value: renderHistory() }
  }

  // Branch diff
  const branchMatch = s.match(/--branch\s+(\S+)\.\.(\S+)/)
  if (branchMatch) {
    const diffText = getBranchDiff(branchMatch[1], branchMatch[2])
    if (!diffText.trim()) return { type: 'text', value: '✅ 分支之间没有差异' }

    const parsed = parseUnifiedDiff(diffText)
    const output = options.wordDiff ? renderInline(parsed) : renderSideBySide(parsed, options)
    return { type: 'text', value: output }
  }

  // Get diff
  const diffText = getDiff(options)

  if (!diffText.trim()) {
    return { type: 'text', value: '✅ 没有检测到代码变更（工作目录干净）。' }
  }

  // Export
  const exportMatch = s.match(/--export\s+(\S+)/)
  if (exportMatch) {
    const path = exportDiff(diffText, exportMatch[1] as any, options)
    return { type: 'text', value: `✅ 已导出到: ${path}` }
  }

  // Stats only
  if (s.includes('--stat')) {
    const statText = getDiffStat(options)
    return { type: 'text', value: statText || '无变更' }
  }

  // Parse and render
  const parsed = parseUnifiedDiff(diffText)

  // Add to history
  addHistoryEntry(s, parsed.map(d => d.file), parsed.reduce((sum, d) => sum + d.additions, 0), parsed.reduce((sum, d) => sum + d.deletions, 0))

  // Stats
  if (s.includes('--stats')) {
    const stats = calculateStats(parsed)
    return { type: 'text', value: formatStats(stats) }
  }

  // Render
  let output: string
  if (options.collapseUnchanged) {
    output = renderCollapsed(parsed, options.minCollapseLines)
  } else if (options.wordDiff) {
    output = renderInline(parsed)
  } else {
    output = renderSideBySide(parsed, options)
  }

  return { type: 'text', value: output }
}

// ============================================================================
// Command Registration
// ============================================================================

const diffMode: Command = {
  type: 'local' as const,
  name: 'diff-mode',
  description: '并排差异视图 - 多模式/评论/书签/历史/导出/统计/三向合并',
  aliases: ['/diff-mode', '/sidediff', '/diff-side'],
  arguments: [
    { name: '--side-by-side', description: '并排视图', required: false },
    { name: '--inline', description: '内联视图', required: false },
    { name: '--word-diff', description: '词级差异', required: false },
    { name: '--collapsed', description: '折叠未变更', required: false },
    { name: '--staged', description: '已暂存的变更', required: false },
    { name: '--file', description: '特定文件', required: false },
    { name: '--commits', description: '最近 n 次提交', required: false },
    { name: '--branch', description: '分支对比', required: false },
    { name: '--stat', description: '只显示统计', required: false },
    { name: '--stats', description: '变更统计', required: false },
    { name: '--comments', description: '查看评论', required: false },
    { name: '--bookmarks', description: '查看书签', required: false },
    { name: '--history', description: '查看历史', required: false },
    { name: '--export', description: '导出', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default diffMode
