import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

interface ReleaseConfig {
  version: string
  changelog: boolean
  tag: boolean
  push: boolean
  npmPublish: boolean
  gitHubRelease: boolean
}

function getCurrentVersion(): string {
  try {
    if (existsSync('package.json')) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      return pkg.version || '0.0.0'
    }
  } catch { /* ignore */ }
  return '0.0.0'
}

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const parts = version.split('.').map(Number)
  if (type === 'major') return (parts[0] + 1) + '.0.0'
  if (type === 'minor') return parts[0] + '.' + (parts[1] + 1) + '.0'
  return parts[0] + '.' + parts[1] + '.' + ((parts[2] || 0) + 1)
}

function getCommitsSinceLastTag(): string[] {
  try {
    const output = execSync('git log $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)..HEAD --pretty=format:"%s"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return output.split('\n').filter(Boolean)
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') {
    return { type: 'text', value: [
      'Release Manager', '', 'Usage:',
      '  /release current               Show current version',
      '  /release bump <type>          Bump version (major/minor/patch)',
      '  /release notes                Generate release notes',
      '  /release changelog            Generate changelog from commits',
      '  /release tag                  Create git tag',
      '  /release create               Full release (bump + notes + tag + push)',
      '  /release list                 List all tags',
      '  /release delete <tag>         Delete a tag',
      '  /release compare <t1> <t2>    Compare two versions',
      '  /release publish              Publish to npm + GitHub release',
    ].join('\n') }
  }

  if (cmd === 'current') {
    return { type: 'text', value: 'Current version: ' + getCurrentVersion() }
  }

  if (cmd === 'bump') {
    const type = (parts[1] as 'major' | 'minor' | 'patch') || 'patch'
    const current = getCurrentVersion()
    const next = bumpVersion(current, type)
    if (existsSync('package.json')) {
      try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
        pkg.version = next
        writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
        return { type: 'text', value: '[OK] Bumped: ' + current + ' -> ' + next }
      } catch { return { type: 'text', value: '[ERROR] Cannot update package.json' } }
    }
    return { type: 'text', value: 'New version: ' + next }
  }

  if (cmd === 'notes') {
    const commits = getCommitsSinceLastTag()
    if (commits.length === 0) return { type: 'text', value: 'No commits since last tag' }
    const lines = ['Release Notes:', '===============']
    commits.forEach(c => lines.push('- ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'changelog') {
    try {
      const output = execSync('git log --pretty=format:"%h %s (%ad)" --date=short -30', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Changelog:\n' + output }
    } catch { return { type: 'text', value: '[ERROR] Cannot generate changelog' } }
  }

  if (cmd === 'tag') {
    const version = getCurrentVersion()
    try {
      execSync('git tag -a v' + version + ' -m "Release v' + version + '"', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Created tag: v' + version }
    } catch { return { type: 'text', value: '[ERROR] Tag creation failed' } }
  }

  if (cmd === 'create') {
    const type = (parts[1] as 'major' | 'minor' | 'patch') || 'patch'
    const current = getCurrentVersion()
    const next = bumpVersion(current, type)
    const lines = ['Release v' + next, '============', '']
    if (existsSync('package.json')) {
      try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
        pkg.version = next
        writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
        lines.push('[OK] Bumped: ' + current + ' -> ' + next)
      } catch { lines.push('[ERROR] Cannot update package.json') }
    }
    try {
      execSync('git add -A && git commit -m "chore: release v' + next + '"', { stdio: 'ignore' })
      execSync('git tag -a v' + next + ' -m "Release v' + next + '"', { stdio: 'ignore' })
      lines.push('[OK] Created tag: v' + next)
    } catch { lines.push('[ERROR] Git operations failed') }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'list') {
    try {
      const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Tags:\n' + tags }
    } catch { return { type: 'text', value: 'No tags found' } }
  }

  if (cmd === 'delete') {
    const tag = parts[1]
    if (!tag) return { type: 'text', value: 'Usage: /release delete <tag>' }
    try { execSync('git tag -d ' + tag, { stdio: 'ignore' }); return { type: 'text', value: '[OK] Deleted tag: ' + tag } }
    catch { return { type: 'text', value: '[ERROR] Delete failed' } }
  }

  if (cmd === 'compare') {
    const t1 = parts[1]; const t2 = parts[2]
    if (!t1 || !t2) return { type: 'text', value: 'Usage: /release compare <tag1> <tag2>' }
    try {
      const diff = execSync('git log --oneline ' + t1 + '..' + t2, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Commits between ' + t1 + ' and ' + t2 + ':\n' + diff }
    } catch { return { type: 'text', value: '[ERROR] Compare failed' } }
  }

  if (cmd === 'publish') {
    try {
      execSync('npm publish 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '[OK] Published to npm' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Publish failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const release: Command = {
  type: 'local', name: 'release',
  description: 'Release - bump/version/notes/changelog/tag/create/publish',
  aliases: ['/release', '/rel'], supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default release
