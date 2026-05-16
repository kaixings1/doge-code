import { saveGlobalConfig } from '../utils/config.js'

/**
 * 将 `replBridgeEnabled` 配置键迁移到 `remoteControlAtStartup`。
 *
 * 旧键是一个泄露到面向用户的配置中的实现细节。
 * 此迁移将值复制到新键并移除旧键。
 * 幂等 — 仅在旧键存在且新键不存在时执行。
 */
export function migrateReplBridgeEnabledToRemoteControlAtStartup(): void {
  saveGlobalConfig(prev => {
    // 旧键不再在 GlobalConfig 类型中，因此通过无类型转换访问它。
    // 仅在旧键存在且新键尚未设置时执行迁移。
    const oldValue = (prev as Record<string, unknown>)['replBridgeEnabled']
    if (oldValue === undefined) return prev
    if (prev.remoteControlAtStartup !== undefined) return prev
    const next = { ...prev, remoteControlAtStartup: Boolean(oldValue) }
    delete (next as Record<string, unknown>)['replBridgeEnabled']
    return next
  })
}
