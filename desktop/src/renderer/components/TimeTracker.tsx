/**
 * TimeTracker — 时间追踪组件
 *
 * 功能：
 * - 当前任务计时器（开始/暂停/停止）
 * - 手动时间输入
 * - 项目/任务选择器
 * - 时间条目列表（日期、任务、时长、项目）
 * - 日/周/月时间汇总
 * - 项目时间预算设置
 * - 预算进度条（已用/剩余）
 * - 时间报告导出（CSV）
 */

import React, { useCallback, useContext, useState } from 'react'
import { ThemeContext } from '../App.js'
import { useTimeTracker, type TimeEntry } from '../hooks/useTimeTracker.js'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function TimeTracker() {
  const themeCtx = useContext(ThemeContext)
  const c = themeCtx.colors

  const {
    entries,
    isRunning,
    currentTaskId,
    currentProject,
    elapsedSeconds,
    todayTotal,
    weekTotal,
    monthTotal,
    budgets,
    startTimer,
    pauseTimer,
    stopTimer,
    addManualEntry,
    deleteEntry,
    setBudget,
    getProjectTime,
    exportCSV,
  } = useTimeTracker()

  const [taskInput, setTaskInput] = useState('')
  const [projectInput, setProjectInput] = useState('default')
  const [manualDuration, setManualDuration] = useState('30')
  const [manualTask, setManualTask] = useState('')
  const [manualProject, setManualProject] = useState('default')
  const [budgetProject, setBudgetProject] = useState('default')
  const [budgetMinutes, setBudgetMinutes] = useState('480')
  const [showManualForm, setShowManualForm] = useState(false)
  const [viewMode, setViewMode] = useState<'entries' | 'summary' | 'budget'>('entries')

  const handleStart = () => {
    if (!taskInput.trim()) return
    startTimer(taskInput.trim(), projectInput.trim() || 'default')
  }

  const handleAddManual = () => {
    if (!manualTask.trim()) return
    const minutes = parseInt(manualDuration, 10) || 0
    if (minutes <= 0) return
    addManualEntry(manualTask.trim(), manualProject.trim() || 'default', minutes * 60)
    setManualTask('')
    setShowManualForm(false)
  }

  const handleSetBudget = () => {
    const minutes = parseInt(budgetMinutes, 10) || 0
    if (minutes <= 0) return
    setBudget(budgetProject.trim() || 'default', minutes)
  }

  const handleExport = () => {
    const csv = exportCSV()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `time-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const recentEntries = [...entries].sort((a, b) => b.startTime - a.startTime).slice(0, 50)
  const projects = [...new Set(entries.map(e => e.project))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: '12px' }}>
      {/* 标题栏 */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: c.text }}>⏱️ 时间追踪</span>
        <span style={{ color: c.textFaint, fontSize: '11px' }}>
          {isRunning ? `进行中: ${formatDuration(elapsedSeconds)}` : '就绪'}
        </span>
      </div>

      {/* 计时器区域 */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}` }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <input
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            placeholder="输入任务名称..."
            style={{ flex: 1, padding: '4px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter' && !isRunning) handleStart() }}
          />
          <input
            value={projectInput}
            onChange={e => setProjectInput(e.target.value)}
            placeholder="项目"
            style={{ width: '80px', padding: '4px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {isRunning ? (
            <>
              <div style={{ fontSize: '18px', fontWeight: 600, color: c.accent, fontFamily: 'monospace', minWidth: '80px' }}>
                {formatDuration(elapsedSeconds)}
              </div>
              <button onClick={pauseTimer} style={{ padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.text, cursor: 'pointer', fontSize: '11px' }}>暂停</button>
              <button onClick={stopTimer} style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>停止</button>
            </>
          ) : (
            <button onClick={handleStart} disabled={!taskInput.trim()} style={{ padding: '4px 12px', border: 'none', borderRadius: '3px', background: taskInput.trim() ? c.accent : c.bgPanel, color: taskInput.trim() ? '#000' : c.textFaint, cursor: taskInput.trim() ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 600 }}>
              开始计时
            </button>
          )}
        </div>
      </div>

      {/* 汇总统计 */}
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '12px' }}>
        <div>
          <span style={{ color: c.textFaint, fontSize: '10px' }}>今日 </span>
          <span style={{ color: c.text, fontWeight: 600, fontSize: '11px' }}>{formatDuration(todayTotal + (isRunning ? elapsedSeconds : 0))}</span>
        </div>
        <div>
          <span style={{ color: c.textFaint, fontSize: '10px' }}>本周 </span>
          <span style={{ color: c.text, fontWeight: 600, fontSize: '11px' }}>{formatDuration(weekTotal + (isRunning ? elapsedSeconds : 0))}</span>
        </div>
        <div>
          <span style={{ color: c.textFaint, fontSize: '10px' }}>本月 </span>
          <span style={{ color: c.text, fontWeight: 600, fontSize: '11px' }}>{formatDuration(monthTotal + (isRunning ? elapsedSeconds : 0))}</span>
        </div>
      </div>

      {/* 标签切换 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${c.borderSubtle}` }}>
        {[
          { id: 'entries' as const, label: '记录' },
          { id: 'summary' as const, label: '汇总' },
          { id: 'budget' as const, label: '预算' },
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
        <button onClick={() => setShowManualForm(!showManualForm)} style={{ padding: '5px 10px', border: 'none', background: 'transparent', color: c.accent, cursor: 'pointer', fontSize: '11px' }}>+ 手动</button>
        <button onClick={handleExport} style={{ padding: '5px 10px', border: 'none', background: 'transparent', color: c.textFaint, cursor: 'pointer', fontSize: '11px' }}>导出</button>
      </div>

      {/* 手动输入表单 */}
      {showManualForm && (
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <input value={manualTask} onChange={e => setManualTask(e.target.value)} placeholder="任务" style={{ flex: 1, minWidth: '100px', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
          <input value={manualProject} onChange={e => setManualProject(e.target.value)} placeholder="项目" style={{ width: '70px', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
          <input value={manualDuration} onChange={e => setManualDuration(e.target.value)} placeholder="分钟" style={{ width: '50px', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
          <span style={{ color: c.textFaint, fontSize: '10px', alignSelf: 'center' }}>分钟</span>
          <button onClick={handleAddManual} disabled={!manualTask.trim()} style={{ padding: '3px 8px', border: 'none', borderRadius: '3px', background: manualTask.trim() ? c.accent : c.bgPanel, color: manualTask.trim() ? '#000' : c.textFaint, cursor: manualTask.trim() ? 'pointer' : 'not-allowed', fontSize: '11px' }}>添加</button>
        </div>
      )}

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {viewMode === 'entries' && (
          <div>
            {recentEntries.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>暂无时间记录</div>
            ) : (
              recentEntries.map(entry => (
                <TimeEntryRow key={entry.id} entry={entry} theme={c} onDelete={deleteEntry} />
              ))
            )}
          </div>
        )}

        {viewMode === 'summary' && (
          <div style={{ padding: '8px 12px' }}>
            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', color: c.textFaint, padding: '16px' }}>暂无数据</div>
            ) : (
              projects.map(project => {
                const projectTime = getProjectTime(project, 30)
                return (
                  <div key={project} style={{ marginBottom: '8px', padding: '6px 8px', background: c.bgAlt, borderRadius: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ color: c.text, fontWeight: 500 }}>{project}</span>
                      <span style={{ color: c.textMuted }}>{formatDuration(projectTime)}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: c.textFaint }}>
                      {entries.filter(e => e.project === project).length} 条记录 · 最近 30 天
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {viewMode === 'budget' && (
          <div style={{ padding: '8px 12px' }}>
            {/* 设置预算 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              <input value={budgetProject} onChange={e => setBudgetProject(e.target.value)} placeholder="项目" style={{ flex: 1, padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
              <input value={budgetMinutes} onChange={e => setBudgetMinutes(e.target.value)} placeholder="分钟" style={{ width: '60px', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
              <button onClick={handleSetBudget} style={{ padding: '3px 8px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>设置</button>
            </div>

            {/* 预算列表 */}
            {budgets.length === 0 ? (
              <div style={{ textAlign: 'center', color: c.textFaint, padding: '16px' }}>暂无预算设置</div>
            ) : (
              budgets.map(budget => {
                const used = getProjectTime(budget.project, 30)
                const usedMinutes = Math.floor(used / 60)
                const percent = Math.min(100, (usedMinutes / budget.budgetMinutes) * 100)
                const isOverBudget = usedMinutes > budget.budgetMinutes
                return (
                  <div key={budget.project} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ color: c.text, fontWeight: 500 }}>{budget.project}</span>
                      <span style={{ color: isOverBudget ? c.errorText : c.textMuted, fontSize: '11px' }}>
                        {usedMinutes} / {budget.budgetMinutes} 分钟
                      </span>
                    </div>
                    <div style={{ height: '6px', background: c.bgPanel, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: isOverBudget ? c.errorText : percent > 80 ? '#FFB347' : c.accent,
                        borderRadius: '3px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 时间条目行 ───
interface TimeEntryRowProps {
  entry: TimeEntry
  theme: import('../theme.js').ThemeColors
  onDelete: (id: string) => void
}

function TimeEntryRow({ entry, theme: c, onDelete }: TimeEntryRowProps) {
  const date = new Date(entry.startTime)
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  return (
    <div style={{ padding: '5px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.borderSubtle}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.task}
          <span style={{ color: c.textFaint, fontSize: '10px', marginLeft: '6px' }}>{entry.project}</span>
        </div>
        <div style={{ color: c.textFaint, fontSize: '10px' }}>
          {entry.date} {timeStr} {entry.isManual ? '(手动)' : '(自动)'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: c.accent, fontWeight: 600, fontFamily: 'monospace', fontSize: '11px' }}>
          {formatDuration(entry.duration)}
        </span>
        <span
          onClick={() => onDelete(entry.id)}
          style={{ cursor: 'pointer', color: c.textFaint, fontSize: '10px' }}
          title="删除"
        >✕</span>
      </div>
    </div>
  )
}
