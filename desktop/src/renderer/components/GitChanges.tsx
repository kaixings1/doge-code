/**
 * Git 变更面板组件 - 显示 git status、暂存/取消暂存/丢弃操作
 */

import React, { useCallback, useContext, useEffect, useState } from 'react'
import { ThemeContext } from '../App.js'
import { STATUS_COLORS } from '../theme.js'

export interface GitFile {
  path: string
  status: string
  staged: boolean
}

interface GitChangesProps {
  cwd: string
  onSelectFile: (path: string) => void
  theme?: import('../theme.js').ThemeColors
}

export function GitChanges({ cwd, onSelectFile, theme: externalTheme }: GitChangesProps) {
  const themeCtx = useContext(ThemeContext)
  const theme = externalTheme ?? themeCtx.colors
  const appStyles = themeCtx.styles
  const [files, setFiles] = useState<GitFile[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'all' | 'staged'>('all')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: GitFile } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.getGitStatus(cwd)
      setFiles(result)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, file: GitFile) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  const runGit = async (action: 'stage' | 'unstage' | 'discard', filePath: string) => {
    setContextMenu(null)
    let result: { success: boolean; error?: string }
    if (action === 'stage') result = await window.dogeAPI.gitStage(cwd, filePath)
    else if (action === 'unstage') result = await window.dogeAPI.gitUnstage(cwd, filePath)
    else result = await window.dogeAPI.gitDiscard(cwd, filePath)

    if (!result.success) alert(result.error || '操作失败')
    refresh()
    if (filePath) onSelectFile(filePath)
  }

  const visibleFiles = files.filter(f => viewMode === 'staged' ? f.staged : true)
  const stats = files.reduce(
    (acc, f) => {
      if (f.status.includes('M')) acc.modified++
      else if (f.status.includes('A') || f.status.includes('?')) acc.added++
      else if (f.status.includes('D')) acc.deleted++
      else if (f.status.includes('R')) acc.renamed++
      return acc
    },
    { modified: 0, added: 0, deleted: 0, renamed: 0 }
  )

  if (loading) return <div style={{ padding: '8px', color: theme.textFaint, fontSize: '11px' }}>加载中...</div>
  if (files.length === 0) return <div style={{ padding: '8px', color: theme.textFaint, fontSize: '11px' }}>无变更</div>

  return (
    <div style={{ fontSize: '11px' }}>
      {/* 统计栏 */}
      <div style={{ padding: '4px 12px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: `1px solid ${theme.borderSubtle}` }}>
        {stats.modified > 0 && <span style={{ color: theme.errorText }}>修改 {stats.modified}</span>}
        {stats.added > 0 && <span style={{ color: theme.accent }}>新增 {stats.added}</span>}
        {stats.deleted > 0 && <span style={{ color: theme.errorText }}>删除 {stats.deleted}</span>}
        {stats.renamed > 0 && <span style={{ color: '#FFB347' }}>重命名 {stats.renamed}</span>}
        <span style={{ marginLeft: 'auto', color: theme.textFaint }}>共 {files.length} 个文件</span>
      </div>

      {/* 切换按钮 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.borderSubtle}` }}>
        <button
          onClick={() => setViewMode('all')}
          style={{
            flex: 1, padding: '4px', border: 'none', background: viewMode === 'all' ? theme.surface : 'transparent',
            color: viewMode === 'all' ? theme.text : theme.textFaint, cursor: 'pointer', fontSize: '11px'
          }}
        >
          全部 ({files.length})
        </button>
        <button
          onClick={() => setViewMode('staged')}
          style={{
            flex: 1, padding: '4px', border: 'none', background: viewMode === 'staged' ? theme.surface : 'transparent',
            color: viewMode === 'staged' ? theme.text : theme.textFaint, cursor: 'pointer', fontSize: '11px'
          }}
        >
          已暂存 ({files.filter(f => f.staged).length})
        </button>
      </div>

      {/* 文件列表 */}
      {visibleFiles.length === 0 ? (
        <div style={{ padding: '8px 12px', color: theme.textFaint }}>无变更</div>
      ) : (
        visibleFiles.map((f) => {
          const color = STATUS_COLORS[f.status] || '#888888'
          const label = f.status.trim() || '??'
          return (
            <div
              key={f.path}
              style={{ ...appStyles.gitFile, cursor: 'pointer' }}
              onClick={() => onSelectFile(f.path)}
              onContextMenu={(e) => handleContextMenu(e, f)}
              title="左键查看 diff，右键操作"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{f.path.replace(cwd + '/', '')}</span>
              <span style={{ ...appStyles.gitStatus, color }}>{label}</span>
            </div>
          )
        })
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
            background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '4px 0',
            boxShadow: `0 4px 12px ${theme.bg}80`, minWidth: '160px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.file.status[0] !== '?' && !contextMenu.file.staged && (
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.accent }} onClick={() => runGit('stage', contextMenu.file.path)}>
              暂存 (Stage)
            </div>
          )}
          {contextMenu.file.staged && (
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#FFB347' }} onClick={() => runGit('unstage', contextMenu.file.path)}>
              取消暂存 (Unstage)
            </div>
          )}
          {!contextMenu.file.status.includes('D') && (
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.errorText }} onClick={() => runGit('discard', contextMenu.file.path)}>
              丢弃更改 (Discard)
            </div>
          )}
          <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.textMuted }} onClick={() => { navigator.clipboard.writeText(contextMenu.file.path); setContextMenu(null) }}>
            复制路径 (Copy)
          </div>
        </div>
      )}
    </div>
  )
}
