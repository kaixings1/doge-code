import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'

interface PRReviewConfig {
  autoApprove: boolean
  requireTests: boolean
  maxFiles: number
  focusAreas: string[]
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') {
    return { type: 'text', value: [
      'PR Review', '', 'Usage:',
      '  /pr-review <PR number>           Review a GitHub PR',
      '  /pr-review diff <PR number>      Show PR diff summary',
      '  /pr-review approve <PR number>    Approve PR with review',
      '  /pr-review comment <PR> <text>   Add comment to PR',
      '  /pr-review checklist <PR>         Generate review checklist',
      '  /pr-review issues <PR>            Find potential issues in PR',
      '  /pr-review summary <PR>           AI-generated PR summary',
      '  /pr-review config                 Configure review settings',
    ].join('\n') }
  }

  if (cmd === 'config') {
    const config: PRReviewConfig = { autoApprove: false, requireTests: true, maxFiles: 50, focusAreas: ['security', 'performance', 'tests'] }
    return { type: 'text', value: JSON.stringify(config, null, 2) }
  }

  const prNumber = parts[1]
  if (!prNumber) return { type: 'text', value: 'Usage: /pr-review <PR number> [action]' }

  if (cmd === 'diff') {
    try {
      const diff = execSync('gh pr diff ' + prNumber + ' --patch', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const lines = diff.split('\n')
      const files = new Set<string>()
      lines.forEach(l => { if (l.startsWith('diff --git')) files.add(l.split(' b/')[1] || '') })
      return { type: 'text', value: 'PR #' + prNumber + ' Diff:\nFiles changed: ' + files.size + '\n' + diff.slice(0, 3000) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'issues') {
    try {
      const diff = execSync('gh pr diff ' + prNumber, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const issues: string[] = []
      const lines = diff.split('\n')
      lines.forEach((l, i) => {
        if (l.startsWith('+')) {
          if (l.includes('console.log')) issues.push('Line ' + (i + 1) + ': console.log in new code')
          if (l.includes('any ') || l.includes(': any')) issues.push('Line ' + (i + 1) + ': any type usage')
          if (l.includes('TODO') || l.includes('FIXME')) issues.push('Line ' + (i + 1) + ': TODO/FIXME marker')
          if (l.includes('eval(')) issues.push('Line ' + (i + 1) + ': eval() usage (security)')
          if (l.includes('innerHTML')) issues.push('Line ' + (i + 1) + ': innerHTML (XSS risk)')
          if (l.trim().length > 120) issues.push('Line ' + (i + 1) + ': long line (' + l.trim().length + ' chars)')
        }
      })
      return { type: 'text', value: issues.length > 0 ? 'Potential Issues (' + issues.length + '):\n' + issues.join('\n') : '[OK] No obvious issues found' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'summary') {
    try {
      const prInfo = execSync('gh pr view ' + prNumber + ' --json title,body,author,additions,deletions,changedFiles,files', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const info = JSON.parse(prInfo)
      return { type: 'text', value: [
        'PR #' + prNumber + ' Summary',
        '==================',
        'Title: ' + info.title, 'Author: ' + info.author.login,
        'Changes: +' + info.additions + '/-' + info.deletions + ' (' + info.changedFiles + ' files)',
        '', 'Description:', info.body?.slice(0, 500) || 'No description',
      ].join('\n') }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'checklist') {
    const checklist = [
      'PR Review Checklist for #' + prNumber,
      '================================',
      '',
      'Code Quality:',
      '  [ ] No console.log statements',
      '  [ ] No any types without justification',
      '  [ ] No TODO/FIXME markers',
      '  [ ] Lines under 120 characters',
      '  [ ] Functions under 50 lines',
      '',
      'Security:',
      '  [ ] No eval() or similar',
      '  [ ] No innerHTML without sanitization',
      '  [ ] No hardcoded secrets',
      '  [ ] Input validation present',
      '',
      'Testing:',
      '  [ ] Tests added for new features',
      '  [ ] Tests pass locally',
      '  [ ] Edge cases covered',
      '',
      'Documentation:',
      '  [ ] README updated if needed',
      '  [ ] API changes documented',
      '  [ ] Complex logic commented',
    ]
    return { type: 'text', value: checklist.join('\n') }
  }

  if (cmd === 'comment') {
    const comment = parts.slice(2).join(' ')
    if (!comment) return { type: 'text', value: 'Usage: /pr-review comment <PR> <text>' }
    try {
      execSync('gh pr comment ' + prNumber + ' --body "' + comment + '"', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Comment added to PR #' + prNumber }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'approve') {
    try {
      execSync('gh pr review ' + prNumber + ' --approve', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] PR #' + prNumber + ' approved' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  // Default: review
  try {
    const summary = execSync('gh pr view ' + prNumber + ' --json title,body,additions,deletions,changedFiles', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const info = JSON.parse(summary)
    const diff = execSync('gh pr diff ' + prNumber, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const files = new Set<string>()
    diff.split('\n').forEach(l => { if (l.startsWith('diff --git')) files.add(l.split(' b/')[1] || '') })
    const fileList = Array.from(files).slice(0, 20)

    const review = [
      'PR #' + prNumber + ' Review',
      '==================',
      'Title: ' + info.title, 'Changes: +' + info.additions + '/-' + info.deletions + ' (' + info.changedFiles + ' files)',
      '', 'Files changed:',
      ...fileList.map(f => '  - ' + f),
      '', 'Review notes generated. Use /pr-review issues ' + prNumber + ' for detailed analysis.',
    ]
    return { type: 'text', value: review.join('\n') }
  } catch (err) {
    return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
  }
}

const prReview: Command = {
  type: 'local', name: 'pr-review',
  description: 'GitHub PR review - summary, issues, checklist, approve, comment',
  aliases: ['/pr-review', '/pr'], supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default prReview
