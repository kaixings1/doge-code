import type { Command } from '../../commands.js'

const planMode = {
  type: 'local' as const,
  name: 'plan-mode',
  description: '切换计划模式，在生成前先制定详细计划',
  aliases: [],
  load: () => import('./planMode.ts'),
}

export default planMode
