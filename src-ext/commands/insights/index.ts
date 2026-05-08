import type { Command } from '../../commands.js'

const insights = {
  type: 'local-jsx',
  name: 'insights',
  description: '生成分析你的 Claude Code 会话模式的报告',
  load: () => import('./insights.js'),
} satisfies Command

export default insights
