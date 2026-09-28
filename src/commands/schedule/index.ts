import type { Command } from '../../commands.js'

const schedule = {
  type: 'local-jsx',
  name: 'schedule',
  description: '管理定时调度任务',
  load: () => import('./schedule.ts').then(m => ({ call: m.call })),
} satisfies Command

export default schedule
