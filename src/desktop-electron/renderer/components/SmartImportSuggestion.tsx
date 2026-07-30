/**
 * SmartImportSuggestion — 智能导入建议卡片组件
 *
 * 在消息流中展示缺少的 import 语句建议，支持一键采纳（复制到剪贴板）。
 */

import React from 'react'
import type { ImportSuggestion } from '../hooks/useSmartImport.js'

interface SmartImportSuggestionProps {
  suggestions: ImportSuggestion[]
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

const confidenceConfig: Record<string, { icon: string; color: string; label: string }> = {
  high: { icon: '✅', color: '#81C784', label: '高' },
  medium: { icon: '🔵', color: '#4FC3F7', label: '中' },
  low: { icon: '⚪', color: '#B0BEC5', label: '低' },
}

export function SmartImportSuggestion({ suggestions, onDismiss, onDismissAll, theme }: SmartImportSuggestionProps) {
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
          📦 导入建议 ({suggestions.length})
        </span>
        <span
          style={{ cursor: 'pointer', color: theme.textFaint, fontSize: '10px' }}
          onClick={onDismissAll}
        >
          全部忽略
        </span>
      </div>
      {suggestions.map(s => {
        const config = confidenceConfig[s.confidence] || confidenceConfig.low
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
            <span style={{ color: config.color, fontSize: '12px', flexShrink: 0 }} title={`置信度: ${config.label}`}>
              {config.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: theme.text, lineHeight: '1.4', fontFamily: 'monospace', fontSize: '10px' }}>
                {s.importStatement}
              </div>
              <div style={{ color: theme.textMuted, fontSize: '10px', marginTop: '2px' }}>
                L{s.line} · 符号: {s.symbol} · 置信度: {config.label}
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(s.importStatement)
                } catch {
                  // clipboard 不可用时静默忽略
                }
              }}
              title="复制 import 语句"
              style={{
                background: 'none',
                border: `1px solid ${theme.border}`,
                borderRadius: '3px',
                color: theme.accent,
                cursor: 'pointer',
                fontSize: '10px',
                padding: '1px 4px',
                flexShrink: 0,
              }}
            >
              复制
            </button>
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
