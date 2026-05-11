import type { Command } from '../../commands.js'

const schedule = {
  type: 'local',
  name: 'schedule',
  description: '管理定时调度任务',
  load: () => import('./schedule.js'),
} satisfies Command

export default schedule
