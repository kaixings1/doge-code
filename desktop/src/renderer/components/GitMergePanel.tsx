/**
 * GitMergePanel — Git 合并冲突解决面板
 *
 * 3-way merge 可视化：
 * - base/ours/theirs 三栏对比
 * - 冲突行高亮 + 一键选择
 * - 冲突统计
 * - 合并后自动保存
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { ThemeColors } from '../theme.js'

export interface ConflictFile {
  file: string
  base: string
  ours: string
  theirs: string
}

export interface GitMergeStatus {
  inMerge: boolean
  conflicts: ConflictFile[]
  message: string
  error?: string
}

interface GitMergePanelProps {
  cwd: string
  theme: ThemeColors
  onClose?: () => void
  onResolved?: () => void
}

type ResolutionStrategy = 'ours' | 'theirs' | 'base' | 'manual'

interface ConflictResolution {
  file: string
  strategy: ResolutionStrategy
  manualContent?: string
}

export function GitMergePanel({ cwd, theme, onClose, onResolved }: GitMergePanelProps): JSX.Element {
  const c = theme
  const [status, setStatus] = useState<GitMergeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolutions, setResolutions] = useState<Map<string, ConflictResolution>>(new Map())
  const [activeFileIndex, setActiveFileIndex] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [message, setMessage] = useState('')

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.gitMergeStatus(cwd)
      setStatus(result)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  const currentConflict = status?.conflicts[activeFileIndex]
  const currentFile = currentConflict?.file || ''
  const currentResolution = resolutions.get(currentFile)

  const setResolution = useCallback((file: string, strategy: ResolutionStrategy, manualContent?: string) => {
    setResolutions(prev => {
      const next = new Map(prev)
      next.set(file, { file, strategy, manualContent })
      return next
    })
  }, [])

  const handleResolve = useCallback(async () => {
    if (!currentConflict || !currentResolution) return
    setResolving(true)
    setMessage('')
    try {
      let resolvedContent: string
      switch (currentResolution.strategy) {
        case 'ours':
          resolvedContent = currentConflict.ours
          break
        case 'theirs':
          resolvedContent = currentConflict.theirs
          break
        case 'base':
          resolvedContent = currentConflict.base
          break
        case 'manual':
          resolvedContent = currentResolution.manualContent || ''
          break
        default:
          resolvedContent = ''
      }
      const strategy = currentResolution.strategy === 'base' ? 'manual' : currentResolution.strategy
      const result = await window.dogeAPI.gitMergeResolve(cwd, currentConflict.file, resolvedContent, strategy as 'ours' | 'theirs' | 'manual')
      if (result.success) {
        setMessage(`✅ ${currentConflict.file} 已解决`)
        // 刷新状态
        await refreshStatus()
        if (status && status.conflicts.length <= 1) {
          onResolved?.()
        }
      } else {
        setMessage(`❌ 解决失败: ${result.error}`)
      }
    } catch (e) {
      setMessage(`❌ 错误: ${e instanceof Error ? e.message : '未知错误'}`)
    } finally { setResolving(false) }
  }, [currentConflict, currentResolution, cwd, refreshStatus, status, onResolved])

  const handleAbort = useCallback(async () => {
    setResolving(true)
    setMessage('')
    try {
      const result = await window.dogeAPI.gitAbortMerge(cwd)
      if (result.success) {
        setMessage('⏹ 合并已中止')
        onResolved?.()
      } else {
        setMessage(`❌ 中止失败: ${result.error}`)
      }
    } catch { /* ignore */ } finally { setResolving(false) }
  }, [cwd, onResolved])

  // 计算冲突严重度
  const getSeverity = (conflict: ConflictFile): 'high' | 'medium' | 'low' => {
    const oursLines = conflict.ours.split('\n').length
    const theirsLines = conflict.theirs.split('\n').length
    const diff = Math.abs(oursLines - theirsLines)
    if (diff > 10) return 'high'
    if (diff > 3) return 'medium'
    return 'low'
  }

  const resolvedCount = resolutions.size
  const totalConflicts = status?.conflicts.length || 0
  const unresolvedCount = totalConflicts - resolvedCount

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '11px',
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
  }

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgAlt,
    color: c.text,
    cursor: 'pointer',
    fontSize: '11px',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#000',
    border: 'none',
    fontWeight: 600,
  }

  const severityColors: Record<string, string> = {
    high: '#FF6B6B',
    medium: '#FFB74D',
    low: '#81C784',
  }

  if (loading) {
    return <div style={{ ...containerStyle, padding: '12px', color: c.textMuted }}>加载合并状态...</div>
  }

  if (!status?.inMerge) {
    return (
      <div style={{ ...containerStyle, padding: '12px' }}>
        <div style={{ color: c.textMuted, textAlign: 'center', padding: '16px' }}>
          {status?.error ? `⚠️ ${status.error}` : '✅ 当前无合并冲突'}
        </div>
        {onClose && (
          <div style={{ textAlign: 'center' }}>
            <button onClick={onClose} style={buttonStyle}>关闭</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* 头部统计 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '12px' }}>🔀 合并冲突</span>
          <span style={{ fontSize: '10px', color: c.textMuted }}>{status.message}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
          <span style={{ color: '#FF6B6B' }}>🔴 {unresolvedCount} 未解决</span>
          <span style={{ color: '#81C784' }}>✅ {resolvedCount} 已解决</span>
          <span style={{ color: c.textMuted }}>📄 {totalConflicts} 总计</span>
        </div>
        {message && (
          <div style={{ marginTop: '4px', padding: '4px 8px', borderRadius: '3px', background: message.startsWith('✅') ? '#81C78422' : '#ef535022', color: message.startsWith('✅') ? '#81C784' : '#FF6B6B', fontSize: '10px' }}>
            {message}
          </div>
        )}
      </div>

      {/* 冲突文件列表 */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {status.conflicts.map((conflict, idx) => {
          const severity = getSeverity(conflict)
          const isResolved = resolutions.has(conflict.file)
          const isActive = idx === activeFileIndex
          return (
            <button
              key={conflict.file}
              onClick={() => setActiveFileIndex(idx)}
              style={{
                padding: '3px 8px',
                border: `1px solid ${isActive ? c.accent : isResolved ? '#81C784' : c.border}`,
                borderRadius: '3px',
                background: isActive ? c.accent + '22' : isResolved ? '#81C78411' : c.bgAlt,
                color: isActive ? c.accent : isResolved ? '#81C784' : c.text,
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {isResolved ? '✅' : <span style={{ color: severityColors[severity] }}>●</span>} {conflict.file.split(/[/\\]/).pop()}
            </button>
          )
        })}
      </div>

      {/* 当前冲突的 3-way 对比 */}
      {currentConflict && !resolutions.has(currentFile) && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px' }}>
            📄 {currentConflict.file}
            <span style={{ marginLeft: '8px', color: severityColors[getSeverity(currentConflict)], fontSize: '10px' }}>
              严重度: {getSeverity(currentConflict) === 'high' ? '高' : getSeverity(currentConflict) === 'medium' ? '中' : '低'}
            </span>
          </div>

          {/* 三栏对比 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
            {/* Ours */}
            <div style={{ border: '1px solid #FF6B6B44', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ padding: '3px 6px', background: '#FF6B6B22', color: '#FF6B6B', fontWeight: 600, fontSize: '10px' }}>
                Ours (当前分支)
              </div>
              <pre style={{ padding: '4px', fontSize: '9px', fontFamily: 'monospace', background: c.bgPanel, maxHeight: '200px', overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {currentConflict.ours || '(空)'}
              </pre>
            </div>

            {/* Base */}
            <div style={{ border: '1px solid #B0BEC544', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ padding: '3px 6px', background: '#B0BEC522', color: '#B0BEC5', fontWeight: 600, fontSize: '10px' }}>
                Base (共同祖先)
              </div>
              <pre style={{ padding: '4px', fontSize: '9px', fontFamily: 'monospace', background: c.bgPanel, maxHeight: '200px', overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {currentConflict.base || '(空)'}
              </pre>
            </div>

            {/* Theirs */}
            <div style={{ border: '1px solid #81C78444', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ padding: '3px 6px', background: '#81C78422', color: '#81C784', fontWeight: 600, fontSize: '10px' }}>
                Theirs (合并分支)
              </div>
              <pre style={{ padding: '4px', fontSize: '9px', fontFamily: 'monospace', background: c.bgPanel, maxHeight: '200px', overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {currentConflict.theirs || '(空)'}
              </pre>
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setResolution(currentFile, 'ours')}
              style={{ ...buttonStyle, color: '#FF6B6B' }}
            >
              接受 Ours
            </button>
            <button
              onClick={() => setResolution(currentFile, 'base')}
              style={{ ...buttonStyle, color: '#B0BEC5' }}
            >
              接受 Base
            </button>
            <button
              onClick={() => setResolution(currentFile, 'theirs')}
              style={{ ...buttonStyle, color: '#81C784' }}
            >
              接受 Theirs
            </button>
            <button
              onClick={() => setResolution(currentFile, 'manual')}
              style={{ ...buttonStyle, color: c.accent }}
            >
              手动编辑
            </button>
          </div>
        </div>
      )}

      {/* 手动编辑模式 */}
      {currentConflict && currentResolution?.strategy === 'manual' && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px' }}>✏️ 手动编辑: {currentConflict.file}</div>
          <textarea
            defaultValue={currentResolution.manualContent || [currentConflict.ours, currentConflict.base, currentConflict.theirs].filter(Boolean).join('\n')}
            onChange={(e) => setResolution(currentFile, 'manual', e.target.value)}
            rows={8}
            style={{
              width: '100%',
              padding: '6px',
              border: `1px solid ${c.border}`,
              borderRadius: '3px',
              background: c.bgPanel,
              color: c.text,
              fontSize: '10px',
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
            <button onClick={handleResolve} disabled={resolving} style={{ ...primaryButtonStyle, opacity: resolving ? 0.5 : 1 }}>
              {resolving ? '保存中...' : '保存解决'}
            </button>
            <button onClick={() => setResolutions(prev => { const next = new Map(prev); next.delete(currentFile); return next })} style={buttonStyle}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 已解决但未保存的冲突 */}
      {currentConflict && currentResolution && currentResolution.strategy !== 'manual' && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px', color: '#81C784' }}>
            ✅ 已选择: {currentResolution.strategy === 'ours' ? 'Ours' : currentResolution.strategy === 'theirs' ? 'Theirs' : 'Base'}
          </div>
          <pre style={{
            padding: '6px', fontSize: '9px', fontFamily: 'monospace', background: c.bgPanel,
            border: `1px solid ${c.border}`, borderRadius: '3px', maxHeight: '120px', overflow: 'auto',
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {currentResolution.strategy === 'ours' ? currentConflict.ours : currentResolution.strategy === 'theirs' ? currentConflict.theirs : currentConflict.base}
          </pre>
          <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
            <button onClick={handleResolve} disabled={resolving} style={{ ...primaryButtonStyle, opacity: resolving ? 0.5 : 1 }}>
              {resolving ? '保存中...' : '确认解决'}
            </button>
            <button onClick={() => setResolutions(prev => { const next = new Map(prev); next.delete(currentFile); return next })} style={buttonStyle}>
              重新选择
            </button>
          </div>
        </div>
      )}

      {/* 全部解决按钮 */}
      {unresolvedCount === 0 && resolvedCount > 0 && (
        <div style={{ textAlign: 'center', padding: '8px' }}>
          <button onClick={handleResolve} disabled={resolving} style={{ ...primaryButtonStyle, padding: '6px 20px', opacity: resolving ? 0.5 : 1 }}>
            {resolving ? '处理中...' : '✅ 提交合并'}
          </button>
          <button onClick={handleAbort} disabled={resolving} style={{ ...buttonStyle, marginLeft: '8px', color: '#ef5350' }}>
            ⏹ 中止合并
          </button>
        </div>
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
