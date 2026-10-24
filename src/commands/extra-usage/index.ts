import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { isOverageProvisioningAllowed } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

function isExtraUsageAllowed(): boolean {
  if (isEnvTruthy(process.env.DISABLE_EXTRA_USAGE_COMMAND)) {
    return false
  }
  return isOverageProvisioningAllowed()
}

export const extraUsage = {
  type: 'local-jsx',
  name: 'extra-usage',
  description: '配置额外用量以在达到限制时继续工作',
  isEnabled: () => isExtraUsageAllowed() && !getIsNonInteractiveSession(),
  load: () => import('./extra-usage.tsx'),
} satisfies Command

// 非交互会话下同一个 `/extra-usage` 打印链接而非打开浏览器。
// 与 extraUsage 互斥（isEnabled 二选一），只注册一份，避免同名命令出现两次。
export const extraUsageNonInteractive = {
  type: 'local',
  name: 'extra-usage',
  supportsNonInteractive: true,
  description: '配置额外用量以在达到限制时继续工作',
  isEnabled: () => isExtraUsageAllowed() && getIsNonInteractiveSession(),
  load: () => import('./extra-usage-noninteractive.ts'),
} satisfies Command
