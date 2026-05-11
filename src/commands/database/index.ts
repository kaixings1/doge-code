import type { Command } from '../../commands.js'

const database = {
  type: 'local',
  name: 'database',
  description: '查看和操作数据库中存储的数据',
  load: () => import('./database.js'),
} satisfies Command

export default database
