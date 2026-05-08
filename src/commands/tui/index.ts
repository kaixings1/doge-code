import type { Command } from '../../commands.js'

const tui = {
  type: 'local-jsx',
  name: 'tui',
  description: 'TUI 模式（开发中）',
  load: () => import('./tui.js'),
} satisfies Command

export default tui
