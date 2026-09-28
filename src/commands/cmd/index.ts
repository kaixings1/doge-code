import type { Command } from '../../commands.js'
import type { LocalCommandModule } from '../../types/command.js'

const cmd = {
  type: 'local' as const,
  name: 'cmd',
  description: '搜索和浏览可用命令',
  isEnabled: () => true,
  supportsNonInteractive: false,
  argumentHint: '<搜索关键词>',
  load: () =>
    import('./cmd.ts').then(
      m => ({ call: m.default }) as unknown as LocalCommandModule,
    ),
} satisfies Command

export default cmd
