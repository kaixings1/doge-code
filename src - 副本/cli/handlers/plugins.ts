/**
 * 插件与市场子命令处理函数 — 从 main.tsx 提取以实现懒加载。
 * 仅在执行 `claude plugin *` 或 `claude plugin marketplace *` 命令时动态导入。
 */
/* eslint-disable custom-rules/no-process-exit -- CLI 子命令处理函数有意执行退出 */
import figures from 'figures'
import { basename, dirname } from 'path'
import { setUseCoworkPlugins } from '../../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import {
  disableAllPlugins,
  disablePlugin,
  enablePlugin,
  installPlugin,
  uninstallPlugin,
  updatePluginCli,
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
} from '../../services/plugins/pluginCliCommands.js'
import { getPluginErrorMessage } from '../../types/plugin.js'
import { errorMessage } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js'
import { getInstallCounts } from '../../utils/plugins/installCounts.js'
import {
  isPluginInstalled,
  loadInstalledPluginsV2,
} from '../../utils/plugins/installedPluginsManager.js'
import {
  createPluginId,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js'
import {
  addMarketplaceSource,
  loadKnownMarketplacesConfig,
  refreshAllMarketplaces,
  refreshMarketplace,
  removeMarketplaceSource,
  saveMarketplaceToSettings,
} from '../../utils/plugins/marketplaceManager.js'
import { loadPluginMcpServers } from '../../utils/plugins/mcpPluginIntegration.js'
import { parseMarketplaceInput } from '../../utils/plugins/parseMarketplaceInput.js'
import {
  parsePluginIdentifier,
  scopeToSettingSource,
} from '../../utils/plugins/pluginIdentifier.js'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'
import type { PluginSource } from '../../utils/plugins/schemas.js'
import {
  type ValidationResult,
  validateManifest,
  validatePluginContents,
} from '../../utils/plugins/validatePlugin.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { plural } from '../../utils/stringUtils.js'
import { cliError, cliOk } from '../exit.js'

// 重新导出供 main.tsx 在选项定义中引用
export { VALID_INSTALLABLE_SCOPES, VALID_UPDATE_SCOPES }

/**
 * 辅助函数，用于统一处理市场命令错误。
 */
export function handleMarketplaceError(error: unknown, action: string): never {
  logError(error)
  cliError(`${figures.cross} ${action} 失败：${errorMessage(error)}`)
}

function printValidationResult(result: ValidationResult): void {
  if (result.errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(
      `${figures.cross} 发现 ${result.errors.length} ${plural(result.errors.length, '个错误')}：\n`,
    )
    result.errors.forEach(error => {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  ${figures.pointer} ${error.path}: ${error.message}`)
    })
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('')
  }
  if (result.warnings.length > 0) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(
      `${figures.warning} 发现 ${result.warnings.length} ${plural(result.warnings.length, '个警告')}：\n`,
    )
    result.warnings.forEach(warning => {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  ${figures.pointer} ${warning.path}: ${warning.message}`)
    })
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('')
  }
}

// plugin validate
export async function pluginValidateHandler(
  manifestPath: string,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const result = await validateManifest(manifestPath)

    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`正在验证 ${result.fileType} 清单：${result.filePath}\n`)
    printValidationResult(result)

    // 如果这是位于 .claude-plugin 目录内的插件清单，
    // 同时验证插件的内容文件（skills、agents、commands、hooks）。
    // 无论用户传递的是目录还是 plugin.json 路径都可以工作。
    let contentResults: ValidationResult[] = []
    if (result.fileType === 'plugin') {
      const manifestDir = dirname(result.filePath)
      if (basename(manifestDir) === '.claude-plugin') {
        contentResults = await validatePluginContents(dirname(manifestDir))
        for (const r of contentResults) {
          // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
          console.log(`正在验证 ${r.fileType}：${r.filePath}\n`)
          printValidationResult(r)
        }
      }
    }

    const allSuccess = result.success && contentResults.every(r => r.success)
    const hasWarnings =
      result.warnings.length > 0 ||
      contentResults.some(r => r.warnings.length > 0)

    if (allSuccess) {
      cliOk(
        hasWarnings
          ? `${figures.tick} 验证通过，但有警告`
          : `${figures.tick} 验证通过`,
      )
    } else {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`${figures.cross} 验证失败`)
      process.exit(1)
    }
  } catch (error) {
    logError(error)
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.error(
      `${figures.cross} 验证过程中发生意外错误：${errorMessage(error)}`,
    )
    process.exit(2)
  }
}

// plugin list (原行号 5217–5416)
export async function pluginListHandler(options: {
  json?: boolean
  available?: boolean
  cowork?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  logEvent('tengu_plugin_list_command', {})

  const installedData = loadInstalledPluginsV2()
  const { getPluginEditableScopes } = await import(
    '../../utils/plugins/pluginStartupCheck.js'
  )
  const enabledPlugins = getPluginEditableScopes()

  const pluginIds = Object.keys(installedData.plugins)

  // 一次性加载所有插件。JSON 和人类可读路径均需要：
  //  - loadErrors（用于展示每个插件的加载失败信息）
  //  - 内联插件（仅会话有效，通过 --plugin-dir 指定，source='name@inline'）
  //    这些插件不在 installedData.plugins（V2 记账）中——必须单独呈现，否则 `plugin list` 会静默忽略 --plugin-dir。
  const {
    enabled: loadedEnabled,
    disabled: loadedDisabled,
    errors: loadErrors,
  } = await loadAllPlugins()
  const allLoadedPlugins = [...loadedEnabled, ...loadedDisabled]
  const inlinePlugins = allLoadedPlugins.filter(p =>
    p.source.endsWith('@inline'),
  )
  // 路径级别的内联失败（目录不存在、读取清单前的解析错误）使用 source='inline[N]'。
  // 读取清单后的插件级错误使用 source='name@inline'。将两者都收集到会话部分——
  // 否则这些错误将不可见，因为它们没有 pluginId。
  const inlineLoadErrors = loadErrors.filter(
    e => e.source.endsWith('@inline') || e.source.startsWith('inline['),
  )

  if (options.json) {
    // 创建插件 source 到已加载插件的映射以便快速查找
    const loadedPluginMap = new Map(allLoadedPlugins.map(p => [p.source, p]))

    const plugins: Array<{
      id: string
      version: string
      scope: string
      enabled: boolean
      installPath: string
      installedAt?: string
      lastUpdated?: string
      projectPath?: string
      mcpServers?: Record<string, unknown>
      errors?: string[]
    }> = []

    for (const pluginId of pluginIds.sort()) {
      const installations = installedData.plugins[pluginId]
      if (!installations || installations.length === 0) continue

      // 查找此插件的加载错误
      const pluginName = parsePluginIdentifier(pluginId).name
      const pluginErrors = loadErrors
        .filter(
          e =>
            e.source === pluginId || ('plugin' in e && e.plugin === pluginName),
        )
        .map(getPluginErrorMessage)

      for (const installation of installations) {
        // 尝试找到已加载的插件以获取 MCP 服务器信息
        const loadedPlugin = loadedPluginMap.get(pluginId)
        let mcpServers: Record<string, unknown> | undefined

        if (loadedPlugin) {
          // 加载 MCP 服务器（如果尚未缓存）
          const servers =
            loadedPlugin.mcpServers ||
            (await loadPluginMcpServers(loadedPlugin))
          if (servers && Object.keys(servers).length > 0) {
            mcpServers = servers
          }
        }

        plugins.push({
          id: pluginId,
          version: installation.version || 'unknown',
          scope: installation.scope,
          enabled: enabledPlugins.has(pluginId),
          installPath: installation.installPath,
          installedAt: installation.installedAt,
          lastUpdated: installation.lastUpdated,
          projectPath: installation.projectPath,
          mcpServers,
          errors: pluginErrors.length > 0 ? pluginErrors : undefined,
        })
      }
    }

    // 仅会话有效的插件：scope='session'，无安装元数据。
    // 从 inlineLoadErrors（而非 loadErrors）筛选，避免已安装的同名插件通过 e.plugin 交叉污染。
    // e.plugin 回退用于处理 dirName≠manifestName 的情况：
    // createPluginFromPath 用 `${dirName}@inline` 标记错误，但随后 plugin.source 被重新赋值为 `${manifest.name}@inline`
    // （见 pluginLoader.ts 中的 loadInlinePlugins），因此当开发检出的目录如 ~/code/my-fork/ 的清单名为 'cool-plugin' 时，
    // e.source 与 p.source 不匹配。
    for (const p of inlinePlugins) {
      const servers = p.mcpServers || (await loadPluginMcpServers(p))
      const pErrors = inlineLoadErrors
        .filter(
          e => e.source === p.source || ('plugin' in e && e.plugin === p.name),
        )
        .map(getPluginErrorMessage)
      plugins.push({
        id: p.source,
        version: p.manifest.version ?? 'unknown',
        scope: 'session',
        enabled: p.enabled !== false,
        installPath: p.path,
        mcpServers:
          servers && Object.keys(servers).length > 0 ? servers : undefined,
        errors: pErrors.length > 0 ? pErrors : undefined,
      })
    }
    // 路径级别的内联失败（--plugin-dir /nonexistent）：不存在 LoadedPlugin 对象，因此上述循环无法呈现。
    // 与人类可读路径的处理方式一致，确保 JSON 消费方能看见失败信息，而非静默忽略。
    for (const e of inlineLoadErrors.filter(e =>
      e.source.startsWith('inline['),
    )) {
      plugins.push({
        id: e.source,
        version: 'unknown',
        scope: 'session',
        enabled: false,
        installPath: 'path' in e ? e.path : '',
        errors: [getPluginErrorMessage(e)],
      })
    }

    // 如果设置了 --available，则同时加载市场中可用的插件
    if (options.available) {
      const available: Array<{
        pluginId: string
        name: string
        description?: string
        marketplaceName: string
        version?: string
        source: PluginSource
        installCount?: number
      }> = []

      try {
        const [config, installCounts] = await Promise.all([
          loadKnownMarketplacesConfig(),
          getInstallCounts(),
        ])
        const { marketplaces } =
          await loadMarketplacesWithGracefulDegradation(config)

        for (const {
          name: marketplaceName,
          data: marketplace,
        } of marketplaces) {
          if (marketplace) {
            for (const entry of marketplace.plugins) {
              const pluginId = createPluginId(entry.name, marketplaceName)
              // 仅包含尚未安装的插件
              if (!isPluginInstalled(pluginId)) {
                available.push({
                  pluginId,
                  name: entry.name,
                  description: entry.description,
                  marketplaceName,
                  version: entry.version,
                  source: entry.source,
                  installCount: installCounts?.get(pluginId),
                })
              }
            }
          }
        }
      } catch {
        // 静默忽略市场加载错误
      }

      cliOk(jsonStringify({ installed: plugins, available }, null, 2))
    } else {
      cliOk(jsonStringify(plugins, null, 2))
    }
  }

  if (pluginIds.length === 0 && inlinePlugins.length === 0) {
    // 即使没有内联插件，也可能存在 inlineLoadErrors（例如 --plugin-dir 指向不存在的路径）。
    // 不要提前退出——继续进入会话部分，以便显示失败信息。
    if (inlineLoadErrors.length === 0) {
      cliOk(
        '未安装任何插件。使用 `claude plugin install` 安装插件。',
      )
    }
  }

  if (pluginIds.length > 0) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('已安装的插件：\n')
  }

  for (const pluginId of pluginIds.sort()) {
    const installations = installedData.plugins[pluginId]
    if (!installations || installations.length === 0) continue

    // 查找此插件的加载错误
    const pluginName = parsePluginIdentifier(pluginId).name
    const pluginErrors = loadErrors.filter(
      e => e.source === pluginId || ('plugin' in e && e.plugin === pluginName),
    )

    for (const installation of installations) {
      const isEnabled = enabledPlugins.has(pluginId)
      const status =
        pluginErrors.length > 0
          ? `${figures.cross} 加载失败`
          : isEnabled
            ? `${figures.tick} 已启用`
            : `${figures.cross} 已禁用`
      const version = installation.version || '未知'
      const scope = installation.scope

      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  ${figures.pointer} ${pluginId}`)
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`    版本：${version}`)
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`    作用域：${scope}`)
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`    状态：${status}`)
      for (const error of pluginErrors) {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`    错误：${getPluginErrorMessage(error)}`)
      }
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log('')
    }
  }

  if (inlinePlugins.length > 0 || inlineLoadErrors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('仅本次会话有效的插件（--plugin-dir）：\n')
    for (const p of inlinePlugins) {
      // 与上述 JSON 路径相同的 dirName≠manifestName 回退处理——错误来源使用目录基名，但 p.source 使用清单名称。
      const pErrors = inlineLoadErrors.filter(
        e => e.source === p.source || ('plugin' in e && e.plugin === p.name),
      )
      const status =
        pErrors.length > 0
          ? `${figures.cross} 加载时有错误`
          : `${figures.tick} 已加载`
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  ${figures.pointer} ${p.source}`)
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`    版本：${p.manifest.version ?? '未知'}`)
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`    路径：${p.path}`)
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`    状态：${status}`)
      for (const e of pErrors) {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`    错误：${getPluginErrorMessage(e)}`)
      }
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log('')
    }
    // 路径级别失败：没有 LoadedPlugin 对象存在。显示它们，避免 `--plugin-dir /typo` 静默无输出。
    for (const e of inlineLoadErrors.filter(e =>
      e.source.startsWith('inline['),
    )) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(
        `  ${figures.pointer} ${e.source}: ${figures.cross} ${getPluginErrorMessage(e)}\n`,
      )
    }
  }

  cliOk()
}

// marketplace add (原行号 5433–5487)
export async function marketplaceAddHandler(
  source: string,
  options: { cowork?: boolean; sparse?: string[]; scope?: string },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const parsed = await parseMarketplaceInput(source)

    if (!parsed) {
      cliError(
        `${figures.cross} 无效的市场源格式。请使用：owner/repo、https://... 或 ./path`,
      )
    }

    if ('error' in parsed) {
      cliError(`${figures.cross} ${parsed.error}`)
    }

    // 验证作用域
    const scope = options.scope ?? 'user'
    if (scope !== 'user' && scope !== 'project' && scope !== 'local') {
      cliError(
        `${figures.cross} 无效的作用域 '${scope}'。请使用：user、project 或 local`,
      )
    }
    const settingSource = scopeToSettingSource(scope)

    let marketplaceSource = parsed

    if (options.sparse && options.sparse.length > 0) {
      if (
        marketplaceSource.source === 'github' ||
        marketplaceSource.source === 'git'
      ) {
        marketplaceSource = {
          ...marketplaceSource,
          sparsePaths: options.sparse,
        }
      } else {
        cliError(
          `${figures.cross} --sparse 仅支持 github 和 git 市场源（得到：${marketplaceSource.source}）`,
        )
      }
    }

    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('正在添加市场...')

    const { name, alreadyMaterialized, resolvedSource } =
      await addMarketplaceSource(marketplaceSource, message => {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(message)
      })

    // 将意图写入指定作用域的设置文件
    saveMarketplaceToSettings(name, { source: resolvedSource }, settingSource)

    clearAllCaches()

    let sourceType = marketplaceSource.source
    if (marketplaceSource.source === 'github') {
      sourceType =
        marketplaceSource.repo as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    }
    logEvent('tengu_marketplace_added', {
      source_type:
        sourceType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    cliOk(
      alreadyMaterialized
        ? `${figures.tick} 市场 '${name}' 已存在于磁盘 — 已在 ${scope} 设置中声明`
        : `${figures.tick} 成功添加市场：${name}（已在 ${scope} 设置中声明）`,
    )
  } catch (error) {
    handleMarketplaceError(error, '添加市场')
  }
}

// marketplace list (原行号 5497–5565)
export async function marketplaceListHandler(options: {
  json?: boolean
  cowork?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const config = await loadKnownMarketplacesConfig()
    const names = Object.keys(config)

    if (options.json) {
      const marketplaces = names.sort().map(name => {
        const marketplace = config[name]
        const source = marketplace?.source
        return {
          name,
          source: source?.source,
          ...(source?.source === 'github' && { repo: source.repo }),
          ...(source?.source === 'git' && { url: source.url }),
          ...(source?.source === 'url' && { url: source.url }),
          ...(source?.source === 'directory' && { path: source.path }),
          ...(source?.source === 'file' && { path: source.path }),
          installLocation: marketplace?.installLocation,
        }
      })
      cliOk(jsonStringify(marketplaces, null, 2))
    }

    if (names.length === 0) {
      cliOk('未配置市场')
    }

    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('已配置的市场：\n')
    names.forEach(name => {
      const marketplace = config[name]
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  ${figures.pointer} ${name}`)

      if (marketplace?.source) {
        const src = marketplace.source
        if (src.source === 'github') {
          // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
          console.log(`    来源：GitHub (${src.repo})`)
        } else if (src.source === 'git') {
          // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
          console.log(`    来源：Git (${src.url})`)
        } else if (src.source === 'url') {
          // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
          console.log(`    来源：URL (${src.url})`)
        } else if (src.source === 'directory') {
          // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
          console.log(`    来源：目录 (${src.path})`)
        } else if (src.source === 'file') {
          // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
          console.log(`    来源：文件 (${src.path})`)
        }
      }
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log('')
    })

    cliOk()
  } catch (error) {
    handleMarketplaceError(error, '列出市场')
  }
}

// marketplace remove (原行号 5576–5598)
export async function marketplaceRemoveHandler(
  name: string,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    await removeMarketplaceSource(name)
    clearAllCaches()

    logEvent('tengu_marketplace_removed', {
      marketplace_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    cliOk(`${figures.tick} 成功移除市场：${name}`)
  } catch (error) {
    handleMarketplaceError(error, '移除市场')
  }
}

// marketplace update (原行号 5609–5672)
export async function marketplaceUpdateHandler(
  name: string | undefined,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    if (name) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`正在更新市场：${name}...`)

      await refreshMarketplace(name, message => {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(message)
      })

      clearAllCaches()

      logEvent('tengu_marketplace_updated', {
        marketplace_name:
          name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      cliOk(`${figures.tick} 成功更新市场：${name}`)
    } else {
      const config = await loadKnownMarketplacesConfig()
      const marketplaceNames = Object.keys(config)

      if (marketplaceNames.length === 0) {
        cliOk('未配置市场')
      }

      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`正在更新 ${marketplaceNames.length} 个市场...`)

      await refreshAllMarketplaces()
      clearAllCaches()

      logEvent('tengu_marketplace_updated_all', {
        count:
          marketplaceNames.length as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      cliOk(
        `${figures.tick} 成功更新 ${marketplaceNames.length} 个市场`,
      )
    }
  } catch (error) {
    handleMarketplaceError(error, '更新市场')
  }
}

// plugin install (原行号 5690–5721)
export async function pluginInstallHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork 只能用于 user 作用域')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `无效的作用域：${scope}。必须为以下之一：${VALID_INSTALLABLE_SCOPES.join(', ')}。`,
    )
  }
  // _PROTO_* 路由到带 PII 标记的 plugin_name/marketplace_name 列（用于 BigQuery）。
  // 未脱敏的 plugin 参数之前会记录到所有用户可访问的 additional_metadata 中——
  // 现已改为通过特权列路由。marketplace 可能在解析前为 undefined。
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_install_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await installPlugin(plugin, scope as 'user' | 'project' | 'local')
}

// plugin uninstall (原行号 5738–5769)
export async function pluginUninstallHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean; keepData?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork 只能用于 user 作用域')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `无效的作用域：${scope}。必须为以下之一：${VALID_INSTALLABLE_SCOPES.join(', ')}。`,
    )
  }
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_uninstall_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await uninstallPlugin(
    plugin,
    scope as 'user' | 'project' | 'local',
    options.keepData,
  )
}

// plugin enable (原行号 5783–5818)
export async function pluginEnableHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  let scope: (typeof VALID_INSTALLABLE_SCOPES)[number] | undefined
  if (options.scope) {
    if (
      !VALID_INSTALLABLE_SCOPES.includes(
        options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
      )
    ) {
      cliError(
        `无效的作用域 "${options.scope}"。有效作用域：${VALID_INSTALLABLE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number]
  }
  if (options.cowork && scope !== undefined && scope !== 'user') {
    cliError('--cowork 只能用于 user 作用域')
  }

  // --cowork 始终作用于 user 作用域
  if (options.cowork && scope === undefined) {
    scope = 'user'
  }

  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_enable_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: (scope ??
      'auto') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await enablePlugin(plugin, scope)
}

// plugin disable (原行号 5833–5902)
export async function pluginDisableHandler(
  plugin: string | undefined,
  options: { scope?: string; cowork?: boolean; all?: boolean },
): Promise<void> {
  if (options.all && plugin) {
    cliError('无法同时使用 --all 和指定具体插件')
  }

  if (!options.all && !plugin) {
    cliError('请指定插件名称或使用 --all 禁用所有插件')
  }

  if (options.cowork) setUseCoworkPlugins(true)

  if (options.all) {
    if (options.scope) {
      cliError('无法同时使用 --scope 和 --all')
    }

    // 此处没有 _PROTO_plugin_name —— --all 会禁用所有插件。
    // 可通过 plugin_name IS NULL 与指定插件的分支区分。
    logEvent('tengu_plugin_disable_command', {})

    await disableAllPlugins()
    return
  }

  let scope: (typeof VALID_INSTALLABLE_SCOPES)[number] | undefined
  if (options.scope) {
    if (
      !VALID_INSTALLABLE_SCOPES.includes(
        options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
      )
    ) {
      cliError(
        `无效的作用域 "${options.scope}"。有效作用域：${VALID_INSTALLABLE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number]
  }
  if (options.cowork && scope !== undefined && scope !== 'user') {
    cliError('--cowork 只能用于 user 作用域')
  }

  // --cowork 始终作用于 user 作用域
  if (options.cowork && scope === undefined) {
    scope = 'user'
  }

  const { name, marketplace } = parsePluginIdentifier(plugin!)
  logEvent('tengu_plugin_disable_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: (scope ??
      'auto') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await disablePlugin(plugin!, scope)
}

// plugin update (原行号 5918–5948)
export async function pluginUpdateHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_update_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
  })

  let scope: (typeof VALID_UPDATE_SCOPES)[number] = 'user'
  if (options.scope) {
    if (
      !VALID_UPDATE_SCOPES.includes(
        options.scope as (typeof VALID_UPDATE_SCOPES)[number],
      )
    ) {
      cliError(
        `无效的作用域 "${options.scope}"。有效作用域：${VALID_UPDATE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_UPDATE_SCOPES)[number]
  }
  if (options.cowork && scope !== 'user') {
    cliError('--cowork 只能用于 user 作用域')
  }

  await updatePluginCli(plugin, scope)
}