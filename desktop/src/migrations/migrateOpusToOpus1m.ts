import { logEvent } from '../services/analytics/index.js'
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  parseUserSpecifiedModel,
} from '../utils/model/model.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * 将设置中固定为 'opus' 的用户迁移到 'opus[1m]'，前提是他们符合
 * 合并后的 Opus 1M 体验条件（第一方 Max/Team Premium 用户）。
 *
 * 使用 --model opus 的 CLI 调用不受影响：该标志是运行时覆盖，
 * 不会修改 userSettings，因此仍使用普通 Opus。
 *
 * Pro 订阅者被跳过——他们保留独立的 Opus 和 Opus 1M 选项。
 * 第三方用户被跳过——他们的模型字符串是完整模型 ID，而非别名。
 *
 * 幂等：仅在 userSettings.model 恰好为 'opus' 时写入。
 */
export function migrateOpusToOpus1m(): void {
  if (!isOpus1mMergeEnabled()) {
    return
  }

  const model = getSettingsForSource('userSettings')?.model
  if (model !== 'opus') {
    return
  }

  const migrated = 'opus[1m]'
  const modelToSet =
    parseUserSpecifiedModel(migrated) ===
    parseUserSpecifiedModel(getDefaultMainLoopModelSetting())
      ? undefined
      : migrated
  updateSettingsForSource('userSettings', { model: modelToSet })

  logEvent('tengu_opus_to_opus1m_migration', {})
}
