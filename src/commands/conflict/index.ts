import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, extname } from 'path'

interface ConflictInfo {
  file: string
  lineStart: number
  lineEnd: number
  ours: string[]
  theirs: string[]
}

function findConflicts(): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []
  const fs = require('fs')
  const scan = (dir: string) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|md|css|html|py|go|java|rs)$/.test(extname(entry.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            if (content.includes('<<<<<<<')) {
              const lines = content.split('\n')
              let inConflict = false
              let startLine = 0
              const ours: string[] = []
              const theirs: string[] = []
              let side: 'ours' | 'theirs' = 'ours'
              lines.forEach((line, i) => {
                if (line.startsWith('<<<<<<<')) { inConflict = true; startLine = i + 1; side = 'ours' }
                else if (line.startsWith('=======') && inConflict) { side = 'theirs' }
                else if (line.startsWith('>>>>>>>') && inConflict) {
                  conflicts.push({ file: fp, lineStart: startLine, lineEnd: i + 1, ours: [...ours], theirs: [...theirs] })
                  inConflict = false; ours.length = 0; theirs.length = 0
                } else if (inConflict) { if (side === 'ours') ours.push(line); else theirs.push(line) }
              })
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan('.')
  return conflicts
}

function resolveConflict(file: string, strategy: 'ours' | 'theirs' | 'both'): number {
  if (!existsSync(file)) return 0
  try {
    let content = readFileSync(file, 'utf-8')
    const regex = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*/g
    let resolved = 0
    content = content.replace(regex, (match, ours, theirs) => {
      resolved++
      if (strategy === 'ours') return ours.trim()
      if (strategy === 'theirs') return theirs.trim()
      return ours.trim() + '\n' + theirs.trim()
    })
    writeFileSync(file, content, 'utf-8')
    return resolved
  } catch { return 0 }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'help' || cmd === '') {
    return { type: 'text', value: [
      '🔀 合并冲突解决器', '', '📖 用法：',
      '  /conflict list               列出所有冲突',
      '  /conflict show <文件>        查看冲突详情',
      '  /conflict ours <文件>        使用我们的版本',
      '  /conflict theirs <文件>      使用对方的版本',
      '  /conflict both <文件>        保留两边',
      '  /conflict resolve-all <策略>  全部解决 (ours/theirs/both)',
      '  /conflict status             Git 合并状态',
      '  /conflict abort              中止合并',
      '  /conflict continue           继续合并',
    ].join('\n') }
  }

  if (cmd === 'list' || cmd === 'status') {
    const conflicts = findConflicts()
    if (conflicts.length === 0) return { type: 'text', value: '✅ 未发现合并冲突' }
    const lines = ['🔀 合并冲突（' + conflicts.length + '）：', '══════════════════', '']
    conflicts.forEach(c => lines.push(c.file + ' (行 ' + c.lineStart + '-' + c.lineEnd + ', ' + c.ours.length + ' vs ' + c.theirs.length + ' 行)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'show') {
    const file = parts[1]
    if (!file) return { type: 'text', value: '📖 用法：/conflict show <文件>' }
    const conflicts = findConflicts().filter(c => c.file === file || c.file.endsWith(file))
    if (conflicts.length === 0) return { type: 'text', value: '⚠️ ' + file + ' 中无冲突' }
    const lines = ['📋 ' + file + ' 中的冲突：', '════════════════════════', '']
    conflicts.forEach((c, i) => {
      lines.push('冲突 #' + (i + 1) + ' (行 ' + c.lineStart + '-' + c.lineEnd + ')：')
      lines.push('--- 我们的版本 ---'); c.ours.forEach(l => lines.push('  + ' + l))
      lines.push('--- 对方版本 ---'); c.theirs.forEach(l => lines.push('  - ' + l))
      lines.push('')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'ours' || cmd === 'theirs' || cmd === 'both') {
    const file = parts[1]
    if (!file) return { type: 'text', value: '📖 用法：/conflict ' + cmd + ' <文件>' }
    const resolved = resolveConflict(file, cmd as 'ours' | 'theirs' | 'both')
    return { type: 'text', value: '✅ 已解决 ' + resolved + ' 个冲突（策略：' + cmd + '）' }
  }

  if (cmd === 'resolve-all') {
    const strategy = (parts[1] as 'ours' | 'theirs' | 'both') || 'ours'
    const conflicts = findConflicts()
    if (conflicts.length === 0) return { type: 'text', value: '✅ 无冲突需要解决' }
    let total = 0
    conflicts.forEach(c => { total += resolveConflict(c.file, strategy) })
    return { type: 'text', value: '✅ 已解决 ' + total + ' 个冲突（策略：' + strategy + '）' }
  }

  if (cmd === 'abort') {
    try { execSync('git merge --abort', { stdio: 'ignore' }); return { type: 'text', value: '✅ 合并已中止' } }
    catch { return { type: 'text', value: '❌ 中止失败' } }
  }

  if (cmd === 'continue') {
    try { execSync('git commit --no-edit', { stdio: 'ignore' }); return { type: 'text', value: '✅ 合并继续' } }
    catch { return { type: 'text', value: '❌ 继续失败' } }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const conflict: Command = {
  type: 'local', name: 'conflict',
  description: '合并冲突 - 列出/显示/解决(ours/theirs/both)/中止/继续',
  aliases: ['/conflict', '/merge'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default conflict
