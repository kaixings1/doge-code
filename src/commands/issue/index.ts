// issue command — GitHub Issue 读取 + loop 引擎自动修复
import type { Command, LocalCommandCall, LocalCommandResult } from '../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { gitExe } from '../utils/git.js'
import { executeLoop } from '../commands/loop/engine.js'
import type { LoopGoal, LoopOptions } from '../commands/loop/types.js'

// ==================== 类型 ====================

interface IssueInfo {
  number: number
  title: string
  body: string
  state: string
  labels: string[]
  createdAt: string
  url: string
  commentsCount: number
}

// ==================== GitHub API ====================

function getGitHubToken(): string {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.DOGE_API_KEY || ''
}

function getApiBaseUrl(): string {
  return 'https://api.github.com'
}

function getAuthHeaders(): Record<string, string> {
  const token = getGitHubToken()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'doge-code',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function ghFetch<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`
  const res = await fetch(url, { headers: getAuthHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

function parseGitHubIssueUrl(url: string): { owner: string; repo: string; number: number } | null {
  // 支持格式:
  //   https://github.com/owner/repo/issues/123
  //   https://api.github.com/repos/owner/repo/issues/123
  const m = url.match(/(?:github\.com|api\.github\.com\/repos)\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2], number: parseInt(m[3], 10) }
}

async function detectRepoFromGit(): Promise<string | null> {
  try {
    const { stdout } = execSync(`${gitExe()} remote get-url origin`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const url = stdout.trim()
    const m = url.match(/(?:github\.com[:\/])([^/]+)\/([^/.]+)/)
    if (m) return `${m[1]}/${m[2]}`
  } catch { /* ignore */ }
  return null
}

// ==================== Issue 子命令 ====================

async function issueFetch(args: string): Promise<LocalCommandResult> {
  const url = args.trim()
  if (!url) {
    return { type: 'text', value: '用法: /issue fetch <github-issue-url>' }
  }

  const parsed = parseGitHubIssueUrl(url)
  if (!parsed) {
    return { type: 'text', value: `无法解析 GitHub Issue URL: ${url}\n期望格式: https://github.com/owner/repo/issues/123` }
  }

  try {
    const issue = await ghFetch<IssueInfo>(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`)

    const labelStr = issue.labels.map(l => typeof l === 'string' ? l : l.name).join(', ') || '无标签'

    const result: string[] = [
      `📋 Issue #${issue.number}: ${issue.title}`,
      `   状态: ${issue.state === 'open' ? '🔓 Open' : '🔒 Closed'}`,
      `   仓库: ${parsed.owner}/${parsed.repo}`,
      `   标签: ${labelStr}`,
      `   创建: ${issue.createdAt}`,
      `   评论数: ${issue.commentsCount}`,
      `   URL: ${issue.url.replace('api.github.com', 'github.com').replace('/repos/', '/')}`,
      '',
      '── 内容 ──',
      issue.body || '(无内容)',
    ]

    if (issue.commentsCount > 0) {
      const comments = await ghFetch<any[]>(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`)
      result.push('', '── 评论 ──')
      for (const c of comments.slice(0, 10)) {
        result.push(`@${c.user.login} (${c.created_at.slice(0, 10)}): ${(c.body || '').slice(0, 200)}`)
      }
      if (comments.length > 10) {
        result.push(`... 还有 ${comments.length - 10} 条评论`)
      }
    }

    return { type: 'text', value: result.join('\n') }
  } catch (err) {
    return { type: 'text', value: `获取 Issue 失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function issueList(args: string): Promise<LocalCommandResult> {
  const repo = args.trim() || (await detectRepoFromGit()) || ''
  if (!repo) {
    return { type: 'text', value: '用法: /issue list [owner/repo]\n未检测到当前仓库，请指定 owner/repo' }
  }

  try {
    const issues = await ghFetch<any[]>(`/repos/${repo}/issues?state=open&per_page=20&sort=created&direction=desc`)

    if (issues.length === 0) {
      return { type: 'text', value: `${repo} 暂无 Open Issues` }
    }

    const lines = [
      `📋 ${repo} 的 Open Issues (${issues.length} 条)`,
      '',
    ]

    for (const issue of issues) {
      const labels = issue.labels.map((l: any) => l.name).join(', ') || ''
      const labelPart = labels ? ` [${labels}]` : ''
      lines.push(`  #${issue.number}  ${issue.title}${labelPart}`)
      lines.push(`       创建: ${issue.created_at.slice(0, 10)}  评论: ${issue.comments}`)
    }

    lines.push('', '💡 使用 /issue fetch <url> 查看详情，/issue fix <url> 自动修复')
    return { type: 'text', value: lines.join('\n') }
  } catch (err) {
    return { type: 'text', value: `获取 Issue 列表失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function createIssueTaskExecutor(): LoopOptions['taskExecutor'] {
  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || getGitHubToken() || ''
  const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.longcat.chat/openai/v1/chat/completions'
  const model = process.env.ANTHROPIC_MODEL || 'LongCat-2.0'

  return async (prompt: string, _systemPrompt: string, task: { id: string; description: string }): Promise<{ success: boolean; output: string; error?: string }> => {
    const outputLines: string[] = []
    const createdFiles: string[] = []

    try {
      outputLines.push(`🤖 [AI] 调用 API (model: ${model})`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60_000)

      let response: Response
      try {
        response = await fetch(baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: '你是一个专业的工程师。请完成以下 GitHub Issue 修复任务，执行真实的 bash 命令来修改代码。' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 4000,
            stream: false,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, output: outputLines.join('\n'), error: `API HTTP ${response.status}: ${errorText.slice(0, 200)}` }
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
        error?: { message?: string }
      }

      if (data.error) {
        return { success: false, output: outputLines.join('\n'), error: `API 错误: ${data.error.message || 'unknown'}` }
      }

      const aiOutput = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
      outputLines.push(`🤖 [AI] 返回 (${aiOutput.length} 字符)`)

      // 解析 bash 命令
      const bashBlocks = aiOutput.match(/```(?:bash|sh|shell)?\s*([\s\S]*?)```/g) || []
      const commands: string[] = []
      for (const block of bashBlocks) {
        const content = block.replace(/```(?:bash|sh|shell)?\s*/, '').replace(/```\s*$/, '').trim()
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
            commands.push(trimmed)
          }
        }
      }

      if (commands.length > 0) {
        outputLines.push(`⚡ [执行] ${commands.length} 个命令:`)
        for (const cmd of commands) {
          outputLines.push(`  > ${cmd.slice(0, 100)}${cmd.length > 100 ? '...' : ''}`)
          try {
            const isWin = process.platform === 'win32'
            const shellPath = isWin ? 'C:\\Program Files\\Git\\bin\\bash.exe' : undefined
            const result = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', timeout: 60000, shell: shellPath, stdio: ['pipe', 'pipe', 'pipe'] })
            outputLines.push(`    ✓ (${result.length} 字符)`)
            const fileMatch = cmd.match(/>\s*([^\s&|]+)/g)
            if (fileMatch) {
              for (const m of fileMatch) {
                const fp = m.replace(/^>\s*/, '').trim()
                if (fp && !fp.startsWith('/dev/')) createdFiles.push(fp)
              }
            }
          } catch (execErr: unknown) {
            const err = execErr as { status?: number; stderr?: string }
            outputLines.push(`    ✗ (${err.status ?? '?'})`)
          }
        }
      } else if (aiOutput.length > 0) {
        outputLines.push('⚠️  无 bash 命令，写入报告文件')
        try {
          const reportPath = `issue-fix-report-${task.id}.md`
          const { writeFileSync } = require('fs')
          writeFileSync(reportPath, `# ${task.description}\n\n${aiOutput}`)
          createdFiles.push(reportPath)
          outputLines.push(`  📄 ${reportPath}`)
        } catch { /* ignore */ }
      } else {
        return { success: false, output: outputLines.join('\n'), error: 'AI 返回了空内容' }
      }

      const uniqueFiles = [...new Set(createdFiles)]
      if (uniqueFiles.length > 0) {
        outputLines.push(`\n📁 创建了 ${uniqueFiles.length} 个文件:`)
        for (const f of uniqueFiles) outputLines.push(`   • ${f}`)
      }

      return { success: true, output: outputLines.join('\n').slice(0, 8000) }
    } catch (error) {
      return { success: false, output: outputLines.join('\n'), error: error instanceof Error ? error.message : String(error) }
    }
  }
}

async function issueFix(args: string): Promise<LocalCommandResult> {
  const url = args.trim()
  if (!url) {
    return { type: 'text', value: '用法: /issue fix <github-issue-url>\n示例: /issue fix https://github.com/owner/repo/issues/123' }
  }

  const parsed = parseGitHubIssueUrl(url)
  if (!parsed) {
    return { type: 'text', value: `无法解析 GitHub Issue URL: ${url}\n期望格式: https://github.com/owner/repo/issues/123` }
  }

  // 检查 API key
  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || getGitHubToken() || ''
  if (!apiKey) {
    return { type: 'text', value: '❌ 需要设置 DOGE_API_KEY 或 ANTHROPIC_API_KEY 环境变量才能自动修复 Issue' }
  }

  try {
    // 1. 获取 Issue 详情
    const issue = await ghFetch<IssueInfo>(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`)

    // 2. 获取评论（如果有）
    let commentsText = ''
    if (issue.commentsCount > 0) {
      const comments = await ghFetch<any[]>(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`)
      commentsText = '\n\n## 评论\n' + comments.map((c: any) => `@${c.user.login}: ${c.body}`).join('\n\n')
    }

    const issueBody = `## GitHub Issue\n**仓库:** ${parsed.owner}/${parsed.repo}\n**编号:** #${issue.number}\n**标题:** ${issue.title}\n**状态:** ${issue.state}\n**标签:** ${issue.labels.map((l: any) => l.name).join(', ') || '无'}\n**URL:** ${issue.url.replace('api.github.com', 'github.com').replace('/repos/', '/')}\n\n### 问题描述\n${issue.body || '(无内容)'}${commentsText}`

    // 3. 构造循环目标
    const goal: LoopGoal = {
      description: `修复 GitHub Issue #${issue.number}: ${issue.title}`,
      successCriteria: [
        `Issue #${issue.number} 描述的问题已修复`,
        '相关测试通过',
      ],
      maxIterations: 10,
    }

    // 4. 调用 loop 引擎
    const result = await executeLoop({
      strategy: 'swe-agent',
      goal,
      taskExecutor: createIssueTaskExecutor(),
      snapshot: true,
      autoRepair: true,
      verifyMode: 'test',
      progressIntervalMs: 30000,
      onProgress: (event) => {
        // 可以在这里添加进度回调
      }
    })

    // 5. 格式化结果
    const resultLines = [
      `🔧 自动修复完成: Issue #${issue.number}`,
      `   仓库: ${parsed.owner}/${parsed.repo}`,
      `   策略: swe-agent`,
      `   迭代: ${result.iterations} 轮`,
      `   耗时: ${Math.round(result.duration / 1000)}s`,
      `   成功: ${result.success ? '✅' : '❌'}`,
      `   原因: ${result.reason}`,
      '',
      result.finalOutput || '(无输出)',
    ]

    return { type: 'text', value: resultLines.join('\n') }
  } catch (err) {
    return { type: 'text', value: `修复 Issue 失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ==================== 主命令 ====================

const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const subcmd = parts[0]?.toLowerCase() || ''
  const rest = parts.slice(1).join(' ')

  switch (subcmd) {
    case 'fetch':
      return issueFetch(rest)
    case 'list':
    case 'ls':
      return issueList(rest)
    case 'fix':
      return issueFix(rest)
    case 'help':
    case '--help':
      return {
        type: 'text',
        value: [
          '🐛 /issue — GitHub Issue 管理',
          '',
          '📖 用法: ',
          '  /issue fetch <url>        读取 Issue 详情',
          '  /issue list [owner/repo]  列出 Open Issues',
          '  /issue fix <url>          自动修复 Issue（调用 loop 引擎）',
          '',
          '💡 示例: ',
          '  /issue fetch https://github.com/owner/repo/issues/123',
          '  /issue list owner/repo',
          '  /issue fix https://github.com/owner/repo/issues/123',
          '',
          '环境变量:',
          '  GITHUB_TOKEN / GH_TOKEN — GitHub API 认证',
          '  DOGE_API_KEY — AI 修复所需（/issue fix 时）',
        ].join('\n'),
      }
    default:
      return {
        type: 'text',
        value: [
          '🐛 /issue — GitHub Issue 管理',
          '',
          '📖 用法: ',
          '  /issue fetch <url>        读取 Issue 详情',
          '  /issue list [owner/repo]  列出 Open Issues',
          '  /issue fix <url>          自动修复 Issue（调用 loop 引擎）',
          '',
          '💡 使用 /issue help 查看完整帮助',
        ].join('\n'),
      }
  }
}

const issue: Command = {
  type: 'local',
  name: 'issue',
  description: 'GitHub Issue 管理：读取/列出/自动修复',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default issue
