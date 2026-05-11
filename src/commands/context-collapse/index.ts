import type { Command } from '../../commands.js'

const contextCollapse = {
  type: 'local',
  name: 'context-collapse',
  description: '折叠/展开对话上下文中的非关键部分以释放空间',
  supportsNonInteractive: true,
  load: () => import('./contextCollapse.js'),
} satisfies Command

export default contextCollapse
