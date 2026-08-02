import type { Command } from '../../commands.js'
import { getAutoModeManager } from '../../features/index.js'

const autoModeReset = {
  type: 'local' as const,
  name: 'auto-mode-reset',
  aliases: ['/auto-mode-reset', '/amr'],
  description: '重置自动模式配置为默认值 (更新日志 2.1.212)',
  argumentHint: '[--yes]',
  isEnabled: () => true,
  get isHidden() {
    return false
  },
  async call(args: string) {
    const autoModeMgr = getAutoModeManager()
    const skipConfirm = args.includes('--yes') || args.includes('-y')

    if (!skipConfirm) {
      return {
        type: 'text' as const,
        value: '确定要重置自动模式配置吗？\n' +
          '这将恢复以下设置为默认值:\n' +
          '  - dangerousRm: true\n' +
          '  - backgroundAmpersand: true\n' +
          '  - suspiciousWindowsPaths: true\n\n' +
          '使用 /auto-mode-reset --yes 确认重置。',
      }
    }

    autoModeMgr.reset()
    const config = autoModeMgr.getConfig()
    return {
      type: 'text' as const,
      value: '✅ 自动模式配置已重置为默认值\n' +
        `  dangerousRm: ${config.dangerousRm}\n` +
        `  backgroundAmpersand: ${config.backgroundAmpersand}\n` +
        `  suspiciousWindowsPaths: ${config.suspiciousWindowsPaths}`,
    }
  },
} satisfies Command

export default autoModeReset
