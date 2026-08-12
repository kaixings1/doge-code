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
      'Merge Conflict Resolver', '', '📖 Usage: ',
      '  /conflict list                List all conflicts',
      '  /conflict show <file>         Show conflict details',
      '  /conflict ours <file>         Resolve with ours',
      '  /conflict theirs <file>       Resolve with theirs',
      '  /conflict both <file>         Keep both sides',
      '  /conflict resolve-all <s>     Resolve all (ours/theirs/both)',
      '  /conflict status             Git merge status',
      '  /conflict abort              Abort merge',
      '  /conflict continue           Continue merge after resolution',
    ].join('\n') }
  }

  if (cmd === 'list' || cmd === 'status') {
    const conflicts = findConflicts()
    if (conflicts.length === 0) return { type: 'text', value: '[OK] No merge conflicts found!' }
    const lines = ['Merge Conflicts (' + conflicts.length + '):', '====================', '']
    conflicts.forEach(c => lines.push(c.file + ' (lines ' + c.lineStart + '-' + c.lineEnd + ', ' + c.ours.length + ' vs ' + c.theirs.length + ' lines)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'show') {
    const file = parts[1]
    if (!file) return { type: 'text', value: 'Usage: /conflict show <file>' }
    const conflicts = findConflicts().filter(c => c.file === file || c.file.endsWith(file))
    if (conflicts.length === 0) return { type: 'text', value: 'No conflicts in: ' + file }
    const lines = ['Conflicts in ' + file + ':', '====================', '']
    conflicts.forEach((c, i) => {
      lines.push('Conflict #' + (i + 1) + ' (lines ' + c.lineStart + '-' + c.lineEnd + '):')
      lines.push('--- OURS ---'); c.ours.forEach(l => lines.push('  + ' + l))
      lines.push('--- THEIRS ---'); c.theirs.forEach(l => lines.push('  - ' + l))
      lines.push('')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'ours' || cmd === 'theirs' || cmd === 'both') {
    const file = parts[1]
    if (!file) return { type: 'text', value: 'Usage: /conflict ' + cmd + ' <file>' }
    const resolved = resolveConflict(file, cmd as 'ours' | 'theirs' | 'both')
    return { type: 'text', value: '[OK] Resolved ' + resolved + ' conflicts in ' + file + ' using: ' + cmd }
  }

  if (cmd === 'resolve-all') {
    const strategy = (parts[1] as 'ours' | 'theirs' | 'both') || 'ours'
    const conflicts = findConflicts()
    if (conflicts.length === 0) return { type: 'text', value: '[OK] No conflicts to resolve' }
    let total = 0
    conflicts.forEach(c => { total += resolveConflict(c.file, strategy) })
    return { type: 'text', value: '[OK] Resolved ' + total + ' conflicts using: ' + strategy }
  }

  if (cmd === 'abort') {
    try { execSync('git merge --abort', { stdio: 'ignore' }); return { type: 'text', value: '[OK] Merge aborted' } }
    catch { return { type: 'text', value: '[ERROR] Abort failed' } }
  }

  if (cmd === 'continue') {
    try { execSync('git commit --no-edit', { stdio: 'ignore' }); return { type: 'text', value: '[OK] Merge continued' } }
    catch { return { type: 'text', value: '[ERROR] Continue failed' } }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const conflict: Command = {
  type: 'local', name: 'conflict',
  description: 'Merge conflicts - list/show/resolve (ours/theirs/both)/abort/continue',
  aliases: ['/conflict', '/merge'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default conflict
