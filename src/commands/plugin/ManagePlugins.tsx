import figures from 'figures';
import type { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { Byline } from '../../components/design-system/Byline.js';
import { MCPRemoteServerMenu } from '../../components/mcp/MCPRemoteServerMenu.js';
import { MCPStdioServerMenu } from '../../components/mcp/MCPStdioServerMenu.js';
import { MCPToolDetailView } from '../../components/mcp/MCPToolDetailView.js';
import { MCPToolListView } from '../../components/mcp/MCPToolListView.js';
import type { ClaudeAIServerInfo, HTTPServerInfo, SSEServerInfo, StdioServerInfo } from '../../components/mcp/types.js';
import { SearchBox } from '../../components/SearchBox.js';
import { useSearchInput } from '../../hooks/useSearchInput.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- useInput needed for raw search mode text input
import { Box, Text, useInput, useTerminalFocus } from '../../ink.js';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import { getBuiltinPluginDefinition } from '../../plugins/builtinPlugins.js';
import { useMcpToggleEnabled } from '../../services/mcp/MCPConnectionManager.js';
import type { MCPServerConnection, McpClaudeAIProxyServerConfig, McpHTTPServerConfig, McpSSEServerConfig, McpStdioServerConfig } from '../../services/mcp/types.js';
import { filterToolsByServer } from '../../services/mcp/utils.js';
import { disablePluginOp, enablePluginOp, getPluginInstallationFromV2, isInstallableScope, isPluginEnabledAtProjectScope, uninstallPluginOp, updatePluginOp } from '../../services/plugins/pluginOperations.js';
import { useAppState } from '../../state/AppState.js';
import type { Tool } from '../../Tool.js';
import type { LoadedPlugin, PluginError } from '../../types/plugin.js';
import { count } from '../../utils/array.js';
import { openBrowser } from '../../utils/browser.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage, toError } from '../../utils/errors.js';
import { logError } from '../../utils/log.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import { loadInstalledPluginsV2 } from '../../utils/plugins/installedPluginsManager.js';
import { getMarketplace } from '../../utils/plugins/marketplaceManager.js';
import { isMcpbSource, loadMcpbFile, type McpbNeedsConfigResult, type UserConfigValues } from '../../utils/plugins/mcpbHandler.js';
import { getPluginDataDirSize, pluginDataDirPath } from '../../utils/plugins/pluginDirectories.js';
import { getFlaggedPlugins, markFlaggedPluginsSeen, removeFlaggedPlugin } from '../../utils/plugins/pluginFlagging.js';
import { type PersistablePluginScope, parsePluginIdentifier } from '../../utils/plugins/pluginIdentifier.js';
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js';
import { loadPluginOptions, type PluginOptionSchema, savePluginOptions } from '../../utils/plugins/pluginOptionsStorage.js';
import { isPluginBlockedByPolicy } from '../../utils/plugins/pluginPolicy.js';
import { getPluginEditableScopes } from '../../utils/plugins/pluginStartupCheck.js';
import { getSettings_DEPRECATED, getSettingsForSource, updateSettingsForSource } from '../../utils/settings/settings.js';
import { jsonParse } from '../../utils/slowOperations.js';
import { plural } from '../../utils/stringUtils.js';
import { formatErrorMessage, getErrorGuidance } from './PluginErrors.js';
import { PluginOptionsDialog } from './PluginOptionsDialog.js';
import { PluginOptionsFlow } from './PluginOptionsFlow.js';
import type { ViewState as ParentViewState } from './types.js';
import { UnifiedInstalledCell } from './UnifiedInstalledCell.js';
import type { UnifiedInstalledItem } from './unifiedTypes.js';
import { usePagination } from './usePagination.js';

type Props = {
  setViewState: (state: ParentViewState) => void;
  setResult: (result: string | null) => void;
  onManageComplete?: () => void | Promise<void>;
  onSearchModeChange?: (isActive: boolean) => void;
  targetPlugin?: string;
  targetMarketplace?: string;
  action?: 'enable' | 'disable' | 'uninstall';
};

type FlaggedPluginInfo = {
  id: string;
  name: string;
  marketplace: string;
  reason: string;
  text: string;
  flaggedAt: string;
};

type FailedPluginInfo = {
  id: string;
  name: string;
  marketplace: string;
  errors: PluginError[];
  scope: PersistablePluginScope;
};

type ViewState =
  | 'plugin-list'
  | 'plugin-details'
  | 'configuring'
  | { type: 'plugin-options' }
  | { type: 'configuring-options'; schema: PluginOptionSchema }
  | 'confirm-project-uninstall'
  | { type: 'confirm-data-cleanup'; size: { bytes: number; human: string } }
  | { type: 'flagged-detail'; plugin: FlaggedPluginInfo }
  | { type: 'failed-plugin-details'; plugin: FailedPluginInfo }
  | { type: 'mcp-detail'; client: MCPServerConnection }
  | { type: 'mcp-tools'; client: MCPServerConnection }
  | { type: 'mcp-tool-detail'; client: MCPServerConnection; tool: Tool };

type MarketplaceInfo = {
  name: string;
  installedPlugins: LoadedPlugin[];
  enabledCount?: number;
  disabledCount?: number;
};

type PluginState = {
  plugin: LoadedPlugin;
  marketplace: string;
  scope?: 'user' | 'project' | 'local' | 'managed' | 'builtin';
  pendingEnable?: boolean; // 待切换启用/禁用
  pendingUpdate?: boolean; // 标记待更新
};

/**
 * 从目录中获取基础文件名（不含 .md 扩展名）
 * @param dirPath 要列出文件的目录路径
 * @returns 不含 .md 扩展名的文件名数组
 * @example
 * // 给定目录包含: agent-sdk-verifier-py.md, agent-sdk-verifier-ts.md, README.txt
 * await getBaseFileNames('/path/to/agents')
 * // 返回: ['agent-sdk-verifier-py', 'agent-sdk-verifier-ts']
 */
async function getBaseFileNames(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry: Dirent) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry: Dirent) => {
        // 专门移除 .md 扩展名
        const baseName = path.basename(entry.name, '.md');
        return baseName;
      });
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`从 ${dirPath} 读取插件组件失败: ${errorMsg}`, { level: 'error' });
    logError(toError(error));
    // 返回空数组以优雅降级 —— 插件详情仍可显示
    return [];
  }
}

/**
 * 从技能目录中获取技能目录名称列表
 * 技能是包含 SKILL.md 文件的目录
 * @param dirPath 要扫描的技能目录路径
 * @returns 包含 SKILL.md 的技能目录名称数组
 * @example
 * // 给定目录包含: my-skill/SKILL.md, another-skill/SKILL.md, README.txt
 * await getSkillDirNames('/path/to/skills')
 * // 返回: ['my-skill', 'another-skill']
 */
async function getSkillDirNames(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const skillNames: string[] = [];

    for (const entry of entries) {
      // 检查是否为目录或符号链接（符号链接可能指向技能目录）
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        // 检查此目录是否包含 SKILL.md 文件
        const skillFilePath = path.join(dirPath, entry.name, 'SKILL.md');
        try {
          const st = await fs.stat(skillFilePath);
          if (st.isFile()) {
            skillNames.push(entry.name);
          }
        } catch {
          // 此目录中没有 SKILL.md 文件，跳过
        }
      }
    }

    return skillNames;
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`从 ${dirPath} 读取技能目录失败: ${errorMsg}`, { level: 'error' });
    logError(toError(error));
    // 返回空数组以优雅降级 —— 插件详情仍可显示
    return [];
  }
}

// 显示已安装插件组件的组件
function PluginComponentsDisplay({
  plugin,
  marketplace,
}: {
  plugin: LoadedPlugin;
  marketplace: string;
}): React.ReactNode {
  const [components, setComponents] = useState<{
    commands?: string | string[] | Record<string, unknown> | null;
    agents?: string | string[] | Record<string, unknown> | null;
    skills?: string | string[] | Record<string, unknown> | null;
    hooks?: unknown;
    mcpServers?: unknown;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadComponents() {
      try {
        // 内置插件没有市场条目 —— 直接从注册的定义中读取
        if (marketplace === 'builtin') {
          const builtinDef = getBuiltinPluginDefinition(plugin.name);
          if (builtinDef) {
            const skillNames = builtinDef.skills?.map(s => s.name) ?? [];
            const hookEvents = builtinDef.hooks ? Object.keys(builtinDef.hooks) : [];
            const mcpServerNames = builtinDef.mcpServers ? Object.keys(builtinDef.mcpServers) : [];
            setComponents({
              commands: null,
              agents: null,
              skills: skillNames.length > 0 ? skillNames : null,
              hooks: hookEvents.length > 0 ? hookEvents : null,
              mcpServers: mcpServerNames.length > 0 ? mcpServerNames : null,
            });
          } else {
            setError(`未找到内置插件 ${plugin.name}`);
          }
          setLoading(false);
          return;
        }

        const marketplaceData = await getMarketplace(marketplace);
        // 在数组中查找插件条目
        const pluginEntry = marketplaceData.plugins.find(p => p.name === plugin.name);
        if (pluginEntry) {
          // 合并两个来源的命令
          const commandPathList = [];
          if (plugin.commandsPath) {
            commandPathList.push(plugin.commandsPath);
          }
          if (plugin.commandsPaths) {
            commandPathList.push(...plugin.commandsPaths);
          }

          // 从所有命令路径获取基础文件名
          const commandList: string[] = [];
          for (const commandPath of commandPathList) {
            if (typeof commandPath === 'string') {
              // commandPath 已经是完整路径
              const baseNames = await getBaseFileNames(commandPath);
              commandList.push(...baseNames);
            }
          }

          // 合并两个来源的代理
          const agentPathList = [];
          if (plugin.agentsPath) {
            agentPathList.push(plugin.agentsPath);
          }
          if (plugin.agentsPaths) {
            agentPathList.push(...plugin.agentsPaths);
          }

          // 从所有代理路径获取基础文件名
          const agentList: string[] = [];
          for (const agentPath of agentPathList) {
            if (typeof agentPath === 'string') {
              // agentPath 已经是完整路径
              const baseNames = await getBaseFileNames(agentPath);
              agentList.push(...baseNames);
            }
          }

          // 合并两个来源的技能
          const skillPathList = [];
          if (plugin.skillsPath) {
            skillPathList.push(plugin.skillsPath);
          }
          if (plugin.skillsPaths) {
            skillPathList.push(...plugin.skillsPaths);
          }

          // 从所有技能路径获取技能目录名称
          // 技能是包含 SKILL.md 文件的目录
          const skillList: string[] = [];
          for (const skillPath of skillPathList) {
            if (typeof skillPath === 'string') {
              // skillPath 已经是技能目录的完整路径
              const skillDirNames = await getSkillDirNames(skillPath);
              skillList.push(...skillDirNames);
            }
          }

          // 合并两个来源的钩子
          const hooksList = [];
          if (plugin.hooksConfig) {
            hooksList.push(Object.keys(plugin.hooksConfig));
          }
          if (pluginEntry.hooks) {
            hooksList.push(pluginEntry.hooks);
          }

          // 合并两个来源的 MCP 服务器
          const mcpServersList = [];
          if (plugin.mcpServers) {
            mcpServersList.push(Object.keys(plugin.mcpServers));
          }
          if (pluginEntry.mcpServers) {
            mcpServersList.push(pluginEntry.mcpServers);
          }

          setComponents({
            commands: commandList.length > 0 ? commandList : null,
            agents: agentList.length > 0 ? agentList : null,
            skills: skillList.length > 0 ? skillList : null,
            hooks: hooksList.length > 0 ? hooksList : null,
            mcpServers: mcpServersList.length > 0 ? mcpServersList : null,
          });
        } else {
          setError(`在市场 ${marketplace} 中未找到插件 ${plugin.name}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载组件失败');
      } finally {
        setLoading(false);
      }
    }
    void loadComponents();
  }, [
    plugin.name,
    plugin.commandsPath,
    plugin.commandsPaths,
    plugin.agentsPath,
    plugin.agentsPaths,
    plugin.skillsPath,
    plugin.skillsPaths,
    plugin.hooksConfig,
    plugin.mcpServers,
    marketplace,
  ]);

  if (loading) {
    return null; // 为保持界面简洁，不显示加载状态
  }

  if (error) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>组件：</Text>
        <Text dimColor>错误：{error}</Text>
      </Box>
    );
  }

  if (!components) {
    return null; // 没有可用的组件信息
  }

  const hasComponents =
    components.commands ||
    components.agents ||
    components.skills ||
    components.hooks ||
    components.mcpServers;

  if (!hasComponents) {
    return null; // 未定义任何组件
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>已安装的组件：</Text>
      {components.commands ? (
        <Text dimColor>
          • 命令：{' '}
          {typeof components.commands === 'string'
            ? components.commands
            : Array.isArray(components.commands)
              ? components.commands.join(', ')
              : Object.keys(components.commands).join(', ')}
        </Text>
      ) : null}
      {components.agents ? (
        <Text dimColor>
          • 代理：{' '}
          {typeof components.agents === 'string'
            ? components.agents
            : Array.isArray(components.agents)
              ? components.agents.join(', ')
              : Object.keys(components.agents).join(', ')}
        </Text>
      ) : null}
      {components.skills ? (
        <Text dimColor>
          • 技能：{' '}
          {typeof components.skills === 'string'
            ? components.skills
            : Array.isArray(components.skills)
              ? components.skills.join(', ')
              : Object.keys(components.skills).join(', ')}
        </Text>
      ) : null}
      {components.hooks ? (
        <Text dimColor>
          • 钩子：{' '}
          {typeof components.hooks === 'string'
            ? components.hooks
            : Array.isArray(components.hooks)
              ? components.hooks.map(String).join(', ')
              : typeof components.hooks === 'object' && components.hooks !== null
                ? Object.keys(components.hooks).join(', ')
                : String(components.hooks)}
        </Text>
      ) : null}
      {components.mcpServers ? (
        <Text dimColor>
          • MCP 服务器：{' '}
          {typeof components.mcpServers === 'string'
            ? components.mcpServers
            : Array.isArray(components.mcpServers)
              ? components.mcpServers.map(String).join(', ')
              : typeof components.mcpServers === 'object' && components.mcpServers !== null
                ? Object.keys(components.mcpServers).join(', ')
                : String(components.mcpServers)}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * 检查插件是否来自本地源且无法远程更新
 * @returns 如果是本地插件返回错误消息，否则返回 null
 */
async function checkIfLocalPlugin(
  pluginName: string,
  marketplaceName: string,
): Promise<string | null> {
  const marketplace = await getMarketplace(marketplaceName);
  const entry = marketplace?.plugins.find(p => p.name === pluginName);

  if (entry && typeof entry.source === 'string') {
    return `本地插件无法远程更新。要更新，请修改源：${entry.source}`;
  }

  return null;
}

/**
 * 过滤掉因组织策略而强制禁用的插件（policySettings）。
 * 这些插件被组织阻止，用户无法重新启用。
 * 直接检查 policySettings 而不是安装范围，因为托管设置不会创建带有 scope 'managed' 的安装记录。
 */
export function filterManagedDisabledPlugins(plugins: LoadedPlugin[]): LoadedPlugin[] {
  return plugins.filter(plugin => {
    const marketplace = plugin.source.split('@')[1] || 'local';
    return !isPluginBlockedByPolicy(`${plugin.name}@${marketplace}`);
  });
}

export function ManagePlugins({
  setViewState: setParentViewState,
  setResult,
  onManageComplete,
  onSearchModeChange,
  targetPlugin,
  targetMarketplace,
  action,
}: Props): React.ReactNode {
  // 用于 MCP 访问的应用状态
  const mcpClients = useAppState(s => s.mcp.clients);
  const mcpTools = useAppState(s => s.mcp.tools);
  const pluginErrors = useAppState(s => s.plugins.errors);
  const flaggedPlugins = getFlaggedPlugins();

  // 搜索状态
  const [isSearchMode, setIsSearchModeRaw] = useState(false);
  const setIsSearchMode = useCallback(
    (active: boolean) => {
      setIsSearchModeRaw(active);
      onSearchModeChange?.(active);
    },
    [onSearchModeChange],
  );
  const isTerminalFocused = useTerminalFocus();
  const { columns: terminalWidth } = useTerminalSize();

  // 视图状态
  const [viewState, setViewState] = useState<ViewState>('plugin-list');
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: viewState === 'plugin-list' && isSearchMode,
    onExit: () => {
      setIsSearchMode(false);
    },
  });
  const [selectedPlugin, setSelectedPlugin] = useState<PluginState | null>(null);

  // 数据状态
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([]);
  const [pluginStates, setPluginStates] = useState<PluginState[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingToggles, setPendingToggles] = useState<Map<string, 'will-enable' | 'will-disable'>>(new Map());

  // 防止用户导航离开后自动导航再次触发（父级从未清除 targetPlugin）
  const hasAutoNavigated = useRef(false);
  // 自动导航落地后要执行的自动操作（启用/禁用/卸载）
  // 使用 ref 而不是 state：它被一次性 effect 消费，该 effect 已依赖 viewState/selectedPlugin 重新运行，因此触发渲染的状态变量是多余的
  const pendingAutoActionRef = useRef<'enable' | 'disable' | 'uninstall' | undefined>(undefined);

  // MCP 切换钩子
  const toggleMcpServer = useMcpToggleEnabled();

  // 处理返回（Esc）—— 基于视图状态的导航
  const handleBack = React.useCallback(() => {
    if (viewState === 'plugin-details') {
      setViewState('plugin-list');
      setSelectedPlugin(null);
      setProcessError(null);
    } else if (typeof viewState === 'object' && viewState.type === 'failed-plugin-details') {
      setViewState('plugin-list');
      setProcessError(null);
    } else if (viewState === 'configuring') {
      setViewState('plugin-details');
      setConfigNeeded(null);
    } else if (
      typeof viewState === 'object' &&
      (viewState.type === 'plugin-options' || viewState.type === 'configuring-options')
    ) {
      // 取消中途序列 —— 插件已启用，直接返回到列表。
      // 用户如果需要，稍后可以通过“配置选项”菜单进行配置。
      setViewState('plugin-list');
      setSelectedPlugin(null);
      setResult('插件已启用。已跳过配置 — 运行 /reload-plugins 以应用。');
      if (onManageComplete) {
        void onManageComplete();
      }
    } else if (typeof viewState === 'object' && viewState.type === 'flagged-detail') {
      setViewState('plugin-list');
      setProcessError(null);
    } else if (typeof viewState === 'object' && viewState.type === 'mcp-detail') {
      setViewState('plugin-list');
      setProcessError(null);
    } else if (typeof viewState === 'object' && viewState.type === 'mcp-tools') {
      setViewState({ type: 'mcp-detail', client: viewState.client });
    } else if (typeof viewState === 'object' && viewState.type === 'mcp-tool-detail') {
      setViewState({ type: 'mcp-tools', client: viewState.client });
    } else {
      if (pendingToggles.size > 0) {
        setResult('运行 /reload-plugins 以应用插件更改。');
        return;
      }
      setParentViewState({ type: 'menu' });
    }
  }, [viewState, setParentViewState, pendingToggles, setResult]);

  // 当不在搜索模式时按 Esc 返回。
  // 排除 confirm-project-uninstall（在确认上下文中有自己的 confirm:no 处理器 —— 让此事件触发会产生竞争处理器）
  // 和 confirm-data-cleanup（使用原始 useInput，其中 n 和 escape 是不同的操作：保留数据 vs 取消）。
  useKeybinding('confirm:no', handleBack, {
    context: 'Confirmation',
    isActive:
      (viewState !== 'plugin-list' || !isSearchMode) &&
      viewState !== 'confirm-project-uninstall' &&
      !(typeof viewState === 'object' && viewState.type === 'confirm-data-cleanup'),
  });

  // 获取 MCP 状态的辅助函数
  const getMcpStatus = (
    client: MCPServerConnection,
  ): 'connected' | 'disabled' | 'pending' | 'needs-auth' | 'failed' => {
    if (client.type === 'connected') return 'connected';
    if (client.type === 'disabled') return 'disabled';
    if (client.type === 'pending') return 'pending';
    if (client.type === 'needs-auth') return 'needs-auth';
    return 'failed';
  };

  // 从插件和 MCP 服务器派生统一项
  const unifiedItems = useMemo(() => {
    const mergedSettings = getSettings_DEPRECATED();

    // 构建插件名称 -> 子 MCP 的映射
    // 插件 MCP 的名称类似 "plugin:pluginName:serverName"
    const pluginMcpMap = new Map<
      string,
      Array<{ displayName: string; client: MCPServerConnection }>
    >();
    for (const client of mcpClients) {
      if (client.name.startsWith('plugin:')) {
        const parts = client.name.split(':');
        if (parts.length >= 3) {
          const pluginName = parts[1]!;
          const serverName = parts.slice(2).join(':');
          const existing = pluginMcpMap.get(pluginName) || [];
          existing.push({ displayName: serverName, client });
          pluginMcpMap.set(pluginName, existing);
        }
      }
    }

    // 构建插件项（暂不排序）
    type PluginWithChildren = {
      item: UnifiedInstalledItem & { type: 'plugin' };
      originalScope: 'user' | 'project' | 'local' | 'managed' | 'builtin';
      childMcps: Array<{ displayName: string; client: MCPServerConnection }>;
    };
    const pluginsWithChildren: PluginWithChildren[] = [];

    for (const state of pluginStates) {
      const pluginId = `${state.plugin.name}@${state.marketplace}`;
      const isEnabled = mergedSettings?.enabledPlugins?.[pluginId] !== false;
      const errors = pluginErrors.filter(
        e =>
          ('plugin' in e && e.plugin === state.plugin.name) ||
          e.source === pluginId ||
          e.source.startsWith(`${state.plugin.name}@`),
      );

      // 内置插件使用 'builtin' 作用域；其他从 V2 数据中查找。
      const originalScope = state.plugin.isBuiltin ? 'builtin' : state.scope || 'user';
      pluginsWithChildren.push({
        item: {
          type: 'plugin',
          id: pluginId,
          name: state.plugin.name,
          description: state.plugin.manifest.description,
          marketplace: state.marketplace,
          scope: originalScope,
          isEnabled,
          errorCount: errors.length,
          errors,
          plugin: state.plugin,
          pendingEnable: state.pendingEnable,
          pendingUpdate: state.pendingUpdate,
          pendingToggle: pendingToggles.get(pluginId),
        },
        originalScope,
        childMcps: pluginMcpMap.get(state.plugin.name) || [],
      });
    }

    // 查找孤儿错误（完全加载失败的插件）
    const matchedPluginIds = new Set(pluginsWithChildren.map(({ item }) => item.id));
    const matchedPluginNames = new Set(pluginsWithChildren.map(({ item }) => item.name));
    const orphanErrorsBySource = new Map<string, typeof pluginErrors>();
    for (const error of pluginErrors) {
      if (
        matchedPluginIds.has(error.source) ||
        ('plugin' in error && typeof error.plugin === 'string' && matchedPluginNames.has(error.plugin))
      ) {
        continue;
      }
      const existing = orphanErrorsBySource.get(error.source) || [];
      existing.push(error);
      orphanErrorsBySource.set(error.source, existing);
    }
    const pluginScopes = getPluginEditableScopes();
    const failedPluginItems: UnifiedInstalledItem[] = [];
    for (const [pluginId, errors] of orphanErrorsBySource) {
      // 跳过已在标记部分显示的插件
      if (pluginId in flaggedPlugins) continue;
      const parsed = parsePluginIdentifier(pluginId);
      const pluginName = parsed.name || pluginId;
      const marketplace = parsed.marketplace || 'unknown';
      const rawScope = pluginScopes.get(pluginId);
      // 'flag' 是会话级的（来自 --plugin-dir / flagSettings），undefined 表示插件不在任何设置源中。
      // 默认都使用 'user'，因为 UnifiedInstalledItem 没有 'flag' 作用域变体。
      const scope = rawScope === 'flag' || rawScope === undefined ? 'user' : rawScope;
      failedPluginItems.push({
        type: 'failed-plugin',
        id: pluginId,
        name: pluginName,
        marketplace,
        scope,
        errorCount: errors.length,
        errors,
      });
    }

    // 构建独立 MCP 项
    const standaloneMcps: UnifiedInstalledItem[] = [];
    for (const client of mcpClients) {
      if (client.name === 'ide') continue;
      if (client.name.startsWith('plugin:')) continue;

      standaloneMcps.push({
        type: 'mcp',
        id: `mcp:${client.name}`,
        name: client.name,
        description: undefined,
        scope: client.config.scope,
        status: getMcpStatus(client),
        client,
      });
    }

    // 定义显示作用域的顺序
    const scopeOrder: Record<string, number> = {
      flagged: -1,
      project: 0,
      local: 1,
      user: 2,
      enterprise: 3,
      managed: 4,
      dynamic: 5,
      builtin: 6,
    };

    // 通过合并插件（及其子 MCP）和独立 MCP 构建最终列表
    // 按作用域分组以避免重复的作用域标题
    const unified: UnifiedInstalledItem[] = [];

    // 创建作用域 -> 项映射以便正确合并
    const itemsByScope = new Map<string, UnifiedInstalledItem[]>();

    // 添加插件及其子 MCP
    for (const { item, originalScope, childMcps } of pluginsWithChildren) {
      const scope = item.scope;
      if (!itemsByScope.has(scope)) {
        itemsByScope.set(scope, []);
      }
      itemsByScope.get(scope)!.push(item);
      // 在插件之后立即添加子 MCP，缩进（使用原始作用域，而不是 'flagged'）。
      // 内置插件映射到 'user' 用于显示，因为 MCP ConfigScope 不包含 'builtin'。
      for (const { displayName, client } of childMcps) {
        const displayScope = originalScope === 'builtin' ? 'user' : originalScope;
        if (!itemsByScope.has(displayScope)) {
          itemsByScope.set(displayScope, []);
        }
        itemsByScope.get(displayScope)!.push({
          type: 'mcp',
          id: `mcp:${client.name}`,
          name: displayName,
          description: undefined,
          scope: displayScope,
          status: getMcpStatus(client),
          client,
          indented: true,
        });
      }
    }

    // 将独立 MCP 添加到其各自的作用域组
    for (const mcp of standaloneMcps) {
      const scope = mcp.scope;
      if (!itemsByScope.has(scope)) {
        itemsByScope.set(scope, []);
      }
      itemsByScope.get(scope)!.push(mcp);
    }

    // 将失败的插件添加到其各自的作用域组
    for (const failedPlugin of failedPluginItems) {
      const scope = failedPlugin.scope;
      if (!itemsByScope.has(scope)) {
        itemsByScope.set(scope, []);
      }
      itemsByScope.get(scope)!.push(failedPlugin);
    }

    // 从用户设置中添加标记（已下架）的插件。
    // 原因/文本从缓存的安全消息文件中查找。
    for (const [pluginId, entry] of Object.entries(flaggedPlugins)) {
      const parsed = parsePluginIdentifier(pluginId);
      const pluginName = parsed.name || pluginId;
      const marketplace = parsed.marketplace || 'unknown';
      if (!itemsByScope.has('flagged')) {
        itemsByScope.set('flagged', []);
      }
      itemsByScope.get('flagged')!.push({
        type: 'flagged-plugin',
        id: pluginId,
        name: pluginName,
        marketplace,
        scope: 'flagged',
        reason: 'delisted',
        text: '已从市场移除',
        flaggedAt: entry.flaggedAt,
      });
    }

    // 排序作用域并构建最终列表
    const sortedScopes = [...itemsByScope.keys()].sort(
      (a, b) => (scopeOrder[a] ?? 99) - (scopeOrder[b] ?? 99),
    );

    for (const scope of sortedScopes) {
      const items = itemsByScope.get(scope)!;

      // 将项分离为插件组（及其子 MCP）和独立 MCP
      // 这样可以保留通过简单排序会被破坏的父子关系
      const pluginGroups: UnifiedInstalledItem[][] = [];
      const standaloneMcpsInScope: UnifiedInstalledItem[] = [];
      let i = 0;
      while (i < items.length) {
        const item = items[i]!;
        if (
          item.type === 'plugin' ||
          item.type === 'failed-plugin' ||
          item.type === 'flagged-plugin'
        ) {
          // 将插件及其子 MCP 收集为一组
          const group: UnifiedInstalledItem[] = [item];
          i++;
          // 向前查找缩进的子 MCP
          let nextItem = items[i];
          while (nextItem?.type === 'mcp' && nextItem.indented) {
            group.push(nextItem);
            i++;
            nextItem = items[i];
          }
          pluginGroups.push(group);
        } else if (item.type === 'mcp' && !item.indented) {
          // 独立 MCP（不是插件的子项）
          standaloneMcpsInScope.push(item);
          i++;
        } else {
          // 跳过孤立的缩进 MCP（不应发生）
          i++;
        }
      }

      // 按插件名称排序插件组（每组的第一项）
      pluginGroups.sort((a, b) => a[0]!.name.localeCompare(b[0]!.name));

      // 按名称排序独立 MCP
      standaloneMcpsInScope.sort((a, b) => a.name.localeCompare(b.name));

      // 构建最终列表：先插件（及其子项），然后独立 MCP
      for (const group of pluginGroups) {
        unified.push(...group);
      }
      unified.push(...standaloneMcpsInScope);
    }

    return unified;
  }, [pluginStates, mcpClients, pluginErrors, pendingToggles, flaggedPlugins]);

  // 当“已安装”视图渲染它们时，将标记的插件标记为已见。
  // 在 seenAt 之后 48 小时，它们将在下次加载时自动清除。
  const flaggedIds = useMemo(
    () =>
      unifiedItems
        .filter(item => item.type === 'flagged-plugin')
        .map(item => item.id),
    [unifiedItems],
  );
  useEffect(() => {
    if (flaggedIds.length > 0) {
      void markFlaggedPluginsSeen(flaggedIds);
    }
  }, [flaggedIds]);

  // 根据搜索查询筛选项（匹配名称或描述）
  const filteredItems = useMemo(() => {
    if (!searchQuery) return unifiedItems;
    const lowerQuery = searchQuery.toLowerCase();
    return unifiedItems.filter(
      item =>
        item.name.toLowerCase().includes(lowerQuery) ||
        ('description' in item && item.description?.toLowerCase().includes(lowerQuery)),
    );
  }, [unifiedItems, searchQuery]);

  // 选择状态
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 统一列表的分页（连续滚动）
  const pagination = usePagination<UnifiedInstalledItem>({
    totalItems: filteredItems.length,
    selectedIndex,
    maxVisible: 8,
  });

  // 详情视图状态
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // 配置状态
  const [configNeeded, setConfigNeeded] = useState<McpbNeedsConfigResult | null>(null);
  const [_isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [selectedPluginHasMcpb, setSelectedPluginHasMcpb] = useState(false);

  // 检测所选插件是否有 MCPB
  // 直接读取原始 marketplace.json 以兼容旧缓存市场
  useEffect(() => {
    if (!selectedPlugin) {
      setSelectedPluginHasMcpb(false);
      return;
    }

    async function detectMcpb() {
      // 首先检查插件清单
      const mcpServersSpec = selectedPlugin!.plugin.manifest.mcpServers;
      let hasMcpb = false;

      if (mcpServersSpec) {
        hasMcpb =
          (typeof mcpServersSpec === 'string' && isMcpbSource(mcpServersSpec)) ||
          (Array.isArray(mcpServersSpec) &&
            mcpServersSpec.some(s => typeof s === 'string' && isMcpbSource(s)));
      }

      // 如果清单中没有，直接读取原始 marketplace.json（绕过模式验证）
      // 这甚至适用于来自 MCPB 支持之前的旧缓存市场
      if (!hasMcpb) {
        try {
          const marketplaceDir = path.join(selectedPlugin!.plugin.path, '..');
          const marketplaceJsonPath = path.join(marketplaceDir, '.claude-plugin', 'marketplace.json');
          const content = await fs.readFile(marketplaceJsonPath, 'utf-8');
          const marketplace = jsonParse(content);
          const entry = marketplace.plugins?.find(
            (p: { name: string }) => p.name === selectedPlugin!.plugin.name,
          );
          if (entry?.mcpServers) {
            const spec = entry.mcpServers;
            hasMcpb =
              (typeof spec === 'string' && isMcpbSource(spec)) ||
              (Array.isArray(spec) &&
                spec.some((s: unknown) => typeof s === 'string' && isMcpbSource(s)));
          }
        } catch (err) {
          logForDebugging(`读取原始 marketplace.json 失败：${err}`);
        }
      }
      setSelectedPluginHasMcpb(hasMcpb);
    }
    void detectMcpb();
  }, [selectedPlugin]);

  // 加载按市场分组的已安装插件
  useEffect(() => {
    async function loadInstalledPlugins() {
      setLoading(true);
      try {
        const { enabled, disabled } = await loadAllPlugins();
        const mergedSettings = getSettings_DEPRECATED(); // 使用合并的设置以尊重所有层级

        const allPlugins = filterManagedDisabledPlugins([...enabled, ...disabled]);

        // 按市场分组插件
        const pluginsByMarketplace: Record<string, LoadedPlugin[]> = {};
        for (const plugin of allPlugins) {
          const marketplace = plugin.source.split('@')[1] || 'local';
          if (!pluginsByMarketplace[marketplace]) {
            pluginsByMarketplace[marketplace] = [];
          }
          pluginsByMarketplace[marketplace]!.push(plugin);
        }

        // 创建带有启用/禁用计数的市场信息数组
        const marketplaceInfos: MarketplaceInfo[] = [];
        for (const [name, plugins] of Object.entries(pluginsByMarketplace)) {
          const enabledCount = count(plugins, p => {
            const pluginId = `${p.name}@${name}`;
            return mergedSettings?.enabledPlugins?.[pluginId] !== false;
          });
          const disabledCount = plugins.length - enabledCount;

          marketplaceInfos.push({
            name,
            installedPlugins: plugins,
            enabledCount,
            disabledCount,
          });
        }

        // 排序市场：claude-plugin-directory 优先，然后按字母顺序
        marketplaceInfos.sort((a, b) => {
          if (a.name === 'claude-plugin-directory') return -1;
          if (b.name === 'claude-plugin-directory') return 1;
          return a.name.localeCompare(b.name);
        });
        setMarketplaces(marketplaceInfos);

        // 构建所有插件状态的扁平列表
        const allStates: PluginState[] = [];
        for (const marketplace of marketplaceInfos) {
          for (const plugin of marketplace.installedPlugins) {
            const pluginId = `${plugin.name}@${marketplace.name}`;
            // 内置插件没有 V2 安装条目 —— 跳过查找。
            const scope = plugin.isBuiltin
              ? 'builtin'
              : getPluginInstallationFromV2(pluginId).scope;

            allStates.push({
              plugin,
              marketplace: marketplace.name,
              scope,
              pendingEnable: undefined,
              pendingUpdate: false,
            });
          }
        }
        setPluginStates(allStates);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
    }
    void loadInstalledPlugins();
  }, []);

  // 如果指定了目标插件，自动导航到它（仅一次）
  useEffect(() => {
    if (hasAutoNavigated.current) return;
    if (targetPlugin && marketplaces.length > 0 && !loading) {
      // targetPlugin 可能是 `name` 或 `name@marketplace`（parseArgs 传递原始参数）。
      // 解析它以便 p.name 匹配两种方式都能工作。
      const { name: targetName, marketplace: targetMktFromId } = parsePluginIdentifier(targetPlugin);
      const effectiveTargetMarketplace = targetMarketplace ?? targetMktFromId;

      // 如果提供了 targetMarketplace 则使用，否则搜索所有
      const marketplacesToSearch = effectiveTargetMarketplace
        ? marketplaces.filter(m => m.name === effectiveTargetMarketplace)
        : marketplaces;

      // 首先检查成功加载的插件
      for (const marketplace of marketplacesToSearch) {
        const plugin = marketplace.installedPlugins.find(p => p.name === targetName);
        if (plugin) {
          // 从 V2 数据获取作用域以正确处理操作
          const pluginId = `${plugin.name}@${marketplace.name}`;
          const { scope } = getPluginInstallationFromV2(pluginId);

          const pluginState: PluginState = {
            plugin,
            marketplace: marketplace.name,
            scope,
            pendingEnable: undefined,
            pendingUpdate: false,
          };
          setSelectedPlugin(pluginState);
          setViewState('plugin-details');
          pendingAutoActionRef.current = action;
          hasAutoNavigated.current = true;
          return;
        }
      }

      // 回退到失败的插件（有错误但未加载的插件）
      const failedItem = unifiedItems.find(
        item => item.type === 'failed-plugin' && item.name === targetName,
      );
      if (failedItem && failedItem.type === 'failed-plugin') {
        setViewState({
          type: 'failed-plugin-details',
          plugin: {
            id: failedItem.id,
            name: failedItem.name,
            marketplace: failedItem.marketplace,
            errors: failedItem.errors,
            scope: failedItem.scope,
          },
        });
        hasAutoNavigated.current = true;
      }

      // 在已加载或失败的插件中都没有匹配 —— 关闭对话框并显示消息，而不是静默停留在插件列表。
      // 仅在请求了操作时执行此操作（例如 /plugin uninstall X）；
      // 纯导航（/plugin manage）应该仍然只显示列表。
      if (!hasAutoNavigated.current && action) {
        hasAutoNavigated.current = true;
        setResult(`插件“${targetPlugin}”未在此项目中安装`);
      }
    }
  }, [targetPlugin, targetMarketplace, marketplaces, loading, unifiedItems, action, setResult]);

  // 从详情视图处理单个插件操作
  const handleSingleOperation = async (
    operation: 'enable' | 'disable' | 'update' | 'uninstall',
  ) => {
    if (!selectedPlugin) return;

    const pluginScope = selectedPlugin.scope || 'user';
    const isBuiltin = pluginScope === 'builtin';

    // 内置插件只能启用/禁用，不能更新/卸载。
    if (isBuiltin && (operation === 'update' || operation === 'uninstall')) {
      setProcessError('内置插件无法更新或卸载。');
      return;
    }

    // 托管作用域的插件只能更新，不能启用/禁用/卸载
    if (!isBuiltin && !isInstallableScope(pluginScope) && operation !== 'update') {
      setProcessError('此插件由您的组织管理。请联系管理员禁用它。');
      return;
    }

    setIsProcessing(true);
    setProcessError(null);

    try {
      const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
      let reverseDependents: string[] | undefined;

      // enable/disable 省略作用域 —— pluginScope 是来自 installed_plugins.json 的安装作用域（缓存文件的位置），
      // 可能与设置作用域（启用状态所在位置）不同。传递它会触发跨作用域保护。自动检测会找到正确的作用域。#38084
      switch (operation) {
        case 'enable': {
          const enableResult = await enablePluginOp(pluginId);
          if (!enableResult.success) {
            throw new Error(enableResult.message);
          }
          break;
        }
        case 'disable': {
          const disableResult = await disablePluginOp(pluginId);
          if (!disableResult.success) {
            throw new Error(disableResult.message);
          }
          reverseDependents = disableResult.reverseDependents;
          break;
        }
        case 'uninstall': {
          if (isBuiltin) break; // 已在上面防护；收窄 pluginScope
          if (!isInstallableScope(pluginScope)) break;
          // 如果插件在 .claude/settings.json 中启用（与团队共享），则转到一个确认对话框，改为在 settings.local.json 中禁用。
          // 直接检查设置文件 —— `pluginScope`（来自 installed_plugins.json）可能是 'user'，即使插件也启用了项目范围，
          // 卸载用户作用域的安装将使项目启用状态保持激活。
          if (isPluginEnabledAtProjectScope(pluginId)) {
            setIsProcessing(false);
            setViewState('confirm-project-uninstall');
            return;
          }
          // 如果插件有持久数据（${CLAUDE_PLUGIN_DATA}）且这是最后一个作用域，则在删除前提示。
          // 对于多作用域安装，操作的 isLastScope 检查无论用户 y/n 都不会删除 —— 显示对话框会误导（"y" → 什么都不发生）。
          // 长度检查与 pluginOperations.ts:513 一致。
          const installs = loadInstalledPluginsV2().plugins[pluginId];
          const isLastScope = !installs || installs.length <= 1;
          const dataSize = isLastScope ? await getPluginDataDirSize(pluginId) : null;
          if (dataSize) {
            setIsProcessing(false);
            setViewState({ type: 'confirm-data-cleanup', size: dataSize });
            return;
          }
          const result = await uninstallPluginOp(pluginId, pluginScope);
          if (!result.success) {
            throw new Error(result.message);
          }
          reverseDependents = result.reverseDependents;
          break;
        }
        case 'update': {
          if (isBuiltin) break; // 已在上面防护；收窄 pluginScope
          const result = await updatePluginOp(pluginId, pluginScope);
          if (!result.success) {
            throw new Error(result.message);
          }
          // 如果已经是最新版本，显示消息并退出
          if (result.alreadyUpToDate) {
            setResult(`${selectedPlugin.plugin.name} 已是最新版本 (${result.newVersion})。`);
            if (onManageComplete) {
              await onManageComplete();
            }
            setParentViewState({ type: 'menu' });
            return;
          }
          // 成功 - 将在下面显示标准消息
          break;
        }
      }

      // 操作（启用、禁用、卸载、更新）现在使用集中式函数，
      // 这些函数处理自己的设置更新，因此我们只需要在此处清除缓存
      clearAllCaches();

      // 如果插件最终被启用，提示 manifest.userConfig + channel userConfig。
      // 重新读取设置而不是依赖于 `operation === 'enable'`：安装时启用，所以菜单首先显示“禁用”。
      // PluginOptionsFlow 本身会检查 getUnconfiguredOptions —— 如果不需要填写任何内容，它会立即调用 onDone('skipped')。
      const pluginIdNow = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
      const settingsAfter = getSettings_DEPRECATED();
      const enabledAfter = settingsAfter?.enabledPlugins?.[pluginIdNow] !== false;
      if (enabledAfter) {
        setIsProcessing(false);
        setViewState({ type: 'plugin-options' });
        return;
      }

      const operationName =
        operation === 'enable'
          ? '已启用'
          : operation === 'disable'
            ? '已禁用'
            : operation === 'update'
              ? '已更新'
              : '已卸载';

      // 单行警告 —— 通知超时约 8 秒，多行会滚出屏幕。
      // 持久记录在“错误”标签页中（重载后依赖未满足）。
      const depWarn =
        reverseDependents && reverseDependents.length > 0
          ? ` · 被 ${reverseDependents.join(', ')} 依赖`
          : '';
      const message = `✓ ${operationName} ${selectedPlugin.plugin.name}${depWarn}。运行 /reload-plugins 以应用。`;
      setResult(message);
      if (onManageComplete) {
        await onManageComplete();
      }
      setParentViewState({ type: 'menu' });
    } catch (error) {
      setIsProcessing(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setProcessError(`${operation} 失败：${errorMessage}`);
      logError(toError(error));
    }
  };

  // 最新引用：让自动操作 effect 调用当前闭包，而无需将 handleSingleOperation（每次渲染重新创建）添加到其依赖项中。
  const handleSingleOperationRef = useRef(handleSingleOperation);
  handleSingleOperationRef.current = handleSingleOperation;

  // 一旦自动导航到达 plugin-details，自动执行 action prop（/plugin uninstall X, /plugin enable X 等）
  useEffect(() => {
    if (viewState === 'plugin-details' && selectedPlugin && pendingAutoActionRef.current) {
      const pending = pendingAutoActionRef.current;
      pendingAutoActionRef.current = undefined;
      void handleSingleOperationRef.current(pending);
    }
  }, [viewState, selectedPlugin]);

  // 处理启用/禁用切换
  const handleToggle = React.useCallback(() => {
    if (selectedIndex >= filteredItems.length) return;
    const item = filteredItems[selectedIndex];
    if (item?.type === 'flagged-plugin') return;
    if (item?.type === 'plugin') {
      const pluginId = `${item.plugin.name}@${item.marketplace}`;
      const mergedSettings = getSettings_DEPRECATED();
      const currentPending = pendingToggles.get(pluginId);
      const isEnabled = mergedSettings?.enabledPlugins?.[pluginId] !== false;
      const pluginScope = item.scope;
      const isBuiltin = pluginScope === 'builtin';
      if (isBuiltin || isInstallableScope(pluginScope)) {
        const newPending = new Map(pendingToggles);
        // 省略作用域 —— 参见 handleSingleOperation 中 enable/disable 的注释。
        if (currentPending) {
          // 取消：将操作反转回原始状态
          newPending.delete(pluginId);
          void (async () => {
            try {
              if (currentPending === 'will-disable') {
                await enablePluginOp(pluginId);
              } else {
                await disablePluginOp(pluginId);
              }
              clearAllCaches();
            } catch (err) {
              logError(err);
            }
          })();
        } else {
          newPending.set(pluginId, isEnabled ? 'will-disable' : 'will-enable');
          void (async () => {
            try {
              if (isEnabled) {
                await disablePluginOp(pluginId);
              } else {
                await enablePluginOp(pluginId);
              }
              clearAllCaches();
            } catch (err) {
              logError(err);
            }
          })();
        }
        setPendingToggles(newPending);
      }
    } else if (item?.type === 'mcp') {
      void toggleMcpServer(item.client.name);
    }
  }, [selectedIndex, filteredItems, pendingToggles, pluginStates, toggleMcpServer]);

  // 在 plugin-list 中处理接受（Enter）
  const handleAccept = React.useCallback(() => {
    if (selectedIndex >= filteredItems.length) return;
    const item = filteredItems[selectedIndex];
    if (item?.type === 'plugin') {
      const state = pluginStates.find(
        s => s.plugin.name === item.plugin.name && s.marketplace === item.marketplace,
      );
      if (state) {
        setSelectedPlugin(state);
        setViewState('plugin-details');
        setDetailsMenuIndex(0);
        setProcessError(null);
      }
    } else if (item?.type === 'flagged-plugin') {
      setViewState({
        type: 'flagged-detail',
        plugin: {
          id: item.id,
          name: item.name,
          marketplace: item.marketplace,
          reason: item.reason,
          text: item.text,
          flaggedAt: item.flaggedAt,
        },
      });
      setProcessError(null);
    } else if (item?.type === 'failed-plugin') {
      setViewState({
        type: 'failed-plugin-details',
        plugin: {
          id: item.id,
          name: item.name,
          marketplace: item.marketplace,
          errors: item.errors,
          scope: item.scope,
        },
      });
      setDetailsMenuIndex(0);
      setProcessError(null);
    } else if (item?.type === 'mcp') {
      setViewState({ type: 'mcp-detail', client: item.client });
      setProcessError(null);
    }
  }, [selectedIndex, filteredItems, pluginStates]);

  // 插件列表导航（非搜索模式）
  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex === 0) {
          setIsSearchMode(true);
        } else {
          pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex);
        }
      },
      'select:next': () => {
        if (selectedIndex < filteredItems.length - 1) {
          pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex);
        }
      },
      'select:accept': handleAccept,
    },
    {
      context: 'Select',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  );

  useKeybindings(
    { 'plugin:toggle': handleToggle },
    {
      context: 'Plugin',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  );

  // 处理 flagged-detail 视图中的关闭操作
  const handleFlaggedDismiss = React.useCallback(() => {
    if (typeof viewState !== 'object' || viewState.type !== 'flagged-detail') return;
    void removeFlaggedPlugin(viewState.plugin.id);
    setViewState('plugin-list');
  }, [viewState]);

  useKeybindings(
    { 'select:accept': handleFlaggedDismiss },
    {
      context: 'Select',
      isActive: typeof viewState === 'object' && viewState.type === 'flagged-detail',
    },
  );

  // 构建详情菜单项（导航所需）
  const detailsMenuItems = React.useMemo(() => {
    if (viewState !== 'plugin-details' || !selectedPlugin) return [];

    const mergedSettings = getSettings_DEPRECATED();
    const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    const isEnabled = mergedSettings?.enabledPlugins?.[pluginId] !== false;
    const isBuiltin = selectedPlugin.marketplace === 'builtin';

    const menuItems: Array<{ label: string; action: () => void }> = [];

    menuItems.push({
      label: isEnabled ? '禁用插件' : '启用插件',
      action: () => void handleSingleOperation(isEnabled ? 'disable' : 'enable'),
    });

    // 更新/卸载选项 —— 内置插件不可用
    if (!isBuiltin) {
      menuItems.push({
        label: selectedPlugin.pendingUpdate ? '取消标记更新' : '标记为更新',
        action: async () => {
          try {
            const localError = await checkIfLocalPlugin(
              selectedPlugin.plugin.name,
              selectedPlugin.marketplace,
            );
            if (localError) {
              setProcessError(localError);
              return;
            }
            const newStates = [...pluginStates];
            const index = newStates.findIndex(
              s =>
                s.plugin.name === selectedPlugin.plugin.name &&
                s.marketplace === selectedPlugin.marketplace,
            );
            if (index !== -1) {
              newStates[index]!.pendingUpdate = !selectedPlugin.pendingUpdate;
              setPluginStates(newStates);
              setSelectedPlugin({
                ...selectedPlugin,
                pendingUpdate: !selectedPlugin.pendingUpdate,
              });
            }
          } catch (error) {
            setProcessError(
              error instanceof Error ? error.message : '检查插件更新可用性失败',
            );
          }
        },
      });

      if (selectedPluginHasMcpb) {
        menuItems.push({
          label: '配置',
          action: async () => {
            setIsLoadingConfig(true);
            try {
              const mcpServersSpec = selectedPlugin.plugin.manifest.mcpServers;

              let mcpbPath: string | null = null;
              if (typeof mcpServersSpec === 'string' && isMcpbSource(mcpServersSpec)) {
                mcpbPath = mcpServersSpec;
              } else if (Array.isArray(mcpServersSpec)) {
                for (const spec of mcpServersSpec) {
                  if (typeof spec === 'string' && isMcpbSource(spec)) {
                    mcpbPath = spec;
                    break;
                  }
                }
              }

              if (!mcpbPath) {
                setProcessError('插件中未找到 MCPB 文件');
                setIsLoadingConfig(false);
                return;
              }

              const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
              const result = await loadMcpbFile(
                mcpbPath,
                selectedPlugin.plugin.path,
                pluginId,
                undefined,
                undefined,
                true,
              );

              if ('status' in result && result.status === 'needs-config') {
                setConfigNeeded(result);
                setViewState('configuring');
              } else {
                setProcessError('加载 MCPB 进行配置失败');
              }
            } catch (err) {
              const errorMsg = errorMessage(err);
              setProcessError(`加载配置失败：${errorMsg}`);
            } finally {
              setIsLoadingConfig(false);
            }
          },
        });
      }

      if (
        selectedPlugin.plugin.manifest.userConfig &&
        Object.keys(selectedPlugin.plugin.manifest.userConfig).length > 0
      ) {
        menuItems.push({
          label: '配置选项',
          action: () => {
            setViewState({
              type: 'configuring-options',
              schema: selectedPlugin.plugin.manifest.userConfig!,
            });
          },
        });
      }

      menuItems.push({
        label: '立即更新',
        action: () => void handleSingleOperation('update'),
      });

      menuItems.push({
        label: '卸载',
        action: () => void handleSingleOperation('uninstall'),
      });
    }

    if (selectedPlugin.plugin.manifest.homepage) {
      menuItems.push({
        label: '打开主页',
        action: () => void openBrowser(selectedPlugin.plugin.manifest.homepage!),
      });
    }

    if (selectedPlugin.plugin.manifest.repository) {
      menuItems.push({
        // 通用标签 —— manifest.repository 可以是 GitLab、Bitbucket、Azure DevOps 等（gh-31598）。
        // pluginDetailsHelpers.tsx:74 保留“View on GitHub”是因为该路径有明确的 isGitHub 检查。
        label: '查看仓库',
        action: () => void openBrowser(selectedPlugin.plugin.manifest.repository!),
      });
    }

    menuItems.push({
      label: '返回插件列表',
      action: () => {
        setViewState('plugin-list');
        setSelectedPlugin(null);
        setProcessError(null);
      },
    });

    return menuItems;
  }, [viewState, selectedPlugin, selectedPluginHasMcpb, pluginStates]);

  // 插件详情导航
  useKeybindings(
    {
      'select:previous': () => {
        if (detailsMenuIndex > 0) {
          setDetailsMenuIndex(detailsMenuIndex - 1);
        }
      },
      'select:next': () => {
        if (detailsMenuIndex < detailsMenuItems.length - 1) {
          setDetailsMenuIndex(detailsMenuIndex + 1);
        }
      },
      'select:accept': () => {
        if (detailsMenuItems[detailsMenuIndex]) {
          detailsMenuItems[detailsMenuIndex]!.action();
        }
      },
    },
    {
      context: 'Select',
      isActive: viewState === 'plugin-details' && !!selectedPlugin,
    },
  );

  // 失败插件详情：只有“卸载”选项，处理 Enter
  useKeybindings(
    {
      'select:accept': () => {
        if (typeof viewState === 'object' && viewState.type === 'failed-plugin-details') {
          void (async () => {
            setIsProcessing(true);
            setProcessError(null);
            const pluginId = viewState.plugin.id;
            const pluginScope = viewState.plugin.scope;
            // 传递作用域给 uninstallPluginOp，以便它能够找到正确的 V2 安装记录并清理磁盘文件。
            // 如果作用域不可安装（例如 'managed'，尽管下面的 isActive 防护了这种情况），则回退到默认作用域。
            // deleteDataDir=false：这是加载失败插件的恢复路径 —— 它可能可以重新安装，所以不要静默删除 ${CLAUDE_PLUGIN_DATA}。
            // 正常卸载路径会提示；此路径保留数据。
            const result = isInstallableScope(pluginScope)
              ? await uninstallPluginOp(pluginId, pluginScope, false)
              : await uninstallPluginOp(pluginId, 'user', false);
            let success = result.success;
            if (!success) {
              // 插件从未安装（仅在 enabledPlugins 设置中）。
              // 直接从所有可编辑的设置源中移除。
              const editableSources = [
                'userSettings' as const,
                'projectSettings' as const,
                'localSettings' as const,
              ];
              for (const source of editableSources) {
                const settings = getSettingsForSource(source);
                if (settings?.enabledPlugins?.[pluginId] !== undefined) {
                  updateSettingsForSource(source, {
                    enabledPlugins: {
                      ...settings.enabledPlugins,
                      [pluginId]: undefined,
                    },
                  });
                  success = true;
                }
              }
              // 清除记忆缓存，以便下次 loadAllPlugins() 获取设置更改
              clearAllCaches();
            }
            if (success) {
              if (onManageComplete) {
                await onManageComplete();
              }
              setIsProcessing(false);
              // 返回列表（不要 setResult —— 那会关闭整个对话框）
              setViewState('plugin-list');
            } else {
              setIsProcessing(false);
              setProcessError(result.message);
            }
          })();
        }
      },
    },
    {
      context: 'Select',
      isActive:
        typeof viewState === 'object' &&
        viewState.type === 'failed-plugin-details' &&
        viewState.plugin.scope !== 'managed',
    },
  );

  // 确认项目卸载：y/enter 在 settings.local.json 中禁用，n/escape 取消
  useKeybindings(
    {
      'confirm:yes': () => {
        if (!selectedPlugin) return;
        setIsProcessing(true);
        setProcessError(null);
        const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
        // 直接写入 `false` —— disablePluginOp 的跨作用域保护会拒绝此操作（插件尚未在 localSettings 中；覆盖正是目的）。
        const { error } = updateSettingsForSource('localSettings', {
          enabledPlugins: {
            ...getSettingsForSource('localSettings')?.enabledPlugins,
            [pluginId]: false,
          },
        });
        if (error) {
          setIsProcessing(false);
          setProcessError(`写入设置失败：${error.message}`);
          return;
        }
        clearAllCaches();
        setResult(
          `✓ 已在 .claude/settings.local.json 中禁用 ${selectedPlugin.plugin.name}。运行 /reload-plugins 以应用。`,
        );
        if (onManageComplete) void onManageComplete();
        setParentViewState({ type: 'menu' });
      },
      'confirm:no': () => {
        setViewState('plugin-details');
        setProcessError(null);
      },
    },
    {
      context: 'Confirmation',
      isActive: viewState === 'confirm-project-uninstall' && !!selectedPlugin && !isProcessing,
    },
  );

  // 确认数据清理：y 卸载并删除数据目录，n 卸载但保留数据，esc 取消。
  // 使用原始 useInput 因为：(1) 确认上下文将 enter 映射到 confirm:yes，这会使 Enter 删除数据目录 ——
  //     UI 文本（“y 删除 · n 保留”）没有宣传的破坏性默认行为；(2) 与 confirm-project-uninstall（使用 useKeybindings，
  //     其中 n 和 escape 都映射到 confirm:no）不同，这里 n 和 escape 是不同的操作（保留数据 vs 取消），
  //     因此故意保留原始 useInput。
  // eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw y/n/esc; Enter must not trigger destructive delete
  useInput(
    (input, key) => {
      if (!selectedPlugin) return;
      const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
      const pluginScope = selectedPlugin.scope;
      // 对话框仅在卸载情况下可达（已防护 isBuiltin），但 TS 无法跨视图状态转换跟踪。
      if (!pluginScope || pluginScope === 'builtin' || !isInstallableScope(pluginScope)) return;
      const doUninstall = async (deleteDataDir: boolean) => {
        setIsProcessing(true);
        setProcessError(null);
        try {
          const result = await uninstallPluginOp(pluginId, pluginScope, deleteDataDir);
          if (!result.success) throw new Error(result.message);
          clearAllCaches();
          const suffix = deleteDataDir ? '' : ' · 数据已保留';
          setResult(`${figures.tick} ${result.message}${suffix}`);
          if (onManageComplete) void onManageComplete();
          setParentViewState({ type: 'menu' });
        } catch (e) {
          setIsProcessing(false);
          setProcessError(e instanceof Error ? e.message : String(e));
        }
      };
      if (input === 'y' || input === 'Y') {
        void doUninstall(true);
      } else if (input === 'n' || input === 'N') {
        void doUninstall(false);
      } else if (key.escape) {
        setViewState('plugin-details');
        setProcessError(null);
      }
    },
    {
      isActive:
        typeof viewState === 'object' &&
        viewState.type === 'confirm-data-cleanup' &&
        !!selectedPlugin &&
        !isProcessing,
    },
  );

  // 当搜索查询更改时重置选择
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // 处理进入搜索模式的输入（文本输入由 useSearchInput 钩子处理）
  // eslint-disable-next-line custom-rules/prefer-use-keybindings -- useInput needed for raw search mode text input
  useInput(
    (input, key) => {
      const keyIsNotCtrlOrMeta = !key.ctrl && !key.meta;
      if (isSearchMode) {
        // 文本输入由 useSearchInput 钩子处理
        return;
      }

      // 使用 '/' 或任何可打印字符进入搜索模式（导航键除外）
      if (input === '/' && keyIsNotCtrlOrMeta) {
        setIsSearchMode(true);
        setSearchQuery('');
        setSelectedIndex(0);
      } else if (
        keyIsNotCtrlOrMeta &&
        input.length > 0 &&
        !/^\s+$/.test(input) &&
        input !== 'j' &&
        input !== 'k' &&
        input !== ' '
      ) {
        setIsSearchMode(true);
        setSearchQuery(input);
        setSelectedIndex(0);
      }
    },
    { isActive: viewState === 'plugin-list' },
  );

  // 加载状态
  if (loading) {
    return <Text>正在加载已安装的插件…</Text>;
  }

  // 没有安装插件或 MCP
  if (unifiedItems.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>管理插件</Text>
        </Box>
        <Text>未安装任何插件或 MCP 服务器。</Text>
        <Box marginTop={1}>
          <Text dimColor>按 Esc 返回</Text>
        </Box>
      </Box>
    );
  }

  if (
    typeof viewState === 'object' &&
    viewState.type === 'plugin-options' &&
    selectedPlugin
  ) {
    const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    function finish(msg: string): void {
      setResult(msg);
      // 无论配置是否保存或跳过，插件都已启用 —— onManageComplete → markPluginsChanged → 持久的“运行 /reload-plugins”通知。
      if (onManageComplete) {
        void onManageComplete();
      }
      setParentViewState({ type: 'menu' });
    }
    return (
      <PluginOptionsFlow
        plugin={selectedPlugin.plugin}
        pluginId={pluginId}
        onDone={(outcome, detail) => {
          switch (outcome) {
            case 'configured':
              finish(
                `✓ 已启用并配置 ${selectedPlugin.plugin.name}。运行 /reload-plugins 以应用。`,
              );
              break;
            case 'skipped':
              finish(`✓ 已启用 ${selectedPlugin.plugin.name}。运行 /reload-plugins 以应用。`);
              break;
            case 'error':
              finish(`保存配置失败：${detail}`);
              break;
          }
        }}
      />
    );
  }

  // 配置选项（从管理菜单）
  if (
    typeof viewState === 'object' &&
    viewState.type === 'configuring-options' &&
    selectedPlugin
  ) {
    const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    return (
      <PluginOptionsDialog
        title={`配置 ${selectedPlugin.plugin.name}`}
        subtitle="插件选项"
        configSchema={viewState.schema}
        initialValues={loadPluginOptions(pluginId)}
        onSave={values => {
          try {
            savePluginOptions(pluginId, values, viewState.schema);
            clearAllCaches();
            setResult('配置已保存。运行 /reload-plugins 以使更改生效。');
          } catch (err) {
            setProcessError(`保存配置失败：${errorMessage(err)}`);
          }
          setViewState('plugin-details');
        }}
        onCancel={() => setViewState('plugin-details')}
      />
    );
  }

  // 配置视图
  if (viewState === 'configuring' && configNeeded && selectedPlugin) {
    const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;

    async function handleSave(config: UserConfigValues) {
      if (!configNeeded || !selectedPlugin) return;

      try {
        // 再次查找 MCPB 路径
        const mcpServersSpec = selectedPlugin.plugin.manifest.mcpServers;
        let mcpbPath: string | null = null;

        if (typeof mcpServersSpec === 'string' && isMcpbSource(mcpServersSpec)) {
          mcpbPath = mcpServersSpec;
        } else if (Array.isArray(mcpServersSpec)) {
          for (const spec of mcpServersSpec) {
            if (typeof spec === 'string' && isMcpbSource(spec)) {
              mcpbPath = spec;
              break;
            }
          }
        }

        if (!mcpbPath) {
          setProcessError('未找到 MCPB 文件');
          setViewState('plugin-details');
          return;
        }

        // 使用提供的配置重新加载
        await loadMcpbFile(mcpbPath, selectedPlugin.plugin.path, pluginId, undefined, config);

        // 成功 - 返回详情
        setProcessError(null);
        setConfigNeeded(null);
        setViewState('plugin-details');
        setResult('配置已保存。运行 /reload-plugins 以使更改生效。');
      } catch (err) {
        const errorMsg = errorMessage(err);
        setProcessError(`保存配置失败：${errorMsg}`);
        setViewState('plugin-details');
      }
    }

    function handleCancel() {
      setConfigNeeded(null);
      setViewState('plugin-details');
    }

    return (
      <PluginOptionsDialog
        title={`配置 ${configNeeded.manifest.name}`}
        subtitle={`插件：${selectedPlugin.plugin.name}`}
        configSchema={configNeeded.configSchema}
        initialValues={configNeeded.existingConfig}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  // 标记的插件详情视图
  if (typeof viewState === 'object' && viewState.type === 'flagged-detail') {
    const fp = viewState.plugin;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>
            {fp.name} @ {fp.marketplace}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>状态：</Text>
          <Text color="error">已移除</Text>
        </Box>

        <Box marginBottom={1} flexDirection="column">
          <Text color="error">已从市场移除 · 原因：{fp.reason}</Text>
          <Text>{fp.text}</Text>
          <Text dimColor>标记于 {new Date(fp.flaggedAt).toLocaleDateString()}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text>{figures.pointer} </Text>
            <Text color="suggestion">关闭</Text>
          </Box>
        </Box>

        <Byline>
          <ConfigurableShortcutHint
            action="select:accept"
            context="Select"
            fallback="Enter"
            description="关闭"
          />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="返回"
          />
        </Byline>
      </Box>
    );
  }

  // 确认项目卸载：警告共享的 .claude/settings.json，改为在 settings.local.json 中禁用
  if (viewState === 'confirm-project-uninstall' && selectedPlugin) {
    return (
      <Box flexDirection="column">
        <Text bold color="warning">
          {selectedPlugin.plugin.name} 在 .claude/settings.json 中已启用（与您的团队共享）
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text>仅为您在 .claude/settings.local.json 中禁用它？</Text>
          <Text dimColor>这具有与卸载相同的效果，且不影响其他贡献者。</Text>
        </Box>
        {processError && (
          <Box marginTop={1}>
            <Text color="error">{processError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          {isProcessing ? (
            <Text dimColor>正在禁用…</Text>
          ) : (
            <Byline>
              <ConfigurableShortcutHint
                action="confirm:yes"
                context="Confirmation"
                fallback="y"
                description="禁用"
              />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="取消"
              />
            </Byline>
          )}
        </Box>
      </Box>
    );
  }

  // 确认数据清理：在删除 ${CLAUDE_PLUGIN_DATA} 目录之前提示
  if (typeof viewState === 'object' && viewState.type === 'confirm-data-cleanup' && selectedPlugin) {
    return (
      <Box flexDirection="column">
        <Text bold>
          {selectedPlugin.plugin.name} 有 {viewState.size.human} 的持久数据
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text>在卸载插件时一并删除这些数据？</Text>
          <Text dimColor>
            {pluginDataDirPath(`${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`)}
          </Text>
        </Box>
        {processError && (
          <Box marginTop={1}>
            <Text color="error">{processError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          {isProcessing ? (
            <Text dimColor>正在卸载…</Text>
          ) : (
            <Text>
              <Text bold>y</Text> 删除 · <Text bold>n</Text> 保留 · <Text bold>esc</Text> 取消
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  // 插件详情视图
  if (viewState === 'plugin-details' && selectedPlugin) {
    const mergedSettings = getSettings_DEPRECATED(); // 使用合并的设置以尊重所有层级
    const pluginId = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    const isEnabled = mergedSettings?.enabledPlugins?.[pluginId] !== false;

    // 计算插件错误部分
    const filteredPluginErrors = pluginErrors.filter(
      e =>
        ('plugin' in e && e.plugin === selectedPlugin.plugin.name) ||
        e.source === pluginId ||
        e.source.startsWith(`${selectedPlugin.plugin.name}@`),
    );
    const pluginErrorsSection =
      filteredPluginErrors.length === 0 ? null : (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="error">
            {filteredPluginErrors.length} {plural(filteredPluginErrors.length, '错误')}：
          </Text>
          {filteredPluginErrors.map((error, i) => {
            const guidance = getErrorGuidance(error);
            return (
              <Box key={i} flexDirection="column" marginLeft={2}>
                <Text color="error">{formatErrorMessage(error)}</Text>
                {guidance && (
                  <Text dimColor italic>
                    {figures.arrowRight} {guidance}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      );

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>
            {selectedPlugin.plugin.name} @ {selectedPlugin.marketplace}
          </Text>
        </Box>

        {/* 作用域 */}
        <Box>
          <Text dimColor>作用域：</Text>
          <Text>{selectedPlugin.scope || 'user'}</Text>
        </Box>

        {/* 插件详情 */}
        {selectedPlugin.plugin.manifest.version && (
          <Box>
            <Text dimColor>版本：</Text>
            <Text>{selectedPlugin.plugin.manifest.version}</Text>
          </Box>
        )}

        {selectedPlugin.plugin.manifest.description && (
          <Box marginBottom={1}>
            <Text>{selectedPlugin.plugin.manifest.description}</Text>
          </Box>
        )}

        {selectedPlugin.plugin.manifest.author && (
          <Box>
            <Text dimColor>作者：</Text>
            <Text>{selectedPlugin.plugin.manifest.author.name}</Text>
          </Box>
        )}

        {/* 当前状态 */}
        <Box marginBottom={1}>
          <Text dimColor>状态：</Text>
          <Text color={isEnabled ? 'success' : 'warning'}>{isEnabled ? '已启用' : '已禁用'}</Text>
          {selectedPlugin.pendingUpdate && <Text color="suggestion"> · 已标记更新</Text>}
        </Box>

        {/* 已安装组件 */}
        <PluginComponentsDisplay plugin={selectedPlugin.plugin} marketplace={selectedPlugin.marketplace} />

        {/* 插件错误 */}
        {pluginErrorsSection}

        {/* 菜单 */}
        <Box marginTop={1} flexDirection="column">
          {detailsMenuItems.map((item, index) => {
            const isSelected = index === detailsMenuIndex;
            return (
              <Box key={index}>
                {isSelected && <Text>{figures.pointer} </Text>}
                {!isSelected && <Text>{'  '}</Text>}
                <Text
                  bold={isSelected}
                  color={
                    item.label.includes('卸载')
                      ? 'error'
                      : item.label.includes('更新')
                        ? 'suggestion'
                        : undefined
                  }
                >
                  {item.label}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* 处理状态 */}
        {isProcessing && (
          <Box marginTop={1}>
            <Text>正在处理…</Text>
          </Box>
        )}

        {/* 错误消息 */}
        {processError && (
          <Box marginTop={1}>
            <Text color="error">{processError}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor italic>
            <Byline>
              <ConfigurableShortcutHint
                action="select:previous"
                context="Select"
                fallback="↑"
                description="导航"
              />
              <ConfigurableShortcutHint
                action="select:accept"
                context="Select"
                fallback="Enter"
                description="选择"
              />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="返回"
              />
            </Byline>
          </Text>
        </Box>
      </Box>
    );
  }

  // 失败插件详情视图
  if (typeof viewState === 'object' && viewState.type === 'failed-plugin-details') {
    const failedPlugin = viewState.plugin;
    const firstError = failedPlugin.errors[0];
    const errorMessage = firstError ? formatErrorMessage(firstError) : '加载失败';
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{failedPlugin.name}</Text>
          <Text dimColor> @ {failedPlugin.marketplace}</Text>
          <Text dimColor> ({failedPlugin.scope})</Text>
        </Text>
        <Text color="error">{errorMessage}</Text>

        {failedPlugin.scope === 'managed' ? (
          <Box marginTop={1}>
            <Text dimColor>由您的组织管理 — 请联系管理员</Text>
          </Box>
        ) : (
          <Box marginTop={1}>
            <Text color="suggestion">{figures.pointer} </Text>
            <Text bold>移除</Text>
          </Box>
        )}

        {isProcessing && <Text>正在处理…</Text>}
        {processError && <Text color="error">{processError}</Text>}

        <Box marginTop={1}>
          <Text dimColor italic>
            <Byline>
              {failedPlugin.scope !== 'managed' && (
                <ConfigurableShortcutHint
                  action="select:accept"
                  context="Select"
                  fallback="Enter"
                  description="移除"
                />
              )}
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="返回"
              />
            </Byline>
          </Text>
        </Box>
      </Box>
    );
  }

  // MCP 详情视图
  if (typeof viewState === 'object' && viewState.type === 'mcp-detail') {
    const client = viewState.client;
    const serverToolsCount = filterToolsByServer(mcpTools, client.name).length;

    // MCP 菜单的通用处理函数
    const handleMcpViewTools = () => {
      setViewState({ type: 'mcp-tools', client });
    };
    const handleMcpCancel = () => {
      setViewState('plugin-list');
    };
    const handleMcpComplete = (result?: string) => {
      if (result) {
        setResult(result);
      }
      setViewState('plugin-list');
    };

    // 将 MCPServerConnection 转换为适当的 ServerInfo 类型
    const scope = client.config.scope;
    const configType = client.config.type;

    if (configType === 'stdio') {
      const server: StdioServerInfo = {
        name: client.name,
        client,
        scope,
        transport: 'stdio',
        config: client.config as McpStdioServerConfig,
      };
      return (
        <MCPStdioServerMenu
          server={server}
          serverToolsCount={serverToolsCount}
          onViewTools={handleMcpViewTools}
          onCancel={handleMcpCancel}
          onComplete={handleMcpComplete}
          borderless
        />
      );
    } else if (configType === 'sse') {
      const server: SSEServerInfo = {
        name: client.name,
        client,
        scope,
        transport: 'sse',
        isAuthenticated: undefined,
        config: client.config as McpSSEServerConfig,
      };
      return (
        <MCPRemoteServerMenu
          server={server}
          serverToolsCount={serverToolsCount}
          onViewTools={handleMcpViewTools}
          onCancel={handleMcpCancel}
          onComplete={handleMcpComplete}
          borderless
        />
      );
    } else if (configType === 'http') {
      const server: HTTPServerInfo = {
        name: client.name,
        client,
        scope,
        transport: 'http',
        isAuthenticated: undefined,
        config: client.config as McpHTTPServerConfig,
      };
      return (
        <MCPRemoteServerMenu
          server={server}
          serverToolsCount={serverToolsCount}
          onViewTools={handleMcpViewTools}
          onCancel={handleMcpCancel}
          onComplete={handleMcpComplete}
          borderless
        />
      );
    } else if (configType === 'claudeai-proxy') {
      const server: ClaudeAIServerInfo = {
        name: client.name,
        client,
        scope,
        transport: 'claudeai-proxy',
        isAuthenticated: undefined,
        config: client.config as McpClaudeAIProxyServerConfig,
      };
      return (
        <MCPRemoteServerMenu
          server={server}
          serverToolsCount={serverToolsCount}
          onViewTools={handleMcpViewTools}
          onCancel={handleMcpCancel}
          onComplete={handleMcpComplete}
          borderless
        />
      );
    }

    // 回退 —— 不应发生，但优雅处理
    setViewState('plugin-list');
    return null;
  }

  // MCP 工具视图
  if (typeof viewState === 'object' && viewState.type === 'mcp-tools') {
    const client = viewState.client;
    const scope = client.config.scope;
    const configType = client.config.type;

    // 为 MCPToolListView 构建 ServerInfo
    let server: StdioServerInfo | SSEServerInfo | HTTPServerInfo | ClaudeAIServerInfo;
    if (configType === 'stdio') {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'stdio',
        config: client.config as McpStdioServerConfig,
      };
    } else if (configType === 'sse') {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'sse',
        isAuthenticated: undefined,
        config: client.config as McpSSEServerConfig,
      };
    } else if (configType === 'http') {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'http',
        isAuthenticated: undefined,
        config: client.config as McpHTTPServerConfig,
      };
    } else {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'claudeai-proxy',
        isAuthenticated: undefined,
        config: client.config as McpClaudeAIProxyServerConfig,
      };
    }

    return (
      <MCPToolListView
        server={server}
        onSelectTool={(tool: Tool) => {
          setViewState({ type: 'mcp-tool-detail', client, tool });
        }}
        onBack={() => setViewState({ type: 'mcp-detail', client })}
      />
    );
  }

  // MCP 工具详情视图
  if (typeof viewState === 'object' && viewState.type === 'mcp-tool-detail') {
    const { client, tool } = viewState;
    const scope = client.config.scope;
    const configType = client.config.type;

    // 为 MCPToolDetailView 构建 ServerInfo
    let server: StdioServerInfo | SSEServerInfo | HTTPServerInfo | ClaudeAIServerInfo;
    if (configType === 'stdio') {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'stdio',
        config: client.config as McpStdioServerConfig,
      };
    } else if (configType === 'sse') {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'sse',
        isAuthenticated: undefined,
        config: client.config as McpSSEServerConfig,
      };
    } else if (configType === 'http') {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'http',
        isAuthenticated: undefined,
        config: client.config as McpHTTPServerConfig,
      };
    } else {
      server = {
        name: client.name,
        client,
        scope,
        transport: 'claudeai-proxy',
        isAuthenticated: undefined,
        config: client.config as McpClaudeAIProxyServerConfig,
      };
    }

    return (
      <MCPToolDetailView
        tool={tool}
        server={server}
        onBack={() => setViewState({ type: 'mcp-tools', client })}
      />
    );
  }

  // 插件列表视图（主管理界面）
  const visibleItems = pagination.getVisibleItems(filteredItems);
  return (
    <Box flexDirection="column">
      {/* 搜索框 */}
      <Box marginBottom={1}>
        <SearchBox
          query={searchQuery}
          isFocused={isSearchMode}
          isTerminalFocused={isTerminalFocused}
          width={terminalWidth - 4}
          cursorOffset={searchCursorOffset}
        />
      </Box>

      {/* 无搜索结果 */}
      {filteredItems.length === 0 && searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>没有项匹配 &quot;{searchQuery}&quot;</Text>
        </Box>
      )}

      {/* 向上滚动指示器 */}
      {pagination.scrollPosition.canScrollUp && (
        <Box>
          <Text dimColor> {figures.arrowUp} 上方还有更多</Text>
        </Box>
      )}

      {/* 按作用域分组的插件和 MCP 统一列表 */}
      {visibleItems.map((item, visibleIndex) => {
        const actualIndex = pagination.toActualIndex(visibleIndex);
        const isSelected = actualIndex === selectedIndex && !isSearchMode;

        // 检查是否需要显示作用域标题
        const prevItem = visibleIndex > 0 ? visibleItems[visibleIndex - 1] : null;
        const showScopeHeader = !prevItem || prevItem.scope !== item.scope;

        // 获取作用域标签
        const getScopeLabel = (scope: string): string => {
          switch (scope) {
            case 'flagged':
              return '已标记';
            case 'project':
              return '项目';
            case 'local':
              return '本地';
            case 'user':
              return '用户';
            case 'enterprise':
              return '企业';
            case 'managed':
              return '托管';
            case 'builtin':
              return '内置';
            case 'dynamic':
              return '内置';
            default:
              return scope;
          }
        };

        return (
          <React.Fragment key={item.id}>
            {showScopeHeader && (
              <Box marginTop={visibleIndex > 0 ? 1 : 0} paddingLeft={2}>
                <Text
                  dimColor={item.scope !== 'flagged'}
                  color={item.scope === 'flagged' ? 'warning' : undefined}
                  bold={item.scope === 'flagged'}
                >
                  {getScopeLabel(item.scope)}
                </Text>
              </Box>
            )}
            <UnifiedInstalledCell item={item} isSelected={isSelected} />
          </React.Fragment>
        );
      })}

      {/* 向下滚动指示器 */}
      {pagination.scrollPosition.canScrollDown && (
        <Box>
          <Text dimColor> {figures.arrowDown} 下方还有更多</Text>
        </Box>
      )}

      {/* 帮助文本 */}
      <Box marginTop={1} marginLeft={1}>
        <Text dimColor italic>
          <Byline>
            <Text>输入以搜索</Text>
            <ConfigurableShortcutHint
              action="plugin:toggle"
              context="Plugin"
              fallback="Space"
              description="切换"
            />
            <ConfigurableShortcutHint
              action="select:accept"
              context="Select"
              fallback="Enter"
              description="详情"
            />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="返回"
            />
          </Byline>
        </Text>
      </Box>

      {/* 插件更改的重载提示 */}
      {pendingToggles.size > 0 && (
        <Box marginLeft={1}>
          <Text dimColor italic>
            运行 /reload-plugins 以应用更改
          </Text>
        </Box>
      )}
    </Box>
  );
}
