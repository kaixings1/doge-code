import type { Command } from '../../commands.js'

const logger = {
  type: 'local',
  name: 'logger',
  description: '查看和配置日志记录级别',
  load: () => import('./logger.js'),
} satisfies Command

export default logger
