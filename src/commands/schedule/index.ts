import type { Command } from '../../commands.js'

const schedule: Command = {
  name: 'schedule',
  description: '命令描述',
  type: 'local',
  load: () => import('./schedule.js'),
}

export default schedule
