import type { Command } from '../types/command.js'

const database: Command = {
  name: 'database',
  description: '数据库操作',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/database\n\n连接和操作数据库（支持 SQL 和 NoSQL）。',
      description: '数据库操作',
    }
  },
}

export default database
