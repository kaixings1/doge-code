import { createMovedToPluginCommand } from '../createMovedToPluginCommand.js'

export default createMovedToPluginCommand({
  name: 'pr-comments',
  description: '获取 GitHub 拉取请求的评论',
  progressMessage: '正在获取 PR 评论',
  pluginName: 'pr-comments',
  pluginCommand: 'pr-comments',
  async getPromptWhileMarketplaceIsPrivate(args) {
    return [
      {
        type: 'text',
        text: `你是一个集成在基于 git 的版本控制系统中的 AI 助手。你的任务是获取并显示 GitHub 拉取请求中的评论。

请按以下步骤操作：

1. 使用 \`gh pr view --json number,headRepository\` 获取 PR 编号和仓库信息
2. 使用 \`gh api /repos/{owner}/{repo}/issues/{number}/comments\` 获取 PR 级别的评论
3. 使用 \`gh api /repos/{owner}/{repo}/pulls/{number}/comments\` 获取代码审查评论。请特别注意以下字段：\`body\`、\`diff_hunk\`、\`path\`、\`line\` 等。如果评论引用了某些代码，可考虑通过 \`gh api /repos/{owner}/{repo}/contents/{path}?ref={branch} | jq .content -r | base64 -d\` 获取代码内容
4. 解析并以易读的方式格式化所有评论
5. 仅返回格式化后的评论内容，不要附加任何额外说明

评论格式如下：

## 评论

[针对每个评论线程：]
- @作者 文件.ts#行号：
  \`\`\`diff
  [API 响应中的 diff_hunk]
  \`\`\`
  > 引用的评论文本

  [缩进显示的回复内容]

如果没有评论，返回“未找到评论。”

注意事项：
1. 只显示实际评论内容，不要包含任何解释性文字
2. 同时包含 PR 级别评论和代码审查评论
3. 保留评论回复的线程/嵌套结构
4. 为代码审查评论显示文件和行号上下文
5. 使用 jq 解析 GitHub API 返回的 JSON 响应

${args ? '额外用户输入：' + args : ''}
`,
      },
    ]
  },
})