import {
  getMainLoopModelOverride,
  setMainLoopModelOverride,
} from '../bootstrap/state.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * 将保存为 "sonnet[1m]" 的用户迁移到显式的 "sonnet-4-5-20250929[1m]"。
 *
 * "sonnet" 别名现在解析为 Sonnet 4.6，因此之前设置 "sonnet[1m]"
 * （指向 Sonnet 4.5 并带 1M 上下文）的用户需要固定到显式版本以保留其预期模型。
 *
 * 这是必需的，因为 Sonnet 4.6 1M 面向的是与 Sonnet 4.5 1M 不同的用户群体，
 * 因此我们需要将现有 sonnet[1m] 用户固定到 Sonnet 4.5 1M。
 *
 * 专门从 userSettings 读取（而非合并设置），以免将项目作用域的 "sonnet[1m]"
 * 提升为全局默认值。仅运行一次，由全局配置中的完成标志跟踪。
 */
export function migrateSonnet1mToSonnet45(): void {
  const config = getGlobalConfig()
  if (config.sonnet1m45MigrationComplete) {
    return
  }

  const model = getSettingsForSource('userSettings')?.model
  if (model === 'sonnet[1m]') {
    updateSettingsForSource('userSettings', {
      model: 'sonnet-4-5-20250929[1m]',
    })
  }

  // 如果已设置内存中的覆盖，也一并迁移
  const override = getMainLoopModelOverride()
  if (override === 'sonnet[1m]') {
    setMainLoopModelOverride('sonnet-4-5-20250929[1m]')
  }

  saveGlobalConfig(current => ({
    ...current,
    sonnet1m45MigrationComplete: true,
  }))
}
