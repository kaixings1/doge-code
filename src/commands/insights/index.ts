import type { Command } from '../../commands.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

const insights = {
  type: 'local-jsx',
  name: 'insights',
  description: '生成分析你的 Claude Code 会话模式的报告',
  // 非交互会话由 commands.ts 的 usageReport（prompt 版）提供服务，避免同名命令注册两次。
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./insights.ts'),
} satisfies Command

export default insights
