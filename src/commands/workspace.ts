import type { Command } from '../commands.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'

const ALLOWED_TOOLS = [
  'Bash(git:*)',
  'Bash(cat:*)',
  'Bash(echo:*)',
  'Bash(mkdir:*)',
  'Bash(ls:*)',
]

function getPromptContent(action: string, args: string): string {
  if (action === 'save') {
    return `## 任务：保存当前工作上下文

用户想要保存当前的工作状态，以便将来恢复。

### 需要保存的信息

1. **Git 状态**：
   - 当前分支 (\`git branch --show-current\`)
   - 当前 diff (\`git diff HEAD\`)
   - 未跟踪的文件 (\`git status --short\`)
   - 最近的提交 (\`git log --oneline -5\`)

2. **项目信息**：
   - 当前目录路径 (\`pwd\`)
   - 项目名称（目录名）
   - 最后修改的文件（按时间排序）

3. **工作摘要**（如果有参数的话）：
   ${args ? `"${args}"` : '根据当前状态自动生成工作摘要'}

### 存储格式

将上述信息保存到 \`.doge/workspace.json\` 文件中，格式如下：
\`\`\`json
{
  "savedAt": "ISO 时间戳",
  "project": "项目名",
  "branch": "当前分支",
  "summary": "工作摘要",
  "files": ["修改的文件列表"],
  "branchDescription": "分支描述/用途"
}
\`\`\`

### 注意事项
- 确保 .doge/ 目录存在，不存在则创建
- 不要提交 .doge/ 目录到 git（已在 .gitignore 中）
- 保存成功后输出 "✅ 工作上下文已保存"`
  }

  if (action === 'load') {
    return `## 任务：恢复之前保存的工作上下文

用户想要恢复之前保存的工作状态。

### 恢复步骤

1. **读取保存的信息**：
   - 读取 \`.doge/workspace.json\`
   - 如果文件不存在，提示"没有找到保存的工作上下文"

2. **恢复工作状态**：
   - 如果保存的分支与当前分支不同，建议切换分支
   - 如果是同一个分支，列出之前的 diff 和修改的文件
   - 检查之前修改的文件是否仍然存在
   - 检查是否有未完成的变更

### 输出格式

\`\`\`
📋 保存的工作上下文
- 项目: <project>
- 分支: <branch>
- 保存时间: <savedAt>
- 摘要: <summary>

📝 当时修改的文件:
- <file1>
- <file2>

🔄 当前状态对比:
- 当前分支: <currentBranch>
- 是否有未提交变更: <yes/no>
\`\`\``
  }

  if (action === 'list') {
    return `## 任务：列出所有保存的工作上下文

### 搜索范围
1. 搜索所有 \`.doge/workspace.json\` 文件
2. 也搜索 \`~/.doge/workspaces/\` 目录（全局保存的上下文）

### 输出格式
按保存时间倒序排列，显示每个上下文的项目名、分支、保存时间和摘要。`
  }

  // Default: show usage
  return `## 工作区管理命令

用法：
- \`/workspace save [摘要]\` - 保存当前工作上下文
- \`/workspace load\` - 恢复最近保存的工作上下文
- \`/workspace list\` - 列出所有保存的工作上下文`
}

const command = {
  type: 'prompt',
  name: 'workspace',
  description: '保存/恢复工作上下文（分支、diff、修改的文件）',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0,
  progressMessage: '正在处理工作上下文',
  source: 'builtin',
  getPromptForCommand(args: string): string {
    const trimmed = args?.trim() || ''
    const parts = trimmed.split(/\s+/)
    const action = parts[0]?.toLowerCase() || ''
    const restArgs = parts.slice(1).join(' ')
    return getPromptContent(action, restArgs)
  },
} satisfies Command

export default command
