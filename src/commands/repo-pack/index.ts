import { readdir, stat, readFile, writeFile } from 'fs/promises'
import { execSync } from 'child_process'
import { tmpdir } from 'node:os'
import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

const HELP = `Repo Pack — 将代码库打包为 AI 友好格式

用法: /repo-pack [选项]

选项:
  --output <format>          输出格式: markdown|xml|json (默认: markdown)
  --output-file <path>       输出文件路径 (默认: repomix-output.md)
  --include <pattern>        包含模式 (glob, 可多次指定)
  --ignore <pattern>         忽略模式 (glob, 可多次指定)
  --token-budget <n>         token 预算限制 (近似估算)
  --include-git-diff         包含 git diff
  --include-git-log [n]      包含 git log (默认最近 10 条)
  --directory-structure      显示目录结构
  --compress                 压缩内容 (移除注释和空行)
  --remove-comments          移除注释
  --remove-empty-lines       移除空行
  --help                     显示帮助

示例:
  /repo-pack
  /repo-pack --output xml --include "*.ts"
  /repo-pack --token-budget 50000 --compress
  /repo-pack --include-git-diff --directory-structure
`

interface Options {
  outputFormat: string
  outputFile: string
  includes: string[]
  ignores: string[]
  tokenBudget: number | null
  includeGitDiff: boolean
  includeGitLog: number
  showDirectoryStructure: boolean
  compress: boolean
  removeComments: boolean
  removeEmptyLines: boolean
}

function parseOptions(s: string): Options {
  const opts: Options = {
    outputFormat: 'markdown',
    outputFile: 'repomix-output.md',
    includes: ['**/*'],
    ignores: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.min.*'],
    tokenBudget: null,
    includeGitDiff: false,
    includeGitLog: 0,
    showDirectoryStructure: false,
    compress: false,
    removeComments: false,
    removeEmptyLines: false,
  }

  const parts = s.split(/\s+/)
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    switch (p) {
      case '--output':
        opts.outputFormat = parts[++i] || 'markdown'
        if (opts.outputFormat === 'xml') opts.outputFile = 'repomix-output.xml'
        else if (opts.outputFormat === 'json') opts.outputFile = 'repomix-output.json'
        else opts.outputFile = 'repomix-output.md'
        break
      case '--output-file':
        opts.outputFile = parts[++i] || opts.outputFile
        break
      case '--include':
        if (opts.includes.includes('**/*')) {
          opts.includes = [parts[++i] || '**/*']
        } else {
          opts.includes.push(parts[++i] || '**/*')
        }
        break
      case '--ignore':
        opts.ignores.push(parts[++i])
        break
      case '--token-budget':
        opts.tokenBudget = parseInt(parts[++i] || '0', 10) || null
        break
      case '--include-git-diff':
        opts.includeGitDiff = true
        break
      case '--include-git-log':
        opts.includeGitLog = parseInt(parts[++i] || '10', 10)
        break
      case '--directory-structure':
        opts.showDirectoryStructure = true
        break
      case '--compress':
        opts.compress = true
        opts.removeComments = true
        opts.removeEmptyLines = true
        break
      case '--remove-comments':
        opts.removeComments = true
        break
      case '--remove-empty-lines':
        opts.removeEmptyLines = true
        break
    }
  }

  return opts
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

function compressContent(content: string, removeComments: boolean, removeEmptyLines: boolean): string {
  let result = content
  if (removeComments) {
    result = result.replace(/\/\/.*$/gm, '')
    result = result.replace(/\/\*[\s\S]*?\*\//g, '')
    result = result.replace(/#.*$/gm, '')
    result = result.replace(/<!--[\s\S]*?-->/g, '')
  }
  if (removeEmptyLines) {
    result = result.split('\n').filter(line => line.trim() !== '').join('\n')
  }
  return result
}

const DEFAULT_IGNORES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'repomix-output'])

async function collectFiles(cwd: string, opts: Options): Promise<{ path: string; content: string; tokens: number }[]> {
  const files: { path: string; content: string; tokens: number }[] = []
  const seen = new Set<string>()

  const MAX_FILES = 500
  const MAX_TOTAL_CHARS = 5_000_000

  // 预先一次性收集所有候选文件（避免对每个 pattern 重复遍历）
  const allFiles = new Set<string>()
  for await (const fullPath of walkDir(cwd)) {
    const rel = fullPath.replace(cwd, '').replace(/^[/\\]/, '')
    // 跳过超出 cwd 边界的路径
    if (rel.startsWith('..')) continue
    if (shouldIgnore(rel, opts.ignores)) continue
    allFiles.add(fullPath)
  }

  const globPatterns = opts.includes.map(p => {
    if (p.startsWith('.')) return p
    if (!p.includes('*')) return p + '/**/*'
    return p
  })

  const matches = new Set<string>()
  for (const pattern of globPatterns) {
    for (const fullPath of allFiles) {
      const rel = fullPath.replace(cwd, '').replace(/^[/\\]/, '')
      if (matchesGlob(rel, pattern)) matches.add(fullPath)
    }
  }

  let totalChars = 0
  for (const filePath of matches) {
    if (seen.has(filePath)) continue
    seen.add(filePath)
    if (files.length >= MAX_FILES) break
    if (totalChars >= MAX_TOTAL_CHARS) break

    try {
      const content = await readFile(filePath, 'utf-8')
      let processed = content
      if (opts.compress || opts.removeComments || opts.removeEmptyLines) {
        processed = compressContent(content, opts.removeComments, opts.removeEmptyLines)
      }
      totalChars += processed.length
      const tokens = estimateTokens(processed)
      files.push({ path: filePath, content: processed, tokens })
    } catch {
      // skip unreadable files
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path))
  return files
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  let entries: { name: string; path: string }[]
  try {
    const names = await readdir(dir)
    entries = names.map(n => ({ name: n, path: dir + '/' + n }))
  } catch {
    return
  }
  for (const entry of entries) {
    try {
      const s = await stat(entry.path)
      if (s.isDirectory()) {
        // 跳过被忽略的目录，避免递归进入 node_modules 等
        const relName = entry.path.replace(dir + '/', '')
        if (DEFAULT_IGNORES.has(relName)) continue
        yield* walkDir(entry.path)
      } else {
        yield entry.path
      }
    } catch {
      // skip unreadable entries
    }
  }
}

function matchesGlob(relPath: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return relPath === pattern || relPath.startsWith(pattern + '/')
  }
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '<<<DOUBLESTAR>>>').replace(/\*/g, '[^/]*').replace(/<<<DOUBLESTAR>>>/g, '.*') + '$'
  )
  return regex.test(relPath)
}

function shouldIgnore(relPath: string, ignorePatterns: string[]): boolean {
  const lower = relPath.toLowerCase()
  for (const dir of DEFAULT_IGNORES) {
    if (lower.includes('/' + dir + '/') || lower.startsWith(dir + '/')) return true
  }
  for (const pattern of ignorePatterns) {
    const p = pattern.replace(/\*\*/g, '').replace(/\*/g, '[^/]*').replace(/\./g, '\\.')
    if (new RegExp('^' + p + '$').test(relPath)) return true
  }
  return false
}

function generateDirectoryTree(files: { path: string }[], cwd: string): string {
  const lines: string[] = ['Directory structure:', '']
  const relPaths = files.map(f => f.path.replace(cwd + '/', '').replace(cwd + '\\', ''))

  for (const p of relPaths) {
    const parts = p.split('/').filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      const prefix = '  '.repeat(i)
      const isLast = i === parts.length - 1
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${parts[i]}`)
    }
  }

  return lines.join('\n')
}

async function getGitDiff(cwd: string): Promise<string> {
  try {
    const out = execSync('git diff --stat', { cwd, encoding: 'utf-8' })
    return out
  } catch {
    return ''
  }
}

async function getGitLog(count: number, cwd: string): Promise<string> {
  try {
    const out = execSync(`git log --oneline -n ${String(count)}`, { cwd, encoding: 'utf-8' })
    return out
  } catch {
    return ''
  }
}

function generateMarkdown(files: { path: string; content: string; tokens: number }[], opts: Options, cwd: string, gitDiff: string, gitLog: string): string {
  const parts: string[] = []
  const relCwd = cwd.replace(/\\/g, '/')

  parts.push(`# Repository: ${relCwd}`)
  parts.push('')
  parts.push(`> Packed by repo-pack | ${new Date().toISOString()}`)
  parts.push('')

  if (opts.showDirectoryStructure) {
    parts.push('## Directory Structure')
    parts.push('')
    parts.push(generateDirectoryTree(files, cwd))
    parts.push('')
    parts.push('---')
    parts.push('')
  }

  if (gitDiff) {
    parts.push('## Git Diff')
    parts.push('')
    parts.push('```')
    parts.push(gitDiff.trim())
    parts.push('```')
    parts.push('')
    parts.push('---')
    parts.push('')
  }

  if (gitLog) {
    parts.push('## Git Log')
    parts.push('')
    parts.push('```')
    parts.push(gitLog.trim())
    parts.push('```')
    parts.push('')
    parts.push('---')
    parts.push('')
  }

  parts.push('## Files')
  parts.push('')

  let totalTokens = 0
  for (const file of files) {
    if (opts.tokenBudget && totalTokens + file.tokens > opts.tokenBudget) {
      parts.push(`... (truncated at token budget ${opts.tokenBudget})`)
      break
    }
    totalTokens += file.tokens
    const relPath = file.path.replace(cwd + '/', '').replace(cwd + '\\', '')
    parts.push(`### ${relPath}`)
    parts.push('')
    parts.push('```')
    parts.push(file.content)
    parts.push('```')
    parts.push('')
  }

  parts.push('---')
  parts.push(`Total files: ${files.length} | Estimated tokens: ${totalTokens}`)

  return parts.join('\n')
}

function generateXml(files: { path: string; content: string; tokens: number }[], opts: Options, cwd: string): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  parts.push('<repository>')
  parts.push(`  <name>${cwd.replace(/\\/g, '/')}</name>`)
  parts.push(`  <timestamp>${new Date().toISOString()}</timestamp>`)

  if (opts.showDirectoryStructure) {
    parts.push('  <directoryStructure>')
    const relPaths = files.map(f => f.path.replace(cwd + '/', '').replace(cwd + '\\', ''))
    for (const p of relPaths) {
      parts.push(`    <file>${escapeXml(p)}</file>`)
    }
    parts.push('  </directoryStructure>')
  }

  parts.push('  <files>')
  for (const file of files) {
    const relPath = file.path.replace(cwd + '/', '').replace(cwd + '\\', '')
    parts.push(`    <file path="${escapeXml(relPath)}" tokens="${file.tokens}">`)
    parts.push(`      <content><![CDATA[${file.content}]]></content>`)
    parts.push('    </file>')
  }
  parts.push('  </files>')
  parts.push('</repository>')
  return parts.join('\n')
}

function generateJson(files: { path: string; content: string; tokens: number }[], opts: Options, cwd: string): string {
  const relCwd = cwd.replace(/\\/g, '/')
  const output = {
    name: relCwd,
    timestamp: new Date().toISOString(),
    files: files.map(f => ({
      path: f.path.replace(cwd + '/', '').replace(cwd + '\\', ''),
      tokens: f.tokens,
      content: f.content,
    })),
    stats: {
      totalFiles: files.length,
      totalTokens: files.reduce((sum, f) => sum + f.tokens, 0),
    },
  }
  return JSON.stringify(output, null, 2)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const repoPack: Command = {
  name: 'repo-pack',
  description: '将代码库打包为 AI 友好格式 (类似 repomix)',
  type: 'local',
  call: async (input, _ctx): Promise<LocalCommandCall> => {
    const s = typeof input === 'string' ? input : input.message ?? ''

    if (s.includes('--help')) {
      return { type: 'text', value: HELP }
    }

    const opts = parseOptions(s)
    const cwd = (_ctx as any)?.cwd || process.cwd()

    const files = await collectFiles(cwd, opts)
    if (files.length === 0) {
      return { type: 'text', value: 'No files found matching the include patterns.' }
    }

    let gitDiff = ''
    let gitLog = ''
    if (opts.includeGitDiff) {
      gitDiff = await getGitDiff(cwd)
    }
    if (opts.includeGitLog > 0) {
      gitLog = await getGitLog(opts.includeGitLog, cwd)
    }

    let output: string
    switch (opts.outputFormat) {
      case 'xml':
        output = generateXml(files, opts, cwd)
        break
      case 'json':
        output = generateJson(files, opts, cwd)
        break
      default:
        output = generateMarkdown(files, opts, cwd, gitDiff, gitLog)
    }

    const outputDir = cwd === process.cwd() ? tmpdir() : cwd
    const outputPath = outputDir + '/' + opts.outputFile
    try {
      await writeFile(outputPath, output, 'utf-8')
      const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0)
      return {
        type: 'text',
        value: `Packed ${files.length} files into ${opts.outputFile}\nFormat: ${opts.outputFormat}\nEstimated tokens: ${totalTokens}\nOutput: ${outputPath}`,
      }
    } catch {
      return { type: 'text', value: `Error writing output file: ${outputPath}` }
    }
  },
}

export default repoPack
