import type { Command } from '../../commands.js'

const cron = {
  type: 'local',
  name: 'cron',
  description: '命令描述',
  load: () => import('./cron.js'),
} satisfies Command

export default cron
