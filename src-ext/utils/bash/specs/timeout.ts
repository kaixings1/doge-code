import type { CommandSpec } from '../registry.js'

const timeout: CommandSpec = {
  name: 'timeout',
  description: '在限定时间内运行命令',
  args: [
    {
      name: 'duration',
      description: '超时前的等待时间（如 10、5s、2m）',
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
