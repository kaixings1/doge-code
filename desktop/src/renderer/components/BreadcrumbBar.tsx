/**
 * BreadcrumbBar — 面包屑导航组件
 *
 * 功能：
 * - 水平条显示当前光标所在符号层级路径
 * - 分隔符使用 ›
 * - 支持点击跳转、悬停效果、加载状态
 */

import React, { useCallback } from 'react'
import type { ThemeColors } from '../theme.js'
import { useBreadcrumb } from '../hooks/useBreadcrumb.js'

interface BreadcrumbBarProps {
  editor: any
  filePath: string
  theme: ThemeColors
  enabled?: boolean
  onSymbolClick?: (filePath: string, line: number, column?: number) => void
}

const KIND_ICONS: Record<string, string> = {
  function: '𝑓',
  method: '𝓂',
  class: '𝐂',
  interface: '𝐈',
  type: '𝑇',
  variable: '𝑣',
  constant: '𝐶',
  enum: '𝐸',
  module: '𝑀',
  property: '𝑝',
  import: '↳',
  symbol: '●',
  unknown: '●',
}

export function BreadcrumbBar({ editor, filePath, theme, enabled = true, onSymbolClick }: BreadcrumbBarProps): JSX.Element {
  const c = theme
  const { breadcrumbs, loading } = useBreadcrumb(editor, filePath, enabled)

  const handleClick = useCallback((item: { name: string; range: { startLine: number; startColumn: number } }) => {
    if (!editor) return
    editor.setPosition({ lineNumber: item.range.startLine, column: item.range.startColumn })
    editor.revealLineInCenter(item.range.startLine)
    editor.focus()
    onSymbolClick?.(filePath, item.range.startLine, item.range.startColumn)
  }, [editor, filePath, onSymbolClick])

  if (!enabled) {
    return <></>
  }

  return (
    <div
      style={{
        padding: '4px 10px',
        borderBottom: `1px solid ${c.border}`,
        background: c.bgPanel,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        minHeight: '28px',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {loading && <span style={{ fontSize: '10px', color: c.textFaint, marginRight: '6px' }}>加载中...</span>}
      {!loading && breadcrumbs.length === 0 && (
        <span style={{ fontSize: '10px', color: c.textFaint }}>符号路径</span>
      )}
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1
        return (
          <React.Fragment key={`${item.name}-${item.range.startLine}-${index}`}>
            {index > 0 && (
              <span style={{ color: c.textFaint, fontSize: '10px', margin: '0 2px' }}>›</span>
            )}
            <span
              onClick={() => handleClick(item)}
              title={`${item.kind}: ${item.name}`}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '1px 6px',
                borderRadius: '3px',
                background: isLast ? c.accentDim : 'transparent',
                color: isLast ? c.accent : c.text,
                fontSize: '10px',
              }}
              onMouseEnter={(e) => {
                if (!isLast) {
                  (e.currentTarget as HTMLElement).style.background = c.hoverBg
                }
              }}
              onMouseLeave={(e) => {
                if (!isLast) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: '9px', width: '12px', textAlign: 'center', fontFamily: 'serif', fontWeight: 600 }}>
                {KIND_ICONS[item.kind] || KIND_ICONS.symbol}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{item.name}</span>
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default BreadcrumbBar
