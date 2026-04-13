import type { CommandSpec } from '../registry.js'

const nohup: CommandSpec = {
  name: 'nohup',
  description: '运行不受挂断影响的命�?,
  args: {
    name: 'command',
    description: '使用 nohup 运行的命�?,
    isCommand: true,
  },
}

export default nohup
