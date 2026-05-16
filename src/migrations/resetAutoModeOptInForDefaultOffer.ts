import { feature } from 'bun:bundle'
import { logEvent } from '../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { logError } from '../utils/log.js'
import { getAutoModeEnabledState } from '../utils/permissions/permissionSetup.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * 一次性迁移：清除那些接受了旧的二选项 AutoModeOptInDialog 但未将 auto
 * 设为默认模式的用户的 skipAutoPermissionPrompt 标记。
 * 重新显示对话框，以便他们看到新的"设为默认模式"选项。
 * 守卫标记位于 GlobalConfig (~/.claude.json) 而非 settings.json，
 * 因此即使设置重置也不会丢失，且不会自行重新激活。
 *
 * 仅在 tengu_auto_mode_config.enabled === 'enabled' 时运行。对于 'opt-in'
 * 用户，清除 skipAutoPermissionPrompt 会从轮播中移除 auto
 * (permissionSetup.ts:988) —— 对话框将变得无法访问，迁移会自相矛盾。
 * 实际上约 40 个目标 ants 用户都是 'enabled'（他们通过裸 Shift+Tab 到达旧对话框，
 * 这需要 'enabled'），但守卫标记使其无论如何都安全。
 */
export function resetAutoModeOptInForDefaultOffer(): void {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    const config = getGlobalConfig()
    if (config.hasResetAutoModeOptInForDefaultOffer) return
    if (getAutoModeEnabledState() !== 'enabled') return

    try {
      const user = getSettingsForSource('userSettings')
      if (
        user?.skipAutoPermissionPrompt &&
        user?.permissions?.defaultMode !== 'auto'
      ) {
        updateSettingsForSource('userSettings', {
          skipAutoPermissionPrompt: undefined,
        })
        logEvent('tengu_migrate_reset_auto_opt_in_for_default_offer', {})
      }

      saveGlobalConfig(c => {
        if (c.hasResetAutoModeOptInForDefaultOffer) return c
        return { ...c, hasResetAutoModeOptInForDefaultOffer: true }
      })
    } catch (error) {
      logError(new Error(`Failed to reset auto mode opt-in: ${error}`))
    }
  }
}
