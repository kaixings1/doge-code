/**
 * InlineSuggestion — 行内建议卡片组件
 *
 * 在消息流中展示静态分析建议，支持一键采纳。
 */

import React from 'react'

export interface Suggestion {
  id: string
  type: 'todo' | 'long-func' | 'duplicate' | 'complex' | 'unused' | 'deprecated'
  severity: 'info' | 'warning' | 'suggestion'
  message: string
  action?: string
  line?: number
}

interface InlineSuggestionProps {
  suggestions: Suggestion[]
  onDismiss: (id: string) => void
  onDismissAll: () => void
  theme: {
    accent: string
    text: string
    textFaint: string
    textMuted: string
    bgPanel: string
    border: string
    surface: string
    errorText: string
    successText: string
    warningText: string
  }
}

const severityConfig = {
  info: { icon: 'ℹ️', color: '#4FC3F7' },
  warning: { icon: '⚠️', color: '#FFB74D' },
  suggestion: { icon: '💡', color: '#81C784' },
}

const typeLabels: Record<string, string> = {
  todo: '待办标记',
  'long-func': '长函数',
  duplicate: '重复代码',
  complex: '复杂嵌套',
  deprecated: '废弃 API',
}

export function InlineSuggestion({ suggestions, onDismiss, onDismissAll, theme }: InlineSuggestionProps) {
  if (suggestions.length === 0) return null

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '8px 12px',
      margin: '8px 0',
      fontSize: '11px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, color: theme.accent }}>
          🔍 智能建议 ({suggestions.length})
        </span>
        <span
          style={{ cursor: 'pointer', color: theme.textFaint, fontSize: '10px' }}
          onClick={onDismissAll}
        >
          全部忽略
        </span>
      </div>
      {suggestions.map(s => {
        const config = severityConfig[s.severity] || severityConfig.info
        return (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              padding: '4px 0',
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ color: config.color, fontSize: '12px', flexShrink: 0 }}>{config.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: theme.text, lineHeight: '1.4' }}>
                {s.line && <span style={{ color: theme.textMuted, fontSize: '10px', marginRight: '4px' }}>L{s.line}</span>}
                {s.message}
              </div>
              {s.action && (
                <div style={{ color: theme.textMuted, fontSize: '10px', marginTop: '2px' }}>
                  💡 {s.action}
                </div>
              )}
            </div>
            <span
              style={{ cursor: 'pointer', color: theme.textFaint, fontSize: '10px', flexShrink: 0 }}
              onClick={() => onDismiss(s.id)}
            >
              ✕
            </span>
          </div>
        )
      })}
    </div>
  )
}
