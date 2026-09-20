/**
 * 插件设置界面的视图状态（判别联合）。
 * 原定义为 string，导致对象字面量无法赋值、viewState.type 访问报错。
 */
export type ViewState =
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'validate'; path?: string }
  | { type: 'marketplace-list' }
  | { type: 'marketplace-menu' }
  | { type: 'manage-marketplaces'; action?: string; targetMarketplace?: string }
  | { type: 'manage-plugins'; action?: string; targetPlugin?: string }
  | { type: 'add-marketplace'; initialValue?: string }
  | { type: 'browse-marketplace'; targetMarketplace?: string; targetPlugin?: string }
  | { type: 'discover-plugins'; targetPlugin?: string }
  | { type: 'configuring-options'; schema?: unknown }
  | { type: 'plugin' }
  | { type: 'plugin-options' }
  | { type: 'prune' }
  | { type: 'confirm-data-cleanup'; size?: number; human?: string; bytes?: number }
  | { type: 'failed-plugin'; id?: string; name?: string; errorCount?: number }
  | {
      type: 'failed-plugin-details'
      id?: string
      name?: string
      marketplace?: string
      plugin?: string
      scope?: string
      errors?: unknown[]
    }
  | {
      type: 'flagged-plugin'
      id?: string
      name?: string
      reason?: string
      text?: string
      scope?: string
      flaggedAt?: string
    }
  | {
      type: 'flagged-detail'
      id?: string
      name?: string
      marketplace?: string
      plugin?: string
      reason?: string
      text?: string
      flaggedAt?: string
    }
  | { type: 'mcp'; id?: string; mcp?: unknown }
  | { type: 'mcp-detail'; client?: unknown }
  | { type: 'mcp-tools'; client?: unknown }
  | { type: 'mcp-tool-detail'; client?: unknown; tool?: unknown }

export type PluginSettingsProps = Record<string, unknown>

