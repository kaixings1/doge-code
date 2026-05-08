import type { Command } from '../types/command.js'

const lessPermissionPrompts: Command = {
  name: 'less-permission-prompts',
  description: '扫描会话，生成权限白名单',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/less-permission-prompts\n\n分析当前会话中使用的工具和权限，生成最小权限集。',
      description: '扫描会话，生成权限白名单',
    }
  },
}

export default lessPermissionPrompts
