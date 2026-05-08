import type { Command } from '../../commands.js'

const contextCollapse = {
  type: 'local',
  name: 'context-collapse',
  description: '命令描述',
  load: () => import('./contextCollapse.js'),
} satisfies Command

export default contextCollapse
