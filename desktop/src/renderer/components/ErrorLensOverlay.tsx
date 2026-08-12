/**
 * ErrorLensOverlay — 错误透镜底部面板
 *
 * 以表格展示当前文件的 LSP 诊断：
 * 文件路径 | 行号 | 级别 | 消息
 * 点击可跳转到 MonacoEditorPanel 对应行。
 */

import React from 'react'
import type { ThemeColors } from '../theme.js'
import type { DiagnosticItem, DiagnosticLevel } from '../hooks/useErrorLens.js'

const LEVEL_LABEL: Record<DiagnosticLevel, string> = {
  error: ' Error',
  warning: '🟡 Warning',
  info: 'ℹ Info',
}

const LEVEL_COLOR: Record<DiagnosticLevel, string> = {
  error: '#FF6B6B',
  warning: '#FFB74D',
  info: '#64B5F6',
}

export function ErrorLensOverlay({
  items,
  theme,
  onNavigate,
}: {
  items: DiagnosticItem[]
  theme: ThemeColors
  onNavigate?: (filePath: string, line: number, column: number) => void
}): JSX.Element {
  const c = theme

  const handleRowClick = (item: DiagnosticItem) => {
    onNavigate?.(item.filePath, item.line, item.column)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: c.bgPanel,
        color: c.text,
        fontSize: '11px',
      }}
    >
      <div
        style={{
          padding: '6px 8px',
          borderBottom: `1px solid ${c.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: c.bgAlt,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '11px' }}> Error Lens</span>
        <span style={{ color: c.textFaint, fontSize: '10px' }}>
          {items.length} 项诊断
        </span>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.textFaint,
            fontSize: '11px',
          }}
        >
          暂无诊断信息
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '10px',
              tableLayout: 'fixed',
            }}
          >
            <thead>
              <tr style={{ background: c.bgAlt }}>
                <th style={{ width: '38%', padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>文件路径</th>
                <th style={{ width: '8%', padding: '4px 4px', textAlign: 'center', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>行号</th>
                <th style={{ width: '18%', padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>级别</th>
                <th style={{ width: '36%', padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>消息</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => handleRowClick(item)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: `1px solid ${c.borderSubtle || c.border}`,
                    background: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    const row = e.currentTarget as HTMLTableRowElement
                    row.style.background = `${c.accent}11`
                  }}
                  onMouseLeave={(e) => {
                    const row = e.currentTarget as HTMLTableRowElement
                    row.style.background = 'transparent'
                  }}
                >
                  <td
                    style={{
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: 'monospace',
                      color: c.textMuted,
                    }}
                    title={item.filePath}
                  >
                    {item.filePath}
                  </td>
                  <td style={{ padding: '3px 4px', textAlign: 'center', color: c.textFaint, fontFamily: 'monospace' }}>
                    {item.line}:{item.column}
                  </td>
                  <td style={{ padding: '3px 8px' }}>
                    <span style={{ color: LEVEL_COLOR[item.level], fontSize: '10px', fontWeight: 600 }}>
                      {LEVEL_LABEL[item.level]}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: c.text,
                    }}
                    title={item.message}
                  >
                    {item.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
