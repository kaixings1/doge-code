import type { Command } from '../../commands.js'

const stats = {
  type: 'local-jsx',
  name: 'stats',
  description: '显示您的 Claude Code 使用统计和活动',
  load: () => import('./stats.tsx'),
} satisfies Command

export default stats
