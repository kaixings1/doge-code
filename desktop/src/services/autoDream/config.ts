// 叶子配置模块 —— 刻意保持最小导入，使 UI 组件
// 可以读取 auto-dream 启用状态，而无需引入 autoDream.ts
// 所依赖的分支 agent / 任务注册表 / 消息构建器链。

import { getInitialSettings } from '../../utils/settings/settings.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'

/**
 * 后台记忆整合是否应运行。用户设置
 * （settings.json 中的 autoDreamEnabled）在显式设置时
 * 覆盖 GrowthBook 默认值；否则回退到 tengu_onyx_plover。
 */
export function isAutoDreamEnabled(): boolean {
  const setting = getInitialSettings().autoDreamEnabled
  if (setting !== undefined) return setting
  const gb = getFeatureValue_CACHED_MAY_BE_STALE<{ enabled?: unknown } | null>(
    'tengu_onyx_plover',
    null,
  )
  return gb?.enabled === true
}
