import type { CommandSpec } from '../registry.js'

const sleep: CommandSpec = {
  name: 'sleep',
  description: '延迟指定的时间',
  args: {
    name: 'duration',
    description: '延迟时长（秒或带后缀如 5s、2m、1h）',
    isOptional: false,
  },
}

export default sleep
