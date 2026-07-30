/**
 * ToolErrorBanner — 工具错误分类展示组件
 *
 * 根据错误内容自动分类（权限/网络/文件/输入/执行），
 * 显示对应颜色标签和图标，支持展开查看详情。
 */

import React, { useState } from 'react'

export interface ToolErrorCategory {
  label: string
  color: string
  icon: string
  suggestion?: string
}

function classifyError(err: string): ToolErrorCategory {
  const lower = err.toLowerCase()
  if (/permission|denied|not allowed|unauthorized|forbidden|eacces/.test(lower)) {
    return { label: '权限错误', color: '#FF6B6B', icon: '🔒', suggestion: '请检查工具权限设置，或手动确认后重试' }
  }
  if (/network|timeout|connection|econnrefused|econnreset|enotfound|etimedout|socket|dns/.test(lower)) {
    return { label: '网络错误', color: '#FFA726', icon: '🌐', suggestion: '请检查网络连接，或稍后重试' }
  }
  if (/enoent|no such file|not found|file not exist|path not found/.test(lower)) {
    return { label: '文件错误', color: '#EF5350', icon: '📁', suggestion: '请确认文件路径是否正确' }
  }
  if (/syntax|parse|invalid|typeerror|referenceerror|unexpected|malformed/.test(lower)) {
    return { label: '输入错误', color: '#AB47BC', icon: '⚠️', suggestion: '请检查输入参数格式是否正确' }
  }
  if (/rate.?limit|throttl|429|too many requests/.test(lower)) {
    return { label: '限流错误', color: '#FFA726', icon: '⏱️', suggestion: '请求过于频繁，请稍后重试' }
  }
  if (/memory|heap|out of memory|cannot allocate/.test(lower)) {
    return { label: '内存错误', color: '#EF5350', icon: '💾', suggestion: '内存不足，请关闭部分标签页后重试' }
  }
  return { label: '执行错误', color: '#FF6B6B', icon: '❌', suggestion: '工具执行过程中发生未知错误' }
}

interface ToolErrorBannerProps {
  error: string
  toolName?: string
  onRetry?: () => void
  onDismiss?: () => void
}

export function ToolErrorBanner({ error, toolName, onRetry, onDismiss }: ToolErrorBannerProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const category = classifyError(error)

  return (
    <div style={{
      background: 'rgba(255,107,107,0.06)',
      border: `1px solid ${category.color}33`,
      borderRadius: '6px',
      margin: '4px 0',
      overflow: 'hidden',
    }}>
      {/* 头部：图标 + 分类标签 + 工具名 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 10px', cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: '14px' }}>{category.icon}</span>
        <span style={{
          fontSize: '11px', fontWeight: 600, color: category.color,
          background: `${category.color}15`, padding: '1px 8px',
          borderRadius: '3px', flexShrink: 0,
        }}>
          {category.label}
        </span>
        {toolName && (
          <span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>
            {toolName}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '10px', color: '#555' }}>
          {expanded ? '收起 ▲' : '展开 ▼'}
        </span>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div style={{ padding: '0 10px 8px' }}>
          {/* 建议 */}
          {category.suggestion && (
            <div style={{
              fontSize: '11px', color: '#888', marginBottom: '6px',
              padding: '4px 8px', background: '#0F0F0F',
              borderRadius: '3px', borderLeft: `2px solid ${category.color}`,
            }}>
              💡 {category.suggestion}
            </div>
          )}
          {/* 错误详情 */}
          <pre style={{
            margin: 0, padding: '6px 8px', background: '#0A0A0A',
            border: '1px solid #262626', borderRadius: '3px',
            fontSize: '11px', color: '#ccc', fontFamily: 'Consolas, monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5,
            maxHeight: '120px', overflowY: 'auto',
          }}>
            {error}
          </pre>
          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {onRetry && (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry() }}
                style={{
                  padding: '3px 10px', border: '1px solid #333', borderRadius: '3px',
                  background: '#0F0F0F', color: '#4ECB71', cursor: 'pointer',
                  fontSize: '10px', fontWeight: 600,
                }}
              >
                🔄 重试
              </button>
            )}
            {onDismiss && (
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss() }}
                style={{
                  padding: '3px 10px', border: '1px solid #333', borderRadius: '3px',
                  background: '#0F0F0F', color: '#888', cursor: 'pointer',
                  fontSize: '10px',
                }}
              >
                忽略
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
