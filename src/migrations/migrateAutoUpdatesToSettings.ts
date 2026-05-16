import { logEvent } from '../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { logError } from '../utils/log.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
/**
 * 迁移：将用户设置的 autoUpdates 首选项移至 settings.json 环境变量
 * 仅在用户明确禁用自动更新时迁移（非保护性禁用）
 * 这保留了用户意图，同时允许原生安装自动更新
 */
export function migrateAutoUpdatesToSettings(): void {
  const globalConfig = getGlobalConfig()

  // 仅当用户首选项明确将 autoUpdates 设置为 false 时才迁移
  //（非原生安装保护性自动禁用）
  if (
    globalConfig.autoUpdates !== false ||
    globalConfig.autoUpdatesProtectedForNative === true
  ) {
    return
  }

  try {
    const userSettings = getSettingsForSource('userSettings') || {}

    // 始终设置 DISABLE_AUTOUPDATER 以保留用户意图
    // 即使已存在也需要覆盖，以确保迁移完成
    updateSettingsForSource('userSettings', {
      ...userSettings,
      env: {
        ...userSettings.env,
        DISABLE_AUTOUPDATER: '1',
      },
    })

    logEvent('tengu_migrate_autoupdates_to_settings', {
      was_user_preference: true,
      already_had_env_var: !!userSettings.env?.DISABLE_AUTOUPDATER,
    })

    // 明确设置，以便立即生效
    process.env.DISABLE_AUTOUPDATER = '1'

    // 迁移成功后从全局配置中移除 autoUpdates
    saveGlobalConfig(current => {
      const {
        autoUpdates: _,
        autoUpdatesProtectedForNative: __,
        ...updatedConfig
      } = current
      return updatedConfig
    })
  } catch (error) {
    logError(new Error(`Failed to migrate auto-updates: ${error}`))
    logEvent('tengu_migrate_autoupdates_error', {
      has_error: true,
    })
  }
}
