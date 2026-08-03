import type { Command } from '../../commands.js'

const exit = {
  type: 'local-jsx',
  name: 'exit',
  aliases: ['quit'],
  description: '退出 REPL',
  immediate: true,
  load: () => import('./exit.tsx'),
} satisfies Command

export default exit
