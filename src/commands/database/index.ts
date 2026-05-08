import type { Command } from '../../commands.js'

const database = {
  type: 'local',
  name: 'database',
  description: '命令描述',
  load: () => import('./database.js'),
} satisfies Command

export default database
