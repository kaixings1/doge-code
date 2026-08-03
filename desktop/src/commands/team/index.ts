import type { Command } from '../../commands.js'

const team = {
  type: 'local-jsx',
  name: 'team',
  description: '团队管理命令',
  load: () => import('./team.ts'),
} satisfies Command

export default team
