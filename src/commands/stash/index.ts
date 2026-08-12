import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface StashEntry {
  index: number
  name: string
  branch: string
  message: string
  files: number
  date: string
}

const STASH_NOTES_FILE = join(homedir(), '.doge', 'stash-notes.json')

function getStashList(): StashEntry[] {
  try {
    const output = execSync('git stash list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const lines = output.split('\n').filter(Boolean)
    return lines.map((line, i) => {
      const match = line.match(/^stash@\{(\d+)\}: (?:On (\S+): )?(.+)$/)
      return {
        index: i,
        name: '{' + i + '}',
        branch: match?.[2] || 'unknown',
        message: match?.[3] || line,
        files: 0,
        date: '',
      }
    })
  } catch { return [] }
}

function getStashFiles(index: number): string[] {
  try {
    const output = execSync('git stash show stash@\{' + index + '\} --name-only', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return output.split('\n').filter(Boolean)
  } catch { return [] }
}

function getStashStats(index: number): { insertions: number; deletions: number; files: number } {
  try {
    const output = execSync('git diff --stat stash@\{' + index + '\}^..stash@\{' + index + '\}', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const match = output.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/)
    return { files: parseInt(match?.[1] || '0'), insertions: parseInt(match?.[2] || '0'), deletions: parseInt(match?.[3] || '0') }
  } catch { return { files: 0, insertions: 0, deletions: 0 } }
}

function loadNotes(): Record<string, string> {
  try { if (existsSync(STASH_NOTES_FILE)) return JSON.parse(readFileSync(STASH_NOTES_FILE, 'utf-8')) } catch { /* ignore */ }
  return {}
}

function saveNotes(notes: Record<string, string>) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STASH_NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  const stashes = getStashList()
  const notes = loadNotes()

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    if (stashes.length === 0) return { type: 'text', value: '📋 无暂存记录。使用 /stash save [消息] 创建一个。' }
    const lines = ['Git 暂存：', '=============', '']
    stashes.forEach(st => {
      const stats = getStashStats(st.index)
      const note = notes['{' + st.index + '}'] ? ' [' + notes['{' + st.index + '}'] + ']' : ''
      lines.push(st.name + ' [' + st.branch + '] ' + st.message + note)
      lines.push('  文件：' + stats.files + ' (+' + stats.insertions + '/-' + stats.deletions + ')')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'save' || cmd === 'push') {
    const message = parts.slice(1).join(' ') || 'stash-' + new Date().toISOString().slice(0, 19)
    try {
      const flags = parts.includes('-u') || parts.includes('--include-untracked') ? ' --include-untracked' : ''
      execSync('git stash push' + flags + ' -m "' + message + '"', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已暂存：' + message }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'pop' || cmd === 'apply') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: '📖 用法：/stash pop [index]' }
    try {
      const action = cmd === 'pop' ? 'pop' : 'apply'
      execSync('git stash ' + action + ' stash@\{' + idx + '\}', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已' + (action === 'pop' ? '弹出' : '应用') + '暂存：{' + idx + '}' }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'show' || cmd === 'view') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: '📖 用法：/stash show [index]' }
    try {
      const stats = getStashStats(idx)
      const files = getStashFiles(idx)
      const diff = execSync('git diff stash@\{' + idx + '\}', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const lines = [
        '暂存 {' + idx + '}：', '文件：' + stats.files + ' (+' + stats.insertions + '/-' + stats.deletions + ')', '',
        '变更文件：',
      ]
      files.forEach(f => lines.push('  - ' + f))
      lines.push('', '差异：', diff.slice(0, 3000))
      return { type: 'text', value: lines.join('\n') }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'files') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: '📖 用法：/stash files [index]' }
    const files = getStashFiles(idx)
    if (files.length === 0) return { type: 'text', value: '暂存 {' + idx + '} 中没有文件' }
    const lines = ['暂存 {' + idx + '} 中的文件：', '========================', '']
    files.forEach(f => lines.push('  - ' + f))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'branch') {
    const idx = parseInt(parts[1] || '0')
    const branchName = parts[2] || 'stash-branch-' + idx
    if (isNaN(idx)) return { type: 'text', value: '📖 用法：/stash branch [index] [branch-name]' }
    try {
      execSync('git stash branch ' + branchName + ' stash@\{' + idx + '\}', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已从暂存 {' + idx + '} 创建分支：' + branchName }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'drop') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: '📖 用法：/stash drop [index]' }
    try { execSync('git stash drop stash@\{' + idx + '\}', { stdio: 'ignore' }); return { type: 'text', value: '✅ 已删除暂存：{' + idx + '}' } }
    catch (err) { return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) } }
  }

  if (cmd === 'clear') {
    try { execSync('git stash clear', { stdio: 'ignore' }); return { type: 'text', value: '✅ 已清除所有暂存' } }
    catch { return { type: 'text', value: '❌ 清除失败' } }
  }

  if (cmd === 'note') {
    const idx = parseInt(parts[1] || '0')
    const note = parts.slice(2).join(' ')
    if (isNaN(idx) || !note) return { type: 'text', value: '📖 用法：/stash note <index> <note>' }
    notes['{' + idx + '}'] = note
    saveNotes(notes)
    return { type: 'text', value: '✅ 已添加备注到暂存 {' + idx + '}' }
  }

  if (cmd === 'rename') {
    const idx = parseInt(parts[1] || '0')
    const newName = parts.slice(2).join(' ')
    if (isNaN(idx) || !newName) return { type: 'text', value: '📖 用法：/stash rename <index> <new-message>' }
    try {
      execSync('git stash drop stash@\{' + idx + '\}', { stdio: 'ignore' })
      execSync('git stash push -m "' + newName + '"', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已重命名并重新保存为：' + newName }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'compare') {
    const idx1 = parseInt(parts[1] || '0')
    const idx2 = parseInt(parts[2] || '1')
    if (isNaN(idx1) || isNaN(idx2)) return { type: 'text', value: '📖 用法：/stash compare <idx1> <idx2>' }
    try {
      const diff = execSync('git diff stash@\{' + idx1 + '\}..stash@\{' + idx2 + '\}', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '暂存 {' + idx1 + '} 和 {' + idx2 + '} 之间的差异：\n' + diff.slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  return { type: 'text', value: [
    '🗂️ Git 暂存管理器', '', '📖 用法：',
    '  /stash list              列出所有暂存（含统计）', '  /stash save [消息]       创建新暂存',
    '  /stash pop [index]       弹出暂存（删除）', '  /stash apply [index]     应用暂存（保留）',
    '  /stash show [index]      查看完整差异', '  /stash files [index]     列出变更文件',
    '  /stash branch [idx] [name] 从暂存创建分支', '  /stash drop [index]      删除暂存',
    '  /stash clear             删除所有暂存', '  /stash note <idx> <text> 添加备注',
    '  /stash rename <idx> <msg> 重命名暂存', '  /stash compare <i> <j>   比较两个暂存',
  ].join('\n') }
}

const stash: Command = {
  type: 'local', name: 'stash',
  description: 'Git stash - save/pop/apply/show/files/branch/drop/note/rename/compare',
  aliases: ['/stash', '/st'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default stash
