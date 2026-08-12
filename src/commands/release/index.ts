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
      '🚀 发布管理器', '', '📖 用法：',
      '  /release current               显示当前版本',
      '  /release bump <type>           升级版本（major/minor/patch）',
      '  /release notes                 生成发布说明',
      '  /release changelog             从提交生成变更日志',
      '  /release tag                   创建 git 标签',
      '  /release create                完整发布（升级+说明+标签+推送）',
      '  /release list                  列出所有标签',
      '  /release delete <tag>          删除标签',
      '  /release compare <t1> <t2>     比较两个版本',
      '  /release publish               发布到 npm + GitHub release',
    ].join('\n') }
  }

  if (cmd === 'current') {
    return { type: 'text', value: '📌 当前版本：' + getCurrentVersion() }
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
        return { type: 'text', value: '✅ 已升级版本：' + current + ' -> ' + next }
      } catch { return { type: 'text', value: '❌ 无法更新 package.json' } }
    }
    return { type: 'text', value: '📌 新版本：' + next }
  }

  if (cmd === 'notes') {
    const commits = getCommitsSinceLastTag()
    if (commits.length === 0) return { type: 'text', value: '📋 自上次标签以来无提交' }
    const lines = ['📝 发布说明：', '===============']
    commits.forEach(c => lines.push('- ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'changelog') {
    try {
      const output = execSync('git log --pretty=format:"%h %s (%ad)" --date=short -30', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '📋 变更日志：\n' + output }
    } catch { return { type: 'text', value: '❌ 无法生成变更日志' } }
  }

  if (cmd === 'tag') {
    const version = getCurrentVersion()
    try {
      execSync('git tag -a v' + version + ' -m "Release v' + version + '"', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已创建标签：v' + version }
    } catch { return { type: 'text', value: '❌ 标签创建失败' } }
  }

  if (cmd === 'create') {
    const type = (parts[1] as 'major' | 'minor' | 'patch') || 'patch'
    const current = getCurrentVersion()
    const next = bumpVersion(current, type)
    const lines = ['🚀 发布 v' + next, '============', '']
    if (existsSync('package.json')) {
      try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
        pkg.version = next
        writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
        lines.push('✅ 已升级版本：' + current + ' -> ' + next)
      } catch { lines.push('❌ 无法更新 package.json') }
    }
    try {
      execSync('git add -A && git commit -m "chore: release v' + next + '"', { stdio: 'ignore' })
      execSync('git tag -a v' + next + ' -m "Release v' + next + '"', { stdio: 'ignore' })
      lines.push('✅ 已创建标签：v' + next)
    } catch { lines.push('❌ Git 操作失败') }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'list') {
    try {
      const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '🏷️ 标签：\n' + tags }
    } catch { return { type: 'text', value: '📋 无标签' } }
  }

  if (cmd === 'delete') {
    const tag = parts[1]
    if (!tag) return { type: 'text', value: '📖 用法：/release delete <tag>' }
    try { execSync('git tag -d ' + tag, { stdio: 'ignore' }); return { type: 'text', value: '✅ 已删除标签：' + tag } }
    catch { return { type: 'text', value: '❌ 删除失败' } }
  }

  if (cmd === 'compare') {
    const t1 = parts[1]; const t2 = parts[2]
    if (!t1 || !t2) return { type: 'text', value: '📖 用法：/release compare <tag1> <tag2>' }
    try {
      const diff = execSync('git log --oneline ' + t1 + '..' + t2, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '📊 ' + t1 + ' 和 ' + t2 + ' 之间的提交：\n' + diff }
    } catch { return { type: 'text', value: '❌ 比较失败' } }
  }

  if (cmd === 'publish') {
    try {
      execSync('npm publish 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '✅ 已发布到 npm' }
    } catch (err) {
      return { type: 'text', value: '❌ 发布失败：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const release: Command = {
  type: 'local', name: 'release',
  description: 'Release - bump/version/notes/changelog/tag/create/publish',
  aliases: ['/release', '/rel'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default release
