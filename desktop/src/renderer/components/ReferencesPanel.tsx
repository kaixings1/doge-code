/**
 * ReferencesPanel — 跨文件引用查找可视化面板
 *
 * 展示当前光标位置符号的所有引用位置：
 * - 按文件分组显示引用列表
 * - 显示引用上下文（代码片段）
 * - 点击跳转到引用位置
 * - 统计：总引用数、涉及文件数
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import type { LspLocation } from '../hooks/useLsp'

interface ReferencesPanelProps {
  /** 当前文件路径 */
  filePath: string
  /** 光标行号（0-based） */
  cursorLine: number
  /** 光标列号（0-based） */
  cursorColumn: number
  /** 主题颜色 */
  theme: ThemeColors
  /** 关闭回调 */
  onClose: () => void
  /** 跳转到引用位置回调 */
  onGoToDefinition?: (filePath: string, line: number, column: number) => void
  /** LSP 引用查询函数 */
  referencesQuery: (filePath: string, line: number, character: number) => Promise<LspLocation[]>
}

interface ReferenceGroup {
  filePath: string
  fileName: string
  locations: LspLocation[]
}

export function ReferencesPanel({
  filePath,
  cursorLine,
  cursorColumn,
  theme,
  onClose,
  onGoToDefinition,
  referencesQuery,
}: ReferencesPanelProps): JSX.Element {
  const c = theme
  const [refs, setRefs] = useState<LspLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  // 查询引用
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setRefs([])

    referencesQuery(filePath, cursorLine, cursorColumn)
      .then(result => {
        if (!cancelled) {
          setRefs(result)
          // 默认展开第一个文件
          if (result.length > 0) {
            const firstFile = result[0].uri
            setExpandedFiles(new Set([firstFile]))
          }
        }
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '查询引用失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [filePath, cursorLine, cursorColumn, referencesQuery])

  // 按文件分组
  const groups: ReferenceGroup[] = React.useMemo(() => {
    const map = new Map<string, LspLocation[]>()
    for (const loc of refs) {
      const uri = loc.uri
      if (!map.has(uri)) map.set(uri, [])
      map.get(uri)!.push(loc)
    }
    // 按引用数量排序（多的在前）
    return Array.from(map.entries())
      .map(([uri, locations]) => ({
        filePath: uri,
        fileName: uri.split(/[/\\]/).pop() || uri,
        locations,
      }))
      .sort((a, b) => b.locations.length - a.locations.length)
  }, [refs])

  const handleGoTo = useCallback((loc: LspLocation) => {
    if (!onGoToDefinition) return
    const line = loc.range.start.line + 1
    const col = loc.range.start.character + 1
    onGoToDefinition(loc.uri, line, col)
  }, [onGoToDefinition])

  const toggleFile = useCallback((uri: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  }, [])

  // ─── 样式 ───

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '620px',
    maxHeight: '70vh',
    background: c.bgPanel,
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    color: c.text,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${c.border}`,
    background: c.bgAlt,
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '8px 0',
  }

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: '10px',
    background: color + '22',
    color,
    fontSize: '11px',
    fontWeight: 500,
  })

  const emptyStyle: React.CSSProperties = {
    color: c.textMuted,
    fontSize: '12px',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  }

  const fileHeaderStyle = (isExpanded: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    cursor: 'pointer',
    background: c.bgAlt,
    borderBottom: isExpanded ? `1px solid ${c.border}` : 'none',
    userSelect: 'none',
  })

  const locationRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px 4px 28px',
    cursor: 'pointer',
    transition: 'background 0.1s',
  }

  const symbolIndicatorStyle = (kind: number): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '2px',
    background: symbolColor(kind),
    flexShrink: 0,
  })

  // ─── 渲染 ───

  const totalRefs = refs.length
  const totalFiles = groups.length
  const currentFileName = filePath.split(/[/\\]/).pop() || filePath

  return (
    <div style={containerStyle}>
      {/* 头部 */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>🔗 跨文件引用</span>
          <span style={{ color: c.textMuted, fontSize: '11px' }}>{currentFileName}</span>
          <span style={{ color: c.textMuted, fontSize: '10px' }}>L{cursorLine + 1}:{cursorColumn + 1}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
      </div>

      {/* 统计栏 */}
      {!loading && !error && totalRefs > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '6px 12px', borderBottom: `1px solid ${c.border}`, background: c.bgAlt, flexWrap: 'wrap' }}>
          <span style={badgeStyle(c.accent)}>引用: {totalRefs}</span>
          <span style={badgeStyle('#4FC3F7')}>文件: {totalFiles}</span>
          {totalFiles > 1 && (
            <span style={badgeStyle('#81C784')}>跨文件引用</span>
          )}
        </div>
      )}

      {/* 引用列表 */}
      <div style={bodyStyle}>
        {loading && (
          <div style={emptyStyle}>正在查询引用...</div>
        )}

        {error && (
          <div style={{ ...emptyStyle, color: '#ef5350', fontStyle: 'normal' }}>
             {error}
          </div>
        )}

        {!loading && !error && refs.length === 0 && (
          <div style={emptyStyle}>
            未找到引用。<br />
            将光标移到符号名称上再查询。
          </div>
        )}

        {!loading && !error && groups.map(group => {
          const isExpanded = expandedFiles.has(group.filePath)
          const isCurrentFile = group.filePath === filePath

          return (
            <div key={group.filePath}>
              {/* 文件头 */}
              <div
                style={fileHeaderStyle(isExpanded)}
                onClick={() => toggleFile(group.filePath)}
              >
                <span style={{ fontSize: '10px', color: c.textMuted, width: '12px' }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: isCurrentFile ? c.accent : c.text,
                }}>
                  {group.fileName}
                </span>
                {isCurrentFile && (
                  <span style={{ fontSize: '10px', color: c.textFaint, background: c.accentDim, padding: '1px 5px', borderRadius: '3px' }}>
                    当前文件
                  </span>
                )}
                <span style={badgeStyle(c.textMuted)}>{group.locations.length}</span>
              </div>

              {/* 引用位置列表 */}
              {isExpanded && group.locations.map((loc, idx) => (
                <div
                  key={idx}
                  style={locationRowStyle}
                  onClick={() => handleGoTo(loc)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = c.accentDim }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={symbolIndicatorStyle(0)} />
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: c.text }}>
                    L{loc.range.start.line + 1}:{loc.range.start.character + 1}
                  </span>
                  <span style={{ color: c.textFaint, fontSize: '10px' }}>
                    col {loc.range.end.character + 1}
                  </span>
                  <span style={{ color: c.accent, fontSize: '10px', marginLeft: 'auto' }}>
                    跳转 →
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* 底部提示 */}
      <div style={{ padding: '6px 12px', borderTop: `1px solid ${c.border}`, background: c.bgAlt, fontSize: '10px', color: c.textFaint }}>
        点击引用位置跳转 | 基于 LSP textDocument/references | 按文件分组
      </div>
    </div>
  )
}

// ─── 工具函数 ───

function symbolColor(kind: number): string {
  const colors: Record<number, string> = {
    1: '#569CD6', // File
    2: '#4FC3F7', // Module
    3: '#4FC3F7', // Namespace
    4: '#569CD6', // Package
    5: '#81C784', // Class
    6: '#4FC3F7', // Method
    7: '#FFB74D', // Property
    8: '#FFB74D', // Field
    9: '#81C784', // Constructor
    10: '#CE9178', // Enum
    11: '#CE9178', // Interface
    12: '#CE9178', // Function
    13: '#CE9178', // Variable
    14: '#CE9178', // Constant
    15: '#CE9178', // String
    16: '#CE9178', // Number
    17: '#CE9178', // Boolean
    18: '#CE9178', // Array
    19: '#CE9178', // Object
    20: '#CE9178', // Key
    21: '#CE9178', // Null
    22: '#CE9178', // EnumMember
    23: '#CE9178', // Struct
    24: '#CE9178', // Event
    25: '#CE9178', // Operator
    26: '#CE9178', // TypeParameter
  }
  return colors[kind] || '#CE9178'
}
