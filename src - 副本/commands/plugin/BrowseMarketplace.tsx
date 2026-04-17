import figures from 'figures';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { Byline } from '../../components/design-system/Byline.js';
import { Box, Text } from '../../ink.js';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import type { LoadedPlugin } from '../../types/plugin.js';
import { count } from '../../utils/array.js';
import { openBrowser } from '../../utils/browser.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import { formatInstallCount, getInstallCounts } from '../../utils/plugins/installCounts.js';
import { isPluginGloballyInstalled, isPluginInstalled } from '../../utils/plugins/installedPluginsManager.js';
import { createPluginId, formatFailureDetails, formatMarketplaceLoadingErrors, getMarketplaceSourceDisplay, loadMarketplacesWithGracefulDegradation } from '../../utils/plugins/marketplaceHelpers.js';
import { getMarketplace, loadKnownMarketplacesConfig } from '../../utils/plugins/marketplaceManager.js';
import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js';
import { installPluginFromMarketplace } from '../../utils/plugins/pluginInstallationHelpers.js';
import { isPluginBlockedByPolicy } from '../../utils/plugins/pluginPolicy.js';
import { plural } from '../../utils/stringUtils.js';
import { truncateToWidth } from '../../utils/truncate.js';
import { findPluginOptionsTarget, PluginOptionsFlow } from './PluginOptionsFlow.js';
import { PluginTrustWarning } from './PluginTrustWarning.js';
import { buildPluginDetailsMenuOptions, extractGitHubRepo, type InstallablePlugin, PluginSelectionKeyHint } from './pluginDetailsHelpers.js';
import type { ViewState as ParentViewState } from './types.js';
import { usePagination } from './usePagination.js';
type Props = {
  error: string | null;
  setError: (error: string | null) => void;
  result: string | null;
  setResult: (result: string | null) => void;
  setViewState: (state: ParentViewState) => void;
  onInstallComplete?: () => void | Promise<void>;
  targetMarketplace?: string;
  targetPlugin?: string;
};
type ViewState = 'marketplace-list' | 'plugin-list' | 'plugin-details' | {
  type: 'plugin-options';
  plugin: LoadedPlugin;
  pluginId: string;
};
type MarketplaceInfo = {
  name: string;
  totalPlugins: number;
  installedCount: number;
  source?: string;
};
export function BrowseMarketplace({
  error,
  setError,
  result: _result,
  setResult,
  setViewState: setParentViewState,
  onInstallComplete,
  targetMarketplace,
  targetPlugin
}: Props): React.ReactNode {
  // View state
  const [viewState, setViewState] = useState<ViewState>('marketplace-list');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<InstallablePlugin | null>(null);

  // Data state
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<InstallablePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installCounts, setInstallCounts] = useState<Map<string, number> | null>(null);

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedForInstall, setSelectedForInstall] = useState<Set<string>>(new Set());
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set());

  // Pagination for plugin list (continuous scrolling)
  const pagination = usePagination<InstallablePlugin>({
    totalItems: availablePlugins.length,
    selectedIndex
  });

  // Details view state
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Warning state for non-critical errors (e.g., some marketplaces failed to load)
  const [warning, setWarning] = useState<string | null>(null);

  // Handle escape to go back - viewState-dependent navigation
  const handleBack = React.useCallback(() => {
    if (viewState === 'plugin-list') {
      // If navigated directly to a specific marketplace via targetMarketplace,
      // go back to manage-marketplaces showing that marketplace's details
      if (targetMarketplace) {
        setParentViewState({
          type: 'manage-marketplaces',
          targetMarketplace
        });
      } else if (marketplaces.length === 1) {
        // If there's only one marketplace, skip the marketplace-list view
        // since we auto-navigated past it on load
        setParentViewState({
          type: 'menu'
        });
      } else {
        setViewState('marketplace-list');
        setSelectedMarketplace(null);
        setSelectedForInstall(new Set());
      }
    } else if (viewState === 'plugin-details') {
      setViewState('plugin-list');
      setSelectedPlugin(null);
    } else {
      // At root level (marketplace-list), exit the plugin menu
      setParentViewState({
        type: 'menu'
      });
    }
  }, [viewState, targetMarketplace, setParentViewState, marketplaces.length]);
  useKeybinding('confirm:no', handleBack, {
    context: 'Confirmation'
  });

  // Load marketplaces and count installed plugins
  useEffect(() => {
    async function loadMarketplaceData() {
      try {
        const config = await loadKnownMarketplacesConfig();

        // Load marketplaces with graceful degradation
        const {
          marketplaces: marketplaces_0,
          failures
        } = await loadMarketplacesWithGracefulDegradation(config);
        const marketplaceInfos: MarketplaceInfo[] = [];
        for (const {
          name,
          config: marketplaceConfig,
          data: marketplace
        } of marketplaces_0) {
          if (marketplace) {
            // Count how many plugins from this marketplace are installed
            const installedFromThisMarketplace = count(marketplace.plugins, plugin => isPluginInstalled(createPluginId(plugin.name, name)));
            marketplaceInfos.push({
              name,
              totalPlugins: marketplace.plugins.length,
              installedCount: installedFromThisMarketplace,
              source: getMarketplaceSourceDisplay(marketplaceConfig.source)
            });
          }
        }

        // Sort so claude-plugin-directory is always first
        marketplaceInfos.sort((a, b) => {
          if (a.name === 'claude-plugin-directory') return -1;
          if (b.name === 'claude-plugin-directory') return 1;
          return 0;
        });
        setMarketplaces(marketplaceInfos);

        // Handle marketplace loading errors/warnings
        const successCount = count(marketplaces_0, m => m.data !== null);
        const errorResult = formatMarketplaceLoadingErrors(failures, successCount);
        if (errorResult) {
          if (errorResult.type === 'warning') {
            setWarning(errorResult.message + '。显示可用的市场。');
          } else {
            throw new Error(errorResult.message);
          }
        }

        // Skip marketplace selection if there's only one marketplace
        if (marketplaceInfos.length === 1 && !targetMarketplace && !targetPlugin) {
          const singleMarketplace = marketplaceInfos[0];
          if (singleMarketplace) {
            setSelectedMarketplace(singleMarketplace.name);
            setViewState('plugin-list');
          }
        }

        // Handle targetMarketplace and targetPlugin after marketplaces are loaded
        if (targetPlugin) {
          // Search for the plugin across all marketplaces
          let foundPlugin: InstallablePlugin | null = null;
          let foundMarketplace: string | null = null;
          for (const [name_0] of Object.entries(config)) {
            const marketplace_0 = await getMarketplace(name_0);
            if (marketplace_0) {
              const plugin_0 = marketplace_0.plugins.find(p => p.name === targetPlugin);
              if (plugin_0) {
                const pluginId = createPluginId(plugin_0.name, name_0);
                foundPlugin = {
                  entry: plugin_0,
                  marketplaceName: name_0,
                  pluginId,
                  // isPluginGloballyInstalled: only block when user/managed scope
                  // exists (nothing to add). Project/local-scope installs don't
                  // block — user may want to promote to user scope (gh-29997).
                  isInstalled: isPluginGloballyInstalled(pluginId)
                };
                foundMarketplace = name_0;
                break;
              }
            }
          }
          if (foundPlugin && foundMarketplace) {
            // Block only on global (user/managed) install — project/local scope
            // means the user might still want to add a user-scope entry so the
            // plugin is available in other projects (gh-29997, gh-29240, gh-29392).
            // The plugin-details view offers all three scope options; the backend
            // (installPluginOp → addInstalledPlugin) already supports multiple
            // scope entries per plugin.
            const pluginId_0 = foundPlugin.pluginId;
            const globallyInstalled = isPluginGloballyInstalled(pluginId_0);
            if (globallyInstalled) {
              setError(`Plugin '${pluginId_0}' is already installed globally. Use '/plugin' to manage existing plugins.`);
            } else {
              // Navigate to the plugin details view
              setSelectedMarketplace(foundMarketplace);
              setSelectedPlugin(foundPlugin);
              setViewState('plugin-details');
            }
          } else {
            setError(`插件 "${targetPlugin}" 在任何市场中都未找到`);
          }
        } else if (targetMarketplace) {
          // Navigate directly to the specified marketplace
          const marketplaceExists = marketplaceInfos.some(m_0 => m_0.name === targetMarketplace);
          if (marketplaceExists) {
            setSelectedMarketplace(targetMarketplace);
            setViewState('plugin-list');
          } else {
            setError(`市场 "${targetMarketplace}" 未找到`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载市场失败');
      } finally {
        setLoading(false);
      }
    }
    void loadMarketplaceData();
  }, [setError, targetMarketplace, targetPlugin]);

  // Load plugins when a marketplace is selected
  useEffect(() => {
    if (!selectedMarketplace) return;
    let cancelled = false;
    async function loadPluginsForMarketplace(marketplaceName: string) {
      setLoading(true);
      try {
        const marketplace_1 = await getMarketplace(marketplaceName);
        if (cancelled) return;
        if (!marketplace_1) {
          throw new Error(`加载市场失败：${marketplaceName}`);
        }

        // Filter out already installed plugins
        const installablePlugins: InstallablePlugin[] = [];
        for (const entry of marketplace_1.plugins) {
          const pluginId_1 = createPluginId(entry.name, marketplaceName);
          if (isPluginBlockedByPolicy(pluginId_1)) continue;
          installablePlugins.push({
            entry,
            marketplaceName: marketplaceName,
            pluginId: pluginId_1,
            // Only mark as "installed" when globally scoped (user/managed).
            // Project/local installs don't block — user can add user scope
            // via the plugin-details view (gh-29997).
            isInstalled: isPluginGloballyInstalled(pluginId_1)
          });
        }

        // Fetch install counts and sort by popularity
        try {
          const counts = await getInstallCounts();
          if (cancelled) return;
          setInstallCounts(counts);
          if (counts) {
            // Sort by install count (descending), then alphabetically
            installablePlugins.sort((a_1, b_1) => {
              const countA = counts.get(a_1.pluginId) ?? 0;
              const countB = counts.get(b_1.pluginId) ?? 0;
              if (countA !== countB) return countB - countA;
              return a_1.entry.name.localeCompare(b_1.entry.name);
            });
          } else {
            // No counts available - sort alphabetically
            installablePlugins.sort((a_2, b_2) => a_2.entry.name.localeCompare(b_2.entry.name));
          }
        } catch (error_0) {
          if (cancelled) return;
          // Log the error, then gracefully degrade to alphabetical sort
          logForDebugging(`获取安装计数失败：${errorMessage(error_0)}`);
          installablePlugins.sort((a_0, b_0) => a_0.entry.name.localeCompare(b_0.entry.name));
        }
        setAvailablePlugins(installablePlugins);
        setSelectedIndex(0);
        setSelectedForInstall(new Set());
      } catch (err_0) {
        if (cancelled) return;
        setError(err_0 instanceof Error ? err_0.message : '加载插件失败');
      } finally {
        setLoading(false);
      }
    }
    void loadPluginsForMarketplace(selectedMarketplace);
    return () => {
      cancelled = true;
    };
  }, [selectedMarketplace, setError]);

  // Install selected plugins
  const installSelectedPlugins = async () => {
    if (selectedForInstall.size === 0) return;
    const pluginsToInstall = availablePlugins.filter(p_0 => selectedForInstall.has(p_0.pluginId));
    setInstallingPlugins(new Set(pluginsToInstall.map(p_1 => p_1.pluginId)));
    let successCount_0 = 0;
    let failureCount = 0;
    const newFailedPlugins: Array<{
      name: string;
      reason: string;
    }> = [];
    for (const plugin_1 of pluginsToInstall) {
      const result = await installPluginFromMarketplace({
        pluginId: plugin_1.pluginId,
        entry: plugin_1.entry,
        marketplaceName: plugin_1.marketplaceName,
        scope: 'user'
      });
      if (result.success) {
        successCount_0++;
      } else {
        failureCount++;
        newFailedPlugins.push({
          name: plugin_1.entry.name,
          reason: result.error
        });
      }
    }
    setInstallingPlugins(new Set());
    setSelectedForInstall(new Set());
    clearAllCaches();

    // Handle installation results
    if (failureCount === 0) {
      // All succeeded
      const message = `✓ 已安装 ${successCount_0} 个${plural(successCount_0, '插件')}。` + `运行 /reload-plugins 以激活。`;
      setResult(message);
    } else if (successCount_0 === 0) {
      // All failed - show error with reasons
      setError(`安装失败：${formatFailureDetails(newFailedPlugins, true)}`);
    } else {
      // Mixed results - show partial success
      const message_0 = `✓ 已安装 ${successCount_0} / ${successCount_0 + failureCount} 个插件。` + `失败：${formatFailureDetails(newFailedPlugins, false)}。` + `运行 /reload-plugins 以激活成功安装的插件。`;
      setResult(message_0);
    }

    // Handle completion callback and navigation
    if (successCount_0 > 0) {
      if (onInstallComplete) {
        await onInstallComplete();
      }
    }
    setParentViewState({
      type: 'menu'
    });
  };

  // Install single plugin from details view
  const handleSinglePluginInstall = async (plugin_2: InstallablePlugin, scope: 'user' | 'project' | 'local' = 'user') => {
    setIsInstalling(true);
    setInstallError(null);
    const result_0 = await installPluginFromMarketplace({
      pluginId: plugin_2.pluginId,
      entry: plugin_2.entry,
      marketplaceName: plugin_2.marketplaceName,
      scope
    });
    if (result_0.success) {
      const loaded = await findPluginOptionsTarget(plugin_2.pluginId);
      if (loaded) {
        setIsInstalling(false);
        setViewState({
          type: 'plugin-options',
          plugin: loaded,
          pluginId: plugin_2.pluginId
        });
        return;
      }
      setResult(result_0.message);
      if (onInstallComplete) {
        await onInstallComplete();
      }
      setParentViewState({
        type: 'menu'
      });
    } else {
      setIsInstalling(false);
      setInstallError(result_0.error);
    }
  };

  // Handle error state
  useEffect(() => {
    if (error) {
      setResult(error);
    }
  }, [error, setResult]);

  // Marketplace-list navigation
  useKeybindings({
    'select:previous': () => {
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      }
    },
    'select:next': () => {
      if (selectedIndex < marketplaces.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      }
    },
    'select:accept': () => {
      const marketplace_2 = marketplaces[selectedIndex];
      if (marketplace_2) {
        setSelectedMarketplace(marketplace_2.name);
        setViewState('plugin-list');
      }
    }
  }, {
    context: 'Select',
    isActive: viewState === 'marketplace-list'
  });

  // Plugin-list navigation
  useKeybindings({
    'select:previous': () => {
      if (selectedIndex > 0) {
        pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex);
      }
    },
    'select:next': () => {
      if (selectedIndex < availablePlugins.length - 1) {
        pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex);
      }
    },
    'select:accept': () => {
      if (selectedIndex === availablePlugins.length && selectedForInstall.size > 0) {
        void installSelectedPlugins();
      } else if (selectedIndex < availablePlugins.length) {
        const plugin_3 = availablePlugins[selectedIndex];
        if (plugin_3) {
          if (plugin_3.isInstalled) {
            setParentViewState({
              type: 'manage-plugins',
              targetPlugin: plugin_3.entry.name,
              targetMarketplace: plugin_3.marketplaceName
            });
          } else {
            setSelectedPlugin(plugin_3);
            setViewState('plugin-details');
            setDetailsMenuIndex(0);
            setInstallError(null);
          }
        }
      }
    }
  }, {
    context: 'Select',
    isActive: viewState === 'plugin-list'
  });
  useKeybindings({
    'plugin:toggle': () => {
      if (selectedIndex < availablePlugins.length) {
        const plugin_4 = availablePlugins[selectedIndex];
        if (plugin_4 && !plugin_4.isInstalled) {
          const newSelection = new Set(selectedForInstall);
          if (newSelection.has(plugin_4.pluginId)) {
            newSelection.delete(plugin_4.pluginId);
          } else {
            newSelection.add(plugin_4.pluginId);
          }
          setSelectedForInstall(newSelection);
        }
      }
    },
    'plugin:install': () => {
      if (selectedForInstall.size > 0) {
        void installSelectedPlugins();
      }
    }
  }, {
    context: 'Plugin',
    isActive: viewState === 'plugin-list'
  });

  // Plugin-details navigation
  const detailsMenuOptions = React.useMemo(() => {
    if (!selectedPlugin) return [];
    const hasHomepage = selectedPlugin.entry.homepage;
    const githubRepo = extractGitHubRepo(selectedPlugin);
    return buildPluginDetailsMenuOptions(hasHomepage, githubRepo);
  }, [selectedPlugin]);
  useKeybindings({
    'select:previous': () => {
      if (detailsMenuIndex > 0) {
        setDetailsMenuIndex(detailsMenuIndex - 1);
      }
    },
    'select:next': () => {
      if (detailsMenuIndex < detailsMenuOptions.length - 1) {
        setDetailsMenuIndex(detailsMenuIndex + 1);
      }
    },
    'select:accept': () => {
      if (!selectedPlugin) return;
      const action = detailsMenuOptions[detailsMenuIndex]?.action;
      const hasHomepage_0 = selectedPlugin.entry.homepage;
      const githubRepo_0 = extractGitHubRepo(selectedPlugin);
      if (action === 'install-user') {
        void handleSinglePluginInstall(selectedPlugin, 'user');
      } else if (action === 'install-project') {
        void handleSinglePluginInstall(selectedPlugin, 'project');
      } else if (action === 'install-local') {
        void handleSinglePluginInstall(selectedPlugin, 'local');
      } else if (action === 'homepage' && hasHomepage_0) {
        void openBrowser(hasHomepage_0);
      } else if (action === 'github' && githubRepo_0) {
        void openBrowser(`https://github.com/${githubRepo_0}`);
      } else if (action === 'back') {
        setViewState('plugin-list');
        setSelectedPlugin(null);
      }
    }
  }, {
    context: 'Select',
    isActive: viewState === 'plugin-details' && !!selectedPlugin
  });
  if (typeof viewState === 'object' && viewState.type === 'plugin-options') {
    const {
      plugin: plugin_5,
      pluginId: pluginId_2
    } = viewState;
    function finish(msg: string): void {
      setResult(msg);
      if (onInstallComplete) {
        void onInstallComplete();
      }
      setParentViewState({
        type: 'menu'
      });
    }
    return <PluginOptionsFlow plugin={plugin_5} pluginId={pluginId_2} onDone={(outcome, detail) => {
      switch (outcome) {
        case 'configured':
          finish(`✓ 已安装并配置 ${plugin_5.name}。运行 /reload-plugins 以应用。`);
          break;
        case 'skipped':
          finish(`✓ 已安装插件 ${plugin_5.name}。运行 /reload-plugins 以应用。`);
          break;
        case 'error':
          finish(`已安装但保存配置失败：${detail}`);
          break;
      }
    }} />;
  }

  // Loading state
  if (loading) {
    return <Text>加载中…</Text>;
  }

  // Error state
  if (error) {
    return <Text color="error">{error}</Text>;
  }

  // Marketplace selection view
  if (viewState === 'marketplace-list') {
    if (marketplaces.length === 0) {
      return <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>选择市场</Text>
          </Box>
          <Text>未配置市场。</Text>
          <Text dimColor>
            请先使用 "添加市场" 添加市场源。
          </Text>
          <Box marginTop={1} paddingLeft={1}>
            <Text dimColor>
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
            </Text>
          </Box>
        </Box>;
    }
    return <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Select marketplace</Text>
        </Box>

        {/* Warning banner for marketplace load failures */}
        {warning && <Box marginBottom={1} flexDirection="column">
            <Text color="warning">
              {figures.warning} {warning}
            </Text>
          </Box>}
        {marketplaces.map((marketplace_3, index) => <Box key={marketplace_3.name} flexDirection="column" marginBottom={index < marketplaces.length - 1 ? 1 : 0}>
            <Box>
              <Text color={selectedIndex === index ? 'suggestion' : undefined}>
                {selectedIndex === index ? figures.pointer : ' '}{' '}
                {marketplace_3.name}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>
                {marketplace_3.totalPlugins}{' '}
                {plural(marketplace_3.totalPlugins, 'plugin')} available
                {marketplace_3.installedCount > 0 && ` · ${marketplace_3.installedCount} already installed`}
                {marketplace_3.source && ` · ${marketplace_3.source}`}
              </Text>
            </Box>
          </Box>)}

        <Box marginTop={1}>
          <Text dimColor italic>
            <Byline>
              <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="选择" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
            </Byline>
          </Text>
        </Box>
      </Box>;
  }

  // Plugin details view
  if (viewState === 'plugin-details' && selectedPlugin) {
    const hasHomepage_1 = selectedPlugin.entry.homepage;
    const githubRepo_1 = extractGitHubRepo(selectedPlugin);
    const menuOptions = buildPluginDetailsMenuOptions(hasHomepage_1, githubRepo_1);
    return <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>插件详情</Text>
        </Box>

        {/* Plugin metadata */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{selectedPlugin.entry.name}</Text>
          {selectedPlugin.entry.version && <Text dimColor>版本: {selectedPlugin.entry.version}</Text>}
          {selectedPlugin.entry.description && <Box marginTop={1}>
              <Text>{selectedPlugin.entry.description}</Text>
            </Box>}
          {selectedPlugin.entry.author && <Box marginTop={1}>
              <Text dimColor>
                作者:{' '}
                {typeof selectedPlugin.entry.author === 'string' ? selectedPlugin.entry.author : selectedPlugin.entry.author.name}
              </Text>
            </Box>}
        </Box>

        {/* What will be installed */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>将安装:</Text>
          {selectedPlugin.entry.commands && <Text dimColor>
              · 命令:{' '}
              {Array.isArray(selectedPlugin.entry.commands) ? selectedPlugin.entry.commands.join(', ') : Object.keys(selectedPlugin.entry.commands).join(', ')}
            </Text>}
          {selectedPlugin.entry.agents && <Text dimColor>
              · 智能体:{' '}
              {Array.isArray(selectedPlugin.entry.agents) ? selectedPlugin.entry.agents.join(', ') : Object.keys(selectedPlugin.entry.agents).join(', ')}
            </Text>}
          {selectedPlugin.entry.hooks && <Text dimColor>
              · 钩子: {Object.keys(selectedPlugin.entry.hooks).join(', ')}
            </Text>}
          {selectedPlugin.entry.mcpServers && <Text dimColor>
              · MCP 服务器:{' '}
              {Array.isArray(selectedPlugin.entry.mcpServers) ? selectedPlugin.entry.mcpServers.join(', ') : typeof selectedPlugin.entry.mcpServers === 'object' ? Object.keys(selectedPlugin.entry.mcpServers).join(', ') : '已配置'}
            </Text>}
          {!selectedPlugin.entry.commands && !selectedPlugin.entry.agents && !selectedPlugin.entry.hooks && !selectedPlugin.entry.mcpServers && <>
                {typeof selectedPlugin.entry.source === 'object' && 'source' in selectedPlugin.entry.source && (selectedPlugin.entry.source.source === 'github' || selectedPlugin.entry.source.source === 'url' || selectedPlugin.entry.source.source === 'npm' || selectedPlugin.entry.source.source === 'pip') ? <Text dimColor>
                    · 远程插件的组件摘要暂不可用
                  </Text> :
          // TODO: Actually scan local plugin directories to show real components
          // This would require accessing the filesystem to check for:
          // - commands/ directory and list files
          // - agents/ directory and list files
          // - hooks/ directory and list files
          // - .mcp.json or mcp-servers.json files
          <Text dimColor>
                    · 将在安装时发现组件
                  </Text>}
              </>}
        </Box>

        <PluginTrustWarning />

        {/* Error message */}
        {installError && <Box marginBottom={1}>
            <Text color="error">错误: {installError}</Text>
          </Box>}

        {/* Menu options */}
        <Box flexDirection="column">
          {menuOptions.map((option, index_0) => <Box key={option.action}>
              {detailsMenuIndex === index_0 && <Text>{'> '}</Text>}
              {detailsMenuIndex !== index_0 && <Text>{'  '}</Text>}
              <Text bold={detailsMenuIndex === index_0}>
                {isInstalling && option.action === 'install' ? '安装中…' : option.label}
              </Text>
            </Box>)}
        </Box>

        <Box marginTop={1} paddingLeft={1}>
          <Text dimColor>
            <Byline>
              <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="选择" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
            </Byline>
          </Text>
        </Box>
      </Box>;
  }

  // Plugin installation view
  if (availablePlugins.length === 0) {
    return <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>安装插件</Text>
        </Box>
        <Text dimColor>没有可安装的新插件。</Text>
        <Text dimColor>
          此市场中的所有插件均已安装。
        </Text>
        <Box marginLeft={3}>
          <Text dimColor italic>
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
          </Text>
        </Box>
      </Box>;
  }

  // Get visible plugins from pagination
  const visiblePlugins = pagination.getVisibleItems(availablePlugins);
  return <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>安装插件</Text>
      </Box>

      {/* Scroll up indicator */}
      {pagination.scrollPosition.canScrollUp && <Box>
          <Text dimColor> {figures.arrowUp} 上方还有更多</Text>
        </Box>}

      {/* Plugin list */}
      {visiblePlugins.map((plugin_6, visibleIndex) => {
      const actualIndex = pagination.toActualIndex(visibleIndex);
      const isSelected = selectedIndex === actualIndex;
      const isSelectedForInstall = selectedForInstall.has(plugin_6.pluginId);
      const isInstalling_0 = installingPlugins.has(plugin_6.pluginId);
      const isLast = visibleIndex === visiblePlugins.length - 1;
      return <Box key={plugin_6.pluginId} flexDirection="column" marginBottom={isLast && !error ? 0 : 1}>
            <Box>
              <Text color={isSelected ? 'suggestion' : undefined}>
                {isSelected ? figures.pointer : ' '}{' '}
              </Text>
              <Text color={plugin_6.isInstalled ? 'success' : undefined}>
                {plugin_6.isInstalled ? figures.tick : isInstalling_0 ? figures.ellipsis : isSelectedForInstall ? figures.radioOn : figures.radioOff}{' '}
                {plugin_6.entry.name}
                {plugin_6.entry.category && <Text dimColor> [{plugin_6.entry.category}]</Text>}
                {plugin_6.entry.tags?.includes('community-managed') && <Text dimColor> [社区管理]</Text>}
                {plugin_6.isInstalled && <Text dimColor> (已安装)</Text>}
                {installCounts && selectedMarketplace === OFFICIAL_MARKETPLACE_NAME && <Text dimColor>
                      {' · '}
                      {formatInstallCount(installCounts.get(plugin_6.pluginId) ?? 0)}{' '}
                      次安装
                    </Text>}
              </Text>
            </Box>
            {plugin_6.entry.description && <Box marginLeft={4}>
                <Text dimColor>
                  {truncateToWidth(plugin_6.entry.description, 60)}
                </Text>
                {plugin_6.entry.version && <Text dimColor> · v{plugin_6.entry.version}</Text>}
              </Box>}
          </Box>;
    })}

      {/* Scroll down indicator */}
      {pagination.scrollPosition.canScrollDown && <Box>
          <Text dimColor> {figures.arrowDown} 下方还有更多</Text>
        </Box>}

      {/* Error messages shown in the UI */}
      {error && <Box marginTop={1}>
          <Text color="error">
            {figures.cross} {error}
          </Text>
        </Box>}

      <PluginSelectionKeyHint hasSelection={selectedForInstall.size > 0} />
    </Box>;
}
