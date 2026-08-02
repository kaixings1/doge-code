import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge')
const CONFIG_FILE = join(CONFIG_DIR, 'auto-commit.json')

interface AutoCommitConfig {
  enabled: boolean
  interval: number
  style: 'concise' | 'detailed' | 'emoji'
  includeUntracked: boolean
  maxFiles: number
  conventionalCommits: boolean
}

const DEFAULT_CONFIG: AutoCommitConfig = {
  enabled: false,
  interval: 300,
  style: 'concise',
  includeUntracked: false,
  maxFiles: 50,
  conventionalCommits: true,
}

function loadConfig(): AutoCommitConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
    }
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
  } catch {
    return { modified: [], untracked: [], staged: [] }
  }
}

function generateCommitMessage(files: string[], diff: string): string {
  const prefix = files.length === 1 ? (files[0].split('/').pop() || 'file').replace(/\.\w+$/, '') : files.length + ' files'

  const hasNew = diff.includes('new file mode')
  const hasDelete = diff.includes('deleted file mode')
  const hasFunction = diff.includes('function ') || diff.includes('def ') || diff.includes('func ')
  const hasClass = diff.includes('class ') || diff.includes('struct ')
  const hasFix = diff.includes('fix') || diff.includes('bug') || diff.includes('patch')
  const hasTest = diff.includes('test') || diff.includes('spec')

  let type = 'update'
  if (hasNew) type = 'add'
  else if (hasDelete) type = 'remove'
  else if (hasFix) type = 'fix'
  else if (hasTest) type = 'test'
  else if (hasFunction || hasClass) type = 'refactor'

  const config = loadConfig()
  if (config.style === 'emoji') {
    const emojis: Record<string, string> = { add: '[+]', remove: '[x]', fix: '[bug]', test: '[check]', refactor: '[ref]', update: '[edit]' }
    return (emojis[type] || '[edit]') + ' ' + type + ': ' + prefix
  }
  if (config.style === 'detailed') {
    return type + '(' + prefix + '): auto-commit ' + files.length + ' file' + (files.length > 1 ? 's' : '')
  }
  return type + ': ' + prefix
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'status'
  const config = loadConfig()

  if (cmd === 'status' || cmd === '') {
    const status = getGitStatus()
    return {
      type: 'text',
      value: [
        'Auto-Commit Status',
        '==================',
        '',
        'Status: ' + (config.enabled ? 'Enabled' : 'Disabled'),
        'Style: ' + config.style,
        'Interval: ' + config.interval + 's',
        'IncludeUntracked: ' + (config.includeUntracked ? 'Yes' : 'No'),
        'MaxFiles: ' + config.maxFiles,
        'Conventional: ' + (config.conventionalCommits ? 'Yes' : 'No'),
        '',
        'Pending: ' + status.modified.length + ' modified, ' + status.untracked.length + ' untracked, ' + status.staged.length + ' staged',
      ].join('\n'),
    }
  }

  if (cmd === 'enable') {
    config.enabled = true
    saveConfig(config)
    return { type: 'text', value: '[OK] Auto-commit enabled' }
  }

  if (cmd === 'disable') {
    config.enabled = false
    saveConfig(config)
    return { type: 'text', value: '[OK] Auto-commit disabled' }
  }

  if (cmd === 'commit') {
    const status = getGitStatus()
    const files = config.includeUntracked
      ? [...status.modified, ...status.untracked, ...status.staged]
      : [...status.modified, ...status.staged]

    if (files.length === 0) {
      return { type: 'text', value: 'No files to commit' }
    }
    if (files.length > config.maxFiles) {
      return { type: 'text', value: '[WARN] Too many files (' + files.length + ' > ' + config.maxFiles + '). Please commit manually.' }
    }

    try {
      const diff = execSync('git diff --stat', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const message = generateCommitMessage(files, diff)

      execSync('git add ' + files.map(f => '"' + f + '"').join(' '), { stdio: 'ignore' })
      execSync('git commit -m "' + message + '"', { stdio: 'ignore' })

      return {
        type: 'text',
        value: [
          '[OK] Committed successfully',
          '',
          'Message: ' + message,
          'Files: ' + files.length,
          '',
          diff.trim(),
        ].join('\n'),
      }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Commit failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'config') {
    const key = parts[1]
    const value = parts.slice(2).join(' ')
    if (!key || !value) {
      return {
        type: 'text',
        value: Object.entries(config).map(([k, v]) => '  ' + k + ': ' + v).join('\n'),
      }
    }
    if (key in config) {
      // @ts-expect-error dynamic key assignment
      config[key] = value === 'true' ? true : value === 'false' ? false : value
      saveConfig(config)
      return { type: 'text', value: '[OK] ' + key + ' = ' + config[key as keyof AutoCommitConfig] }
    }
    return { type: 'text', value: '[ERROR] Unknown config: ' + key }
  }

  if (cmd === 'history') {
    try {
      const log = execSync('git log --oneline -20', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Recent commits:\n\n' + log }
    } catch {
      return { type: 'text', value: '[ERROR] Cannot read git log' }
    }
  }

  if (cmd === 'undo') {
    try {
      execSync('git reset --soft HEAD~1', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Undid last commit (files preserved)' }
    } catch {
      return { type: 'text', value: '[ERROR] Undo failed' }
    }
  }

  return {
    type: 'text',
    value: [
      'Auto-Commit Command',
      '',
      'Usage:',
      '  /auto-commit status     View status',
      '  /auto-commit enable     Enable auto-commit',
      '  /auto-commit disable    Disable auto-commit',
      '  /auto-commit commit     Manual smart commit',
      '  /auto-commit config     Configure options',
      '  /auto-commit history    View commit history',
      '  /auto-commit undo       Undo last commit',
    ].join('\n'),
  }
}

const autoCommit: Command = {
  type: 'local',
  name: 'auto-commit',
  description: 'Smart auto-commit - AI generates commit messages, supports conventional commits',
  aliases: ['/auto-commit', '/ac'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default autoCommit
