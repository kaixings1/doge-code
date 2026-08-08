import type { Command } from '../../commands.js'

const glossary = {
  type: 'local' as const,
  name: 'glossary',
  description: '显示术语表和定义',
  isEnabled: () => true,
  supportsNonInteractive: false,
  argumentHint: '<术语>',
  load: () => import('./glossary.ts'),
} satisfies Command

export default glossary
