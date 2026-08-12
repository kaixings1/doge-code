/**
 * IssuesPanel — 问题标记面板
 *
 * 功能：
 * - 显示房间内所有问题（open/in_progress/closed）
 * - 创建新问题（标题/描述/严重级别/负责人）
 * - 更新问题状态
 * - 筛选问题
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface Issue {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  assignee: string
  status: 'open' | 'in_progress' | 'closed'
  createdAt: number
}

const SEVERITY_LABELS: Record<string, string> = { critical: ' 严重', high: '🟠 高', medium: '🟡 中', low: '🟢 低' }
const STATUS_LABELS: Record<string, string> = { open: '待处理', in_progress: '处理中', closed: '已关闭' }

export function IssuesPanel({ theme, roomId }: { theme: ThemeColors; roomId: string }): JSX.Element {
  const c = theme
  const [issues, setIssues] = useState<Issue[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newSeverity, setNewSeverity] = useState<string>('medium')
  const api = (window as any).dogeAPI as Record<string, any>

  const loadIssues = useCallback(async () => {
    if (!roomId) return
    const result = await api.issueList({ roomId, status: filter === 'all' ? undefined : filter })
    if (result?.issues) setIssues(result.issues)
  }, [roomId, filter, api])

  useEffect(() => { loadIssues() }, [loadIssues])

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return
    await api.issueCreate({ roomId, title: newTitle.trim(), description: newDesc.trim(), severity: newSeverity as any })
    setNewTitle(''); setNewDesc(''); setShowCreate(false)
    loadIssues()
  }, [roomId, newTitle, newDesc, newSeverity, api, loadIssues])

  const handleStatusChange = useCallback(async (issueId: string, status: string) => {
    await api.issueUpdate({ roomId, issueId, status: status as any })
    loadIssues()
  }, [roomId, api, loadIssues])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ color: c.accent, fontWeight: 600 }}>问题标记 ({issues.length})</span>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '2px 8px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', fontSize: '9px', cursor: 'pointer' }}>
          {showCreate ? '取消' : '+ 新建'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {['all', 'open', 'in_progress', 'closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 6px', border: 'none', borderRadius: '2px', fontSize: '8px', cursor: 'pointer',
            background: filter === f ? c.accent : c.bgAlt, color: filter === f ? '#000' : c.textMuted
          }}>{f === 'all' ? '全部' : STATUS_LABELS[f] || f}</button>
        ))}
      </div>

      {showCreate && (
        <div style={{ marginBottom: '8px', padding: '6px', background: c.codeBg, borderRadius: '3px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="问题标题" style={{ padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" rows={2} style={{ padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none', resize: 'vertical' }} />
          <select value={newSeverity} onChange={e => setNewSeverity(e.target.value)} style={{ padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px' }}>
            <option value="critical"> 严重</option>
            <option value="high">🟠 高</option>
            <option value="medium">🟡 中</option>
            <option value="low">🟢 低</option>
          </select>
          <button onClick={handleCreate} style={{ padding: '3px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', fontSize: '9px', cursor: 'pointer' }}>创建问题</button>
        </div>
      )}

      {issues.length === 0 ? (
        <div style={{ padding: '12px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>暂无问题</div>
      ) : issues.map(issue => (
        <div key={issue.id} style={{ padding: '6px', borderBottom: `1px solid ${c.borderSubtle}`, borderRadius: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: c.text, fontSize: '10px', fontWeight: 500 }}>{issue.title}</span>
            <span style={{ color: c.textFaint, fontSize: '8px' }}>{SEVERITY_LABELS[issue.severity]}</span>
          </div>
          {issue.description && <div style={{ color: c.textFaint, fontSize: '9px', marginTop: '2px' }}>{issue.description}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px' }}>
            <span style={{ color: c.textFaint, fontSize: '8px' }}>{STATUS_LABELS[issue.status]}</span>
            <select value={issue.status} onChange={e => handleStatusChange(issue.id, e.target.value)} style={{ fontSize: '8px', padding: '1px 3px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text }}>
              <option value="open">待处理</option>
              <option value="in_progress">处理中</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
