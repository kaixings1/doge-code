/**
 * PluginPanel — 桌面端插件管理面板
 *
 * 功能：
 * - 列出已安装的插件（启用/禁用/卸载/详情）
 * - 在线插件市场（浏览 + 一键安装）
 * - 从目录安装插件
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

// ─── 类型 ───

interface PluginManifest {
  name: string
  description?: string
  version?: string
  author?: string
}

interface PluginCommand {
  name: string
  description?: string
  path: string
}

interface PluginAgent {
  name: string
  description?: string
  path: string
}

interface PluginInfo {
  name: string
  path: string
  manifest: PluginManifest
  enabled: boolean
  commands: PluginCommand[]
  agents: PluginAgent[]
}

interface MarketplacePlugin {
  name: string
  description?: string
  version?: string
  source: string
  repo?: string
  installed: boolean
}

interface MarketplaceInfo {
  name: string
  source: string
  plugins: MarketplacePlugin[]
}

type Tab = 'installed' | 'marketplace' | 'runtime'

interface RuntimePlugin {
  name: string
  dir: string
  entry: string
  enabled: boolean
  commandCount: number
  hookCount: number
  loadedAt: number
  errors: string[]
}

interface PluginPanelProps {
  theme: ThemeColors
  onClose: () => void
  onRefresh?: () => void
}

// ─── 组件 ───

export function PluginPanel({ theme, onClose }: PluginPanelProps): JSX.Element {
  const c = theme

  // 本地插件状态
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null)

  // 安装模式（本地）
  const [installMode, setInstallMode] = useState(false)
  const [installPath, setInstallPath] = useState('')
  const [installName, setInstallName] = useState('')

  // 市场状态
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [installingRepo, setInstallingRepo] = useState<string | null>(null)

  // 通用错误
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 当前标签
  const [tab, setTab] = useState<Tab>('installed')

  // ─── 本地插件加载 ───

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.pluginScan()
      setPlugins(result as PluginInfo[])
    } catch {
      setError('无法扫描插件目录')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlugins() }, [loadPlugins])

  // ─── 本地插件操作 ───

  const handleToggle = useCallback(async (pluginName: string, enabled: boolean) => {
    try {
      await window.dogeAPI.pluginEnable(pluginName, enabled)
      setPlugins(prev => prev.map(p => p.name === pluginName ? { ...p, enabled } : p))
    } catch { setError('操作失败') }
  }, [])

  const handleUninstall = useCallback(async (pluginName: string) => {
    if (!confirm(`确定要卸载插件 "${pluginName}" 吗？`)) return
    try {
      const result = await window.dogeAPI.pluginUninstall(pluginName)
      if (result.success) {
        setPlugins(prev => prev.filter(p => p.name !== pluginName))
        if (selectedPlugin === pluginName) setSelectedPlugin(null)
      } else {
        setError(result.error || '卸载失败')
      }
    } catch { setError('卸载失败') }
  }, [selectedPlugin])

  const handleInstall = useCallback(async () => {
    if (!installPath.trim() || !installName.trim()) {
      setError('请填写插件路径和名称')
      return
    }
    try {
      const result = await window.dogeAPI.pluginInstall(installPath.trim(), installName.trim())
      if (result.success) {
        setInstallMode(false)
        setInstallPath('')
        setInstallName('')
        setSuccessMsg(`插件 "${installName.trim()}" 安装成功`)
        loadPlugins()
      } else {
        setError(result.error || '安装失败')
      }
    } catch { setError('安装失败') }
  }, [installPath, installName, loadPlugins])

  // ─── 市场操作 ───

  const loadMarketplaces = useCallback(async () => {
    setMarketLoading(true)
    try {
      const result = await window.dogeAPI.marketplaceList()
      setMarketplaces(result as MarketplaceInfo[])
    } catch {
      setError('无法加载插件市场')
    } finally {
      setMarketLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'marketplace' && marketplaces.length === 0) {
      loadMarketplaces()
    }
  }, [tab, marketplaces.length, loadMarketplaces])

  const handleMarketInstall = useCallback(async (plugin: MarketplacePlugin) => {
    if (!plugin.repo) return
    if (plugin.installed) return
    setInstallingRepo(plugin.repo)
    setError(null)
    try {
      const result = await window.dogeAPI.marketplaceInstall(plugin.name, plugin.repo)
      if (result.success) {
        setSuccessMsg(`插件 "${plugin.name}" 安装成功`)
        // 刷新市场列表和本地插件
        await loadMarketplaces()
        await loadPlugins()
      } else {
        setError(result.error || '安装失败')
      }
    } catch {
      setError('安装失败')
    } finally {
      setInstallingRepo(null)
    }
  }, [loadMarketplaces, loadPlugins])

  // ─── 渲染 ───

  const selected = plugins.find(p => p.name === selectedPlugin)
  const allMarketPlugins = marketplaces.flatMap(m => m.plugins)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '640px', maxHeight: '580px', background: c.surface, border: `1px solid ${c.border}`,
        borderRadius: '8px', boxShadow: `0 8px 32px ${c.bg}80`, display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        {/* 头部 + 标签页切换 */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${c.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>🧩 插件管理</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setTab('installed')}
                style={{
                  padding: '2px 10px', border: 'none', borderRadius: '3px',
                  background: tab === 'installed' ? c.accent : 'transparent',
                  color: tab === 'installed' ? '#000' : c.textMuted,
                  cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}
              >
                已安装
              </button>
              <button
                onClick={() => setTab('marketplace')}
                style={{
                  padding: '2px 10px', border: 'none', borderRadius: '3px',
                  background: tab === 'marketplace' ? c.accent : 'transparent',
                  color: tab === 'marketplace' ? '#000' : c.textMuted,
                  cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}
              >
                插件市场
              </button>
              <button
                onClick={() => setTab('runtime')}
                style={{
                  padding: '2px 10px', border: 'none', borderRadius: '3px',
                  background: tab === 'runtime' ? c.accent : 'transparent',
                  color: tab === 'runtime' ? '#000' : c.textMuted,
                  cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}
              >
                ⚡ 运行时
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
              background: c.bgPanel, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
            }}
          >
            关闭
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{ padding: '6px 16px', background: c.errorBg, color: c.errorText, fontSize: '11px', borderBottom: `1px solid ${c.errorBorder}` }}>
            {error}
            <span style={{ marginLeft: '8px', cursor: 'pointer' }} onClick={() => setError(null)}>✕</span>
          </div>
        )}

        {/* 成功提示 */}
        {successMsg && (
          <div style={{ padding: '6px 16px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '11px', borderBottom: `1px solid ${c.border}` }}>
            {successMsg}
            <span style={{ marginLeft: '8px', cursor: 'pointer' }} onClick={() => setSuccessMsg(null)}>✕</span>
          </div>
        )}

        {/* ─── 已安装标签页 ─── */}
        {/* 运行时标签页（JS 插件沙箱执行 + hooks + 热加载） */}
        {tab === 'runtime' && <RuntimeView theme={c} />}

        {tab === 'installed' && (
          <>
            {/* 安装面板 */}
            {installMode && (
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}`, background: c.bgPanel }}>
                <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '8px', fontWeight: 600 }}>从目录安装插件</div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input
                    value={installPath}
                    onChange={e => setInstallPath(e.target.value)}
                    placeholder="插件源目录路径"
                    style={{ flex: 2, padding: '5px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
                  />
                  <input
                    value={installName}
                    onChange={e => setInstallName(e.target.value)}
                    placeholder="插件名称"
                    style={{ flex: 1, padding: '5px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
                  />
                  <button
                    onClick={handleInstall}
                    style={{ padding: '5px 12px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                  >
                    安装
                  </button>
                </div>
              </div>
            )}

            {/* 操作栏 */}
            <div style={{ padding: '8px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: c.textMuted }}>{plugins.length} 个插件</span>
              <button
                onClick={() => setInstallMode(!installMode)}
                style={{
                  padding: '3px 10px', border: `1px solid ${c.accent}`, borderRadius: '3px',
                  background: installMode ? c.accent : 'transparent', color: installMode ? '#000' : c.accent,
                  cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}
              >
                {installMode ? '取消' : '+ 安装'}
              </button>
            </div>

            {/* 插件列表 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {loading ? (
                <div style={{ padding: '24px', color: c.textFaint, textAlign: 'center', fontSize: '12px' }}>扫描插件中...</div>
              ) : plugins.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: c.textFaint, marginBottom: '8px' }}>暂无已安装插件</div>
                  <div style={{ fontSize: '11px', color: c.textFaint }}>点击「+ 安装」从目录安装插件，或将插件目录放入 .doge/plugins/ 目录。</div>
                </div>
              ) : (
                plugins.map(plugin => (
                  <div
                    key={plugin.name}
                    style={{
                      padding: '10px 16px', borderBottom: `1px solid ${c.borderSubtle}`,
                      background: selectedPlugin === plugin.name ? c.accentDim : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: selectedPlugin === plugin.name ? c.accent : c.text }}>
                            {plugin.manifest.name}
                          </span>
                          {plugin.manifest.version && (
                            <span style={{ fontSize: '9px', color: c.textFaint, background: c.bgPanel, padding: '1px 5px', borderRadius: '2px' }}>
                              v{plugin.manifest.version}
                            </span>
                          )}
                          {!plugin.enabled && (
                            <span style={{ fontSize: '9px', color: c.textFaint, background: c.bgPanel, padding: '1px 5px', borderRadius: '2px' }}>
                              已禁用
                            </span>
                          )}
                        </div>
                        {plugin.manifest.description && (
                          <div style={{ fontSize: '10px', color: c.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {plugin.manifest.description}
                          </div>
                        )}
                        <div style={{ fontSize: '9px', color: c.textFaint, marginTop: '2px' }}>
                          {plugin.commands.length > 0 && `${plugin.commands.length} 个命令`}
                          {plugin.commands.length > 0 && plugin.agents.length > 0 && ' · '}
                          {plugin.agents.length > 0 && `${plugin.agents.length} 个 Agent`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleToggle(plugin.name, !plugin.enabled)}
                          style={{
                            padding: '2px 10px', border: '1px solid', borderColor: plugin.enabled ? c.accent : c.border,
                            borderRadius: '3px', background: plugin.enabled ? `${c.accent}22` : 'transparent',
                            color: plugin.enabled ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px',
                          }}
                        >
                          {plugin.enabled ? '禁用' : '启用'}
                        </button>
                        <button
                          onClick={() => setSelectedPlugin(selectedPlugin === plugin.name ? null : plugin.name)}
                          style={{
                            padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                            background: c.bgPanel, color: c.textMuted, cursor: 'pointer', fontSize: '10px',
                          }}
                        >
                          {selectedPlugin === plugin.name ? '收起' : '详情'}
                        </button>
                        <button
                          onClick={() => handleUninstall(plugin.name)}
                          style={{
                            padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                            background: c.bgPanel, color: c.errorText, cursor: 'pointer', fontSize: '10px',
                          }}
                        >
                          卸载
                        </button>
                      </div>
                    </div>

                    {/* 详情展开 */}
                    {selectedPlugin === plugin.name && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${c.borderSubtle}` }}>
                        {plugin.commands.length > 0 && (
                          <div style={{ marginBottom: '6px' }}>
                            <div style={{ fontSize: '9px', color: c.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                              命令 ({plugin.commands.length})
                            </div>
                            {plugin.commands.map(cmd => (
                              <div key={cmd.name} style={{ padding: '2px 8px', fontSize: '10px', color: c.textMuted, display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontFamily: 'monospace' }}>/{cmd.name}</span>
                                {cmd.description && <span style={{ color: c.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{cmd.description}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {plugin.agents.length > 0 && (
                          <div>
                            <div style={{ fontSize: '9px', color: c.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                              Agent ({plugin.agents.length})
                            </div>
                            {plugin.agents.map(agent => (
                              <div key={agent.name} style={{ padding: '2px 8px', fontSize: '10px', color: c.textMuted, display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontFamily: 'monospace' }}>{agent.name}</span>
                                {agent.description && <span style={{ color: c.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{agent.description}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ─── 插件市场标签页 ─── */}
        {tab === 'marketplace' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {marketLoading ? (
              <div style={{ padding: '24px', color: c.textFaint, textAlign: 'center', fontSize: '12px' }}>加载市场中...</div>
            ) : allMarketPlugins.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: c.textFaint, marginBottom: '8px' }}>暂无可用插件</div>
                <div style={{ fontSize: '11px', color: c.textFaint }}>无法连接到插件市场，请检查网络连接。</div>
                <button
                  onClick={loadMarketplaces}
                  style={{
                    marginTop: '12px', padding: '5px 14px', border: `1px solid ${c.accent}`, borderRadius: '3px',
                    background: 'transparent', color: c.accent, cursor: 'pointer', fontSize: '11px',
                  }}
                >
                  刷新
                </button>
              </div>
            ) : (
              allMarketPlugins.map(plugin => (
                <div
                  key={plugin.repo || plugin.name}
                  style={{
                    padding: '10px 16px', borderBottom: `1px solid ${c.borderSubtle}`,
                    background: plugin.installed ? c.accentDim : 'transparent',
                    opacity: plugin.installed ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: c.text }}>
                          {plugin.name}
                        </span>
                        {plugin.version && (
                          <span style={{ fontSize: '9px', color: c.textFaint, background: c.bgPanel, padding: '1px 5px', borderRadius: '2px' }}>
                            v{plugin.version}
                          </span>
                        )}
                        {plugin.installed && (
                          <span style={{ fontSize: '9px', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '1px 5px', borderRadius: '2px' }}>
                            已安装
                          </span>
                        )}
                      </div>
                      {plugin.description && (
                        <div style={{ fontSize: '10px', color: c.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {plugin.description}
                        </div>
                      )}
                      {plugin.repo && (
                        <div style={{ fontSize: '9px', color: c.textFaint, marginTop: '2px', fontFamily: 'monospace' }}>
                          {plugin.repo}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {plugin.installed ? (
                        <span style={{ fontSize: '10px', color: c.textMuted, padding: '3px 8px' }}>✓</span>
                      ) : (
                        <button
                          onClick={() => handleMarketInstall(plugin)}
                          disabled={installingRepo === plugin.repo}
                          style={{
                            padding: '3px 12px', border: 'none', borderRadius: '3px',
                            background: c.accent, color: '#000', cursor: installingRepo === plugin.repo ? 'wait' : 'pointer',
                            fontSize: '10px', fontWeight: 600,
                            opacity: installingRepo === plugin.repo ? 0.6 : 1,
                          }}
                        >
                          {installingRepo === plugin.repo ? '安装中...' : '安装'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 运行时视图（JS 插件沙箱执行 + hooks + 热加载） ───

interface RuntimeViewProps {
  theme: ThemeColors
}

function RuntimeView({ theme }: RuntimeViewProps): JSX.Element {
  const c = theme
  const [plugins, setPlugins] = useState<RuntimePlugin[]>([])
  const [commands, setCommands] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [watching, setWatching] = useState<Set<string>>(new Set())
  const [invokeResult, setInvokeResult] = useState<{ cmd: string; result?: unknown; error?: string } | null>(null)
  const [scaffoldName, setScaffoldName] = useState('')
  const [showScaffold, setShowScaffold] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)
  const [exports, setExports] = useState<Array<{ name: string; size: number; modifiedAt: number }>>([])
  const [showExports, setShowExports] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = window.dogeAPI as Record<string, any>
    try {
      const res = await api?.pluginRuntimeList?.()
      if (res?.success) {
        setPlugins(res.plugins || [])
        setCommands(res.commands || [])
      }
      const expRes = await api?.pluginListExports?.()
      if (expRes?.success && expRes.exports) setExports(expRes.exports)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleExport = useCallback(async (name: string) => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.pluginExport?.(name)
      if (res?.success) {
        setExportMsg(`✅ 已导出: ${res.path} (${res.fileCount} 文件)`)
        refresh()
      } else {
        setExportMsg(`❌ ${res?.error || '导出失败'}`)
      }
    } catch (e) {
      setExportMsg(`❌ ${e instanceof Error ? e.message : '导出失败'}`)
    }
  }, [refresh])

  const handleImport = useCallback(async (exportName: string) => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.pluginImport?.(exportName)
      if (res?.success) {
        setExportMsg(`✅ 已导入插件: ${res.pluginName}`)
        setShowExports(false)
        refresh()
      } else {
        setExportMsg(`❌ ${res?.error || '导入失败'}`)
      }
    } catch (e) {
      setExportMsg(`❌ ${e instanceof Error ? e.message : '导入失败'}`)
    }
  }, [refresh])

  useEffect(() => { refresh() }, [refresh])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const api = window.dogeAPI as Record<string, any>
    const res = await api?.pluginRuntimeLoadAll?.()
    if (res?.success) refresh()
    else setError(res?.error || '加载失败')
    setLoading(false)
  }, [refresh])

  const toggleWatch = useCallback(async (name: string) => {
    const api = window.dogeAPI as Record<string, any>
    if (watching.has(name)) {
      await api?.pluginRuntimeUnwatch?.(name)
      setWatching(prev => { const n = new Set(prev); n.delete(name); return n })
    } else {
      const res = await api?.pluginRuntimeWatch?.(name)
      if (res?.success) setWatching(prev => new Set(prev).add(name))
    }
  }, [watching])

  const invoke = useCallback(async (cmd: string) => {
    const api = window.dogeAPI as Record<string, any>
    const res = await api?.pluginRuntimeInvoke?.(cmd)
    setInvokeResult({ cmd, result: res?.result, error: res?.error })
  }, [])

  const handleScaffold = useCallback(async () => {
    if (!scaffoldName.trim()) { setError('请输入插件名称'); return }
    setScaffolding(true)
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.pluginScaffold?.(scaffoldName.trim())
      if (res?.success) {
        setScaffoldName('')
        setShowScaffold(false)
        setError(null)
        refresh()
      } else {
        setError(res?.error || '创建失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setScaffolding(false)
    }
  }, [scaffoldName, refresh])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={loadAll} style={{
          padding: '4px 10px', border: 'none', borderRadius: '3px',
          background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
        }}>
          ⟳ 加载全部插件
        </button>
        <button onClick={() => { setShowScaffold(v => !v); setScaffoldName('') }} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '3px',
          background: c.bgPanel, color: c.accent, cursor: 'pointer', fontSize: '10px',
        }}>
          ✨ 新建插件
        </button>
        <button onClick={() => { setShowExports(v => !v) }} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '3px',
          background: showExports ? c.accentDim : c.bgPanel, color: c.accent, cursor: 'pointer', fontSize: '10px',
        }}>
          📦 导入 ({exports.length})
        </button>
        {showScaffold && (
          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              value={scaffoldName}
              onChange={e => setScaffoldName(e.target.value)}
              placeholder="插件名（a-zA-Z0-9_-）"
              onKeyDown={e => { if (e.key === 'Enter') handleScaffold() }}
              style={{
                width: '120px', padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
              }}
            />
            <button onClick={handleScaffold} disabled={scaffolding} style={{
              padding: '3px 8px', border: 'none', borderRadius: '3px',
              background: c.accent, color: '#000', cursor: scaffolding ? 'default' : 'pointer', fontSize: '10px', fontWeight: 600,
            }}>
              {scaffolding ? '生成中...' : '生成'}
            </button>
          </span>
        )}
        <span style={{ fontSize: '9px', color: c.textFaint }}>JS 插件在 vm 沙箱中执行，支持 registerCommand / registerHook / on / emit</span>
      </div>

      {/* 导入列表 */}
      {showExports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '110px', overflowY: 'auto', border: `1px solid ${c.borderSubtle}`, borderRadius: '3px', padding: '4px' }}>
          <div style={{ fontSize: '9px', color: c.textMuted }}>本地插件包（.doge/exports/）</div>
          {exports.length === 0 ? (
            <div style={{ fontSize: '9px', color: c.textFaint, padding: '3px' }}>暂无导出包。先在运行时 Tab 中点「📦 导出」。</div>
          ) : exports.map(exp => (
            <div key={exp.name} onClick={() => handleImport(exp.name)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '3px 6px', border: `1px solid ${c.borderSubtle}`, borderRadius: '2px',
              background: c.bgPanel, cursor: 'pointer',
            }}>
              <span style={{ fontSize: '10px', color: c.text, fontWeight: 500 }}>{exp.name}</span>
              <span style={{ fontSize: '9px', color: c.textFaint }}>{(exp.size / 1024).toFixed(1)} KB</span>
            </div>
          ))}
        </div>
      )}

      {/* 导出/导入消息 */}
      {exportMsg && (
        <div style={{ padding: '5px 8px', background: c.codeBg, borderRadius: '3px', fontSize: '10px', color: c.text }}>
          {exportMsg}
          <span style={{ marginLeft: '8px', cursor: 'pointer' }} onClick={() => setExportMsg(null)}>✕</span>
        </div>
      )}

      {error && <div style={{ padding: '5px 8px', background: c.errorBg, color: c.errorText, borderRadius: '3px', fontSize: '10px' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '11px' }}>加载中...</div>
      ) : plugins.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: c.textFaint, marginBottom: '4px' }}>没有已加载的运行时插件</div>
          <div style={{ fontSize: '10px', color: c.textFaint }}>点击「加载全部插件」扫描并执行 .doge/plugins 下的 JS 插件</div>
        </div>
      ) : (
        <>
          {plugins.map(p => (
            <div key={p.name} style={{ border: `1px solid ${c.borderSubtle}`, borderRadius: '3px', padding: '6px 8px', background: c.bgPanel }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: p.enabled ? c.text : c.textMuted }}>
                  {p.name} {!p.enabled && '(加载失败)'}
                </span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '9px', color: c.textFaint }}>⚡{p.commandCount} 命令 · 🔗{p.hookCount} hooks</span>
                  <button onClick={() => handleExport(p.name)} title="导出为 .dogeplugin 包" style={{
                    padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px',
                    background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '9px',
                  }}>
                    📦 导出
                  </button>
                  <button onClick={() => toggleWatch(p.name)} style={{
                    padding: '1px 6px', border: `1px solid ${watching.has(p.name) ? '#10b981' : c.border}`, borderRadius: '2px',
                    background: watching.has(p.name) ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: watching.has(p.name) ? '#10b981' : c.textMuted, cursor: 'pointer', fontSize: '9px',
                  }}>
                    {watching.has(p.name) ? '● 热加载中' : '◌ 热加载'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '9px', color: c.textFaint, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.entry}</div>
              {p.errors.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  {p.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: '9px', color: c.errorText }}>⚠ {err}</div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {commands.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>可用命令</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {commands.map(cmd => (
                  <button key={cmd} onClick={() => invoke(cmd)} style={{
                    padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                    background: c.surface, color: c.accent, cursor: 'pointer', fontSize: '10px', fontFamily: 'monospace',
                  }}>
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          )}

          {invokeResult && (
            <div style={{ padding: '6px 8px', background: c.codeBg, borderRadius: '3px', fontSize: '10px' }}>
              <span style={{ color: c.accent, fontFamily: 'monospace' }}>{invokeResult.cmd}</span>
              <span style={{ color: c.textFaint, margin: '0 6px' }}>→</span>
              {invokeResult.error
                ? <span style={{ color: c.errorText }}>{invokeResult.error}</span>
                : <span style={{ color: c.text, fontFamily: 'monospace' }}>{String(invokeResult.result ?? 'ok')}</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
