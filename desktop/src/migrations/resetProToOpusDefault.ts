import { logEvent } from '../services/analytics/index.js'
import { isProSubscriber } from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'

export function resetProToOpusDefault(): void {
  const config = getGlobalConfig()

  if (config.opusProMigrationComplete) {
    return
  }

  const apiProvider = getAPIProvider()

  // firstParty 上的 Pro 用户会自动迁移到 Opus 4.5 默认值
  if (apiProvider !== 'firstParty' || !isProSubscriber()) {
    saveGlobalConfig(current => ({
      ...current,
      opusProMigrationComplete: true,
    }))
    logEvent('tengu_reset_pro_to_opus_default', { skipped: true })
    return
  }

  const settings = getSettings_DEPRECATED()

  // 仅在用户使用默认值（无自定义模型设置）时显示通知
  if (settings?.model === undefined) {
    const opusProMigrationTimestamp = Date.now()
    saveGlobalConfig(current => ({
      ...current,
      opusProMigrationComplete: true,
      opusProMigrationTimestamp,
    }))
    logEvent('tengu_reset_pro_to_opus_default', {
      skipped: false,
      had_custom_model: false,
    })
  } else {
    // 用户设置了自定义模型，仅标记迁移完成
    saveGlobalConfig(current => ({
      ...current,
      opusProMigrationComplete: true,
    }))
    logEvent('tengu_reset_pro_to_opus_default', {
      skipped: false,
      had_custom_model: true,
    })
  }
}
