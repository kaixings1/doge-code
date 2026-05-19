import type { Command } from '../../commands.js'

const mockLimits = {
  type: 'local',
  name: 'mock-limits',
  description: '模拟限制模式',
  isHidden: true,
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: '已启用模拟限制模式。',
    }),
  }),
} satisfies Command

export default mockLimits
