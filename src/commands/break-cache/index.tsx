import type { Command } from '../../commands.js'

const breakCache = {
  type: 'local',
  name: 'break-cache',
  description: '刷新提示缓存',
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: '缓存已刷新！下次请求将重新生成提示。',
    }),
  }),
} satisfies Command

export default breakCache
