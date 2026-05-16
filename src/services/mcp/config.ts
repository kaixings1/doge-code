import { feature } from 'bun:bundle'
import { chmod, open, rename, stat, unlink } from 'fs/promises'
import mapValues from 'lodash-es/mapValues.js'
import memoize from 'lodash-es/memoize.js'
import { dirname, join, parse } from 'path'
import { getPlatform } from '../../utils/platform.js'
import type { PluginError } from '../../types/plugin.js'
import { getPluginErrorMessage } from '../../types/plugin.js'
import { isClaudeInChromeMCPServer } from '../../utils/claudeInChrome/common.js'
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  saveCurrentProjectConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import { getCwd } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import { getErrnoCode } from '../../utils/errors.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { safeParseJSON } from '../../utils/json.js'
import { logError } from '../../utils/log.js'
import { getPluginMcpServers } from '../../utils/plugins/mcpPluginIntegration.js'
import { loadAllPluginsCacheOnly } from '../../utils/plugins/pluginLoader.js'
import { isSettingSourceEnabled } from '../../utils/settings/constants.js'
import { getManagedFilePath } from '../../utils/settings/managedPath.js'
import { isRestrictedToPluginOnly } from '../../utils/settings/pluginOnlyPolicy.js'
import {
  getInitialSettings,
  getSettingsForSource,
} from '../../utils/settings/settings.js'
import {
  isMcpServerCommandEntry,
  isMcpServerNameEntry,
  isMcpServerUrlEntry,
  type SettingsJson,
} from '../../utils/settings/types.js'
import type { ValidationError } from '../../utils/settings/validation.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import { fetchClaudeAIMcpConfigsIfEligible } from './claudeai.js'
import { expandEnvVarsInString } from './envExpansion.js'
import {
  type ConfigScope,
  type McpHTTPServerConfig,
  type McpJsonConfig,
  McpJsonConfigSchema,
  type McpServerConfig,
  McpServerConfigSchema,
  type McpSSEServerConfig,
  type McpStdioServerConfig,
  type McpWebSocketServerConfig,
  type ScopedMcpServerConfig,
} from './types.js'
import { getProjectMcpServerStatus } from './utils.js'

/**
 * 获取托管 MCP 配置文件的路径
 */
export function getEnterpriseMcpFilePath(): string {
  return join(getManagedFilePath(), 'managed-mcp.json')
}

/**
 * 内部工具：为服务器配置添加作用域标识
 */
function addScopeToServers(
  servers: Record<string, McpServerConfig> | undefined,
  scope: ConfigScope,
): Record<string, ScopedMcpServerConfig> {
  if (!servers) {
    return {}
  }
  const scopedServers: Record<string, ScopedMcpServerConfig> = {}
  for (const [name, config] of Object.entries(servers)) {
    scopedServers[name] = { ...config, scope }
  }
  return scopedServers
}

/**
 * 内部工具：将 MCP 配置写入 .mcp.json 文件。
 * 保留文件权限并在重命名前刷新到磁盘。
 * 使用原始路径进行重命名（不跟随符号链接）。
 */
async function writeMcpjsonFile(config: McpJsonConfig): Promise<void> {
  const mcpJsonPath = join(getCwd(), '.mcp.json')

  // 读取现有文件权限以便保留
  let existingMode: number | undefined
  try {
    const stats = await stat(mcpJsonPath)
    existingMode = stats.mode
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code !== 'ENOENT') {
      throw e
    }
    // 文件尚不存在 —— 无需保留权限
  }

  // 写入临时文件，刷新到磁盘，然后原子重命名
  const tempPath = `${mcpJsonPath}.tmp.${process.pid}.${Date.now()}`
  const handle = await open(tempPath, 'w', existingMode ?? 0o644)
  try {
    await handle.writeFile(jsonStringify(config, null, 2), {
      encoding: 'utf8',
    })
    await handle.datasync()
  } finally {
    await handle.close()
  }

  try {
    // 在重命名前恢复原始文件权限到临时文件
    if (existingMode !== undefined) {
      await chmod(tempPath, existingMode)
    }
    await rename(tempPath, mcpJsonPath)
  } catch (e: unknown) {
    // 失败时清理临时文件
    try {
      await unlink(tempPath)
    } catch {
      // 尽力清理
    }
    throw e
  }
}

/**
 * 从服务器配置中提取命令数组（仅限 stdio 服务器）
 * 非 stdio 服务器返回 null
 */
function getServerCommandArray(config: McpServerConfig): string[] | null {
  // 非 stdio 服务器没有命令
  if (config.type !== undefined && config.type !== 'stdio') {
    return null
  }
  const stdioConfig = config as McpStdioServerConfig
  return [stdioConfig.command, ...(stdioConfig.args ?? [])]
}

/**
 * 检查两个命令数组是否完全匹配
 */
function commandArraysMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((val, idx) => val === b[idx])
}

/**
 * 从服务器配置中提取 URL（仅限远程服务器）
 * stdio/sdk 服务器返回 null
 */
function getServerUrl(config: McpServerConfig): string | null {
  return 'url' in config ? config.url : null
}

/**
 * CCR 代理 URL 路径标记。在远程会话中，claude.ai 连接器通过 --mcp-config
 * 传入，URL 被重写以通过 CCR/session-ingress SHTTP 代理路由。
 * 原始供应商 URL 保留在 mcp_url 查询参数中，以便代理知道转发到哪里。
 * 参见 api-go/ccr/internal/ccrshared/mcp_url_rewriter.go
 * 和 api-go/ccr/internal/mcpproxy/proxy.go。
 */
const CCR_PROXY_PATH_MARKERS = [
  '/v2/session_ingress/shttp/mcp/',
  '/v2/ccr-sessions/',
]

/**
 * 如果 URL 是 CCR 代理 URL，则从 mcp_url 查询参数中提取原始供应商 URL。
 * 否则返回未经修改的 URL。这使得基于签名的去重能够将插件的原始供应商 URL
 * 与连接器的重写代理 URL 匹配（当两者指向同一 MCP 服务器时）。
 */
export function unwrapCcrProxyUrl(url: string): string {
  if (!CCR_PROXY_PATH_MARKERS.some(m => url.includes(m))) {
    return url
  }
  try {
    const parsed = new URL(url)
    const original = parsed.searchParams.get('mcp_url')
    return original || url
  } catch {
    return url
  }
}

/**
 * 计算 MCP 服务器配置的去重签名。
 * 具有相同签名的两个配置被视为"同一服务器"用于插件去重。
 * 忽略环境变量（插件始终注入 CLAUDE_PLUGIN_ROOT）和标头
 *（相同 URL = 相同服务器，无论认证如何）。
 * 仅对既无命令也无 URL 的配置（sdk 类型）返回 null。
 */
export function getMcpServerSignature(config: McpServerConfig): string | null {
  const cmd = getServerCommandArray(config)
  if (cmd) {
    return `stdio:${jsonStringify(cmd)}`
  }
  const url = getServerUrl(config)
  if (url) {
    return `url:${unwrapCcrProxyUrl(url)}`
  }
  return null
}

/**
 * 过滤插件 MCP 服务器，丢弃签名与手动配置的服务器或更早加载的插件服务器匹配的条目。
 * 手动配置优先于插件；插件之间，先加载的优先。
 *
 * 插件服务器使用命名空间 `plugin:name:server`，因此在合并中不会与手动服务器发生键冲突
 * —— 此基于内容的检查捕获了两者实际启动相同底层进程/连接的情况。
 */
export function dedupPluginMcpServers(
  pluginServers: Record<string, ScopedMcpServerConfig>,
  manualServers: Record<string, ScopedMcpServerConfig>,
): {
  servers: Record<string, ScopedMcpServerConfig>
  suppressed: Array<{ name: string; duplicateOf: string }>
} {
  // 构建签名 -> 服务器名称的映射，以便报告重复项匹配到哪个服务器
  const manualSigs = new Map<string, string>()
  for (const [name, config] of Object.entries(manualServers)) {
    const sig = getMcpServerSignature(config)
    if (sig && !manualSigs.has(sig)) manualSigs.set(sig, name)
  }

  const servers: Record<string, ScopedMcpServerConfig> = {}
  const suppressed: Array<{ name: string; duplicateOf: string }> = []
  const seenPluginSigs = new Map<string, string>()
  for (const [name, config] of Object.entries(pluginServers)) {
    const sig = getMcpServerSignature(config)
    if (sig === null) {
      servers[name] = config
      continue
    }
    const manualDup = manualSigs.get(sig)
    if (manualDup !== undefined) {
      logForDebugging(
        `Suppressing plugin MCP server "${name}": duplicates manually-configured "${manualDup}"`,
      )
      suppressed.push({ name, duplicateOf: manualDup })
      continue
    }
    const pluginDup = seenPluginSigs.get(sig)
    if (pluginDup !== undefined) {
      logForDebugging(
        `Suppressing plugin MCP server "${name}": duplicates earlier plugin server "${pluginDup}"`,
      )
      suppressed.push({ name, duplicateOf: pluginDup })
      continue
    }
    seenPluginSigs.set(sig, name)
    servers[name] = config
  }
  return { servers, suppressed }
}

/**
 * 过滤 claude.ai 连接器，丢弃签名与已启用的手动配置服务器匹配的条目。
 * 手动配置优先：编写 .mcp.json 或运行 `claude mcp add` 的用户
 * 表达了比在 Web UI 中切换的连接器更高的意图。
 *
 * 连接器键为 `claude.ai <DisplayName>`，因此在合并中不会与手动服务器
 * 发生键冲突——此基于内容的检查捕获了两者指向同一底层 URL 的情况
 *（例如 `mcp__slack__*` 和 `mcp__claude_ai_Slack__*` 都访问 mcp.slack.com，
 * 每个回合浪费约 600 字符）。
 *
 * 只有已启用的手动服务器才作为去重目标——禁用的手动服务器不得
 * 抑制其连接器副本，否则两者都无法运行。
 */
export function dedupClaudeAiMcpServers(
  claudeAiServers: Record<string, ScopedMcpServerConfig>,
  manualServers: Record<string, ScopedMcpServerConfig>,
): {
  servers: Record<string, ScopedMcpServerConfig>
  suppressed: Array<{ name: string; duplicateOf: string }>
} {
  const manualSigs = new Map<string, string>()
  for (const [name, config] of Object.entries(manualServers)) {
    if (isMcpServerDisabled(name)) continue
    const sig = getMcpServerSignature(config)
    if (sig && !manualSigs.has(sig)) manualSigs.set(sig, name)
  }

  const servers: Record<string, ScopedMcpServerConfig> = {}
  const suppressed: Array<{ name: string; duplicateOf: string }> = []
  for (const [name, config] of Object.entries(claudeAiServers)) {
    const sig = getMcpServerSignature(config)
    const manualDup = sig !== null ? manualSigs.get(sig) : undefined
    if (manualDup !== undefined) {
      logForDebugging(
        `Suppressing claude.ai connector "${name}": duplicates manually-configured "${manualDup}"`,
      )
      suppressed.push({ name, duplicateOf: manualDup })
      continue
    }
    servers[name] = config
  }
  return { servers, suppressed }
}

/**
 * 将带通配符的 URL 模式转换为 RegExp
 * 支持 * 作为匹配任意字符的通配符
 * 示例：
 *   "https://example.com/*" 匹配 "https://example.com/api/v1"
 *   "https://*.example.com/*" 匹配 "https://api.example.com/path"
 *   "https://example.com:*\/*" 匹配任意端口
 */
function urlPatternToRegex(pattern: string): RegExp {
  // 转义正则特殊字符，但保留 *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  // 将 * 替换为正则等价形式（匹配任意字符）
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}

/**
 * 检查 URL 是否匹配带通配符支持的模式
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  const regex = urlPatternToRegex(pattern)
  return regex.test(url)
}

/**
 * 获取用于 MCP 服务器允许列表策略的设置。
 * 当 policySettings 中设置了 allowManagedMcpServersOnly 时，仅托管设置
 * 控制允许哪些服务器。否则，返回合并的设置。
 */
function getMcpAllowlistSettings(): SettingsJson {
  if (shouldAllowManagedMcpServersOnly()) {
    return getSettingsForSource('policySettings') ?? {}
  }
  return getInitialSettings()
}

/**
 * 获取用于 MCP 服务器拒绝列表策略的设置。
 * 拒绝列表始终从所有来源合并——即使设置了 allowManagedMcpServersOnly，
 * 用户也可以自行拒绝服务器。
 */
function getMcpDenylistSettings(): SettingsJson {
  return getInitialSettings()
}

/**
 * 检查 MCP 服务器是否被企业策略拒绝
 * 检查基于名称、命令和 URL 的限制
 * @param serverName 要检查的服务器名称
 * @param config 可选的服务器配置，用于命令/URL 匹配
 * @returns 被拒绝返回 true，不在拒绝列表中返回 false
 */
function isMcpServerDenied(
  serverName: string,
  config?: McpServerConfig,
): boolean {
  const settings = getMcpDenylistSettings()
  if (!settings.deniedMcpServers) {
    return false // 无限制
  }

  // 检查基于名称的拒绝
  for (const entry of settings.deniedMcpServers) {
    if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
      return true
    }
  }

  // 检查基于命令的拒绝（仅 stdio 服务器）和基于 URL 的拒绝（仅远程服务器）
  if (config) {
    const serverCommand = getServerCommandArray(config)
    if (serverCommand) {
      for (const entry of settings.deniedMcpServers) {
        if (
          isMcpServerCommandEntry(entry) &&
          commandArraysMatch(entry.serverCommand, serverCommand)
        ) {
          return true
        }
      }
    }

    const serverUrl = getServerUrl(config)
    if (serverUrl) {
      for (const entry of settings.deniedMcpServers) {
        if (
          isMcpServerUrlEntry(entry) &&
          urlMatchesPattern(serverUrl, entry.serverUrl)
        ) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * 检查 MCP 服务器是否被企业策略允许
 * 检查基于名称、命令和 URL 的限制
 * @param serverName 要检查的服务器名称
 * @param config 可选的服务器配置，用于命令/URL 匹配
 * @returns 允许返回 true，被策略阻止返回 false
 */
function isMcpServerAllowedByPolicy(
  serverName: string,
  config?: McpServerConfig,
): boolean {
  // 拒绝列表具有绝对优先权
  if (isMcpServerDenied(serverName, config)) {
    return false
  }

  const settings = getMcpAllowlistSettings()
  if (!settings.allowedMcpServers) {
    return true // 无允许列表限制
  }

  // 空允许列表意味着阻止所有服务器
  if (settings.allowedMcpServers.length === 0) {
    return false
  }

  // 检查允许列表是否包含任何基于命令或 URL 的条目
  const hasCommandEntries = settings.allowedMcpServers.some(
    isMcpServerCommandEntry,
  )
  const hasUrlEntries = settings.allowedMcpServers.some(isMcpServerUrlEntry)

  if (config) {
    const serverCommand = getServerCommandArray(config)
    const serverUrl = getServerUrl(config)

    if (serverCommand) {
      // 这是一个 stdio 服务器
      if (hasCommandEntries) {
        // 如果存在 ANY serverCommand 条目，stdio 服务器必须匹配其中之一
        for (const entry of settings.allowedMcpServers) {
          if (
            isMcpServerCommandEntry(entry) &&
            commandArraysMatch(entry.serverCommand, serverCommand)
          ) {
            return true
          }
        }
        return false // Stdio 服务器不匹配任何命令条目
      } else {
        // 无命令条目，检查基于名称的允许
        for (const entry of settings.allowedMcpServers) {
          if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
            return true
          }
        }
        return false
      }
    } else if (serverUrl) {
      // 这是一个远程服务器（sse、http、ws 等）
      if (hasUrlEntries) {
        // 如果存在 ANY serverUrl 条目，远程服务器必须匹配其中之一
        for (const entry of settings.allowedMcpServers) {
          if (
            isMcpServerUrlEntry(entry) &&
            urlMatchesPattern(serverUrl, entry.serverUrl)
          ) {
            return true
          }
        }
        return false // 远程服务器不匹配任何 URL 条目
      } else {
        // 无 URL 条目，检查基于名称的允许
        for (const entry of settings.allowedMcpServers) {
          if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
            return true
          }
        }
        return false
      }
    } else {
      // 未知服务器类型 - 仅检查基于名称的允许
      for (const entry of settings.allowedMcpServers) {
        if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
          return true
        }
      }
      return false
    }
  }

  // 未提供配置 - 仅检查基于名称的允许
  for (const entry of settings.allowedMcpServers) {
    if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
      return true
    }
  }
  return false
}

/**
 * 按托管策略（allowedMcpServers / deniedMcpServers）过滤 MCP 服务器配置记录。
 * 被策略阻止的服务器将被丢弃，其名称返回给调用者以便警告用户。
 *
 * 适用于绕过 getClaudeCodeMcpConfigs() 中策略过滤器的用户控制配置入口点：
 * --mcp-config (main.tsx) 和 mcp_set_servers 控制消息
 *（print.ts，SDK V2 Query.setMcpServers()）。
 *
 * SDK 类型的服务器豁免——它们是 SDK 管理的传输占位符，不是 CLI 管理的连接。
 * CLI 从不为其启动进程或打开网络连接；工具调用通过 mcp_tool_call 路由回 SDK。
 * 基于 URL/命令的允许列表条目对它们无意义（无 url，无命令），
 * 按名称筛选会在 installPluginsAndApplyMcpInBackground 的 sdkMcpConfigs
 * 传递过程中静默丢弃它们。
 *
 * 泛型没有类型约束，因为两个调用点使用不同的配置类型系列：
 * main.tsx 使用 ScopedMcpServerConfig（服务类型，args: string[] 必需），
 * print.ts 使用 McpServerConfigForProcessTransport（SDK 传输类型，args?: string[] 可选）。
 * 两者与 isMcpServerAllowedByPolicy 实际读取的内容（type/url/command/args）
 * 在结构上兼容——策略检查仅读取，从不要求任何字段存在。
 * 因此 `as McpServerConfig` 的类型收窄是安全的；下游检查容忍
 * 缺失/未定义的字段：config 是可选的，getServerCommandArray
 * 通过 ?? [] 将 args 默认为 []。
 *
 */
export function filterMcpServersByPolicy<T>(configs: Record<string, T>): {
  allowed: Record<string, T>
  blocked: string[]
} {
  const allowed: Record<string, T> = {}
  const blocked: string[] = []
  for (const [name, config] of Object.entries(configs)) {
    const c = config as McpServerConfig
    if (c.type === 'sdk' || isMcpServerAllowedByPolicy(name, c)) {
      allowed[name] = config
    } else {
      blocked.push(name)
    }
  }
  return { allowed, blocked }
}

/**
 * 内部工具：展开 MCP 服务器配置中的环境变量
 */
function expandEnvVars(config: McpServerConfig): {
  expanded: McpServerConfig
  missingVars: string[]
} {
  const missingVars: string[] = []

  function expandString(str: string): string {
    const { expanded, missingVars: vars } = expandEnvVarsInString(str)
    missingVars.push(...vars)
    return expanded
  }

  let expanded: McpServerConfig

  switch (config.type) {
    case undefined:
    case 'stdio': {
      const stdioConfig = config as McpStdioServerConfig
      expanded = {
        ...stdioConfig,
        command: expandString(stdioConfig.command),
        args: stdioConfig.args.map(expandString),
        env: stdioConfig.env
          ? mapValues(stdioConfig.env, expandString)
          : undefined,
      }
      break
    }
    case 'sse':
    case 'http':
    case 'ws': {
      const remoteConfig = config as
        | McpSSEServerConfig
        | McpHTTPServerConfig
        | McpWebSocketServerConfig
      expanded = {
        ...remoteConfig,
        url: expandString(remoteConfig.url),
        headers: remoteConfig.headers
          ? mapValues(remoteConfig.headers, expandString)
          : undefined,
      }
      break
    }
    case 'sse-ide':
    case 'ws-ide':
      expanded = config
      break
    case 'sdk':
      expanded = config
      break
    case 'claudeai-proxy':
      expanded = config
      break
  }

  return {
    expanded,
    missingVars: [...new Set(missingVars)],
  }
}

/**
 * 添加新的 MCP 服务器配置
 * @param name 服务器名称
 * @param config 服务器配置
 * @param scope 配置作用域
 * @throws 如果名称无效、服务器已存在或配置无效则抛出错误
 */
export async function addMcpConfig(
  name: string,
  config: unknown,
  scope: ConfigScope,
): Promise<void> {
  if (name.match(/[^a-zA-Z0-9_-]/)) {
    throw new Error(
      `名称 ${name} 无效。名称只能包含字母、数字、连字符和下划线。`,
    )
  }

  // 阻止使用保留的服务器名称 "claude-in-chrome"
  if (isClaudeInChromeMCPServer(name)) {
    throw new Error(`无法添加 MCP 服务器 "${name}"：该名称已保留。`)
  }

  if (feature('CHICAGO_MCP')) {
    const { isComputerUseMCPServer } = await import(
      '../../utils/computerUse/common.js'
    )
    if (isComputerUseMCPServer(name)) {
      throw new Error(`无法添加 MCP 服务器 "${name}"：此名称已被保留。`)
    }
  }

  // 当企业 MCP 配置存在时阻止添加服务器（它拥有独占控制权）
  if (doesEnterpriseMcpConfigExist()) {
    throw new Error(
      `无法添加 MCP 服务器：企业 MCP 配置已激活并独占控制 MCP 服务器`,
    )
  }

  // 首先验证配置（基于命令的策略检查需要）
  const result = McpServerConfigSchema().safeParse(config)
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join(', ')
    throw new Error(`配置无效：${formattedErrors}`)
  }
  const validatedConfig = result.data

  // 检查拒绝列表（携带配置以支持基于命令的检查）
  if (isMcpServerDenied(name, validatedConfig)) {
    throw new Error(
      `无法添加 MCP 服务器 "${name}"：企业策略明确阻止此服务器`,
    )
  }

  // 检查允许列表（携带配置以支持基于命令的检查）
  if (!isMcpServerAllowedByPolicy(name, validatedConfig)) {
    throw new Error(
      `无法添加 MCP 服务器 "${name}"：企业策略不允许`,
    )
  }

  // 检查服务器是否已存在于目标作用域中
  switch (scope) {
    case 'project': {
      const { servers } = getProjectMcpConfigsFromCwd()
      if (servers[name]) {
        throw new Error(`MCP 服务器 ${name} 已存在于 .mcp.json 中`)
      }
      break
    }
    case 'user': {
      const globalConfig = getGlobalConfig()
      if (globalConfig.mcpServers?.[name]) {
        throw new Error(`MCP 服务器 ${name} 已存在于用户配置中`)
      }
      break
    }
    case 'local': {
      const projectConfig = getCurrentProjectConfig()
      if (projectConfig.mcpServers?.[name]) {
        throw new Error(`MCP 服务器 ${name} 已存在于本地配置中`)
      }
      break
    }
    case 'dynamic':
      throw new Error('无法添加到作用域：dynamic')
    case 'enterprise':
      throw new Error('无法添加到作用域：enterprise')
    case 'claudeai':
      throw new Error('无法添加到作用域：claudeai')
  }

  // 根据作用域添加
  switch (scope) {
    case 'project': {
      const { servers: existingServers } = getProjectMcpConfigsFromCwd()

      const mcpServers: Record<string, McpServerConfig> = {}
      for (const [serverName, serverConfig] of Object.entries(
        existingServers,
      )) {
        const { scope: _, ...configWithoutScope } = serverConfig
        mcpServers[serverName] = configWithoutScope
      }
      mcpServers[name] = validatedConfig
      const mcpConfig = { mcpServers }

      // 写回 .mcp.json
      try {
        await writeMcpjsonFile(mcpConfig)
      } catch (error) {
        throw new Error(`写入 .mcp.json 失败：${error}`)
      }
      break
    }

    case 'user': {
      saveGlobalConfig(current => ({
        ...current,
        mcpServers: {
          ...current.mcpServers,
          [name]: validatedConfig,
        },
      }))
      break
    }

    case 'local': {
      saveCurrentProjectConfig(current => ({
        ...current,
        mcpServers: {
          ...current.mcpServers,
          [name]: validatedConfig,
        },
      }))
      break
    }

    default:
      throw new Error(`无法添加到作用域：${scope}`)
  }
}

/**
 * 移除 MCP 服务器配置
 * @param name 要移除的服务器名称
 * @param scope 配置作用域
 * @throws 如果在指定作用域中未找到服务器则抛出错误
 */
export async function removeMcpConfig(
  name: string,
  scope: ConfigScope,
): Promise<void> {
  switch (scope) {
    case 'project': {
      const { servers: existingServers } = getProjectMcpConfigsFromCwd()

      if (!existingServers[name]) {
        throw new Error(`在 .mcp.json 中未找到名为 ${name} 的 MCP 服务器`)
      }

      // 写回 .mcp.json 时移除作用域信息
      const mcpServers: Record<string, McpServerConfig> = {}
      for (const [serverName, serverConfig] of Object.entries(
        existingServers,
      )) {
        if (serverName !== name) {
          const { scope: _, ...configWithoutScope } = serverConfig
          mcpServers[serverName] = configWithoutScope
        }
      }
      const mcpConfig = { mcpServers }
      try {
        await writeMcpjsonFile(mcpConfig)
      } catch (error) {
        throw new Error(`从 .mcp.json 移除失败：${error}`)
      }
      break
    }

    case 'user': {
      const config = getGlobalConfig()
      if (!config.mcpServers?.[name]) {
        throw new Error(`未找到用户级 MCP 服务器：${name}`)
      }
      saveGlobalConfig(current => {
        const { [name]: _, ...restMcpServers } = current.mcpServers ?? {}
        return {
          ...current,
          mcpServers: restMcpServers,
        }
      })
      break
    }

    case 'local': {
      // 在更新前检查服务器是否存在
      const config = getCurrentProjectConfig()
      if (!config.mcpServers?.[name]) {
        throw new Error(`未找到项目本地 MCP 服务器：${name}`)
      }
      saveCurrentProjectConfig(current => {
        const { [name]: _, ...restMcpServers } = current.mcpServers ?? {}
        return {
          ...current,
          mcpServers: restMcpServers,
        }
      })
      break
    }

    default:
      throw new Error(`无法从作用域移除：${scope}`)
  }
}

/**
 * 仅从当前目录获取 MCP 配置（不遍历父目录）。
 * 由 addMcpConfig 和 removeMcpConfig 使用，用于修改本地的 .mcp.json 文件。
 * 导出以供测试使用。
 *
 * @returns 包含作用域信息的服务器配置及当前目录 .mcp.json 的验证错误
 */
export function getProjectMcpConfigsFromCwd(): {
  servers: Record<string, ScopedMcpServerConfig>
  errors: ValidationError[]
} {
  // 检查项目源是否已启用
  if (!isSettingSourceEnabled('projectSettings')) {
    return { servers: {}, errors: [] }
  }

  const mcpJsonPath = join(getCwd(), '.mcp.json')

  const { config, errors } = parseMcpConfigFromFilePath({
    filePath: mcpJsonPath,
    expandVars: true,
    scope: 'project',
  })

  // .mcp.json 文件不存在是预期情况，但格式错误的文件应报告错误
  if (!config) {
    const nonMissingErrors = errors.filter(
      e => !e.message.startsWith('MCP 配置文件未找到'),
    )
    if (nonMissingErrors.length > 0) {
      logForDebugging(
        `MCP config errors for ${mcpJsonPath}: ${jsonStringify(nonMissingErrors.map(e => e.message))}`,
        { level: 'error' },
      )
      return { servers: {}, errors: nonMissingErrors }
    }
    return { servers: {}, errors: [] }
  }

  return {
    servers: config.mcpServers
      ? addScopeToServers(config.mcpServers, 'project')
      : {},
    errors: errors || [],
  }
}

/**
 * 获取特定作用域的所有 MCP 配置
 * @param scope 配置作用域
 * @returns 包含作用域信息的服务器配置及验证错误
 */
export function getMcpConfigsByScope(
  scope: 'project' | 'user' | 'local' | 'enterprise',
): {
  servers: Record<string, ScopedMcpServerConfig>
  errors: ValidationError[]
} {
  // 检查此源是否已启用
  const sourceMap: Record<
    string,
    'projectSettings' | 'userSettings' | 'localSettings'
  > = {
    project: 'projectSettings',
    user: 'userSettings',
    local: 'localSettings',
  }

  if (scope in sourceMap && !isSettingSourceEnabled(sourceMap[scope]!)) {
    return { servers: {}, errors: [] }
  }

  switch (scope) {
    case 'project': {
      const allServers: Record<string, ScopedMcpServerConfig> = {}
      const allErrors: ValidationError[] = []

      // 构建要检查的目录列表
      const dirs: string[] = []
      let currentDir = getCwd()

      while (currentDir !== parse(currentDir).root) {
        dirs.push(currentDir)
        currentDir = dirname(currentDir)
      }

      // 从根目录向下到 CWD 处理（使较近的目录中的文件具有更高优先级）
      for (const dir of dirs.reverse()) {
        const mcpJsonPath = join(dir, '.mcp.json')

        const { config, errors } = parseMcpConfigFromFilePath({
          filePath: mcpJsonPath,
          expandVars: true,
          scope: 'project',
        })

        // 父目录中缺少 .mcp.json 是预期情况，但格式错误的文件应报告错误
        if (!config) {
          const nonMissingErrors = errors.filter(
            e => !e.message.startsWith('MCP 配置文件未找到'),
          )
          if (nonMissingErrors.length > 0) {
            logForDebugging(
              `MCP config errors for ${mcpJsonPath}: ${jsonStringify(nonMissingErrors.map(e => e.message))}`,
              { level: 'error' },
            )
            allErrors.push(...nonMissingErrors)
          }
          continue
        }

        if (config.mcpServers) {
          // 合并服务器，距离 CWD 较近的文件覆盖父目录配置
          Object.assign(allServers, addScopeToServers(config.mcpServers, scope))
        }

        if (errors.length > 0) {
          allErrors.push(...errors)
        }
      }

      return {
        servers: allServers,
        errors: allErrors,
      }
    }
    case 'user': {
      const mcpServers = getGlobalConfig().mcpServers
      if (!mcpServers) {
        return { servers: {}, errors: [] }
      }

      const { config, errors } = parseMcpConfig({
        configObject: { mcpServers },
        expandVars: true,
        scope: 'user',
      })

      return {
        servers: addScopeToServers(config?.mcpServers, scope),
        errors,
      }
    }
    case 'local': {
      const mcpServers = getCurrentProjectConfig().mcpServers
      if (!mcpServers) {
        return { servers: {}, errors: [] }
      }

      const { config, errors } = parseMcpConfig({
        configObject: { mcpServers },
        expandVars: true,
        scope: 'local',
      })

      return {
        servers: addScopeToServers(config?.mcpServers, scope),
        errors,
      }
    }
    case 'enterprise': {
      const enterpriseMcpPath = getEnterpriseMcpFilePath()

      const { config, errors } = parseMcpConfigFromFilePath({
        filePath: enterpriseMcpPath,
        expandVars: true,
        scope: 'enterprise',
      })

      // 缺少企业配置文件是预期情况，但格式错误的文件应报告错误
      if (!config) {
        const nonMissingErrors = errors.filter(
          e => !e.message.startsWith('MCP 配置文件未找到'),
        )
        if (nonMissingErrors.length > 0) {
          logForDebugging(
            `Enterprise MCP config errors for ${enterpriseMcpPath}: ${jsonStringify(nonMissingErrors.map(e => e.message))}`,
            { level: 'error' },
          )
          return { servers: {}, errors: nonMissingErrors }
        }
        return { servers: {}, errors: [] }
      }

      return {
        servers: addScopeToServers(config.mcpServers, scope),
        errors,
      }
    }
  }
}

/**
 * 按名称获取 MCP 服务器配置
 * @param name 服务器名称
 * @returns 包含作用域的服务器配置，未找到则返回 null
 */
export function getMcpConfigByName(name: string): ScopedMcpServerConfig | null {
  const { servers: enterpriseServers } = getMcpConfigsByScope('enterprise')

  // 当 MCP 被锁定为仅插件时，只有企业服务器可通过名称访问。
  // 用户/项目/本地服务器被阻止——与 getClaudeCodeMcpConfigs() 相同。
  if (isRestrictedToPluginOnly('mcp')) {
    return enterpriseServers[name] ?? null
  }

  const { servers: userServers } = getMcpConfigsByScope('user')
  const { servers: projectServers } = getMcpConfigsByScope('project')
  const { servers: localServers } = getMcpConfigsByScope('local')

  if (enterpriseServers[name]) {
    return enterpriseServers[name]
  }
  if (localServers[name]) {
    return localServers[name]
  }
  if (projectServers[name]) {
    return projectServers[name]
  }
  if (userServers[name]) {
    return userServers[name]
  }

  return null
}

/**
 * 获取 Claude Code MCP 配置（返回集中排除 claude.ai 服务器——
 * 它们由调用者单独获取并合并）。
 * 速度很快：仅本地文件读取；关键路径上没有 await 网络调用。
 * 可选的 extraDedupTargets promise（例如正在进行的 claude.ai 连接器获取）
 * 仅在 loadAllPluginsCacheOnly() 完成后才 await，因此两者重叠而非串行执行。
 * @returns 包含适当作用域的 Claude Code 服务器配置
 */
export async function getClaudeCodeMcpConfigs(
  dynamicServers: Record<string, ScopedMcpServerConfig> = {},
  extraDedupTargets: Promise<
    Record<string, ScopedMcpServerConfig>
  > = Promise.resolve({}),
): Promise<{
  servers: Record<string, ScopedMcpServerConfig>
  errors: PluginError[]
}> {
  const { servers: enterpriseServers } = getMcpConfigsByScope('enterprise')

  // 如果企业 MCP 配置存在，则不使用其他配置；它对所有 MCP 服务器拥有独占控制权
  // （企业客户通常不希望其用户能够添加自己的 MCP 服务器）。
  if (doesEnterpriseMcpConfigExist()) {
    // 对企业服务器应用策略过滤
    const filtered: Record<string, ScopedMcpServerConfig> = {}

    for (const [name, serverConfig] of Object.entries(enterpriseServers)) {
      if (!isMcpServerAllowedByPolicy(name, serverConfig)) {
        continue
      }
      filtered[name] = serverConfig
    }

    return { servers: filtered, errors: [] }
  }

  // 加载其他作用域——除非托管策略将 MCP 锁定为仅插件。
  // 与上面的企业独占块不同，此处保留插件服务器。
  const mcpLocked = isRestrictedToPluginOnly('mcp')
  const noServers: { servers: Record<string, ScopedMcpServerConfig> } = {
    servers: {},
  }
  const { servers: userServers } = mcpLocked
    ? noServers
    : getMcpConfigsByScope('user')
  const { servers: projectServers } = mcpLocked
    ? noServers
    : getMcpConfigsByScope('project')
  const { servers: localServers } = mcpLocked
    ? noServers
    : getMcpConfigsByScope('local')

  // 加载插件 MCP 服务器
  const pluginMcpServers: Record<string, ScopedMcpServerConfig> = {}

  const pluginResult = await loadAllPluginsCacheOnly()

  // 收集服务器加载期间特定于 MCP 的错误
  const mcpErrors: PluginError[] = []

  // 记录任何插件加载错误——生产中切勿静默失败
  if (pluginResult.errors.length > 0) {
    for (const error of pluginResult.errors) {
      // 仅当确实与 MCP 相关时才记录为 MCP 错误
      // 否则仅记录为调试信息，因为插件可能没有 MCP 服务器
      if (
        error.type === 'mcp-config-invalid' ||
        error.type === 'mcpb-download-failed' ||
        error.type === 'mcpb-extract-failed' ||
        error.type === 'mcpb-invalid-manifest'
      ) {
        const errorMessage = `Plugin MCP loading error - ${error.type}: ${getPluginErrorMessage(error)}`
        logError(new Error(errorMessage))
      } else {
        // 插件不存在或不可用——这很常见，不一定是错误
        // 插件系统会在可能的情况下处理安装
        const errorType = error.type
        logForDebugging(
          `Plugin not available for MCP: ${error.source} - error type: ${errorType}`,
        )
      }
    }
  }

  // 并行处理已启用插件的 MCP 服务器
  const pluginServerResults = await Promise.all(
    pluginResult.enabled.map(plugin => getPluginMcpServers(plugin, mcpErrors)),
  )
  for (const servers of pluginServerResults) {
    if (servers) {
      Object.assign(pluginMcpServers, servers)
    }
  }

  // 将服务器加载中的 MCP 特定错误添加到插件错误中
  if (mcpErrors.length > 0) {
    for (const error of mcpErrors) {
      const errorMessage = `Plugin MCP server error - ${error.type}: ${getPluginErrorMessage(error)}`
      logError(new Error(errorMessage))
    }
  }

  // 仅过滤已批准的项目服务器
  const approvedProjectServers: Record<string, ScopedMcpServerConfig> = {}
  for (const [name, config] of Object.entries(projectServers)) {
    if (getProjectMcpServerStatus(name) === 'approved') {
      approvedProjectServers[name] = config
    }
  }

  // 对插件服务器进行去重，排除与手动配置的服务器（以及彼此）重复的条目。
  // 插件服务器键使用命名空间 `plugin:x:y`，因此它们不会与下方合并中的
  // 手动键冲突——此基于内容的过滤器捕获了两者启动同一底层进程/连接的情况。
  // 只有实际会连接的服务器才是有效的去重目标——禁用的手动服务器不得
  // 抑制插件服务器，否则两者都不会运行
  //（手动服务器在连接时按名称跳过；插件在此处被移除）。
  const extraTargets = await extraDedupTargets
  const enabledManualServers: Record<string, ScopedMcpServerConfig> = {}
  for (const [name, config] of Object.entries({
    ...userServers,
    ...approvedProjectServers,
    ...localServers,
    ...dynamicServers,
    ...extraTargets,
  })) {
    if (
      !isMcpServerDisabled(name) &&
      isMcpServerAllowedByPolicy(name, config)
    ) {
      enabledManualServers[name] = config
    }
  }
  // 分离已禁用/被策略阻止的插件服务器，使它们不会在与已启用的重复项
  // 的先加载者获胜竞争中胜出——与上述相同的不变约束。
  // 去重后它们会被合并回去，因此仍会在 /mcp 中显示
  //（此函数末尾的策略过滤会丢弃被阻止的）。
  const enabledPluginServers: Record<string, ScopedMcpServerConfig> = {}
  const disabledPluginServers: Record<string, ScopedMcpServerConfig> = {}
  for (const [name, config] of Object.entries(pluginMcpServers)) {
    if (
      isMcpServerDisabled(name) ||
      !isMcpServerAllowedByPolicy(name, config)
    ) {
      disabledPluginServers[name] = config
    } else {
      enabledPluginServers[name] = config
    }
  }
  const { servers: dedupedPluginServers, suppressed } = dedupPluginMcpServers(
    enabledPluginServers,
    enabledManualServers,
  )
  Object.assign(dedupedPluginServers, disabledPluginServers)
  // 在 /plugin UI 中展示抑制信息。在以上 logError 循环之后推送，
  // 这样这些信息不会进入错误日志——它们是信息性的，而非错误。
  for (const { name, duplicateOf } of suppressed) {
    // name 来自 addPluginScopeToServers 的 "plugin:${pluginName}:${serverName}"
    const parts = name.split(':')
    if (parts[0] !== 'plugin' || parts.length < 3) continue
    mcpErrors.push({
      type: 'mcp-server-suppressed-duplicate',
      source: name,
      plugin: parts[1]!,
      serverName: parts.slice(2).join(':'),
      duplicateOf,
    })
  }

  // 按优先级顺序合并：plugin < user < project < local
  const configs = Object.assign(
    {},
    dedupedPluginServers,
    userServers,
    approvedProjectServers,
    localServers,
  )

  // 对合并后的配置应用策略过滤
  const filtered: Record<string, ScopedMcpServerConfig> = {}

  for (const [name, serverConfig] of Object.entries(configs)) {
    if (!isMcpServerAllowedByPolicy(name, serverConfig as McpServerConfig)) {
      continue
    }
    filtered[name] = serverConfig as ScopedMcpServerConfig
  }

  return { servers: filtered, errors: mcpErrors }
}

/**
 * 获取所有作用域的所有 MCP 配置，包括 claude.ai 服务器。
 * 这可能因网络调用而较慢——快速启动请使用 getClaudeCodeMcpConfigs()。
 * @returns 包含适当作用域的所有服务器配置
 */
export async function getAllMcpConfigs(): Promise<{
  servers: Record<string, ScopedMcpServerConfig>
  errors: PluginError[]
}> {
  // 在企业模式下，不加载 claude.ai 服务器（企业拥有独占控制权）
  if (doesEnterpriseMcpConfigExist()) {
    return getClaudeCodeMcpConfigs()
  }

  // 在 getClaudeCodeMcpConfigs 之前启动 claude.ai 获取，使其与内部的
  // loadAllPluginsCacheOnly() 重叠执行。已记忆化——下面的 await 调用是缓存命中。
  const claudeaiPromise = fetchClaudeAIMcpConfigsIfEligible()
  const { servers: claudeCodeServers, errors } = await getClaudeCodeMcpConfigs(
    {},
    claudeaiPromise,
  )
  const { allowed: claudeaiMcpServers } = filterMcpServersByPolicy(
    await claudeaiPromise,
  )

  // 抑制与已启用手动服务器重复的 claude.ai 连接器。
  // 键永远不会冲突（`slack` vs `claude.ai Slack`），因此下面的合并
  // 不会捕获此情况——需要基于签名的 URL 去重。
  const { servers: dedupedClaudeAi } = dedupClaudeAiMcpServers(
    claudeaiMcpServers,
    claudeCodeServers,
  )

  // 合并，claude.ai 具有最低优先级
  const servers = Object.assign({}, dedupedClaudeAi, claudeCodeServers)

  return { servers, errors }
}

/**
 * 解析并验证 MCP 配置对象
 * @param params 解析参数
 * @returns 验证后的配置及任何错误
 */
export function parseMcpConfig(params: {
  configObject: unknown
  expandVars: boolean
  scope: ConfigScope
  filePath?: string
}): {
  config: McpJsonConfig | null
  errors: ValidationError[]
} {
  const { configObject, expandVars, scope, filePath } = params
  const schemaResult = McpJsonConfigSchema().safeParse(configObject)
  if (!schemaResult.success) {
    return {
      config: null,
      errors: schemaResult.error.issues.map(issue => ({
        ...(filePath && { file: filePath }),
        path: issue.path.join('.'),
        message: '不符合 MCP 服务器配置架构',
        mcpErrorMetadata: {
          scope,
          severity: 'fatal',
        },
      })),
    }
  }

  // 验证每个服务器并在请求时展开变量
  const errors: ValidationError[] = []
  const validatedServers: Record<string, McpServerConfig> = {}

  for (const [name, config] of Object.entries(schemaResult.data.mcpServers)) {
    let configToCheck = config

    if (expandVars) {
      const { expanded, missingVars } = expandEnvVars(config)

      if (missingVars.length > 0) {
        errors.push({
          ...(filePath && { file: filePath }),
          path: `mcpServers.${name}`,
          message: `Missing environment variables: ${missingVars.join(', ')}`,
          suggestion: `Set the following environment variables: ${missingVars.join(', ')}`,
          mcpErrorMetadata: {
            scope,
            serverName: name,
            severity: 'warning',
          },
        })
      }

      configToCheck = expanded
    }

    // 检查 Windows 上未使用 cmd 包装器的 npx 用法
    if (
      getPlatform() === 'windows' &&
      (!configToCheck.type || configToCheck.type === 'stdio') &&
      (configToCheck.command === 'npx' ||
        configToCheck.command.endsWith('\\npx') ||
        configToCheck.command.endsWith('/npx'))
    ) {
      errors.push({
        ...(filePath && { file: filePath }),
        path: `mcpServers.${name}`,
        message: `Windows requires 'cmd /c' wrapper to execute npx`,
        suggestion: `Change command to "cmd" with args ["/c", "npx", ...]. See: https://code.claude.com/docs/en/mcp#configure-mcp-servers`,
        mcpErrorMetadata: {
          scope,
          serverName: name,
          severity: 'warning',
        },
      })
    }

    validatedServers[name] = configToCheck
  }
  return {
    config: { mcpServers: validatedServers },
    errors,
  }
}

/**
 * 从文件路径解析并验证 MCP 配置
 * @param params 解析参数
 * @returns 验证后的配置及任何错误
 */
export function parseMcpConfigFromFilePath(params: {
  filePath: string
  expandVars: boolean
  scope: ConfigScope
}): {
  config: McpJsonConfig | null
  errors: ValidationError[]
} {
  const { filePath, expandVars, scope } = params
  const fs = getFsImplementation()

  let configContent: string
  try {
    configContent = fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch (error: unknown) {
    const code = getErrnoCode(error)
    if (code === 'ENOENT') {
      return {
        config: null,
        errors: [
          {
            file: filePath,
            path: '',
            message: `MCP 配置文件未找到: ${filePath}`,
            suggestion: '检查文件路径是否正确',
            mcpErrorMetadata: {
              scope,
              severity: 'fatal',
            },
          },
        ],
      }
    }
    logForDebugging(
      `MCP config read error for ${filePath} (scope=${scope}): ${error}`,
      { level: 'error' },
    )
    return {
      config: null,
      errors: [
        {
          file: filePath,
          path: '',
          message: `读取文件失败: ${error}`,
          suggestion: '检查文件权限并确保文件存在',
          mcpErrorMetadata: {
            scope,
            severity: 'fatal',
          },
        },
      ],
    }
  }

  const parsedJson = safeParseJSON(configContent)

  if (!parsedJson) {
    logForDebugging(
      `MCP config is not valid JSON: ${filePath} (scope=${scope}, length=${configContent.length}, first100=${jsonStringify(configContent.slice(0, 100))})`,
      { level: 'error' },
    )
    return {
      config: null,
      errors: [
        {
          file: filePath,
          path: '',
          message: `MCP 配置文件不是有效的 JSON`,
          suggestion: '修复文件中的 JSON 语法错误',
          mcpErrorMetadata: {
            scope,
            severity: 'fatal',
          },
        },
      ],
    }
  }

  return parseMcpConfig({
    configObject: parsedJson,
    expandVars,
    scope,
    filePath,
  })
}

/**
 * 检查企业 MCP 配置文件是否存在。
 * 结果被记忆化以避免重复的文件系统访问。
 */
export const doesEnterpriseMcpConfigExist = memoize((): boolean => {
  const { config } = parseMcpConfigFromFilePath({
    filePath: getEnterpriseMcpFilePath(),
    expandVars: true,
    scope: 'enterprise',
  })
  return config !== null
})

/**
 * 检查 MCP 允许列表策略是否应仅来自托管设置。
 * 当 policySettings 中设置了 allowManagedMcpServersOnly: true 时返回 true。
 * 启用时，allowedMcpServers 仅从托管设置读取。
 * 用户仍然可以通过 deniedMcpServers 添加自己的 MCP 服务器和拒绝服务器。
 */
export function shouldAllowManagedMcpServersOnly(): boolean {
  return (
    getSettingsForSource('policySettings')?.allowManagedMcpServersOnly === true
  )
}

/**
 * 检查配置中的所有 MCP 服务器是否在企业 MCP 配置下被允许。
 */
export function areMcpConfigsAllowedWithEnterpriseMcpConfig(
  configs: Record<string, ScopedMcpServerConfig>,
): boolean {
  // 注意：虽然从安全角度来看所有 SDK MCP 服务器应该是安全的，但我们仍在讨论
  // 最佳实现方式。在此期间，我们暂时将其限制为 claude-vscode，以
  // 修复已启用企业 MCP 配置的特定企业客户的 VSCode 扩展。
  // https://anthropic.slack.com/archives/C093UA0KLD7/p1764975463670109
  return Object.values(configs).every(
    c => c.type === 'sdk' && c.name === 'claude-vscode',
  )
}

/**
 * 默认禁用的内置 MCP 服务器。与用户配置的服务器不同
 *（通过 disabledMcpServers 选择退出），此服务器需要通过
 * enabledMcpServers 明确选择加入。在用户启用之前，在 /mcp 中显示为已禁用。
 */

const DEFAULT_DISABLED_BUILTIN = feature('CHICAGO_MCP')
  ? (
      require('../../utils/computerUse/common.js') as typeof import('../../utils/computerUse/common.js')
    ).COMPUTER_USE_MCP_SERVER_NAME
  : null
 

function isDefaultDisabledBuiltin(name: string): boolean {
  return DEFAULT_DISABLED_BUILTIN !== null && name === DEFAULT_DISABLED_BUILTIN
}

/**
 * 检查 MCP 服务器是否已禁用
 * @param name 服务器名称
 * @returns 如果服务器已禁用则返回 true
 */
export function isMcpServerDisabled(name: string): boolean {
  const projectConfig = getCurrentProjectConfig()
  if (isDefaultDisabledBuiltin(name)) {
    const enabledServers = projectConfig.enabledMcpServers || []
    return !enabledServers.includes(name)
  }
  const disabledServers = projectConfig.disabledMcpServers || []
  return disabledServers.includes(name)
}

function toggleMembership(
  list: string[],
  name: string,
  shouldContain: boolean,
): string[] {
  const contains = list.includes(name)
  if (contains === shouldContain) return list
  return shouldContain ? [...list, name] : list.filter(s => s !== name)
}

/**
 * 启用或禁用 MCP 服务器
 * @param name 服务器名称
 * @param enabled 是否应启用服务器
 */
export function setMcpServerEnabled(name: string, enabled: boolean): void {
  const isBuiltinStateChange =
    isDefaultDisabledBuiltin(name) && isMcpServerDisabled(name) === enabled

  saveCurrentProjectConfig(current => {
    if (isDefaultDisabledBuiltin(name)) {
      const prev = current.enabledMcpServers || []
      const next = toggleMembership(prev, name, enabled)
      if (next === prev) return current
      return { ...current, enabledMcpServers: next }
    }

    const prev = current.disabledMcpServers || []
    const next = toggleMembership(prev, name, !enabled)
    if (next === prev) return current
    return { ...current, disabledMcpServers: next }
  })

  if (isBuiltinStateChange) {
    logEvent('tengu_builtin_mcp_toggle', {
      serverName:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      enabled,
    })
  }
}
