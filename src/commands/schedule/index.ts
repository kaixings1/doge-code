import type { Command } from '../../commands.js'

const schedule = {
  type: 'local',
  name: 'schedule',
  description: '命令描述',
  load: () => import('./schedule.js'),
} satisfies Command

export default schedule
