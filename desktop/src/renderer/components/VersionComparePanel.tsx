import React, { useState, useEffect } from 'react'
import type { ThemeColors } from '../theme.js'
import type { CommitInfo, DiffStat } from '../hooks/useVersionCompare.js'

export interface VersionComparePanelProps {
  cwd: string
  theme: ThemeColors
  selectedCommitSha?: string | null
  onCompareCommits?: (shaA: string, shaB: string) => void
  onClose?: () => void
  initialCommits?: CommitInfo[]
}

export function VersionComparePanel({ cwd, theme, selectedCommitSha, onCompareCommits, onClose, initialCommits }: VersionComparePanelProps): JSX.Element {
  const c = theme
  const [commits, setCommits] = useState<CommitInfo[]>(initialCommits || [])
  const [loading, setLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null)
  const [diffStats, setDiffStats] = useState<DiffStat[]>([])
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')

  useEffect(() => {
    if (initialCommits && initialCommits.length > 0) {
      setCommits(initialCommits)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await window.dogeAPI.getGitStats(cwd)
        const list: CommitInfo[] = (result.commits || []).map((item: { hash: string; date: string; author: string; message: string; additions: number; deletions: number }) => ({
          sha: item.hash,
          shortSha: item.hash.slice(0, 7),
          author: item.author,
          date: item.date,
          message: item.message,
          stats: [],
        }))
        if (!cancelled) setCommits(list)
      } catch { /* ignore */ } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [cwd, initialCommits])

  useEffect(() => {
    if (selectedCommitSha) {
      handleSelectCommit(selectedCommitSha)
    }
  }, [selectedCommitSha])

  const handleSelectCommit = async (sha: string) => {
    setLoading(true)
    setSelectedCommit(null)
    setDiffStats([])
    try {
      const result = await window.dogeAPI.gitShow(cwd, sha)
      if (result.success) {
        const info: CommitInfo = {
          sha: result.sha,
          shortSha: result.sha.slice(0, 7),
          author: result.author,
          date: result.date,
          message: result.message,
          stats: result.stats || [],
        }
        setSelectedCommit(info)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const handleCompare = async () => {
    if (!compareA || !compareB) return
    setLoading(true)
    setDiffStats([])
    try {
      const result = await window.dogeAPI.gitDiff(cwd, compareA, compareB)
      if (result.success) {
        const stats: DiffStat[] = (result.stats || []).map(item => ({
          file: item.file,
          additions: item.additions,
          deletions: item.deletions,
          changeType: (item.changeType || 'modified') as DiffStat['changeType'],
        }))
        setDiffStats(stats)
        onCompareCommits?.(compareA, compareB)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '10px',
    maxHeight: '75vh',
    background: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    padding: '8px',
    boxSizing: 'border-box',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
    fontSize: '12px',
  }

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
    overflow: 'hidden',
  }

  const commitListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '45vh',
    overflow: 'auto',
    padding: '6px',
  }

  const commitItemStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 6px',
    borderRadius: '3px',
    background: active ? c.accent + '18' : 'transparent',
    cursor: 'pointer',
    border: `1px solid ${active ? c.accent : 'transparent'}`,
  })

  const diffTableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '10px',
  }

  const selectStyle: React.CSSProperties = {
    padding: '2px 4px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgPanel,
    color: c.text,
    fontSize: '10px',
    outline: 'none',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '2px 8px',
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

  const changeTypeIcon = (type: string): string => {
    switch (type) {
      case 'added': return '＋'
      case 'deleted': return '－'
      case 'renamed': return '⇄'
      default: return '△'
    }
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span> 版本对比</span>
        {onClose && (
          <button onClick={onClose} style={{ ...buttonStyle, color: c.textMuted }}>✕ 关闭</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', maxHeight: '60vh' }}>
        {/* 左侧 commit 列表 */}
        <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 6px', fontWeight: 600, borderBottom: `1px solid ${c.border}` }}>提交历史</div>
          <div style={commitListStyle}>
            {loading && commits.length === 0 && <div style={{ color: c.textMuted }}>加载提交...</div>}
            {commits.map(commit => (
              <div
                key={commit.sha}
                style={commitItemStyle(selectedCommit?.sha === commit.sha)}
                onClick={() => handleSelectCommit(commit.sha)}
              >
                <div style={{ fontFamily: 'monospace', color: c.accent }}>
                  ▸ {commit.shortSha}
                </div>
                <div style={{ color: c.textMuted }}>
                  {commit.date}
                </div>
                <div style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {commit.message}
                </div>
              </div>
            ))}
            {!loading && commits.length === 0 && (
              <div style={{ color: c.textMuted }}>暂无提交记录</div>
            )}
          </div>
        </div>

        {/* 右侧详情 */}
        <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 6px', fontWeight: 600, borderBottom: `1px solid ${c.border}` }}>文件变更详情</div>
          <div style={{ padding: '6px', overflow: 'auto', maxHeight: '50vh' }}>
            {selectedCommit ? (
              <table style={diffTableStyle}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={{ textAlign: 'left', padding: '2px 4px' }}>文件</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px', color: '#81C784' }}>additions</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px', color: '#FF6B6B' }}>deletions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCommit.stats.map((stat, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{changeTypeIcon('modified')}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.file}</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 4px', color: '#81C784' }}>+{stat.additions}</td>
                      <td style={{ textAlign: 'right', padding: '2px 4px', color: '#FF6B6B' }}>-{stat.deletions}</td>
                    </tr>
                  ))}
                  {selectedCommit.stats.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '4px', color: c.textMuted }}>无文件变更</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div style={{ color: c.textMuted }}>选择提交查看详情</div>
            )}

            {diffStats.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>对比结果</div>
                <table style={diffTableStyle}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                      <th style={{ textAlign: 'left', padding: '2px 4px' }}>文件</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px', color: '#81C784' }}>additions</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px', color: '#FF6B6B' }}>deletions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffStats.map((stat, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{changeTypeIcon(stat.changeType)}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.file}</span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '2px 4px', color: '#81C784' }}>+{stat.additions}</td>
                        <td style={{ textAlign: 'right', padding: '2px 4px', color: '#FF6B6B' }}>-{stat.deletions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部对比选择器 */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: c.textMuted }}>选择两个 commit 对比 ▼</span>
        <select value={compareA} onChange={e => setCompareA(e.target.value)} style={selectStyle}>
          <option value="">A</option>
          {commits.map(c => (
            <option key={c.sha} value={c.sha}>{c.shortSha} - {c.message}</option>
          ))}
        </select>
        <span style={{ color: c.textMuted }}>→</span>
        <select value={compareB} onChange={e => setCompareB(e.target.value)} style={selectStyle}>
          <option value="">B</option>
          {commits.map(c => (
            <option key={c.sha} value={c.sha}>{c.shortSha} - {c.message}</option>
          ))}
        </select>
        <button onClick={handleCompare} disabled={!compareA || !compareB || loading} style={{ ...primaryButtonStyle, opacity: (!compareA || !compareB || loading) ? 0.5 : 1 }}>
          对比
        </button>
      </div>
    </div>
  )
}
