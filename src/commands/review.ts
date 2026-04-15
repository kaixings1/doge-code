import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'
import { isUltrareviewEnabled } from './review/ultrareviewEnabled.js'

// 法务要求显示明确的功能名称以及触发前的文档链接，因此在描述中包含“Web 版 Claude Code”和 URL。
const CCR_TERMS_URL = 'https://code.claude.com/docs/en/claude-code-on-the-web'

const LOCAL_REVIEW_PROMPT = (args: string) => `
      你是一名专业的代码审查者。请遵循以下步骤：

      1. 如果参数中没有提供 PR 编号，请运行 \`gh pr list\` 显示未关闭的 PR
      2. 如果提供了 PR 编号，请运行 \`gh pr view <编号>\` 获取 PR 详情
      3. 运行 \`gh pr diff <编号>\` 获取差异内容
      4. 分析变更并提供全面的代码审查，包括：
         - PR 所实现功能的概述
         - 代码质量与风格的评估
         - 具体的改进建议
         - 任何潜在问题或风险

      审查应保持简洁但全面。重点关注：
      - 代码正确性
      - 是否符合项目规范
      - 性能影响
      - 测试覆盖情况
      - 安全性考虑

      PR 编号：${args}
    `

const review: Command = {
  type: 'prompt',
  name: 'review',
  description: '审查拉取请求',
  progressMessage: '正在审查拉取请求',
  contentLength: 0,
  source: 'builtin',
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    return [{ type: 'text', text: LOCAL_REVIEW_PROMPT(args) }]
  },
}

// /ultrareview 是远程 bug 猎人路径的唯一切入点 —
// /review 始终保留为本地版本。local-jsx 类型用于在免费审查次数耗尽时显示超额许可对话框。
const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `约 10–20 分钟 · 查找并验证你分支中的 bug。在 Web 版 Claude Code 中运行。详见 ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('./review/ultrareviewCommand.js'),
}

export default review
export { ultrareview }