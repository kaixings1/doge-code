import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge')
const CONFIG_FILE = join(CONFIG_DIR, 'auto-commit.json')
const HISTORY_FILE = join(CONFIG_DIR, 'commit-history.json')

interface AutoCommitConfig {
  enabled: boolean
  interval: number
  style: 'concise' | 'detailed' | 'emoji' | 'conventional'
  includeUntracked: boolean
  maxFiles: number
  conventionalCommits: boolean
  signOff: boolean
  scopes: string[]
  maxSubjectLength: number
}

interface CommitEntry {
  hash: string
  message: string
  date: string
  files: number
  insertions: number
  deletions: number
}

const DEFAULT_CONFIG: AutoCommitConfig = {
  enabled: false,
  interval: 300,
  style: 'conventional',
  includeUntracked: false,
  maxFiles: 50,
  conventionalCommits: true,
  signOff: false,
  scopes: [],
  maxSubjectLength: 72,
}

function loadConfig(): AutoCommitConfig {
  try {
    if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: AutoCommitConfig) {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function getGitStatus(): { modified: string[]; untracked: string[]; staged: string[] } {
  try {
    const output = execSync('git status --porcelain', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const lines = output.split('\n').filter(Boolean)
    return {
      modified: lines.filter(l => l.startsWith(' M') || l.startsWith('MM')).map(l => l.slice(3)),
      untracked: lines.filter(l => l.startsWith('??')).map(l => l.slice(3)),
      staged: lines.filter(l => l.startsWith('M ') || l.startsWith('A ')).map(l => l.slice(3)),
    }
  } catch { return { modified: [], untracked: [], staged: [] } }
}

function generateCommitMessage(files: string[], diff: string): string {
  const config = loadConfig()
  const prefix = files.length === 1 ? (files[0].split('/').pop() || 'file').replace(/\.\w+$/, '') : files.length + ' files'

  const hasNew = diff.includes('new file mode')
  const hasDelete = diff.includes('deleted file mode')
  const hasFunction = diff.includes('function ') || diff.includes('def ') || diff.includes('func ')
  const hasClass = diff.includes('class ') || diff.includes('struct ')
  const hasFix = diff.includes('fix') || diff.includes('bug') || diff.includes('patch')
  const hasTest = diff.includes('test') || diff.includes('spec')
  const hasDoc = diff.includes('README') || diff.includes('doc') || diff.includes('comment')
  const hasStyle = diff.includes('format') || diff.includes('lint') || diff.includes('style')
  const hasRefactor = diff.includes('refactor') || diff.includes('rename') || diff.includes('move')
  const hasPerf = diff.includes('perf') || diff.includes('optim') || diff.includes('speed')
  const hasBuild = diff.includes('build') || diff.includes('webpack') || diff.includes('vite')
  const hasCi = diff.includes('ci') || diff.includes('github') || diff.includes('action')
  const hasChore = diff.includes('chore') || diff.includes('deps') || diff.includes('package')
  const hasRevert = diff.includes('revert') || diff.includes('undo')

  let type = 'update'
  let scope = ''

  if (hasRevert) type = 'revert'
  else if (hasNew) type = 'add'
  else if (hasDelete) type = 'remove'
  else if (hasFix) type = 'fix'
  else if (hasTest) type = 'test'
  else if (hasDoc) type = 'docs'
  else if (hasStyle) type = 'style'
  else if (hasRefactor) type = 'refactor'
  else if (hasPerf) type = 'perf'
  else if (hasBuild) type = 'build'
  else if (hasCi) type = 'ci'
  else if (hasChore) type = 'chore'
  else if (hasFunction || hasClass) type = 'feat'

  if (config.scopes.length > 0) {
    for (const s of config.scopes) {
      if (files.some(f => f.includes(s))) { scope = s; break }
    }
  }

  const scopeStr = scope ? '(' + scope + ')' : ''
  const subject = type + scopeStr + ': ' + prefix

  if (config.style === 'emoji') {
    const emojis: Record<string, string> = { add: '[+]', remove: '[x]', fix: '[bug]', test: '[check]', docs: '[doc]', style: '[style]', refactor: '[ref]', perf: '[perf]', build: '[build]', ci: '[ci]', chore: '[chore]', feat: '[feat]', revert: '[revert]', update: '[edit]' }
    return (emojis[type] || '[edit]') + ' ' + subject
  }

  if (config.style === 'detailed') {
    return subject + ' - ' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' changed'
  }

  if (config.style === 'conventional' && config.conventionalCommits) {
    return subject
  }

  return subject
}

function getCommitHistory(count = 20): CommitEntry[] {
  try {
    const output = execSync('git log --pretty=format:"%H|%s|%ai" -' + count, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const statOutput = execSync('git log --stat --pretty=format:"%H" -' + count, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return output.split('\n').filter(Boolean).map(line => {
      const [hash, message, date] = line.split('|')
      return { hash: hash.slice(0, 7), message, date, files: 0, insertions: 0, deletions: 0 }
    })
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'status'
  const config = loadConfig()

  if (cmd === 'status' || cmd === '') {
    const status = getGitStatus()
    return { type: 'text', value: [
      'Auto-Commit Status', '====================',
      '', 'Status: ' + (config.enabled ? 'Enabled' : 'Disabled'),
      'Style: ' + config.style, 'Interval: ' + config.interval + 's',
      'IncludeUntracked: ' + (config.includeUntracked ? 'Yes' : 'No'),
      'MaxFiles: ' + config.maxFiles, 'Conventional: ' + (config.conventionalCommits ? 'Yes' : 'No'),
      'SignOff: ' + (config.signOff ? 'Yes' : 'No'),
      '', 'Pending: ' + status.modified.length + ' modified, ' + status.untracked.length + ' untracked, ' + status.staged.length + ' staged',
    ].join('\n') }
  }

  if (cmd === 'enable') { config.enabled = true; saveConfig(config); return { type: 'text', value: '[OK] Auto-commit enabled' } }
  if (cmd === 'disable') { config.enabled = false; saveConfig(config); return { type: 'text', value: '[OK] Auto-commit disabled' } }

  if (cmd === 'commit') {
    const status = getGitStatus()
    const files = config.includeUntracked ? [...status.modified, ...status.untracked, ...status.staged] : [...status.modified, ...status.staged]
    if (files.length === 0) return { type: 'text', value: 'No files to commit' }
    if (files.length > config.maxFiles) return { type: 'text', value: '[WARN] Too many files (' + files.length + ' > ' + config.maxFiles + '). Please commit manually.' }

    try {
      const diff = execSync('git diff --stat', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      let message = generateCommitMessage(files, diff)
      if (config.signOff) message += '\n\nSigned-off-by: auto-commit'

      execSync('git add ' + files.map(f => '"' + f + '"').join(' '), { stdio: 'ignore' })
      execSync('git commit -m "' + message + '"', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Committed: ' + message + '\nFiles: ' + files.length + '\n' + diff.trim() }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'amend') {
    try {
      execSync('git commit --amend --no-edit', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Amended last commit' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'history' || cmd === 'log') {
    const count = parseInt(parts[1]) || 20
    const history = getCommitHistory(count)
    if (history.length === 0) return { type: 'text', value: 'No commit history' }
    const lines = ['Commit History:', '================', '']
    history.forEach(h => lines.push(h.hash + ' ' + h.message + ' (' + h.date + ')'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'undo') {
    try { execSync('git reset --soft HEAD~1', { stdio: 'ignore' }); return { type: 'text', value: '[OK] Undid last commit (files preserved)' } }
    catch { return { type: 'text', value: '[ERROR] Undo failed' } }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    config[key] = value === 'true' ? true : value === 'false' ? false : value
    saveConfig(config)
    return { type: 'text', value: '[OK] ' + key + ' = ' + config[key] }
  }

  if (cmd === 'message' || cmd === 'preview') {
    const status = getGitStatus()
    const files = [...status.modified, ...status.staged]
    const diff = execSync('git diff --stat', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return { type: 'text', value: 'Preview commit message:\n' + generateCommitMessage(files, diff) }
  }

  if (cmd === 'help') {
    return { type: 'text', value: [
      'Auto-Commit', '', 'Usage:',
      '  /auto-commit status          View status', '  /auto-commit enable/disable  Toggle',
      '  /auto-commit commit          Manual smart commit', '  /auto-commit amend           Amend last commit',
      '  /auto-commit history [N]     View commit history', '  /auto-commit undo             Undo last commit',
      '  /auto-commit config          View/edit config', '  /auto-commit message/preview  Preview message',
    ].join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const autoCommit: Command = {
  type: 'local', name: 'auto-commit', description: 'Smart auto-commit - AI generates commit messages, supports conventional commits',
  aliases: ['/auto-commit', '/ac'], supportsNonInteractive: true, load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default autoCommit
