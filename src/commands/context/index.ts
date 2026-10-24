import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'

export const context: Command = {
  name: 'context',
  description: '以彩色网格可视化当前上下文使用情况',
  isEnabled: () => !getIsNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./context.tsx'),
}

// 非交互会话下同一个 `/context` 改为输出 Markdown 表格（load 由 commands.ts 按会话类型选择）。
// 不再单独注册一个同名命令：两条同名命令会让列表查找结果依赖顺序。
export const contextNonInteractive: Command = {
  type: 'local',
  name: 'context',
  supportsNonInteractive: true,
  description: '显示当前上下文使用情况',
  isEnabled: () => getIsNonInteractiveSession(),
  load: () => import('./context-noninteractive.ts'),
}
