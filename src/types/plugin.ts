import type { LspServerConfig } from '../services/lsp/types.js'
import type { McpServerConfig } from '../services/mcp/types.js'
import type { BundledSkillDefinition } from '../skills/bundledSkills.js'
import type {
  CommandMetadata,
  PluginAuthor,
  PluginManifest,
} from '../utils/plugins/schemas.js'
import type { HooksSettings } from '../utils/settings/types.js'

export type { PluginAuthor, PluginManifest, CommandMetadata }

/** 内置插件定义 — 随 CLI 一起发布的插件。
 * 内置插件出现在 /plugin 界面中，可由用户启用/禁用（持久化到用户设置）。 */
export type BuiltinPluginDefinition = {
  /** 插件名称（用于 `{name}@builtin` 标识符）*/
  name: string // 插件名称
  /** 在 /plugin 界面中显示的描述 */
  description: string
  /** 可选版本字符串 */
  version?: string
  /** 此插件提供的技能 */
  skills?: BundledSkillDefinition[]
  /** 此插件提供的钩子 */
  hooks?: HooksSettings
  /** 此插件提供的 MCP 服务器 */
  mcpServers?: Record<string, McpServerConfig>
  /** 此插件是否可用（例如基于系统功能）。不可用的插件会被完全隐藏。*/
  isAvailable?: () => boolean
  /** 用户设置偏好之前的默认启用状态（默认为 true）*/
  defaultEnabled?: boolean
}

/**
 * 插件仓库信息
 */
/**
 * 插件仓库信息
 */
/** 插件仓库信息 */
export type PluginRepository = {
  url: string
  branch: string
  lastUpdated?: string
  commitSha?: string
}

/** 插件配置 */
export type PluginConfig = {
  repositories: Record<string, PluginRepository>
}

/** 已加载的插件信息 */
export type LoadedPlugin = {
  name: string // 插件名称
  manifest: PluginManifest // 插件清单
  path: string // 插件文件路径
  source: string // 插件来源
  repository: string // 插件仓库标识 // Repository identifier, usually same as source
  enabled?: boolean // 是否启用
  isBuiltin?: boolean // 是否为内置插件 // true for built-in plugins that ship with the CLI
  sha?: string // Git 提交 SHA // Git commit SHA for version pinning (from marketplace entry source)
  commandsPath?: string // 命令路径
  commandsPaths?: string[] // 额外的命令路径 // Additional command paths from manifest
  commandsMetadata?: Record<string, CommandMetadata> // Metadata for named commands from object-mapping format
  agentsPath?: string // 代理路径
  agentsPaths?: string[] // 额外的代理路径 // Additional agent paths from manifest
  skillsPath?: string // 技能路径
  skillsPaths?: string[] // 额外的技能路径 // Additional skill paths from manifest
  outputStylesPath?: string
  outputStylesPaths?: string[] // Additional output style paths from manifest
  hooksConfig?: HooksSettings // 钩子配置
  mcpServers?: Record<string, McpServerConfig>
  lspServers?: Record<string, LspServerConfig>
  settings?: Record<string, unknown> // 插件设置
}

/**
 * 插件组件类型
 */
/**
 * 插件组件类型
 */
export type PluginComponent =
  | 'commands'
  | 'agents'
  | 'skills'
  | 'hooks'
  | 'output-styles'

/**
 * 插件错误类型的区分联合。
 * 每种错误类型都有特定的上下文数据，便于调试和用户引导。
 *
 * 此类型替代了之前的字符串匹配方式，采用类型安全的错误处理，
 * 避免在错误消息更改时发生破坏。
 *
 * 实现状态：
 * 当前在生产中使用的类型（2 种）：
 * - generic-error：用于各种插件加载失败
 * - plugin-not-found：在市场中未找到插件时使用
 *
 * 计划未来使用（10 种类型 — 参见 pluginLoader.ts 中的 TODO）：
 * - path-not-found, git-auth-failed, git-timeout, network-error
 * - manifest-parse-error, manifest-validation-error
 * - marketplace-not-found, marketplace-load-failed
 * - mcp-config-invalid, hook-load-failed, component-load-failed
 *
 * 这些未使用的类型用于支持 UI 格式化，并为提高错误特定性提供明确路线图。
 * 可以在重构错误创建站点时逐步实现。
 */
export type PluginError =
  | {
      type: 'path-not-found' // 路径未找到
      source: string // 插件来源
      plugin?: string
      path: string // 插件文件路径
      component: PluginComponent
    }
  | {
      type: 'git-auth-failed' // Git 认证失败
      source: string // 插件来源
      plugin?: string
      gitUrl: string
      authType: 'ssh' | 'https'
    }
  | {
      type: 'git-timeout' // Git 超时
      source: string // 插件来源
      plugin?: string
      gitUrl: string
      operation: 'clone' | 'pull'
    }
  | {
      type: 'network-error' // 网络错误
      source: string // 插件来源
      plugin?: string
      url: string
      details?: string
    }
  | {
      type: 'manifest-parse-error' // 清单解析错误
      source: string // 插件来源
      plugin?: string
      manifestPath: string
      parseError: string
    }
  | {
      type: 'manifest-validation-error' // 清单验证错误
      source: string // 插件来源
      plugin?: string
      manifestPath: string
      validationErrors: string[]
    }
  | {
      type: 'plugin-not-found' // 插件未找到
      source: string // 插件来源
      pluginId: string
      marketplace: string
    }
  | {
      type: 'marketplace-not-found' // 市场未找到
      source: string // 插件来源
      marketplace: string
      availableMarketplaces: string[]
    }
  | {
      type: 'marketplace-load-failed' // 市场加载失败
      source: string // 插件来源
      marketplace: string
      reason: string
    }
  | {
      type: 'mcp-config-invalid' // MCP 配置无效
      source: string // 插件来源
      plugin: string
      serverName: string
      validationError: string
    }
  | {
      type: 'mcp-server-suppressed-duplicate' // MCP 服务器重复
      source: string // 插件来源
      plugin: string
      serverName: string
      duplicateOf: string
    }
  | {
      type: 'lsp-config-invalid' // LSP 配置无效（首次出现）
      source: string // 插件来源
      plugin: string
      serverName: string
      validationError: string
    }
  | {
      type: 'hook-load-failed' // 钩子加载失败
      source: string // 插件来源
      plugin: string
      hookPath: string
      reason: string
    }
  | {
      type: 'component-load-failed' // 组件加载失败
      source: string // 插件来源
      plugin: string
      component: PluginComponent
      path: string // 插件文件路径
      reason: string
    }
  | {
      type: 'mcpb-download-failed' // MCPB 下载失败
      source: string // 插件来源
      plugin: string
      url: string
      reason: string
    }
  | {
      type: 'mcpb-extract-failed' // MCPB 解压失败
      source: string // 插件来源
      plugin: string
      mcpbPath: string
      reason: string
    }
  | {
      type: 'mcpb-invalid-manifest' // MCPB 清单无效
      source: string // 插件来源
      plugin: string
      mcpbPath: string
      validationError: string
    }
  | {
      type: 'lsp-config-invalid'
      source: string // 插件来源
      plugin: string
      serverName: string
      validationError: string
    }
  | {
      type: 'lsp-server-start-failed' // LSP 服务器启动失败
      source: string // 插件来源
      plugin: string
      serverName: string
      reason: string
    }
  | {
      type: 'lsp-server-crashed' // LSP 服务器崩溃
      source: string // 插件来源
      plugin: string
      serverName: string
      exitCode: number | null
      signal?: string
    }
  | {
      type: 'lsp-request-timeout' // LSP 请求超时
      source: string // 插件来源
      plugin: string
      serverName: string
      method: string
      timeoutMs: number
    }
  | {
      type: 'lsp-request-failed' // LSP 请求失败
      source: string // 插件来源
      plugin: string
      serverName: string
      method: string
      error: string
    }
  | {
      type: 'marketplace-blocked-by-policy' // 市场被策略阻止
      source: string // 插件来源
      plugin?: string
      marketplace: string
      blockedByBlocklist?: boolean // true if blocked by blockedMarketplaces, false if not in strictKnownMarketplaces
      allowedSources: string[] // Formatted source strings (e.g., "github:owner/repo")
    }
  | {
      type: 'dependency-unsatisfied' // 依赖未满足
      source: string // 插件来源
      plugin: string
      dependency: string
      reason: 'not-enabled' | 'not-found'
    }
  | {
      type: 'plugin-cache-miss' // 插件缓存未命中
      source: string // 插件来源
      plugin: string
      installPath: string
    }
  | {
      type: 'generic-error' // 通用错误
      source: string // 插件来源
      plugin?: string
      error: string
    }

/**
 * 插件加载结果
 */
/**
 * 插件加载结果
 */
export type PluginLoadResult = {
  enabled: LoadedPlugin[]
  disabled: LoadedPlugin[]
  errors: PluginError[]
}

/**
 * 辅助函数：从任意 PluginError 获取显示消息
 * 适用于日志记录和简单的错误展示
 */
export function getPluginErrorMessage(error: PluginError): string {
  switch (error.type) {
    case 'generic-error':
      return error.error
    case 'path-not-found':
      return `路径未找到: ${error.path} (${error.component})`
    case 'git-auth-failed':
      return `Git 认证失败 (${error.authType}): ${error.gitUrl}`
    case 'git-timeout':
      return `Git ${error.operation} 超时: ${error.gitUrl}`
    case 'network-error':
      return `网络错误: ${error.url}${error.details ? ` - ${error.details}` : ''}`
    case 'manifest-parse-error':
      return `清单解析错误: ${error.parseError}`
    case 'manifest-validation-error':
      return `清单验证失败: ${error.validationErrors.join(', ')}`
    case 'plugin-not-found':
      return `插件 ${error.pluginId} 在市场 ${error.marketplace} 中未找到`
    case 'marketplace-not-found':
      return `市场 ${error.marketplace} 未找到`
    case 'marketplace-load-failed':
      return `市场 ${error.marketplace} 加载失败: ${error.reason}`
    case 'mcp-config-invalid':
      return `MCP 服务器 ${error.serverName} 无效: ${error.validationError}`
    case 'mcp-server-suppressed-duplicate': {
      const dup = error.duplicateOf.startsWith('plugin:')
        ? `server provided by plugin "${error.duplicateOf.split(':')[1] ?? '?'}"`
        : `already-configured "${error.duplicateOf}"`
      return `MCP 服务器 "${error.serverName}" 已跳过 — 与 ${dup} 命令/URL 重复`
    }
    case 'hook-load-failed':
      return `钩子加载失败: ${error.reason}`
    case 'component-load-failed':
      return `${error.component} 加载失败，路径: ${error.path}: ${error.reason}`
    case 'mcpb-download-failed':
      return `从 ${error.url} 下载 MCPB 失败: ${error.reason}`
    case 'mcpb-extract-failed':
      return `解压 MCPB ${error.mcpbPath} 失败: ${error.reason}`
    case 'mcpb-invalid-manifest':
      return `MCPB 清单在 ${error.mcpbPath} 处无效: ${error.validationError}`
    case 'lsp-config-invalid':
      return `插件 "${error.plugin}" 的 LSP 服务器配置 "${error.serverName}" 无效: ${error.validationError}`
    case 'lsp-server-start-failed':
      return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 启动失败: ${error.reason}`
    case 'lsp-server-crashed':
      if (error.signal) {
        return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 因信号 ${error.signal} 崩溃`
      }
      return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 以退出码 ${error.exitCode ?? '未知'} 崩溃`
    case 'lsp-request-timeout':
      return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 在 ${error.method} 请求中超时（${error.timeoutMs}ms）`
    case 'lsp-request-failed':
      return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 的 ${error.method} 请求失败: ${error.error}`
    case 'marketplace-blocked-by-policy':
      if (error.blockedByBlocklist) {
        return `市场 '${error.marketplace}' 被企业策略阻止`
      }
      return `市场 '${error.marketplace}' 不在允许的市场列表中`
    case 'dependency-unsatisfied': {
      const hint =
        error.reason === 'not-enabled'
          ? '已禁用 — 请启用它或移除依赖'
          : '未在任何已配置的市场中找到'
      return `依赖 "${error.dependency}" ${hint}`
    }
    case 'plugin-cache-miss':
      return `插件 "${error.plugin}" 未缓存在 ${error.installPath} — 运行 /plugins 刷新`
  }
}
