import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { saveGlobalConfig } from '../utils/config.js'
import { isLegacyModelRemapEnabled } from '../utils/model/model.js'
import { getAPIProvider } from '../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * 将第一方用户从显式的 Opus 4.0/4.1 模型字符串迁移走。
 *
 * 'opus' 别名已为 1P 解析为 Opus 4.6，因此任何仍在显式 4.0/4.1 字符串上的用户
 * 都是在 4.5 发布前将其固定在设置中的。parseUserSpecifiedModel 现在会在运行时
 * 静默重新映射这些 — 此迁移清理设置文件，使 /model 显示正确的内容，
 * 并设置时间戳以便 REPL 可以显示一次性通知。
 *
 * 仅修改 userSettings。project/local/policy 设置中的旧字符串保持不变
 *（我们不能/不应该重写它们），并且仍由 parseUserSpecifiedModel 在运行时重新映射。
 * 读写同一源使其无需完成标志即可保持幂等，并避免将 'opus' 静默提升为
 * 仅在一个项目中固定它的用户的全局默认值。
 */
export function migrateLegacyOpusToCurrent(): void {
  if (getAPIProvider() !== 'firstParty') {
    return
  }

  if (!isLegacyModelRemapEnabled()) {
    return
  }

  const model = getSettingsForSource('userSettings')?.model
  if (
    model !== 'claude-opus-4-20250514' &&
    model !== 'claude-opus-4-1-20250805' &&
    model !== 'claude-opus-4-0' &&
    model !== 'claude-opus-4-1'
  ) {
    return
  }

  updateSettingsForSource('userSettings', { model: 'opus' })
  saveGlobalConfig(current => ({
    ...current,
    legacyOpusMigrationTimestamp: Date.now(),
  }))
  logEvent('tengu_legacy_opus_migration', {
    from_model:
      model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}
