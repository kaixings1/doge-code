import type { Command } from '../../commands.js'

const updateskills = {
  type: 'local-jsx',
  name: 'updateskills',
  description: '从素材库安装/更新技能 — /updateskills all / source:<name> / conflict',
  aliases: ['skill-update', '技能更新'],
  load: () => import('./updateskills.tsx'),
} satisfies Command

export default updateskills
