import type { Command } from '../../commands.js'

const recall = {
  type: 'local',
  name: 'recall',
  description: '从历史会话中搜索和回忆相关对话',
  aliases: [],
  argumentHint: '<关键词> [--session <id>] [--limit N]',
  supportsNonInteractive: true,
  load: () => import('./recall.ts'),
} satisfies Command

export default recall
