import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import {
  isMaxSubscriber,
  isProSubscriber,
  isTeamPremiumSubscriber,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { getAPIProvider } from '../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * 将 Pro/Max/Team Premium 第一方用户从显式的 Sonnet 4.5 模型字符串
 * 迁移到 'sonnet' 别名（现在解析为 Sonnet 4.6）。
 *
 * 用户可能因以下原因被固定到显式的 Sonnet 4.5 字符串：
 * - 之前的 migrateSonnet1mToSonnet45 迁移（sonnet[1m] → 显式 4.5[1m]）
 * - 通过 /model 手动选择
 *
 * 专门从 userSettings 读取（非合并），因此仅迁移 /model 写入的内容——
 * 项目/本地固定设置保持不变。
 * 幂等：仅在 userSettings.model 匹配 Sonnet 4.5 字符串时写入。
 */
export function migrateSonnet45ToSonnet46(): void {
  if (getAPIProvider() !== 'firstParty') {
    return
  }

  if (!isProSubscriber() && !isMaxSubscriber() && !isTeamPremiumSubscriber()) {
    return
  }

  const model = getSettingsForSource('userSettings')?.model
  if (
    model !== 'claude-sonnet-4-5-20250929' &&
    model !== 'claude-sonnet-4-5-20250929[1m]' &&
    model !== 'sonnet-4-5-20250929' &&
    model !== 'sonnet-4-5-20250929[1m]'
  ) {
    return
  }

  const has1m = model.endsWith('[1m]')
  updateSettingsForSource('userSettings', {
    model: has1m ? 'sonnet[1m]' : 'sonnet',
  })

  // 跳过全新用户的通知——他们从未体验过旧的默认值
  const config = getGlobalConfig()
  if (config.numStartups > 1) {
    saveGlobalConfig(current => ({
      ...current,
      sonnet45To46MigrationTimestamp: Date.now(),
    }))
  }

  logEvent('tengu_sonnet45_to_46_migration', {
    from_model:
      model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    has_1m: has1m,
  })
}
