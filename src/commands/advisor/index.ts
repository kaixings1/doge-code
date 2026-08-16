import type { Command } from '../../commands.js'

const advisor = {
  type: 'local',
  name: 'advisor',
  description: '代码顾问 — 分析代码库并提供改进建议',
  aliases: [],
  argumentHint: '[--focus <area>] [--path <dir>]',
  supportsNonInteractive: true,
  load: () => import('./advisor.ts'),
} satisfies Command

export default advisor
