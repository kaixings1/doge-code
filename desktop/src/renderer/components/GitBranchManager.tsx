/**
 * GitBranchManager — Git 分支管理面板
 *
 * 功能：
 * - 分支列表 + 当前分支标记
 * - 创建/切换/删除/重命名分支
 * - 分支合并
 * - git log --graph 分支图可视化
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { ThemeColors } from '../theme.js'
import { VersionComparePanel } from './VersionComparePanel.js'

export interface GitBranch {
  name: string
  commit: string
  date: string
  isCurrent: boolean
  isRemote: boolean
}

export interface BranchListResult {
  local: GitBranch[]
  remote: GitBranch[]
  current: string
  error?: string
}

interface GitBranchManagerProps {
  cwd: string
  theme: ThemeColors
  onClose?: () => void
  onBranchChanged?: () => void
}

export function GitBranchManager({ cwd, theme, onClose, onBranchChanged }: GitBranchManagerProps): JSX.Element {
  const c = theme
  const [branches, setBranches] = useState<BranchListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [newBranchName, setNewBranchName] = useState('')
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [graph, setGraph] = useState('')
  const [showGraph, setShowGraph] = useState(false)
  const [showVersionCompare, setShowVersionCompare] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedCommitForCompare, setSelectedCommitForCompare] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.gitBranchList(cwd)
      setBranches(result)
      // 自动设置合并目标为当前分支
      if (result.current && !mergeTarget) setMergeTarget(result.current)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd, mergeTarget])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = useCallback(async () => {
    if (!newBranchName.trim()) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const result = await window.dogeAPI.gitBranchCreate(cwd, newBranchName.trim(), checkoutAfterCreate)
      if (result.success) {
        setActionMessage(`✅ 分支 "${newBranchName}" 已创建`)
        setNewBranchName('')
        await refresh()
        onBranchChanged?.()
      } else {
        setActionMessage(`❌ 创建失败: ${result.error}`)
      }
    } catch { /* ignore */ } finally { setActionLoading(false) }
  }, [cwd, newBranchName, checkoutAfterCreate, refresh, onBranchChanged])

  const handleSwitch = useCallback(async (branchName: string) => {
    setActionLoading(true)
    setActionMessage('')
    try {
      const result = await window.dogeAPI.gitBranchSwitch(cwd, branchName)
      if (result.success) {
        setActionMessage(`✅ 已切换到 "${branchName}"`)
        await refresh()
        onBranchChanged?.()
      } else {
        setActionMessage(`❌ 切换失败: ${result.error}`)
      }
    } catch { /* ignore */ } finally { setActionLoading(false) }
  }, [cwd, refresh, onBranchChanged])

  const handleDelete = useCallback(async (branchName: string, force: boolean) => {
    if (!confirm(`确定要删除分支 "${branchName}" 吗？${force ? '（强制删除）' : ''}`)) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const result = await window.dogeAPI.gitBranchDelete(cwd, branchName, force)
      if (result.success) {
        setActionMessage(`✅ 分支 "${branchName}" 已删除`)
        await refresh()
        onBranchChanged?.()
      } else {
        setActionMessage(`❌ 删除失败: ${result.error}`)
      }
    } catch { /* ignore */ } finally { setActionLoading(false) }
  }, [cwd, refresh, onBranchChanged])

  const handleRename = useCallback(async (oldName: string) => {
    if (!renameName.trim() || renameName.trim() === oldName) {
      setRenameTarget(null)
      setRenameName('')
      return
    }
    setActionLoading(true)
    setActionMessage('')
    try {
      const { execSync } = await import('node:child_process')
      execSync(`git branch -m "${oldName}" "${renameName.trim()}"`, { cwd, encoding: 'utf-8' })
      setActionMessage(`✅ 分支 "${oldName}" 已重命名为 "${renameName.trim()}"`)
      setRenameTarget(null)
      setRenameName('')
      await refresh()
      onBranchChanged?.()
    } catch (e) {
      setActionMessage(`❌ 重命名失败: ${e instanceof Error ? e.message : '未知错误'}`)
    } finally { setActionLoading(false) }
  }, [cwd, renameName, refresh, onBranchChanged])

  const handleMerge = useCallback(async () => {
    if (!mergeSource || !mergeTarget) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const result = await window.dogeAPI.gitBranchMerge(cwd, mergeSource, mergeTarget)
      if (result.success) {
        setActionMessage(`✅ 已合并 "${mergeSource}" 到 "${mergeTarget}"`)
        await refresh()
        onBranchChanged?.()
      } else {
        setActionMessage(`❌ 合并失败: ${result.error}`)
      }
    } catch { /* ignore */ } finally { setActionLoading(false) }
  }, [cwd, mergeSource, mergeTarget, refresh, onBranchChanged])

  const loadGraph = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.gitLogGraph(cwd, 30)
      if (result.success) setGraph(result.graph || '')
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  // 自动加载分支图
  useEffect(() => {
    if (showGraph && !graph) loadGraph()
  }, [showGraph, graph, loadGraph])

  const allBranches = branches ? [...branches.local.map(b => ({ ...b, isRemote: false })), ...branches.remote] : []

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '11px',
    maxHeight: '600px',
    overflow: 'auto',
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
  }

  const inputStyle: React.CSSProperties = {
    padding: '4px 6px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgPanel,
    color: c.text,
    fontSize: '11px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '3px 8px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgAlt,
    color: c.text,
    cursor: 'pointer',
    fontSize: '10px',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#000',
    border: 'none',
    fontWeight: 600,
  }

  if (loading && !branches) {
    return <div style={{ ...containerStyle, padding: '12px', color: c.textMuted }}>加载分支列表...</div>
  }

  return (
    <div style={containerStyle}>
      {/* 操作消息 */}
      {actionMessage && (
        <div style={{
          padding: '4px 8px', borderRadius: '3px', fontSize: '10px',
          background: actionMessage.startsWith('✅') ? '#81C78422' : '#ef535022',
          color: actionMessage.startsWith('✅') ? '#81C784' : '#FF6B6B',
        }}>
          {actionMessage}
        </div>
      )}

      {/* ➕ 创建分支 */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>➕ 创建分支</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            placeholder="分支名称"
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} disabled={actionLoading || !newBranchName.trim()} style={{ ...primaryButtonStyle, opacity: (!newBranchName.trim() || actionLoading) ? 0.5 : 1 }}>
            创建
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '10px', color: c.textMuted, cursor: 'pointer' }}>
          <input type="checkbox" checked={checkoutAfterCreate} onChange={e => setCheckoutAfterCreate(e.target.checked)} />
          创建后自动切换
        </label>
      </div>

      {/* 合并分� */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>🔀 合并分支</div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <select value={mergeSource} onChange={e => setMergeSource(e.target.value)} style={{ ...inputStyle, flex: 1, fontFamily: 'sans-serif' }}>
            <option value="">选择源分支</option>
            {allBranches.filter(b => !b.isCurrent).map(b => (
              <option key={b.name} value={b.name}>{b.isRemote ? '📡 ' : ''}{b.name}</option>
            ))}
          </select>
          <span style={{ color: c.textMuted, fontSize: '10px' }}>→</span>
          <span style={{ fontSize: '10px', color: c.accent, fontWeight: 600, minWidth: '60px' }}>{mergeTarget || '当前'}</span>
          <button onClick={handleMerge} disabled={actionLoading || !mergeSource} style={{ ...primaryButtonStyle, opacity: (!mergeSource || actionLoading) ? 0.5 : 1 }}>
            合并
          </button>
        </div>
      </div>

      {/* 分支列表 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '12px' }}>🌿 分支 ({allBranches.length})</span>
          <button onClick={() => setShowGraph(p => !p)} style={{ ...buttonStyle, fontSize: '10px' }}>
            {showGraph ? '隐藏' : '显示'}分支图
          </button>
        </div>

        {/* 分支图 */}
        {showGraph && (
          <div style={{
            marginBottom: '8px', padding: '6px', borderRadius: '3px',
            background: c.bgPanel, border: `1px solid ${c.border}`,
            fontSize: '9px', fontFamily: 'monospace', maxHeight: '200px', overflow: 'auto',
            whiteSpace: 'pre',
          }}>
            {graph || '点击"刷新"加载分支图'}
            <button onClick={loadGraph} style={{ ...buttonStyle, marginTop: '4px' }}>刷新</button>
          </div>
        )}

        {/* 本地分支 */}
        {branches && branches.local.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '3px' }}>本地分支</div>
            {branches.local.map(branch => (
              <div key={branch.name} style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px',
                borderRadius: '3px', background: branch.isCurrent ? c.accent + '15' : 'transparent',
                marginBottom: '2px',
              }}>
                <span style={{ color: branch.isCurrent ? c.accent : '#81C784', fontSize: '9px' }}>
                  {branch.isCurrent ? '●' : '○'}
                </span>
                <span style={{ flex: 1, fontWeight: branch.isCurrent ? 600 : 400, fontSize: '11px' }}>
                  {branch.name}
                </span>
                <span style={{ fontSize: '9px', color: c.textMuted, fontFamily: 'monospace' }}>{branch.commit}</span>
                <span style={{ fontSize: '9px', color: c.textFaint }}>{branch.date}</span>
                {!branch.isCurrent && (
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button onClick={() => handleSwitch(branch.name)} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px' }} title="切换">
                      ↻
                    </button>
                    {renameTarget === branch.name ? (
                      <>
                        <input
                          value={renameName}
                          onChange={e => setRenameName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleRename(branch.name)}
                          style={{ ...inputStyle, width: '80px', padding: '1px 4px', fontSize: '9px' }}
                          autoFocus
                        />
                        <button onClick={() => handleRename(branch.name)} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px' }}>✓</button>
                        <button onClick={() => { setRenameTarget(null); setRenameName('') }} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px' }}>✗</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setRenameTarget(branch.name); setRenameName(branch.name) }} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px' }} title="重命名">
                          ✎
                        </button>
                        <button onClick={() => handleDelete(branch.name, false)} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px', color: '#FFB74D' }} title="删除">
                          🗑
                        </button>
                        <button onClick={() => handleDelete(branch.name, true)} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px', color: '#FF6B6B' }} title="强制删除">
                          💥
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 远程分支 */}
        {branches && branches.remote.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '3px' }}>远程分支</div>
            {branches.remote.map(branch => (
              <div key={branch.name} style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px',
                borderRadius: '3px', marginBottom: '2px', opacity: 0.7,
              }}>
                <span style={{ fontSize: '9px' }}>📡</span>
                <span style={{ flex: 1, fontSize: '11px' }}>{branch.name}</span>
                <button onClick={() => handleSwitch(branch.name)} style={{ ...buttonStyle, padding: '1px 5px', fontSize: '9px' }} title="切换到此分支">
                  checkout
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 版本对比入口 */}
      <div style={{ textAlign: 'right' }}>
        <button onClick={() => setShowVersionCompare(p => !p)} style={{ ...buttonStyle, color: c.accent }}>
          {showVersionCompare ? '隐藏版本对比' : '显示版本对比'}
        </button>
      </div>

      {/* 版本对比面板 */}
      {showVersionCompare && (
        <VersionComparePanel
          cwd={cwd}
          theme={theme}
          selectedCommitSha={selectedCommitForCompare}
          onCompareCommits={(shaA, shaB) => { /* future: external compare action */ }}
          onClose={() => { setShowVersionCompare(false); setSelectedCommitForCompare(null) }}
        />
      )}

      {/* 关闭按钮 */}
      {onClose && (
        <div style={{ textAlign: 'right' }}>
          <button onClick={onClose} style={{ ...buttonStyle, color: c.textMuted }}>关闭</button>
        </div>
      )}
    </div>
  )
}
