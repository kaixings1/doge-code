import type { PluginError } from '../../types/plugin.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { getPluginLspServers } from '../../utils/plugins/lspPluginIntegration.js'
import { loadAllPluginsCacheOnly } from '../../utils/plugins/pluginLoader.js'
import type { ScopedLspServerConfig } from './types.js'

/**
 * 从插件获取所有已配置的 LSP 服务器。
 * LSP 服务器仅通过插件支持，不支持用户/项目设置。
 *
 * @returns 包含按作用域服务器名称键化的服务器配置对象
 */
export async function getAllLspServers(): Promise<{
  servers: Record<string, ScopedLspServerConfig>
}> {
  const allServers: Record<string, ScopedLspServerConfig> = {}

  try {
    // 获取所有已启用的插件
    const { enabled: plugins } = await loadAllPluginsCacheOnly()

    // 从每个插件并行加载 LSP 服务器。
    // 每个插件独立运行 —— 结果按原始顺序合并，因此
    // Object.assign 的冲突优先级（后加载的插件优先）得以保留。
    const results = await Promise.all(
      plugins.map(async plugin => {
        const errors: PluginError[] = []
        try {
          const scopedServers = await getPluginLspServers(plugin, errors)
          return { plugin, scopedServers, errors }
        } catch (e) {
          // 防御性编程：如果某个插件抛出异常，不要丢失来自
          // 其他插件的结果。之前的串行循环隐式容忍了这一点。
          logForDebugging(
            `Failed to load LSP servers for plugin ${plugin.name}: ${e}`,
            { level: 'error' },
          )
          return { plugin, scopedServers: undefined, errors }
        }
      }),
    )

    for (const { plugin, scopedServers, errors } of results) {
      const serverCount = scopedServers ? Object.keys(scopedServers).length : 0
      if (serverCount > 0) {
        // 合并到所有服务器中（已由 getPluginLspServers 限定作用域）
        Object.assign(allServers, scopedServers)

        logForDebugging(
          `Loaded ${serverCount} LSP server(s) from plugin: ${plugin.name}`,
        )
      }

      // 记录遇到的任何错误
      if (errors.length > 0) {
        logForDebugging(
          `${errors.length} error(s) loading LSP servers from plugin: ${plugin.name}`,
        )
      }
    }

    logForDebugging(
      `Total LSP servers loaded: ${Object.keys(allServers).length}`,
    )
  } catch (error) {
    // 记录错误以监控生产问题。
    // LSP 是可选的，因此我们不抛出异常 —— 但我们需要可见性
    // 来了解插件加载失败的原因，以便改进该功能。
    logError(toError(error))

    logForDebugging(`加载 LSP 服务器配置失败: ${errorMessage(error)}`)
  }

  return {
    servers: allServers,
  }
}
