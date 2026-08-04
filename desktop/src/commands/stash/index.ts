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
    if (stashes.length === 0) return { type: 'text', value: 'No stashes. Use /stash save [message] to create one.' }
    const lines = ['Git Stashes:', '=============', '']
    stashes.forEach(st => {
      const stats = getStashStats(st.index)
      const note = notes['{' + st.index + '}'] ? ' [' + notes['{' + st.index + '}'] + ']' : ''
      lines.push(st.name + ' [' + st.branch + '] ' + st.message + note)
      lines.push('  Files: ' + stats.files + ' (+' + stats.insertions + '/-' + stats.deletions + ')')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'save' || cmd === 'push') {
    const message = parts.slice(1).join(' ') || 'stash-' + new Date().toISOString().slice(0, 19)
    try {
      const flags = parts.includes('-u') || parts.includes('--include-untracked') ? ' --include-untracked' : ''
      execSync('git stash push' + flags + ' -m "' + message + '"', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Stashed: ' + message }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'pop' || cmd === 'apply') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: 'Usage: /stash pop [index]' }
    try {
      const action = cmd === 'pop' ? 'pop' : 'apply'
      execSync('git stash ' + action + ' stash@\{' + idx + '\}', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Stash ' + action + 'ed: {' + idx + '}' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'show' || cmd === 'view') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: 'Usage: /stash show [index]' }
    try {
      const stats = getStashStats(idx)
      const files = getStashFiles(idx)
      const diff = execSync('git diff stash@\{' + idx + '\}', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const lines = [
        'Stash {' + idx + '}:', 'Files: ' + stats.files + ' (+' + stats.insertions + '/-' + stats.deletions + ')', '',
        'Changed files:',
      ]
      files.forEach(f => lines.push('  - ' + f))
      lines.push('', 'Diff:', diff.slice(0, 3000))
      return { type: 'text', value: lines.join('\n') }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'files') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: 'Usage: /stash files [index]' }
    const files = getStashFiles(idx)
    if (files.length === 0) return { type: 'text', value: 'No files in stash {' + idx + '}' }
    const lines = ['Files in stash {' + idx + '}:', '========================', '']
    files.forEach(f => lines.push('  - ' + f))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'branch') {
    const idx = parseInt(parts[1] || '0')
    const branchName = parts[2] || 'stash-branch-' + idx
    if (isNaN(idx)) return { type: 'text', value: 'Usage: /stash branch [index] [branch-name]' }
    try {
      execSync('git stash branch ' + branchName + ' stash@\{' + idx + '\}', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Created branch ' + branchName + ' from stash {' + idx + '}' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'drop') {
    const idx = parseInt(parts[1] || '0')
    if (isNaN(idx)) return { type: 'text', value: 'Usage: /stash drop [index]' }
    try { execSync('git stash drop stash@\{' + idx + '\}', { stdio: 'ignore' }); return { type: 'text', value: '[OK] Dropped stash {' + idx + '}' } }
    catch (err) { return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) } }
  }

  if (cmd === 'clear') {
    try { execSync('git stash clear', { stdio: 'ignore' }); return { type: 'text', value: '[OK] All stashes cleared' } }
    catch { return { type: 'text', value: '[ERROR] Clear failed' } }
  }

  if (cmd === 'note') {
    const idx = parseInt(parts[1] || '0')
    const note = parts.slice(2).join(' ')
    if (isNaN(idx) || !note) return { type: 'text', value: 'Usage: /stash note <index> <note>' }
    notes['{' + idx + '}'] = note
    saveNotes(notes)
    return { type: 'text', value: '[OK] Note added to stash {' + idx + '}' }
  }

  if (cmd === 'rename') {
    const idx = parseInt(parts[1] || '0')
    const newName = parts.slice(2).join(' ')
    if (isNaN(idx) || !newName) return { type: 'text', value: 'Usage: /stash rename <index> <new-message>' }
    try {
      execSync('git stash drop stash@\{' + idx + '\}', { stdio: 'ignore' })
      execSync('git stash push -m "' + newName + '"', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Renamed and re-saved as: ' + newName }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'compare') {
    const idx1 = parseInt(parts[1] || '0')
    const idx2 = parseInt(parts[2] || '1')
    if (isNaN(idx1) || isNaN(idx2)) return { type: 'text', value: 'Usage: /stash compare <idx1> <idx2>' }
    try {
      const diff = execSync('git diff stash@\{' + idx1 + '\}..stash@\{' + idx2 + '\}', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Diff between stash {' + idx1 + '} and {' + idx2 + '}:\n' + diff.slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  return { type: 'text', value: [
    'Git Stash Manager', '', 'Usage:',
    '  /stash list              List all stashes with stats', '  /stash save [message]    Create new stash',
    '  /stash pop [index]       Pop stash (removes)', '  /stash apply [index]     Apply stash (keeps)',
    '  /stash show [index]      View full diff', '  /stash files [index]     List changed files',
    '  /stash branch [idx] [name] Create branch from stash', '  /stash drop [index]      Delete a stash',
    '  /stash clear             Delete all stashes', '  /stash note <idx> <text> Add note',
    '  /stash rename <idx> <msg> Rename stash', '  /stash compare <i> <j>   Compare two stashes',
  ].join('\n') }
}

const stash: Command = {
  type: 'local', name: 'stash',
  description: 'Git stash - save/pop/apply/show/files/branch/drop/note/rename/compare',
  aliases: ['/stash', '/st'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default stash
