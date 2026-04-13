import type { CommandSpec } from '../registry.js'

const timeout: CommandSpec = {
  name: 'timeout',
  description: '在时限内运行命令',
  args: [
    {
      name: 'duration',
      description: '超时等待时长（例�?10�?s�?m�?,
      isOptional: false,
    },
    {
      name: 'command',
      description: '要运行的命令',
      isCommand: true,
    },
  ],
}

export default timeout
