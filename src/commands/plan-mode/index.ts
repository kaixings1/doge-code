import type { Command } from '../../commands.js'

const planMode = {
  type: 'local',
  name: 'plan-mode',
  description: '切换计划模式，在生成前先制定详细计划',
  aliases: ['plan'],
  load: () => import('./planMode.js'),
} satisfies Command

export default planMode
