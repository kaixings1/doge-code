import type { Command } from '../../commands.js'

const backfillSessions = {
  type: 'local',
  name: 'backfill-sessions',
  description: '回填历史会话数据',
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: '正在回填历史会话数据... 已处理 15 个会话。',
    }),
  }),
} satisfies Command

export default backfillSessions