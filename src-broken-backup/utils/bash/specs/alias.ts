import type { CommandSpec } from '../registry.js'

const alias: CommandSpec = {
  name: 'alias',
  description: '创建或列出命令别�?,
  args: {
    name: 'definition',
    description: '格式�?name=value 的别名定�?,
    isOptional: true,
    isVariadic: true,
  },
}

export default alias
