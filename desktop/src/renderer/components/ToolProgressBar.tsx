/**
 * ToolProgressBar — 工具执行实时进度条组件
 *
 * 显示工具执行状态：
 * - 等待中（pending）
 * - 执行中（running，带动画进度条）
 * - 成功（success，绿色完成）
 * - 失败（error，红色错误）
 *
 * 支持 HookProgressMessage 风格的阶段提示
 */

import React, { useEffect, useState } from 'react'

export type ProgressStatus = 'pending' | 'running' | 'success' | 'error'

export interface ToolProgressStep {
  label: string
  status: ProgressStatus
  detail?: string
}

interface ToolProgressBarProps {
  toolName: string
  status: ProgressStatus
  steps?: ToolProgressStep[]
  progress?: number  // 0-100，undefined 表示不确定进度
  duration?: number  // 已执行毫秒数
  onCancel?: () => void
}

export function ToolProgressBar({
  toolName,
  status,
  steps,
  progress,
  duration,
  onCancel,
}: ToolProgressBarProps): JSX.Element {
  const [animatedProgress, setAnimatedProgress] = useState(0)

  // 不确定进度时自动循环动画
  useEffect(() => {
    if (status !== 'running' || progress !== undefined) return
    let frame: number
    let p = 0
    const tick = () => {
      p = p >= 90 ? 0 : p + Math.random() * 8
      setAnimatedProgress(p)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [status, progress])

  // 确定进度时平滑过渡
  useEffect(() => {
    if (progress !== undefined) {
      setAnimatedProgress(progress)
    }
  }, [progress])

  const displayProgress = progress !== undefined ? progress : animatedProgress

  const statusConfig = {
    pending: { color: '#888', icon: '⏳', label: '等待中' },
    running: { color: '#4ECB71', icon: '⚙️', label: '执行中' },
    success: { color: '#4ECB71', icon: '✓', label: '完成' },
    error: { color: '#FF6B6B', icon: '✗', label: '失败' },
  }

  const config = statusConfig[status]

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  return (
    <div style={{
      background: '#0A0A0A',
      border: `1px solid ${status === 'error' ? '#5C2A2A' : '#262626'}`,
      borderRadius: '6px',
      padding: '8px 10px',
      margin: '4px 0',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* 头部：工具名 + 状态 + 耗时 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px' }}>{config.icon}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#F5F5F5', fontFamily: 'monospace' }}>
          {toolName}
        </span>
        <span style={{
          fontSize: '10px', color: config.color, fontWeight: 600,
          background: `${config.color}15`, padding: '1px 6px', borderRadius: '2px',
        }}>
          {config.label}
        </span>
        {duration !== undefined && status === 'running' && (
          <span style={{ fontSize: '10px', color: '#555' }}>
            {formatDuration(duration)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {status === 'running' && onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '1px 8px', border: '1px solid #333', borderRadius: '3px',
              background: '#0F0F0F', color: '#FF6B6B', cursor: 'pointer',
              fontSize: '10px', fontWeight: 600,
            }}
          >
            取消
          </button>
        )}
      </div>

      {/* 进度条 */}
      {status === 'running' && (
        <div style={{
          height: '3px', background: '#1A1A1A', borderRadius: '2px',
          overflow: 'hidden', marginBottom: steps && steps.length > 0 ? '6px' : '0',
        }}>
          <div style={{
            height: '100%', width: `${displayProgress}%`,
            background: 'linear-gradient(90deg, #4ECB71, #6EE787)',
            borderRadius: '2px', transition: 'width 0.3s ease',
            boxShadow: '0 0 6px rgba(78,203,113,0.4)',
          }} />
        </div>
      )}

      {/* 步骤列表 */}
      {steps && steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {steps.map((step, i) => {
            const stepConfig = statusConfig[step.status]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: stepConfig.color, width: '12px', textAlign: 'center' }}>
                  {step.status === 'running' ? '●' : step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '○'}
                </span>
                <span style={{ fontSize: '10px', color: step.status === 'pending' ? '#555' : '#ccc' }}>
                  {step.label}
                </span>
                {step.detail && (
                  <span style={{ fontSize: '9px', color: '#555', marginLeft: 'auto' }}>
                    {step.detail}
                  </span>
                )}
                {step.status === 'running' && (
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: '#4ECB71', animation: 'pulse 1s infinite',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 内联样式：脉冲动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  )
}
