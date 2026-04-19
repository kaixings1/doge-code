import { checkOpus1mAccess, checkSonnet1mAccess } from './check1mAccess.js'
import { getUserSpecifiedModelSetting } from './model.js'

// @[MODEL LAUNCH]: Add a branch for the new model if it supports a 1M context upgrade path.
/**
 * 获取可用的模型升级以获得更大的上下文
 * 如果没有可用的升级或用户已拥有最大上下文，则返回 null
 */
function getAvailableUpgrade(): {
  alias: string
  name: string
  multiplier: number
} | null {
  const currentModelSetting = getUserSpecifiedModelSetting()
  if (currentModelSetting === 'opus' && checkOpus1mAccess()) {
    return {
      alias: 'opus[1m]',
      name: 'Opus 1M',
      multiplier: 5,
    }
  } else if (currentModelSetting === 'sonnet' && checkSonnet1mAccess()) {
    return {
      alias: 'sonnet[1m]',
      name: 'Sonnet 1M',
      multiplier: 5,
    }
  }

  return null
}

/**
 * 获取针对不同上下文的升级提示信息
 */
export function getUpgradeMessage(context: 'warning' | 'tip'): string | null {
  const upgrade = getAvailableUpgrade()
  if (!upgrade) return null

  switch (context) {
    case 'warning':
      return `/model ${upgrade.alias}`
    case 'tip':
      return `提示：你可以使用 ${upgrade.name}，上下文容量提升 ${upgrade.multiplier} 倍`
    default:
      return null
  }
}
