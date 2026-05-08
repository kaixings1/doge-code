import type { Command } from '../../commands.js'

const skills = {
  type: 'local-jsx',
  name: 'skills',
  description: '列出可用的技能',
  load: () => import('./skills.js'),
} satisfies Command

export default skills
