// commit-push-pr.ts
import type { Command, LocalCommandCall } from '../types/command.js'
import { gitExe } from '../utils/git.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { getCwd } from '../utils/cwd.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  getAttributionTexts,
  getEnhancedPRAttribution,
} from '../utils/attribution.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js'

// ==================== 公共辅助函数 ====================

function getUsername(): string {
  // 优先使用 SAFEUSER 环境变量
  if (process.env.SAFEUSER) {
    return process.env.SAFEUSER.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  }
  // 回退到 USER 环境变量
  if (process.env.USER) {
    return process.env.USER.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  }
  return 'user'
}

/**
 * 生成分支名
 */
function generateBranchName(feature: string): string {
  const username = getUsername()
  const safeFeature = feature
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
  if (!safeFeature) {
    return `${username}/update-${Date.now()}`
  }
  return `${username}/${safeFeature}`
}

/**
 * 获取当前分支名
 */
async function getCurrentBranch(): Promise<string | null> {
  const { stdout, code } = await execFileNoThrow(
    gitExe(),
    ['branch', '--show-current'],
    { preserveOutputOnError: false }
  )
  return code === 0 ? stdout.trim() : null
}

async function getDefaultBranch(): Promise<string> {
  const { stdout, code } = await execFileNoThrow(
    gitExe(),
    ['remote', 'show', 'origin', '--', 'HEAD'],
    { preserveOutputOnError: false }
  )
  if (code === 0) {
    const match = stdout.match(/HEAD branch: (\S+)/)
    if (match) return match[1]
  }
  const candidates = ['main', 'master', 'develop']
  for (const candidate of candidates) {
    const { code: checkCode } = await execFileNoThrow(
      gitExe(),
      ['rev-parse', '--verify', candidate],
      { preserveOutputOnError: false }
    )
    if (checkCode === 0) return candidate
  }
  return 'main'
}

async function getExistingPr(branch: string): Promise<{ exists: boolean; number?: number }> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    ['pr', 'view', '--json', 'number', '--jq', '.number'],
    { preserveOutputOnError: false }
  )
  if (code === 0 && stdout.trim()) {
    const number = parseInt(stdout.trim(), 10)
    return { exists: true, number }
  }
  return { exists: false }
}

async function getPrUrl(prNumber: number): Promise<string> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    ['pr', 'view', prNumber.toString(), '--json', 'url', '--jq', '.url'],
    { preserveOutputOnError: false }
  )
  return code === 0 && stdout.trim() ? stdout.trim() : `https://github.com/ PR #${prNumber}`
}

async function getRecentCommits(branch: string, defaultBranch: string): Promise<string[]> {
  const { stdout, code } = await execFileNoThrow(
    gitExe(),
    ['log', '--oneline', '--format=%s', `${defaultBranch}..${branch}`],
    { preserveOutputOnError: false }
  )
  if (code !== 0 || !stdout.trim()) return ['更新代码']
  return stdout.trim().split('\n')
}

// ==================== 本地命令实现（增强版） ====================

function parseArgs(args: string): {
  message: string
  feature: string
  noPush: boolean
  noPr: boolean
  force: boolean
  draft: boolean
  reviewer: string | null
} {
  const result = {
    message: '',
    feature: '',
    noPush: false,
    noPr: false,
    force: false,
    draft: false,
    reviewer: null as string | null,
  }

  if (args.includes('--no-push')) result.noPush = true
  if (args.includes('--no-pr')) result.noPr = true
  if (args.includes('--force')) result.force = true
  if (args.includes('--draft')) result.draft = true

  const reviewerMatch = args.match(/--reviewer\s+(\S+)/)
  if (reviewerMatch) result.reviewer = reviewerMatch[1]

  const mFlagMatch = args.match(/-m\s+["']([^"']+)["']/)
  if (mFlagMatch) {
    result.message = mFlagMatch[1]
    const remaining = args.replace(/-m\s+["'][^"']+["']/, '').trim()
    result.feature = remaining
      .split(/\s+/)
      .filter(f => f && !f.startsWith('-'))
      .join('-')
  } else {
    result.feature = args
      .replace(/--no-push|--no-pr|--force|--draft|--reviewer\s+\S+/g, '')
      .trim()
      .replace(/\s+/g, '-')
  }
  return result
}

async function generateRichPrBody(
  commits: string[],
  defaultBranch: string,
  targetBranch: string,
  appStateGetter: () => any
): Promise<string> {
  const { commit: commitAttribution, pr: defaultPrAttribution } = getAttributionTexts()
  const effectivePrAttribution = await getEnhancedPRAttribution(appStateGetter)

  let changelogSection = `
## 更新日志
<!-- CHANGELOG:START -->
[如果此 PR 包含面向用户的更改，请在此处添加更新日志条目。否则，删除此部分。]
<!-- CHANGELOG:END -->`
  if (process.env.USER_TYPE === 'ant' && isUndercover()) {
    changelogSection = ''
  }

  // 尝试获取 diff 摘要（简单版本，可扩展）
  const { stdout: diffStats } = await execFileNoThrow(
    gitExe(),
    ['diff', '--stat', `${defaultBranch}...${targetBranch}`],
    { preserveOutputOnError: false }
  )
  const diffStatsText = diffStats.trim() || '无变更统计'

  return `## 摘要
${commits.map(c => `- ${c.split('\n')[0]}`).join('\n')}

## 测试计划
- [ ] 运行现有测试
- [ ] 手动验证更改

## 变更说明
${commits.join('\n\n')}

## 文件变更统计
\`\`\`
${diffStatsText}
\`\`\`
${changelogSection}
${effectivePrAttribution ? `\n${effectivePrAttribution}` : defaultPrAttribution ? `\n${defaultPrAttribution}` : ''}`
}

const localCall: LocalCommandCall = async (args, context) => {
  const cwd = getCwd()
  const defaultBranch = await getDefaultBranch()
  const currentBranch = await getCurrentBranch()
  const { message, feature, noPush, noPr, force, draft, reviewer } = parseArgs(args)

  // 检查是否在默认分支上
  if (currentBranch === defaultBranch && !force) {
    return {
      type: 'text',
      value: `当前在 ${defaultBranch} 分支上。\n建议先创建功能分支。使用 --force 强制在当前分支操作。`,
    }
  }

  try {
    let targetBranch = currentBranch
    if (currentBranch === defaultBranch) {
      targetBranch = generateBranchName(feature || 'feature')
      context.updateProgress?.(`创建分支: ${targetBranch}`)
      const { code: checkoutCode, stderr: checkoutStderr } = await execFileNoThrow(
        gitExe(),
        ['checkout', '-b', targetBranch],
        { preserveOutputOnError: false }
      )
      if (checkoutCode !== 0) {
        return { type: 'text', value: `创建分支失败：\n${checkoutStderr || '未知错误'}` }
      }
    }

    // 暂存并提交更改
    const { stdout: statusStdout } = await execFileNoThrow(
      gitExe(),
      ['status', '--porcelain'],
      { preserveOutputOnError: false }
    )
    if (statusStdout.trim()) {
      context.updateProgress?.('暂存更改...')
      const { code: addCode, stderr: addStderr } = await execFileNoThrow(
        gitExe(),
        ['add', '-A'],
        { preserveOutputOnError: false }
      )
      if (addCode !== 0) {
        return { type: 'text', value: `暂存更改失败：\n${addStderr || '未知错误'}` }
      }

      const commitMessage = message || `更新: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
      context.updateProgress?.('创建提交...')
      const { code: commitCode, stderr: commitStderr } = await execFileNoThrow(
        gitExe(),
        ['commit', '-m', commitMessage],
        { preserveOutputOnError: false }
      )
      if (commitCode !== 0) {
        return { type: 'text', value: `提交失败：\n${commitStderr || '未知错误'}` }
      }
    } else {
      const { stdout: commitCount } = await execFileNoThrow(
        gitExe(),
        ['rev-list', '--count', `${defaultBranch}..${targetBranch}`],
        { preserveOutputOnError: false }
      )
      if (parseInt(commitCount.trim(), 10) === 0) {
        return { type: 'text', value: '没有要提交的更改。使用 /status 查看当前状态。' }
      }
    }

    // 推送
    let pushOutput = ''
    if (!noPush) {
      context.updateProgress?.('推送到远程...')
      const { code: pushCode, stdout: pushStdout, stderr: pushStderr } = await execFileNoThrow(
        gitExe(),
        ['push', '-u', 'origin', targetBranch],
        { preserveOutputOnError: false }
      )
      if (pushCode !== 0) {
        return {
          type: 'text',
          value: `推送失败：\n${pushStderr || pushStdout || '未知错误'}\n\n尝试手动推送：git push -u origin ${targetBranch}`,
        }
      }
      pushOutput = '✓ 已推送到远程\n'
    }

    // PR 创建或更新
    let prOutput = ''
    if (!noPr) {
      context.updateProgress?.('检查现有 PR...')
      const existingPr = await getExistingPr(targetBranch)
      const commits = await getRecentCommits(targetBranch, defaultBranch)
      const prBody = await generateRichPrBody(commits, defaultBranch, targetBranch, context.getAppState)
      const title = commits[0]?.split('\n')[0].substring(0, 70) || '更新代码'

      const ghArgsBase = ['pr', existingPr.exists ? 'edit' : 'create']
      if (existingPr.exists && existingPr.number) {
        ghArgsBase.push(existingPr.number.toString())
      }
      if (!existingPr.exists) {
        ghArgsBase.push('--title', title, '--body', prBody, '--base', defaultBranch)
        if (draft) ghArgsBase.push('--draft')
        if (reviewer) ghArgsBase.push('--reviewer', reviewer)
        else if (process.env.USER_TYPE !== 'ant' || !isUndercover()) {
          ghArgsBase.push('--reviewer', 'anthropics/claude-code')
        }
      } else {
        ghArgsBase.push('--title', title, '--body', prBody)
        if (reviewer) ghArgsBase.push('--add-reviewer', reviewer)
        else if (process.env.USER_TYPE !== 'ant' || !isUndercover()) {
          ghArgsBase.push('--add-reviewer', 'anthropics/claude-code')
        }
      }

      const { code: ghCode, stdout: ghStdout, stderr: ghStderr } = await execFileNoThrow(
        'gh',
        ghArgsBase,
        { preserveOutputOnError: false }
      )
      if (ghCode === 0) {
        if (existingPr.exists) {
          prOutput = `✓ 已更新 PR #${existingPr.number}\n  ${await getPrUrl(existingPr.number)}`
        } else {
          const prUrl = ghStdout.trim()
          prOutput = `✓ 已创建 PR\n  ${prUrl}`
          // Slack 发布提示（仅当非 undercover 且检测到 CLAUDE.md 包含相关指令）
          if ((process.env.USER_TYPE !== 'ant' || !isUndercover()) && existsSync(join(cwd, 'CLAUDE.md'))) {
            const claudeMd = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8')
            if (/slack|发布.*channel|send.*slack/i.test(claudeMd)) {
              prOutput += `\n\n💡 检测到 CLAUDE.md 中可能要求发布到 Slack。可使用 \`/mcp__slack__send_message\` 工具将 PR 链接发送到相关频道。`
            }
          }
        }
      } else {
        prOutput = `⚠ ${existingPr.exists ? '更新' : '创建'} PR 失败：${ghStderr || ghStdout || '未知错误'}\n`
      }
    }

    const { stdout: hashStdout } = await execFileNoThrow(
      gitExe(),
      ['rev-parse', 'HEAD'],
      { preserveOutputOnError: false }
    )
    const commitHash = hashStdout.trim().substring(0, 7)

    let resultMessage = `✓ 完成\n\n分支: ${targetBranch}\n提交: ${commitHash}\n`
    if (pushOutput) resultMessage += `\n${pushOutput}`
    if (prOutput) resultMessage += `\n${prOutput}`
    resultMessage += `\n\n下一步:\n- 查看 PR: gh pr view${prOutput ? '' : ' --web'}\n- 合并 PR: gh pr merge`
    return { type: 'text', value: resultMessage }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { type: 'text', value: `执行失败：${errorMsg}` }
  }
}

const localCommand: Command = {
  type: 'local',
  name: 'commit-push-pr',
  description: '提交、推送并创建拉取请求（直接执行）',
  argumentHint: '[-m <消息>] [功能描述] [--no-push] [--no-pr] [--force] [--draft] [--reviewer <用户名>]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: localCall }),
}

// ==================== AI Prompt 命令（AI 模式） ====================

const ALLOWED_TOOLS = [
  'Bash(git checkout --branch:*)',
  'Bash(git checkout -b:*)',
  'Bash(git add:*)',
  'Bash(git status:*)',
  'Bash(git push:*)',
  'Bash(git commit:*)',
  'Bash(gh pr create:*)',
  'Bash(gh pr edit:*)',
  'Bash(gh pr view:*)',
  'Bash(gh pr merge:*)',
  'ToolSearch',
  'mcp__slack__send_message',
  'mcp__claude_ai_Slack__slack_send_message',
]

function getPromptContent(defaultBranch: string, prAttribution?: string): string {
  const { commit: commitAttribution, pr: defaultPrAttribution } = getAttributionTexts()
  const effectivePrAttribution = prAttribution ?? defaultPrAttribution
  const safeUser = process.env.SAFEUSER || ''
  const username = process.env.USER || ''

  let prefix = ''
  let reviewerArg = ' 和 `--reviewer anthropics/claude-code`'
  let addReviewerArg = '（并添加 `--add-reviewer anthropics/claude-code`）'
  let changelogSection = `

## 更新日志
<!-- CHANGELOG:START -->
[如果此 PR 包含面向用户的更改，请在此处添加更新日志条目。否则，删除此部分。]
<!-- CHANGELOG:END -->`
  let slackStep = `

5. 创建/更新 PR 后，检查用户的 CLAUDE.md 是否提及发布到 Slack 频道。如果是，使用 ToolSearch 搜索 "slack send message" 工具。如果 ToolSearch 找到 Slack 工具，询问用户是否希望你将 PR 链接发布到相关 Slack 频道。仅在用户确认后后才发布。如果 ToolSearch 返回无结果或错误，请静默跳过此步骤——不要提及失败，不要尝试解决方法，也不要尝试其他方法。`
  if (process.env.USER_TYPE === 'ant' && isUndercover()) {
    prefix = getUndercoverInstructions() + '\n'
    reviewerArg = ''
    addReviewerArg = ''
    changelogSection = ''
    slackStep = ''
  }

  return `${prefix}## Context

- \`SAFEUSER\`: ${safeUser}
- \`whoami\`: ${username}
- \`git status\`: !\`git status\`
- \`git diff HEAD\`: !\`git diff HEAD\`
- \`git branch --show-current\`: !\`git branch --show-current\`
- \`git diff ${defaultBranch}...HEAD\`: !\`git diff ${defaultBranch}...HEAD\`
- \`gh pr view --json number 2>/dev/null || true\`: !\`gh pr view --json number 2>/dev/null || true\`

## Git 安全协议

- 绝不更新 git 配置
- 绝不执行破坏性/不可逆的 git 命令（如 push --force、hard reset 等），除非用户明确要求
- 绝不跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求
- 绝不向 main/master 执行强制推送，如果用户要求则警告
- 不要提交可能包含秘密的文件（.env、credentials.json 等）
- 绝不使用带 -i 标志的 git 命令（如 git rebase -i 或 git add -i），因为它们需要交互式输入，而这是不支持的

## 你的任务

分析将包含在拉取请求中的所有更改，确保查看所有相关提交（不仅是最新提交，而是所有将包含在拉取请求中的提交，来自上面的 git diff ${defaultBranch}...HEAD 输出）。

基于上述更改：
1. 如果在 ${defaultBranch} 上，创建新分支（使用上面上下文中的 SAFEUSER 作为分支名前缀，如果 SAFEUSER 为空则回退到 whoami，例如：\`username/feature-name\`）
2. 使用 heredoc 语法创建单个提交，并带有适当的提交消息${commitAttribution ? `，以下面示例中显示的归属文本结尾` : ''}：
\`\`\`
git commit -m "$(cat <<'EOF'
提交消息在这里。${commitAttribution ? `\n\n${commitAttribution}` : ''}
EOF
)"
\`\`\`
3. 将分支推送到 origin
4. 如果此分支已存在 PR（检查上面的 gh pr view 输出），使用 \`gh pr edit\` 更新 PR 标题和正文以反映当前的 diff${addReviewerArg}。否则，使用 \`gh pr create\` 创建拉取请求，正文使用 heredoc 语法${reviewerArg}。
   - 重要提示：PR 标题要简短（不超过 70 个字符）。使用正文添加详细信息。
\`\`\`
gh pr create --title "简短且具有描述性的标题" --body "$(cat <<'EOF'
## 摘要
<1-3 个要点>

## 测试计划
[用于测试拉取请求的待办事项要点列表...]${changelogSection}${effectivePrAttribution ? `\n\n${effectivePrAttribution}` : ''}
EOF
)"
\`\`\`

你具有在单个响应中调用多个工具的能力。你必须在一条消息中完成上述所有操作。${slackStep}

完成后返回 PR URL，以便用户可以查看。`
}

const promptCommand: Command = {
  type: 'prompt',
  name: 'commit-push-pr-prompt',
  description: '提交、推送并创建拉取请求（AI 生成内容）',
  allowedTools: ALLOWED_TOOLS,
  get contentLength() {
    return getPromptContent('main').length
  },
  progressMessage: '正在创建提交和 PR（AI 模式）',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const [defaultBranch, prAttribution] = await Promise.all([
      getDefaultBranch(),
      getEnhancedPRAttribution(context.getAppState),
    ])
    let promptContent = getPromptContent(defaultBranch, prAttribution)
    const trimmedArgs = args?.trim()
    if (trimmedArgs) {
      promptContent += `\n\n## Additional instructions from user\n\n${trimmedArgs}`
    }
    const finalContent = await executeShellCommandsInPrompt(
      promptContent,
      {
        ...context,
        getAppState() {
          const appState = context.getAppState()
          return {
            ...appState,
            toolPermissionContext: {
              ...appState.toolPermissionContext,
              alwaysAllowRules: {
                ...appState.toolPermissionContext.alwaysAllowRules,
                command: ALLOWED_TOOLS,
              },
            },
          }
        },
      },
      '/commit-push-pr-prompt'
    )
    return [{ type: 'text', text: finalContent }]
  },
}

// ==================== 导出 ====================
// 默认导出本地命令（保持向后兼容）
export default localCommand
// 同时导出 prompt 命令供需要时使用
export { promptCommand as commitPushPrPrompt }