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
      '🔍 PR 审查', '', '📖 用法：',
      '  /pr-review <PR 编号>          审查 GitHub PR',
      '  /pr-review diff <PR 编号>     显示 PR 差异摘要',
      '  /pr-review approve <PR 编号>   审批 PR',
      '  /pr-review comment <PR> <文本>  添加评论',
      '  /pr-review checklist <PR>        生成审查清单',
      '  /pr-review issues <PR>           查找潜在问题',
      '  /pr-review summary <PR>          AI 生成的 PR 摘要',
      '  /pr-review config                配置审查设置',
    ].join('\n') }
  }

  if (cmd === 'config') {
    const config: PRReviewConfig = { autoApprove: false, requireTests: true, maxFiles: 50, focusAreas: ['security', 'performance', 'tests'] }
    return { type: 'text', value: JSON.stringify(config, null, 2) }
  }

  const prNumber = parts[1]
  if (!prNumber) return { type: 'text', value: '📖 用法：/pr-review <PR 编号> [操作]' }

  if (cmd === 'diff') {
    try {
      const diff = execSync('gh pr diff ' + prNumber + ' --patch', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const lines = diff.split('\n')
      const files = new Set<string>()
      lines.forEach(l => { if (l.startsWith('diff --git')) files.add(l.split(' b/')[1] || '') })
      return { type: 'text', value: '📊 PR #' + prNumber + ' 差异：\n变更文件数：' + files.size + '\n' + diff.slice(0, 3000) }
    } catch (err) {
      return { type: 'text', value: '❌ [错误] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'issues') {
    try {
      const diff = execSync('gh pr diff ' + prNumber, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const issues: string[] = []
      const lines = diff.split('\n')
      lines.forEach((l, i) => {
        if (l.startsWith('+')) {
          if (l.includes('console.log')) issues.push('第 ' + (i + 1) + ' 行：新代码中的 console.log')
          if (l.includes('any ') || l.includes(': any')) issues.push('第 ' + (i + 1) + ' 行：使用 any 类型')
          if (l.includes('TODO') || l.includes('FIXME')) issues.push('第 ' + (i + 1) + ' 行：TODO/FIXME 标记')
          if (l.includes('eval(')) issues.push('第 ' + (i + 1) + ' 行：使用 eval()（安全风险）')
          if (l.includes('innerHTML')) issues.push('第 ' + (i + 1) + ' 行：使用 innerHTML（XSS 风险）')
          if (l.trim().length > 120) issues.push('第 ' + (i + 1) + ' 行：行长 (' + l.trim().length + ' 字符)')
        }
      })
      return { type: 'text', value: issues.length > 0 ? '潜在问题（' + issues.length + '）：\n' + issues.join('\n') : '✅ 未发现明显问题' }
    } catch (err) {
      return { type: 'text', value: '❌ [错误] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'summary') {
    try {
      const prInfo = execSync('gh pr view ' + prNumber + ' --json title,body,author,additions,deletions,changedFiles,files', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const info = JSON.parse(prInfo)
      return { type: 'text', value: [
        '📊 PR #' + prNumber + ' 摘要',
        '==================',
        '标题：' + info.title, '作者：' + info.author.login,
        '变更：+' + info.additions + '/-' + info.deletions + '（' + info.changedFiles + ' 个文件）',
        '', '描述：', info.body?.slice(0, 500) || '无描述',
      ].join('\n') }
    } catch (err) {
      return { type: 'text', value: '❌ [错误] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'checklist') {
    const checklist = [
      '📋 PR #' + prNumber + ' 审查清单',
      '================================',
      '',
      '代码质量：',
      '  [ ] 无 console.log 语句',
      '  [ ] any 类型需有合理理由',
      '  [ ] 无 TODO/FIXME 标记',
      '  [ ] 行长度不超过 120 字符',
      '  [ ] 函数长度不超过 50 行',
      '',
      '安全：',
      '  [ ] 不使用 eval() 或类似函数',
      '  [ ] innerHTML 需经过过滤',
      '  [ ] 无硬编码密钥',
      '  [ ] 存在输入验证',
      '',
      '测试：',
      '  [ ] 为新功能添加测试',
      '  [ ] 本地测试通过',
      '  [ ] 覆盖边界情况',
      '',
      '文档：',
      '  [ ] 需要时更新 README',
      '  [ ] 记录 API 变更',
      '  [ ] 复杂逻辑已注释',
    ]
    return { type: 'text', value: checklist.join('\n') }
  }

  if (cmd === 'comment') {
    const comment = parts.slice(2).join(' ')
    if (!comment) return { type: 'text', value: '📖 用法：/pr-review comment <PR> <评论内容>' }
    try {
      execSync('gh pr comment ' + prNumber + ' --body "' + comment + '"', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已添加评论到 PR #' + prNumber }
    } catch (err) {
      return { type: 'text', value: '❌ [错误] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'approve') {
    try {
      execSync('gh pr review ' + prNumber + ' --approve', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已批准 PR #' + prNumber }
    } catch (err) {
      return { type: 'text', value: '❌ [错误] ' + (err instanceof Error ? err.message : String(err)) }
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
      '🔍 PR #' + prNumber + ' 审查',
      '==================',
      '标题：' + info.title, '变更：+' + info.additions + '/-' + info.deletions + '（' + info.changedFiles + ' 个文件）',
      '', '变更文件：',
      ...fileList.map(f => '  - ' + f),
      '', '审查笔记已生成。使用 /pr-review issues ' + prNumber + ' 查看详细分析。',
    ]
    return { type: 'text', value: review.join('\n') }
  } catch (err) {
    return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
  }
}

const prReview: Command = {
  type: 'local', name: 'pr-review',
  description: '🔍 GitHub PR 审查 - 摘要/问题/清单/批准/评论',
  aliases: ['/pr-review', '/pr'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default prReview
