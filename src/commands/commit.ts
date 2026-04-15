import type { Command } from '../commands.js'
import { getAttributionTexts } from '../utils/attribution.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js'

const ALLOWED_TOOLS = [
  'Bash(git add:*)',
  'Bash(git status:*)',
  'Bash(git commit:*)',
]

function getPromptContent(): string {
  const { commit: commitAttribution } = getAttributionTexts()

  let prefix = ''
  if (process.env.USER_TYPE === 'ant' && isUndercover()) {
    prefix = getUndercoverInstructions() + '\n'
  }

  return `${prefix}## Context

- 当前 git 状态: !\`git status\`
- 当前 git diff（已暂存和未暂存的更改）: !\`git diff HEAD\`
- 当前分支: !\`git branch --show-current\`
- 最近的提交: !\`git log --oneline -10\`

## Git 安全协议

- 绝不更新 git 配置
- 绝不跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求
- 关键：始终创建新的提交。绝不使用 git commit --amend，除非用户明确要求
- 不要提交可能包含秘密的文件（.env、credentials.json 等）。如果用户特别要求提交这些文件，则警告用户
- 如果没有要提交的更改（即没有未跟踪的文件和没有修改），不要创建空提交
- 绝不使用带 -i 标志的 git 命令（如 git rebase -i 或 git add -i），因为它们需要交互式输入，而这是不支持的

## 你的任务

基于上述更改，创建单个 git 提交：

1. 分析所有已暂存的更改并起草提交消息：
   - 查看最近上面的提交，以遵循此仓库的提交消息风格
   - 总结更改的性质（新功能、增强、错误修复、重构、测试、文档等）
   - 确保消息准确反映更改及其目的（即 "add" 表示全新的功能，"update" 表示对现有功能的增强，"fix" 表示错误修复等）
   - 起草简洁（1-2 句话）的提交消息，重点关注"为什么"而不是"是什么"

2. 暂存相关文件并使用 HEREDOC 语法创建提交：
\`\`\`
git commit -m "$(cat <<'EOF'
提交消息在这里。${commitAttribution ? `\n\n${commitAttribution}` : ''}
EOF
)"
\`\`\`

你具有在单个响应中调用多个工具的能力。在一条消息中暂存文件并创建提交。不要使用任何其他工具或做任何其他事情。除了这些工具调用外，不要发送任何其他文本或消息。`
}

const command = {
  type: 'prompt',
  name: 'commit',
  description: '创建 git 提交',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0, // Dynamic content
  progressMessage: '正在创建提交',
  source: 'builtin',
  async getPromptForCommand(_args, context) {
    const promptContent = getPromptContent()
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
      '/commit',
    )

    return [{ type: 'text', text: finalContent }]
  },
} satisfies Command

export default command
