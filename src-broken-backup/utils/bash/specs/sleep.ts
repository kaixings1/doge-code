import type { CommandSpec } from '../registry.js'

const sleep: CommandSpec = {
  name: 'sleep',
  description: '延迟指定时长',
  args: {
    name: 'duration',
    description: '睡眠时长（秒或带后缀�?5s�?m�?h�?,
    isOptional: false,
  },
}

export default sleep
