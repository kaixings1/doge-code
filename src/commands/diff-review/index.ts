import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

// ─── ANSI color helpers ───────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
}

function colorize(text: string, color: string): string {
  return `${color}${text}${ANSI.reset}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffHunk {
  /** 原始 hunk header 行内容 */
  header: string
  /** 解析出的旧文件起始行号 */
  oldStart: number
  /** 解析出的新文件起始行号 */
  newStart: number
  /** hunk 内的所有行（含上下文） */
  lines: string[]
  /** hunk 纯 diff 行（不含上下文），用于 patch */
  rawHunk: string
}

interface FileDiff {
  /** 文件路径 */
  filePath: string
  /** 旧文件路径（rename/copy 时不同） */
  oldFilePath: string
  /** 是否为新增文件 */
  isNew: boolean
  /** 是否为删除文件 */
  isDeleted: boolean
  /** 是否重命名 */
  isRename: boolean
  /** 该文件的全部 hunk */
  hunks: DiffHunk[]
  /** 原始 diff 文本 */
  rawDiff: string
}

interface ParsedDiff {
  files: FileDiff[]
}

// ─── Unified diff parser ──────────────────────────────────────────────────────

function parseUnifiedDiff(diffText: string): ParsedDiff {
  const lines = diffText.split('\n')
  const files: FileDiff[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Detect file diff header: "diff --git a/path b/path"
    if (line.startsWith('diff --git')) {
      const gitMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      if (!gitMatch) {
        i++
        continue
      }

      const oldFilePath = gitMatch[1]
      const filePath = gitMatch[2]
      const fileDiff: FileDiff = {
        filePath,
        oldFilePath,
        isNew: false,
        isDeleted: false,
        isRename: oldFilePath !== filePath,
        hunks: [],
        rawDiff: '',
      }

      const diffStart = i
      i++

      // Skip metadata lines (index, ---, +++, similarity, rename, etc.)
      while (i < lines.length) {
        const metaLine = lines[i]
        if (metaLine.startsWith('new file mode')) {
          fileDiff.isNew = true
          i++
        } else if (metaLine.startsWith('deleted file mode')) {
          fileDiff.isDeleted = true
          i++
        } else if (
          metaLine.startsWith('index ') ||
          metaLine.startsWith('--- ') ||
          metaLine.startsWith('+++ ') ||
          metaLine.startsWith('similarity index') ||
          metaLine.startsWith('rename ') ||
          metaLine.startsWith('copy ') ||
          metaLine === ''
        ) {
          i++
        } else if (metaLine.startsWith('@@')) {
          break
        } else {
          break
        }
      }

      // Parse hunks
      while (i < lines.length) {
        const hunkLine = lines[i]

        if (hunkLine.startsWith('diff --git')) {
          break // Next file
        }

        if (hunkLine.startsWith('@@')) {
          const headerMatch = hunkLine.match(
            /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/,
          )
          if (!headerMatch) {
            i++
            continue
          }

          const oldStart = parseInt(headerMatch[1], 10)
          const newStart = parseInt(headerMatch[3], 10)
          const hunk: DiffHunk = {
            header: hunkLine,
            oldStart,
            newStart,
            lines: [],
            rawHunk: '',
          }

          const rawHunkLines: string[] = [hunkLine]
          i++

          while (i < lines.length) {
            const contentLine = lines[i]

            // Stop at next hunk, next file, or non-diff line
            if (
              contentLine.startsWith('@@') ||
              contentLine.startsWith('diff --git')
            ) {
              break
            }

            // Valid diff content lines start with +, -, space, or \
            if (
              contentLine.startsWith('+') ||
              contentLine.startsWith('-') ||
              contentLine.startsWith(' ') ||
              contentLine.startsWith('\\')
            ) {
              hunk.lines.push(contentLine)
              rawHunkLines.push(contentLine)
              i++
            } else {
              break
            }
          }

          hunk.rawHunk = rawHunkLines.join('\n')
          fileDiff.hunks.push(hunk)
        } else {
          i++
        }
      }

      fileDiff.rawDiff = lines.slice(diffStart, i).join('\n')
      files.push(fileDiff)
    } else {
      i++
    }
  }

  return { files }
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function runGit(command: string, maxBuffer = 10 * 1024 * 1024): string {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      maxBuffer,
      timeout: 15000,
    })
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number; message?: string }
    if (e.stdout) return e.stdout
    throw new Error(e.message ?? String(err))
  }
}

function getModifiedFiles(): string[] {
  const output = runGit('git diff --name-only')
  const stagedOutput = runGit('git diff --staged --name-only')
  const files = new Set<string>()
  for (const f of output.split('\n')) {
    if (f.trim()) files.add(f.trim())
  }
  for (const f of stagedOutput.split('\n')) {
    if (f.trim()) files.add(f.trim())
  }
  return Array.from(files).sort()
}

function getDiffText(filePath?: string, staged = false): string {
  let cmd = 'git diff --no-color --unified=3'
  if (staged) cmd = 'git diff --staged --no-color --unified=3'
  if (filePath) cmd += ` -- ${filePath}`
  return runGit(cmd)
}

function getStagedDiffText(filePath?: string): string {
  const cmd = filePath
    ? `git diff --staged --no-color --unified=3 -- ${filePath}`
    : 'git diff --staged --no-color --unified=3'
  return runGit(cmd)
}

function getStats(): {
  insertions: number
  deletions: number
  files: number
  fileStats: Map<string, { insertions: number; deletions: number }>
} {
  const output = runGit('git diff --numstat')
  const stagedOutput = runGit('git diff --staged --numstat')
  let insertions = 0
  let deletions = 0
  const fileStats = new Map<string, { insertions: number; deletions: number }>()

  const parseNumstat = (text: string) => {
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split('\t')
      if (parts.length < 3) continue
      const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0
      const dels = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0
      const file = parts[2]
      // Handle renames (format: "R100\told\tnew")
      const cleanFile = file.includes('\t') ? file.split('\t')[1] : file
      insertions += ins
      deletions += dels
      const existing = fileStats.get(cleanFile)
      if (existing) {
        existing.insertions += ins
        existing.deletions += dels
      } else {
        fileStats.set(cleanFile, { insertions: ins, deletions: dels })
      }
    }
  }

  parseNumstat(output)
  parseNumstat(stagedOutput)

  return {
    insertions,
    deletions,
    files: fileStats.size,
    fileStats,
  }
}

function getFullFileContent(filePath: string): string {
  try {
    return runGit(`git show HEAD:${filePath}`)
  } catch {
    // File may be untracked
    try {
      return execSync(`type "${filePath}"`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 5000,
      })
    } catch {
      return ''
    }
  }
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderColoredDiff(diffText: string): string {
  const output: string[] = []
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git')) {
      output.push(colorize(line, ANSI.bold + ANSI.cyan))
    } else if (line.startsWith('--- ')) {
      output.push(colorize(line, ANSI.red))
    } else if (line.startsWith('+++ ')) {
      output.push(colorize(line, ANSI.green))
    } else if (line.startsWith('@@')) {
      output.push(colorize(line, ANSI.cyan))
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      output.push(colorize(line, ANSI.green))
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      output.push(colorize(line, ANSI.red))
    } else if (line.startsWith('index ')) {
      output.push(colorize(line, ANSI.dim))
    } else if (line.startsWith('new file mode') || line.startsWith('deleted file mode')) {
      output.push(colorize(line, ANSI.yellow))
    } else {
      output.push(line)
    }
  }
  return output.join('\n')
}

function renderFileList(files: string[]): string {
  if (files.length === 0) {
    return colorize('  (没有已修改的文件)', ANSI.dim)
  }
  const lines: string[] = []
  for (let i = 0; i < files.length; i++) {
    const idx = colorize(`${i + 1}.`.padStart(4), ANSI.dim)
    lines.push(`  ${idx} ${files[i]}`)
  }
  return lines.join('\n')
}

function renderStats(
  stats: {
    insertions: number
    deletions: number
    files: number
    fileStats: Map<string, { insertions: number; deletions: number }>
  },
  json: boolean,
): string {
  if (json) {
    const fileArr = Array.from(stats.fileStats.entries()).map(([file, s]) => ({
      file,
      insertions: s.insertions,
      deletions: s.deletions,
    }))
    return JSON.stringify(
      {
        totalFiles: stats.files,
        totalInsertions: stats.insertions,
        totalDeletions: stats.deletions,
        files: fileArr,
      },
      null,
      2,
    )
  }

  const lines: string[] = []
  lines.push(colorize('  变更统计', ANSI.bold))
  lines.push('  ' + '─'.repeat(50))
  lines.push(
    `  ${colorize('文件数', ANSI.dim)}   ${String(stats.files).padStart(6)}`,
  )
  lines.push(
    `  ${colorize('新增行', ANSI.green)} +${String(stats.insertions).padStart(6)}`,
  )
  lines.push(
    `  ${colorize('删除行', ANSI.red)} -${String(stats.deletions).padStart(6)}`,
  )
  lines.push('  ' + '─'.repeat(50))

  if (stats.fileStats.size > 0) {
    lines.push('')
    lines.push(colorize('  各文件详情:', ANSI.bold))
    for (const [file, s] of stats.fileStats) {
      const name = file.length > 35 ? '...' + file.slice(-32) : file
      lines.push(
        `  ${name.padEnd(38)} ${colorize('+' + s.insertions, ANSI.green)}${colorize(' / -' + s.deletions, ANSI.red)}`,
      )
    }
  }

  return lines.join('\n')
}

// ─── Interactive hunk review renderer ─────────────────────────────────────────

function renderHunkReview(
  fileDiff: FileDiff,
  hunkIndex: number,
  totalHunks: number,
): string {
  const hunk = fileDiff.hunks[hunkIndex]
  if (!hunk) return colorize('  (无效的 hunk 索引)', ANSI.red)

  const lines: string[] = []
  const hunkLabel = colorize(
    `  Hunk ${hunkIndex + 1}/${totalHunks}`,
    ANSI.bold + ANSI.yellow,
  )
  const fileLabel = colorize(`  ${fileDiff.filePath}`, ANSI.bold + ANSI.cyan)
  lines.push(fileLabel)
  lines.push(colorize(`  ${hunk.header}`, ANSI.cyan))
  lines.push('')

  for (const line of hunk.lines) {
    if (line.startsWith('+')) {
      lines.push(colorize(`  ${line}`, ANSI.green))
    } else if (line.startsWith('-')) {
      lines.push(colorize(`  ${line}`, ANSI.red))
    } else {
      lines.push(colorize(`  ${line}`, ANSI.dim))
    }
  }

  lines.push('')
  lines.push(hunkLabel)
  lines.push(colorize('  [a]ccept  [r]eject  [s]kip  [q]uit', ANSI.dim))

  return lines.join('\n')
}

// ─── Compare two files ────────────────────────────────────────────────────────

function compareFiles(file1: string, file2: string): string {
  try {
    const content1 = execSync(`type "${file1}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 5000,
    })
    const content2 = execSync(`type "${file2}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 5000,
    })

    const lines1 = content1.split('\n')
    const lines2 = content2.split('\n')
    const maxLen = Math.max(lines1.length, lines2.length)

    const output: string[] = []
    output.push(colorize(`  比较: ${file1} vs ${file2}`, ANSI.bold))
    output.push(colorize(`  行数: ${lines1.length} vs ${lines2.length}`, ANSI.dim))
    output.push('')

    let diffCount = 0
    for (let i = 0; i < maxLen; i++) {
      const l1 = lines1[i]
      const l2 = lines2[i]
      if (l1 !== l2) {
        diffCount++
        output.push(colorize(`  行 ${i + 1}:`, ANSI.bold))
        output.push(colorize(`    - ${l1 ?? '(无)'}`, ANSI.red))
        output.push(colorize(`    + ${l2 ?? '(无)'}`, ANSI.green))
      }
    }

    if (diffCount === 0) {
      output.push(colorize('  两个文件内容完全相同。', ANSI.green))
    } else {
      output.push('')
      output.push(colorize(`  共 ${diffCount} 行差异`, ANSI.yellow))
    }

    return output.join('\n')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return colorize(`  读取文件失败: ${msg}`, ANSI.red)
  }
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

interface ParsedArgs {
  subcommand: string
  fileArg?: string
  fileArg2?: string
  json: boolean
  all: boolean
  staged: boolean
}

function parseArgs(args: string): ParsedArgs {
  const tokens = args.trim().split(/\s+/)
  const result: ParsedArgs = {
    subcommand: '',
    json: false,
    all: false,
    staged: false,
  }

  const positional: string[] = []
  for (const token of tokens) {
    if (token === '--json') result.json = true
    else if (token === '--all') result.all = true
    else if (token === '--staged') result.staged = true
    else positional.push(token)
  }

  result.subcommand = positional[0] ?? ''
  result.fileArg = positional[1]
  result.fileArg2 = positional[2]

  return result
}

// ─── Subcommand: list ─────────────────────────────────────────────────────────

function cmdList(json: boolean): string {
  const files = getModifiedFiles()
  if (json) {
    return JSON.stringify({ modifiedFiles: files }, null, 2)
  }

  const lines: string[] = []
  lines.push(colorize('  已修改文件列表', ANSI.bold))
  lines.push('  ' + '─'.repeat(40))
  lines.push(renderFileList(files))
  lines.push('')
  lines.push(colorize(`  共 ${files.length} 个文件`, ANSI.dim))
  return lines.join('\n')
}

// ─── Subcommand: stats ────────────────────────────────────────────────────────

function cmdStats(json: boolean): string {
  const stats = getStats()
  return renderStats(stats, json)
}

// ─── Subcommand: review ───────────────────────────────────────────────────────

function cmdReview(filePath: string | undefined, staged: boolean, json: boolean): string {
  const diffText = getDiffText(filePath, staged)
  if (!diffText.trim()) {
    return colorize(
      '  没有检测到代码变更（工作目录干净或文件无变更）。',
      ANSI.green,
    )
  }

  const parsed = parseUnifiedDiff(diffText)

  if (json) {
    const summary = parsed.files.map((f) => ({
      file: f.filePath,
      isNew: f.isNew,
      isDeleted: f.isDeleted,
      isRename: f.isRename,
      hunkCount: f.hunks.length,
      hunks: f.hunks.map((h) => ({
        header: h.header,
        oldStart: h.oldStart,
        newStart: h.newStart,
        lineCount: h.lines.length,
      })),
    }))
    return JSON.stringify({ files: summary }, null, 2)
  }

  const lines: string[] = []
  lines.push(colorize('  交互式 Diff 审查', ANSI.bold))
  lines.push('  ' + '─'.repeat(50))
  lines.push('')

  for (const fileDiff of parsed.files) {
    const fileLabel = fileDiff.isNew
      ? colorize(`  [新增] ${fileDiff.filePath}`, ANSI.green)
      : fileDiff.isDeleted
        ? colorize(`  [删除] ${fileDiff.filePath}`, ANSI.red)
        : fileDiff.isRename
          ? colorize(
              `  [重命名] ${fileDiff.oldFilePath} → ${fileDiff.filePath}`,
              ANSI.yellow,
            )
          : colorize(`  [修改] ${fileDiff.filePath}`, ANSI.cyan)

    lines.push(fileLabel)
    lines.push(
      colorize(
        `    ${fileDiff.hunks.length} 个 hunk`,
        ANSI.dim,
      ),
    )

    for (let hi = 0; hi < fileDiff.hunks.length; hi++) {
      const hunk = fileDiff.hunks[hi]
      lines.push(colorize(`    Hunk ${hi + 1}: ${hunk.header}`, ANSI.cyan))
      for (const line of hunk.lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lines.push(colorize(`      ${line}`, ANSI.green))
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          lines.push(colorize(`      ${line}`, ANSI.red))
        } else {
          lines.push(colorize(`      ${line}`, ANSI.dim))
        }
      }
    }
    lines.push('')
  }

  lines.push(colorize('  可用操作:', ANSI.bold))
  lines.push(
    colorize(
      `    /diff-review review ${filePath ?? '<文件>'}  审查指定文件`,
      ANSI.dim,
    ),
  )
  lines.push(
    colorize(
      `    /diff-review stage ${filePath ?? '<文件>'}    暂存指定文件的 hunk`,
      ANSI.dim,
    ),
  )
  lines.push(
    colorize(
      `    /diff-review review ${filePath ?? '<文件>'} --all  接受所有 hunk`,
      ANSI.dim,
    ),
  )
  lines.push(
    colorize(
      `    /diff-review list                          列出所有变更文件`,
      ANSI.dim,
    ),
  )

  return lines.join('\n')
}

// ─── Subcommand: stage ────────────────────────────────────────────────────────

function cmdStage(filePath: string | undefined, json: boolean): string {
  if (!filePath) {
    return colorize('📖 用法:   用法: /diff-review stage <文件>', ANSI.red)
  }

  // Check if file has changes
  const diffText = getDiffText(filePath)
  if (!diffText.trim()) {
    // Try staged
    const stagedText = getStagedDiffText(filePath)
    if (!stagedText.trim()) {
      return colorize(`  文件 "${filePath}" 没有未暂存的变更。`, ANSI.green)
    }
  }

  // Stage the file
  try {
    runGit(`git add -- ${filePath}`)
    if (json) {
      return JSON.stringify({ staged: filePath, success: true }, null, 2)
    }
    return colorize(`  已暂存: ${filePath}`, ANSI.green)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (json) {
      return JSON.stringify({ staged: filePath, success: false, error: msg }, null, 2)
    }
    return colorize(`  暂存失败: ${msg}`, ANSI.red)
  }
}

// ─── Subcommand: compare ──────────────────────────────────────────────────────

function cmdCompare(
  file1: string | undefined,
  file2: string | undefined,
  json: boolean,
): string {
  if (!file1 || !file2) {
    return colorize('📖 用法:   用法: /diff-review compare <文件1> <文件2>', ANSI.red)
  }

  const result = compareFiles(file1, file2)
  if (json) {
    return JSON.stringify({ file1, file2, comparison: result }, null, 2)
  }
  return result
}

// ─── Help renderer ────────────────────────────────────────────────────────────

function renderHelp(): string {
  return [
    colorize('  🔍 Diff Review - 交互式代码审查', ANSI.bold),
    '',
    '📖   用法: ',
    '    /diff-review <子命令> [选项]',
    '',
    '⌨️ ⌨️   子命令: ',
    colorize('    review <文件>', ANSI.cyan) + '     交互式审查文件的 git diff（逐 hunk accept/reject）',
    colorize('    stage  <文件>', ANSI.cyan) + '     暂存文件的特定变更（git add）',
    colorize('    compare <f1> <f2>', ANSI.cyan) + ' 比较两个文件的差异',
    colorize('    list', ANSI.cyan) + '              列出所有已修改的文件',
    colorize('    stats', ANSI.cyan) + '             显示变更统计（新增/删除行数）',
    colorize('    help', ANSI.cyan) + '              显示此帮助信息',
    '',
    '  选项:',
    colorize('    --json', ANSI.dim) + '   以 JSON 格式输出',
    colorize('    --all', ANSI.dim) + '    批量操作（接受/暂存所有 hunk）',
    colorize('    --staged', ANSI.dim) + ' 查看已暂存的变更',
    '',
    '💡   示例: ',
    '    /diff-review review src/index.ts',
    '    /diff-review stage src/index.ts',
    '    /diff-review compare src/old.ts src/new.ts',
    '    /diff-review list',
    '    /diff-review stats',
    '    /diff-review stats --json',
    '    /diff-review review src/index.ts --all',
    '    /diff-review list --json',
    '',
    '  说明:',
    '    逐 hunk 审查时，每个变更块将单独展示。',
    '    [a]ccept = 接受此 hunk  [r]eject = 拒绝此 hunk',
    '    终端中带 ANSI 颜色标记（+ 绿色，- 红色）。',
  ].join('\n')
}

// ─── Main call ────────────────────────────────────────────────────────────────

export const call: LocalCommandCall = async (args) => {
  const parsed = parseArgs(args ?? '')

  if (!parsed.subcommand || parsed.subcommand === 'help') {
    return { type: 'text', value: renderHelp() }
  }

  try {
    switch (parsed.subcommand) {
      case 'review':
        return { type: 'text', value: cmdReview(parsed.fileArg, parsed.staged, parsed.json) }
      case 'stage':
        return { type: 'text', value: cmdStage(parsed.fileArg, parsed.json) }
      case 'compare':
        return {
          type: 'text',
          value: cmdCompare(parsed.fileArg, parsed.fileArg2, parsed.json),
        }
      case 'list':
        return { type: 'text', value: cmdList(parsed.json) }
      case 'stats':
        return { type: 'text', value: cmdStats(parsed.json) }
      default:
        return {
          type: 'text',
          value: colorize(`  未知子命令: ${parsed.subcommand}\n  使用 /diff-review help 查看帮助。`, ANSI.red),
        }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (parsed.json) {
      return { type: 'text', value: JSON.stringify({ error: msg }, null, 2) }
    }
    return { type: 'text', value: colorize(`  错误: ${msg}`, ANSI.red) }
  }
}

// ─── Command definition ───────────────────────────────────────────────────────

const diffReview: Command = {
  type: 'local',
  name: 'diff-review',
  description: '交互式 Diff 审查 - 逐 hunk 审查/暂存/比较 git diff',
  aliases: ['/diff-review', '/diff-review', '/dr'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default diffReview
