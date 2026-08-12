/**
 * BatchProcessor — 批量处理组件
 *
 * 对多个文件执行同一个 AI 工作流：
 * - 文件列表输入（每行一个文件路径）
 * - 工作流选择
 * - 批量执行 + 进度条
 * - 结果列表（状态/输出/错误）
 * - 取消批量任务
 */

import React, { useState, useCallback } from 'react'
import type { ThemeColors } from '../theme.js'
import type { WorkflowDefinition, BatchJob, BatchFileItem } from '../hooks/workflowAutomation.types'

interface BatchProcessorProps {
  /** 所有工作流（用于下拉选择） */
  workflows: WorkflowDefinition[]
  /** 当前运行的批量任务 */
  batchJobs: BatchJob[]
  /** 批量任务历史 */
  batchHistory: BatchJob[]
  /** 执行批量任务 */
  onExecute: (workflowId: string, files: Array<{ filePath: string; fileName?: string }>) => Promise<BatchJob>
  /** 取消批量任务 */
  onCancel: (batchId: string) => void
  /** 主题颜色 */
  theme: ThemeColors
  /** 默认文件路径（可选） */
  defaultFilePath?: string
}

const FILE_STATUS_CONFIG: Record<BatchFileItem['status'], { icon: string; color: string; label: string }> = {
  pending: { icon: '', color: '#B0BEC5', label: '等待中' },
  running: { icon: '⏱', color: '#FFB74D', label: '执行中' },
  completed: { icon: '', color: '#81C784', label: '已完成' },
  failed: { icon: '', color: '#FF6B6B', label: '失败' },
  skipped: { icon: '⏭', color: '#B0BEC5', label: '已跳过' },
}

export function BatchProcessor({
  workflows,
  batchJobs,
  batchHistory,
  onExecute,
  onCancel,
  theme,
  defaultFilePath,
}: BatchProcessorProps): JSX.Element {
  const c = theme
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [fileInput, setFileInput] = useState(defaultFilePath || '')
  const [isRunning, setIsRunning] = useState(false)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)

  const customWorkflows = workflows.filter(w => !w.isTemplate)

  const handleExecute = useCallback(async () => {
    if (!selectedWorkflowId) return
    const files = fileInput
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0)
    if (files.length === 0) return

    setIsRunning(true)
    try {
      const result = await onExecute(selectedWorkflowId, files.map(f => ({ filePath: f })))
      setActiveBatchId(result.id)
    } finally {
      setIsRunning(false)
    }
  }, [selectedWorkflowId, fileInput, onExecute])

  const handleCancel = useCallback((batchId: string) => {
    onCancel(batchId)
    setActiveBatchId(prev => prev === batchId ? null : prev)
  }, [onCancel])

  // 计算总进度
  const allActiveBatches = [...batchJobs]
  const totalFiles = allActiveBatches.reduce((sum, b) => sum + b.files.length, 0)
  const completedFiles = allActiveBatches.reduce((sum, b) => sum + b.completedCount, 0)
  const failedFiles = allActiveBatches.reduce((sum, b) => sum + b.failedCount, 0)
  const progressPercent = totalFiles > 0 ? Math.round(((completedFiles + failedFiles) / totalFiles) * 100) : 0

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  }

  const cardStyle: React.CSSProperties = {
    padding: '10px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgPanel,
    color: c.text,
    fontSize: '12px',
    fontFamily: 'monospace',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '6px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
    color: c.text,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#000',
    border: 'none',
    fontWeight: 600,
  }

  const progressBarStyle: React.CSSProperties = {
    height: '6px',
    background: c.bgPanel,
    borderRadius: '3px',
    overflow: 'hidden',
    border: `1px solid ${c.border}`,
  }

  const progressFillStyle: React.CSSProperties = {
    height: '100%',
    width: `${progressPercent}%`,
    background: progressPercent >= 100 ? '#81C784' : c.accent,
    transition: 'width 0.3s ease',
  }

  const fileItemStyle = (status: BatchFileItem['status']): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    borderRadius: '3px',
    background: status === 'failed' ? '#ef535022' : status === 'completed' ? '#81C78422' : 'transparent',
    fontSize: '11px',
  })

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    borderRadius: '10px',
    background: color + '22',
    color,
    fontSize: '10px',
    fontWeight: 500,
  })

  return (
    <div style={containerStyle}>
      {/* 配置区 */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>📦 批量处理</div>

        {/* 工作流选择 */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>选择工作流</div>
          <select
            value={selectedWorkflowId}
            onChange={e => setSelectedWorkflowId(e.target.value)}
            style={{ ...inputStyle, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            disabled={isRunning}
          >
            <option value="">-- 请选择工作流 --</option>
            {customWorkflows.map(wf => (
              <option key={wf.id} value={wf.id}>{wf.icon || ''} {wf.name} ({wf.steps.length} 步)</option>
            ))}
          </select>
          {customWorkflows.length === 0 && (
            <div style={{ fontSize: '10px', color: c.textFaint, marginTop: '3px' }}>
              暂无自定义工作流，请先在"工作流"标签页创建
            </div>
          )}
        </div>

        {/* 文件列表输入 */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>
            文件列表（每行一个路径）
          </div>
          <textarea
            value={fileInput}
            onChange={e => setFileInput(e.target.value)}
            placeholder={`${defaultFilePath || '输入文件路径，每行一个'}\n/src/utils/helper.ts\n/src/components/Header.tsx\n/src/api/client.ts`}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
            disabled={isRunning}
          />
        </div>

        {/* 执行按钮 */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleExecute}
            disabled={!selectedWorkflowId || isRunning || !fileInput.trim()}
            style={{ ...primaryButtonStyle, flex: 1, opacity: (!selectedWorkflowId || isRunning || !fileInput.trim()) ? 0.5 : 1 }}
          >
            {isRunning ? '⏱ 执行中...' : '▶ 批量执行'}
          </button>
          {allActiveBatches.length > 0 && (
            <button
              onClick={() => allActiveBatches.forEach(b => handleCancel(b.id))}
              style={{ ...buttonStyle, color: '#ef5350' }}
            >
              ⏹ 全部取消
            </button>
          )}
        </div>

        {/* 进度条 */}
        {totalFiles > 0 && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>
              <span>总进度: {completedFiles + failedFiles}/{totalFiles} 文件</span>
              <span>{progressPercent}%</span>
            </div>
            <div style={progressBarStyle}>
              <div style={progressFillStyle} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '10px' }}>
              <span style={{ color: '#81C784' }}> {completedFiles} 完成</span>
              <span style={{ color: '#FF6B6B' }}> {failedFiles} 失败</span>
              <span style={{ color: c.textMuted }}> {totalFiles - completedFiles - failedFiles} 待处理</span>
            </div>
          </div>
        )}
      </div>

      {/* 活跃的批量任务 */}
      {allActiveBatches.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>
            🔄 执行中 ({allActiveBatches.length})
          </div>
          {allActiveBatches.map(batch => {
            const wf = workflows.find(w => w.id === batch.workflowId)
            return (
              <div key={batch.id} style={{ marginBottom: '8px', padding: '6px 8px', border: `1px solid ${c.border}`, borderRadius: '4px', background: c.bgPanel }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '12px' }}>
                    {wf?.icon || ''} {batch.name}
                  </span>
                  <button
                    onClick={() => handleCancel(batch.id)}
                    style={{ ...buttonStyle, padding: '2px 8px', fontSize: '10px', color: '#ef5350' }}
                  >
                    取消
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>
                  {batch.completedCount + batch.failedCount}/{batch.files.length} 已完成
                </div>
                {/* 当前正在执行的文件 */}
                {batch.files.filter(f => f.status === 'running').map(item => (
                  <div key={item.id} style={{ ...fileItemStyle('running'), marginBottom: '2px' }}>
                    <span>⏱</span>
                    <span style={{ fontFamily: 'monospace', flex: 1 }}>{item.fileName || item.filePath}</span>
                    <span style={{ color: '#FFB74D', fontSize: '10px' }}>执行中...</span>
                  </div>
                ))}
                {/* 已完成 */}
                {batch.files.filter(f => f.status === 'completed').slice(0, 5).map(item => (
                  <div key={item.id} style={fileItemStyle('completed')}>
                    <span></span>
                    <span style={{ fontFamily: 'monospace', flex: 1 }}>{item.fileName || item.filePath}</span>
                  </div>
                ))}
                {/* 失败 */}
                {batch.files.filter(f => f.status === 'failed').slice(0, 5).map(item => (
                  <div key={item.id} style={fileItemStyle('failed')}>
                    <span></span>
                    <span style={{ fontFamily: 'monospace', flex: 1 }}>{item.fileName || item.filePath}</span>
                    <span style={{ color: '#FF6B6B', fontSize: '10px' }}>{item.error}</span>
                  </div>
                ))}
                {batch.files.length > 10 && (
                  <div style={{ fontSize: '10px', color: c.textFaint, marginTop: '4px' }}>
                    显示前 10 个结果，共 {batch.files.length} 个文件
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 历史记录 */}
      {batchHistory.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>
            📋 历史记录 ({batchHistory.length})
          </div>
          {batchHistory.slice(0, 10).map(batch => {
            const wf = workflows.find(w => w.id === batch.workflowId)
            const statusColor = batch.status === 'completed' ? '#81C784' : batch.status === 'cancelled' ? '#B0BEC5' : '#FF6B6B'
            return (
              <div key={batch.id} style={{ marginBottom: '6px', padding: '6px 8px', border: `1px solid ${c.border}`, borderRadius: '4px', background: c.bgPanel }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '12px' }}>
                    {wf?.icon || ''} {batch.name}
                  </span>
                  <span style={{ ...badgeStyle(statusColor), marginLeft: 'auto' }}>
                    {batch.status}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: c.textMuted }}>
                  {new Date(batch.startedAt).toLocaleString()}
                  {' — '}
                   {batch.completedCount} /  {batch.failedCount} / 📄 {batch.files.length} 文件
                </div>
              </div>
            )
          })}
        </div>
      )}

      {allActiveBatches.length === 0 && batchHistory.length === 0 && (
        <div style={{ color: c.textMuted, fontSize: '11px', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>
          选择工作流并输入文件路径，开始批量处理
        </div>
      )}
    </div>
  )
}
