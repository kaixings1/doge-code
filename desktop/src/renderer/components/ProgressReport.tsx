/**
 * ProgressReport — 进度报告组件
 *
 * 功能：
 * - 提交统计图表（按天/周/月提交次数，CSS 柱状图）
 * - 活跃度热力图（GitHub 风格，CSS Grid）
 * - 代码行数统计（新增/删除/净增）
 * - 项目里程碑管理（创建/编辑/删除）
 * - 里程碑进度条
 * - 周报生成（AI 模板 + 手动编辑）
 * - 报告导出（Markdown/HTML）
 */

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from '../App.js'
import type { ThemeColors } from '../theme.js'
import { useGitStats, type DailyStat } from '../hooks/useGitStats.js'

interface Milestone {
  id: string
  title: string
  description: string
  dueDate: string
  progress: number
  status: 'active' | 'completed' | 'paused'
  createdAt: number
}

const MILESTONE_STORAGE_KEY = 'doge-milestones'

function loadMilestones(): Milestone[] {
  try {
    const saved = localStorage.getItem(MILESTONE_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveMilestones(milestones: Milestone[]): void {
  try {
    localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify(milestones))
  } catch { /* ignore */ }
}

interface ProgressReportProps {
  cwd: string
  theme?: ThemeColors
}

export function ProgressReport({ cwd, theme: externalTheme }: ProgressReportProps) {
  const themeCtx = useContext(ThemeContext)
  const theme = externalTheme ?? themeCtx.colors
  const c = theme

  const { stats, loading, error, refresh } = useGitStats(cwd)
  const [milestones, setMilestones] = useState<Milestone[]>(loadMilestones)
  const [viewMode, setViewMode] = useState<'commits' | 'heatmap' | 'milestones' | 'report'>('commits')
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const [reportContent, setReportContent] = useState('')

  useEffect(() => {
    saveMilestones(milestones)
  }, [milestones])

  // 计算柱状图数据
  const barChartData = useMemo(() => {
    if (!stats || stats.dailyStats.length === 0) return []
    const last30 = stats.dailyStats.slice(-30)
    const maxCommits = Math.max(...last30.map(d => d.commits), 1)
    return last30.map(d => ({
      ...d,
      heightPercent: (d.commits / maxCommits) * 100,
    }))
  }, [stats])

  // 计算周/月汇总
  const weeklyData = useMemo(() => {
    if (!stats) return []
    const weekMap = new Map<string, number>()
    for (const d of stats.dailyStats) {
      const date = new Date(d.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      weekMap.set(key, (weekMap.get(key) || 0) + d.commits)
    }
    return Array.from(weekMap.entries()).map(([week, commits]) => ({ week, commits })).slice(-12)
  }, [stats])

  const handleAddMilestone = () => {
    const newMilestone: Milestone = {
      id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: '新里程碑',
      description: '',
      dueDate: '',
      progress: 0,
      status: 'active',
      createdAt: Date.now(),
    }
    setMilestones(prev => [...prev, newMilestone])
    setEditingMilestone(newMilestone)
  }

  const handleUpdateMilestone = (updated: Milestone) => {
    setMilestones(prev => prev.map(m => m.id === updated.id ? updated : m))
    setEditingMilestone(null)
  }

  const handleDeleteMilestone = (id: string) => {
    setMilestones(prev => prev.filter(m => m.id !== id))
    setEditingMilestone(null)
  }

  const handleGenerateReport = () => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 7)

    const weekStr = `${weekStart.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`
    const totalCommits = stats?.totalCommits || 0
    const totalAdditions = stats?.totalAdditions || 0
    const totalDeletions = stats?.totalDeletions || 0
    const activeMilestones = milestones.filter(m => m.status === 'active').length
    const completedMilestones = milestones.filter(m => m.status === 'completed').length

    const report = `# 项目周报 (${weekStr})

## 概述
- 总提交数: ${totalCommits}
- 新增行数: +${totalAdditions}
- 删除行数: -${totalDeletions}
- 净增行数: +${totalAdditions - totalDeletions}

## 里程碑
- 进行中: ${activeMilestones}
- 已完成: ${completedMilestones}

## 下周计划
- [ ] TODO

## 备注
（在此处添加备注）
`
    setReportContent(report)
  }

  const handleExportMarkdown = () => {
    const blob = new Blob([reportContent], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportHTML = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>周报</title>
<body style="font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;color:#333">
${reportContent.replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/^## (.+)$/gm, '<h2>$2</h2>').replace(/\n/g, '<br/>')}
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeMilestones = milestones.filter(m => m.status === 'active')
  const completedMilestones = milestones.filter(m => m.status === 'completed')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: '12px' }}>
      {/* 标题栏 */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: c.text }}>📊 进度报告</span>
        <span style={{ color: c.accent, cursor: 'pointer', fontSize: '11px' }} onClick={refresh}>刷新</span>
      </div>

      {/* 标签切换 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${c.borderSubtle}` }}>
        {[
          { id: 'commits' as const, label: '提交统计' },
          { id: 'heatmap' as const, label: '热力图' },
          { id: 'milestones' as const, label: '里程碑' },
          { id: 'report' as const, label: '周报' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            style={{
              flex: 1, padding: '5px', border: 'none', background: viewMode === tab.id ? c.surface : 'transparent',
              color: viewMode === tab.id ? c.text : c.textFaint, cursor: 'pointer', fontSize: '11px',
              borderBottom: viewMode === tab.id ? `2px solid ${c.accent}` : '2px solid transparent',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {loading && <div style={{ textAlign: 'center', color: c.textFaint, padding: '20px' }}>加载中...</div>}
        {error && <div style={{ textAlign: 'center', color: c.errorText, padding: '20px' }}>{error}</div>}

        {/* 提交统计 */}
        {viewMode === 'commits' && stats && (
          <div>
            {/* 总览 */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
              <div style={{ flex: 1, padding: '8px', background: c.bgAlt, borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: c.accent }}>{stats.totalCommits}</div>
                <div style={{ fontSize: '10px', color: c.textFaint }}>总提交</div>
              </div>
              <div style={{ flex: 1, padding: '8px', background: c.bgAlt, borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#4ECB71' }}>+{stats.totalAdditions}</div>
                <div style={{ fontSize: '10px', color: c.textFaint }}>新增行</div>
              </div>
              <div style={{ flex: 1, padding: '8px', background: c.bgAlt, borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: c.errorText }}>-{stats.totalDeletions}</div>
                <div style={{ fontSize: '10px', color: c.textFaint }}>删除行</div>
              </div>
              <div style={{ flex: 1, padding: '8px', background: c.bgAlt, borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: c.text }}>+{stats.totalAdditions - stats.totalDeletions}</div>
                <div style={{ fontSize: '10px', color: c.textFaint }}>净增行</div>
              </div>
            </div>

            {/* 柱状图 - 最近 30 天 */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '6px' }}>最近 30 天提交</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px', borderBottom: `1px solid ${c.borderSubtle}`, paddingBottom: '4px' }}>
                {barChartData.map(d => (
                  <div
                    key={d.date}
                    style={{
                      flex: 1,
                      height: `${Math.max(d.heightPercent, 2)}%`,
                      background: d.commits > 0 ? c.accent : c.bgPanel,
                      borderRadius: '2px 2px 0 0',
                      minWidth: '4px',
                      position: 'relative',
                    }}
                    title={`${d.date}: ${d.commits} 提交`}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                <span style={{ fontSize: '9px', color: c.textFaint }}>{barChartData[0]?.date}</span>
                <span style={{ fontSize: '9px', color: c.textFaint }}>{barChartData[barChartData.length - 1]?.date}</span>
              </div>
            </div>

            {/* 周提交 */}
            <div>
              <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '6px' }}>最近 12 周提交</div>
              {weeklyData.map(w => (
                <div key={w.week} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', color: c.textFaint, width: '70px', flexShrink: 0 }}>{w.week}</span>
                  <div style={{ flex: 1, height: '8px', background: c.bgPanel, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (w.commits / Math.max(...weeklyData.map(d => d.commits), 1)) * 100)}%`, height: '100%', background: c.accent, borderRadius: '2px' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: c.textMuted, width: '24px', textAlign: 'right' }}>{w.commits}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 热力图 */}
        {viewMode === 'heatmap' && stats && (
          <div>
            <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '6px' }}>活跃度热力图（最近一年）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(53, 1fr)', gap: '2px' }}>
              {stats.heatmapData.map((d, i) => {
                const intensity = d.count === 0 ? 0 : d.count <= 2 ? 1 : d.count <= 5 ? 2 : d.count <= 10 ? 3 : 4
                const colors = intensity === 0 ? c.bgPanel : intensity === 1 ? `${c.accent}22` : intensity === 2 ? `${c.accent}55` : intensity === 3 ? `${c.accent}99` : c.accent
                return (
                  <div
                    key={i}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      background: colors,
                      borderRadius: '2px',
                    }}
                    title={`${d.date}: ${d.count} 提交`}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '10px', color: c.textFaint }}>少</span>
              {[0, 1, 2, 3, 4].map(level => {
                const colors = level === 0 ? c.bgPanel : level === 1 ? `${c.accent}22` : level === 2 ? `${c.accent}55` : level === 3 ? `${c.accent}99` : c.accent
                return <div key={level} style={{ width: '10px', height: '10px', background: colors, borderRadius: '2px' }} />
              })}
              <span style={{ fontSize: '10px', color: c.textFaint }}>多</span>
            </div>
          </div>
        )}

        {/* 里程碑 */}
        {viewMode === 'milestones' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: c.textMuted }}>
                进行中: {activeMilestones.length} · 已完成: {completedMilestones.length}
              </span>
              <span style={{ cursor: 'pointer', color: c.accent, fontSize: '11px' }} onClick={handleAddMilestone}>+ 新建</span>
            </div>

            {milestones.length === 0 ? (
              <div style={{ textAlign: 'center', color: c.textFaint, padding: '20px' }}>暂无里程碑</div>
            ) : (
              milestones.map(ms => (
                <div
                  key={ms.id}
                  onClick={() => setEditingMilestone(ms)}
                  style={{
                    padding: '8px', marginBottom: '6px', background: c.bgAlt, borderRadius: '4px',
                    cursor: 'pointer', border: `1px solid ${c.borderSubtle}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: c.text }}>{ms.title}</span>
                    <span style={{
                      fontSize: '10px', padding: '1px 6px', borderRadius: '2px',
                      background: ms.status === 'completed' ? '#4ECB7122' : ms.status === 'paused' ? '#FFB34722' : c.accentDim,
                      color: ms.status === 'completed' ? '#4ECB71' : ms.status === 'paused' ? '#FFB347' : c.accent,
                    }}>
                      {ms.status === 'completed' ? '已完成' : ms.status === 'paused' ? '暂停' : '进行中'}
                    </span>
                  </div>
                  {ms.description && <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>{ms.description}</div>}
                  <div style={{ height: '4px', background: c.bgPanel, borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
                    <div style={{ width: `${ms.progress}%`, height: '100%', background: ms.status === 'completed' ? '#4ECB71' : c.accent, borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: c.textFaint }}>{ms.progress}%</span>
                    {ms.dueDate && <span style={{ fontSize: '10px', color: c.textFaint }}>截止: {ms.dueDate}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 周报 */}
        {viewMode === 'report' && (
          <div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <button onClick={handleGenerateReport} style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>生成周报</button>
              <button onClick={handleExportMarkdown} disabled={!reportContent} style={{ padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '3px', background: reportContent ? c.bgAlt : 'transparent', color: reportContent ? c.text : c.textFaint, cursor: reportContent ? 'pointer' : 'not-allowed', fontSize: '11px' }}>导出 MD</button>
              <button onClick={handleExportHTML} disabled={!reportContent} style={{ padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '3px', background: reportContent ? c.bgAlt : 'transparent', color: reportContent ? c.text : c.textFaint, cursor: reportContent ? 'pointer' : 'not-allowed', fontSize: '11px' }}>导出 HTML</button>
            </div>
            <textarea
              value={reportContent}
              onChange={e => setReportContent(e.target.value)}
              placeholder="点击「生成周报」自动生成模板，或手动编写..."
              style={{
                width: '100%', minHeight: '300px', padding: '8px', background: c.inputBg,
                border: `1px solid ${c.border}`, borderRadius: '4px', color: c.text,
                fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: 'monospace',
                lineHeight: '1.6', boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      {/* 里程碑编辑弹窗 */}
      {editingMilestone && (
        <MilestoneEditModal
          milestone={editingMilestone}
          theme={c}
          onSave={handleUpdateMilestone}
          onDelete={handleDeleteMilestone}
          onClose={() => setEditingMilestone(null)}
        />
      )}
    </div>
  )
}

// ─── 里程碑编辑弹窗 ───
interface MilestoneEditModalProps {
  milestone: Milestone
  theme: ThemeColors
  onSave: (milestone: Milestone) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function MilestoneEditModal({ milestone, theme: c, onSave, onDelete, onClose }: MilestoneEditModalProps) {
  const [edit, setEdit] = useState<Milestone>({ ...milestone })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '16px', minWidth: '340px', maxWidth: '440px', width: '90%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 600, color: c.text }}>编辑里程碑</span>
          <span style={{ cursor: 'pointer', color: c.textFaint }} onClick={onClose}>✕</span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>标题</label>
          <input value={edit.title} onChange={e => setEdit(p => ({ ...p, title: e.target.value }))} style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>描述</label>
          <textarea value={edit.description} onChange={e => setEdit(p => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>进度 (%)</label>
            <input type="number" min="0" max="100" value={edit.progress} onChange={e => setEdit(p => ({ ...p, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))} style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>状态</label>
            <select value={edit.status} onChange={e => setEdit(p => ({ ...p, status: e.target.value as Milestone['status'] }))} style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none' }}>
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="paused">暂停</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>截止日期</label>
          <input type="date" value={edit.dueDate} onChange={e => setEdit(p => ({ ...p, dueDate: e.target.value }))} style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => onDelete(milestone.id)} style={{ padding: '5px 12px', border: `1px solid ${c.errorBorder}`, borderRadius: '3px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '11px' }}>删除</button>
          <button onClick={() => onSave(edit)} style={{ padding: '5px 12px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>保存</button>
        </div>
      </div>
    </div>
  )
}
