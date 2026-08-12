import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

/**
 * Parse unified diff output into side-by-side text format.
 */
function parseUnifiedDiff(diffText: string): string {
  const lines = diffText.split('\n')
  const output: string[] = []
  let oldLines: string[] = []
  let newLines: string[] = []
  let oldLineNum = 0
  let newLineNum = 0
  let inHunk = false

  const flushHunk = () => {
    if (oldLines.length === 0 && newLines.length === 0) return

    // Calculate line number width
    const maxNum = Math.max(oldLineNum, newLineNum, 1)
    const numWidth = Math.max(maxNum.toString().length, 3)
    const contentWidth = 38
    const totalWidth = numWidth * 2 + contentWidth * 2 + 10

    output.push('─'.repeat(totalWidth))

    const maxRows = Math.max(oldLines.length, newLines.length)
    for (let i = 0; i < maxRows; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]

      if (oldLine !== undefined && newLine !== undefined) {
        // Both exist - show side by side
        const oldNum = (oldLine.oldNum ?? '').toString().padStart(numWidth)
        const newNum = (newLine.newNum ?? '').toString().padStart(numWidth)
        const oldContent = (oldLine.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
        const newContent = (newLine.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
        const oldMarker = oldLine.type === 'add' ? '+' : oldLine.type === 'remove' ? '-' : ' '
        const newMarker = newLine.type === 'add' ? '+' : newLine.type === 'remove' ? '-' : ' '
        output.push(` ${oldNum} ${oldContent} ${oldMarker}│${newMarker} ${newNum} ${newContent}`)
      } else if (oldLine !== undefined) {
        const oldNum = (oldLine.oldNum ?? '').toString().padStart(numWidth)
        const oldContent = (oldLine.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
        const marker = oldLine.type === 'remove' ? '-' : ' '
        output.push(` ${oldNum} ${oldContent} ${marker}│  ${' '.repeat(numWidth)} ${' '.repeat(contentWidth)}`)
      } else if (newLine !== undefined) {
        const newNum = (newLine.newNum ?? '').toString().padStart(numWidth)
        const newContent = (newLine.text ?? '').slice(0, contentWidth).padEnd(contentWidth)
        const marker = newLine.type === 'add' ? '+' : ' '
        output.push(` ${' '.repeat(numWidth)} ${' '.repeat(contentWidth)}  │${marker} ${newNum} ${newContent}`)
      }
    }

    oldLines = []
    newLines = []
  }

  for (const line of lines) {
    // File header
    if (line.startsWith('diff --git')) {
      flushHunk()
      inHunk = false
      output.push('')
      output.push(`\x1b[1m${line}\x1b[0m`)
      continue
    }

    // Old file marker
    if (line.startsWith('--- ')) {
      output.push(`  \x1b[31m${line}\x1b[0m`)
      continue
    }

    // New file marker
    if (line.startsWith('+++ ')) {
      output.push(`  \x1b[32m${line}\x1b[0m`)
      continue
    }

    // Hunk header
    if (line.startsWith('@@')) {
      flushHunk()
      inHunk = true
      // Parse @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match) {
        oldLineNum = parseInt(match[1], 10)
        newLineNum = parseInt(match[3], 10)
      }
      output.push(`  \x1b[36m${line}\x1b[0m`)
      continue
    }

    if (!inHunk) continue

    // Diff content lines
    if (line.startsWith('-')) {
      oldLines.push({ text: line.slice(1), type: 'remove', oldNum: oldLineNum++ })
    } else if (line.startsWith('+')) {
      newLines.push({ text: line.slice(1), type: 'add', newNum: newLineNum++ })
    } else if (line.startsWith(' ')) {
      // Flush any pending changes before context
      flushHunk()
      oldLineNum++
      newLineNum++
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file"
      continue
    }
  }

  flushHunk()
  return output.join('\n')
}

function renderHelp(): string {
  return [
    '📊 并排 Diff 视图',
    '',
    '显示 git diff 的并排对比视图（类似 GitHub PR）。',
    '',
    '用法:',
    '  /diff-mode [选项]',
    '',
    '选项:',
    '  --staged           查看已暂存的变更（git diff --staged）',
    '  --file <路径>      查看特定文件的变更',
    '  --commits <n>      查看最近 n 次提交的变更（默认 1）',
    ' 用法:   --help             显示帮助',
    '',
    '示例:',
    '  /diff-mode',
    '  /diff-mode --staged',
    '  /diff-mode --file src/index.ts',
    '  /diff-mode --commits 3',
    '',
    '说明:',
    '  左侧为旧版本（红色标记 -），右侧为新版本（绿色标记 +）。',
    '  在支持 ANSI 颜色的终端中显示彩色输出。',
  ].join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  const staged = s.includes('--staged')
  const fileMatch = s.match(/--file\s+(\S+)/)
  const commitsMatch = s.match(/--commits\s+(\d+)/)

  try {
    let diffCmd = 'git diff --no-color --unified=3'
    if (staged) diffCmd = 'git diff --staged --no-color --unified=3'
    if (fileMatch) diffCmd += ` -- ${fileMatch[1]}`
    if (commitsMatch) {
      const n = parseInt(commitsMatch[1], 10)
      diffCmd = `git diff HEAD~${n} HEAD --no-color --unified=3`
    }

    let diffText: string
    try {
      diffText = execSync(diffCmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15000,
      })
    } catch (execErr: unknown) {
      // git diff returns exit code 1 when there are differences - this is normal
      const err = execErr as { stdout?: string; status?: number }
      if (err.stdout) {
        diffText = err.stdout
      } else {
        return { type: 'text', value: ` 无法获取 diff: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    if (!diffText.trim()) {
      return { type: 'text', value: ' 没有检测到代码变更（工作目录干净）。' }
    }

    const sideBySide = parseUnifiedDiff(diffText)
    return { type: 'text', value: sideBySide }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { type: 'text', value: ` Diff 失败: ${message}` }
  }
}

const diffMode = {
  type: 'local' as const,
  name: 'diff-mode',
  description: '并排 Diff 视图 - 类似 GitHub PR 的左右对比 diff',
  aliases: ['/diff-mode', '/sidediff', '/diff-side'],
  arguments: [
    { name: '--staged', description: '查看已暂存的变更', required: false },
    { name: '--file', description: '查看特定文件的变更', required: false },
    { name: '--commits', description: '查看最近 n 次提交的变更', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default diffMode
