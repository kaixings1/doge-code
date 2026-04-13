import figures from 'figures'
import type { Command } from '../../commands.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'

const command = {
  name: 'sandbox',
  get description() {
    const currentlyEnabled = SandboxManager.isSandboxingEnabled()
    const autoAllow = SandboxManager.isAutoAllowBashIfSandboxedEnabled()
    const allowUnsandboxed = SandboxManager.areUnsandboxedCommandsAllowed()
    const isLocked = SandboxManager.areSandboxSettingsLockedByPolicy()
    const hasDeps = SandboxManager.checkDependencies().errors.length === 0

    // 如果缺少依赖项则显示警告图标，否则显示启用/禁用状态
    let icon: string
    if (!hasDeps) {
      icon = figures.warning
    } else {
      icon = currentlyEnabled ? figures.tick : figures.circle
    }

    let statusText = '沙盒已禁用'
    if (currentlyEnabled) {
      statusText = autoAllow
        ? '沙盒已启用（自动允许）'
        : '沙盒已启用'

      // 添加非沙盒回退状态
      statusText += allowUnsandboxed ? '，允许回退' : ''
    }

    if (isLocked) {
      statusText += '（托管）'
    }

    return `${icon} ${statusText}（按回车键配置）`
  },
  argumentHint: '排除"命令模式"',
  get isHidden() {
    return (
      !SandboxManager.isSupportedPlatform() ||
      !SandboxManager.isPlatformInEnabledList()
    )
  },
  immediate: true,
  type: 'local-jsx',
  load: () => import('./sandbox-toggle.js'),
} satisfies Command

export default command
