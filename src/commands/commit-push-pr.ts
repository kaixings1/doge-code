import type { Command } from '../commands.js'
import {
  getAttributionTexts,
  getEnhancedPRAttribution,
} from '../utils/attribution.js'
import { getDefaultBranch } from '../utils/git.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js'

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

function getPromptContent(
  defaultBranch: string,
  prAttribution?: string,
): string {
  const { commit: commitAttribution, pr: defaultPrAttribution } =
    getAttributionTexts()
  // 使用提供的 PR 归属文本，或回退到默认值
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

const command = {
  type: 'prompt',
  name: 'commit-push-pr',
  description: '提交、推送并创建拉取请求',
  allowedTools: ALLOWED_TOOLS,
  get contentLength() {
    // 使用 'main' 作为内容长度计算的估算值
    return getPromptContent('main').length
  },
  progressMessage: '正在创建提交和 PR',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    // 获取默认分支和增强的 PR 归属文本
    const [defaultBranch, prAttribution] = await Promise.all([
      getDefaultBranch(),
      getEnhancedPRAttribution(context.getAppState),
    ])
    let promptContent = getPromptContent(defaultBranch, prAttribution)

    // 如果提供了参数，追加用户指令
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
      '/commit-push-pr',
    )

    return [{ type: 'text', text: finalContent }]
  },
} satisfies Command

export default command
