/**
 * OutlinePanel — 符号大纲面板
 *
 * 功能：
 * - 当前文件符号树（函数/类/变量/接口/类型等）
 * - 符号点击跳转到定义
 * - 符号搜索过滤
 * - 符号类型图标区分
 * - 嵌套层级缩进显示
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThemeColors } from '../theme.js'



/** 符号类型 */
type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'module' | 'property' | 'import'

/** 文件符号 */
interface DocumentSymbol {
  id: string
  name: string
  kind: SymbolKind
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  children?: DocumentSymbol[]
  /** 可见性修饰符 */
  modifiers?: string[]
  /** 返回类型 / 变量类型 */
  detail?: string
}

interface OutlinePanelProps {
  /** 文件路径 */
  filePath: string
  /** 工作目录 */
  cwd: string
  /** 主题颜色 */
  theme: ThemeColors
  /** 符号点击跳转回调 */
  onSymbolClick: (filePath: string, line: number, column?: number) => void
  /** 是否默认展开 */
  defaultExpanded?: boolean
}

/** 符号类型图标映射 */
const SYMBOL_ICONS: Record<SymbolKind, string> = {
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
}

/** 符号类型颜色映射 */
const SYMBOL_COLORS: Record<SymbolKind, string> = {
  function: '#DCAD5A',
  method: '#DCAD5A',
  class: '#4ECB71',
  interface: '#4ECB71',
  type: '#4ECB71',
  variable: '#7B68EE',
  constant: '#FF6B6B',
  enum: '#FF6ACB',
  module: '#569CD6',
  property: '#9CDCFE',
  import: '#888888',
}

const SYMBOL_KIND_LABELS: Record<SymbolKind, string> = {
  function: '函数',
  method: '方法',
  class: '类',
  interface: '接口',
  type: '类型',
  variable: '变量',
  constant: '常量',
  enum: '枚举',
  module: '模块',
  property: '属性',
  import: '导入',
}

export function OutlinePanel({
  filePath,
  cwd,
  theme,
  onSymbolClick,
  defaultExpanded = false,
}: OutlinePanelProps): JSX.Element {
  const c = theme
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [filter, setFilter] = useState('')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 加载符号大纲
  const loadOutline = useCallback(async () => {
    if (!filePath) {
      setSymbols([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.dogeAPI?.getOutline?.({
        filePath,
        cwd,
      })

      if (result?.success && result.symbols) {
        setSymbols(result.symbols as any[])
      } else {
        setError(result?.error || '无法获取符号大纲')
        setSymbols([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取大纲失败')
      setSymbols([])
    } finally {
      setLoading(false)
    }
  }, [filePath, cwd])

  useEffect(() => {
    loadOutline()
  }, [loadOutline])

  // 过滤符号（递归）
  const filteredSymbols = useMemo(() => {
    if (!filter) return symbols
    const lowerFilter = filter.toLowerCase()

    const filterNodes = (nodes: DocumentSymbol[]): DocumentSymbol[] => {
      const result: DocumentSymbol[] = []
      for (const node of nodes) {
        const matches = node.name.toLowerCase().includes(lowerFilter) ||
          node.kind.toLowerCase().includes(lowerFilter) ||
          node.detail?.toLowerCase().includes(lowerFilter)

        const filteredChildren = node.children ? filterNodes(node.children) : []

        if (matches || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          })
        }
      }
      return result
    }

    return filterNodes(symbols)
  }, [symbols, filter])

  // 切换折叠状态
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // 递归渲染符号树
  const renderSymbol = useCallback((symbol: DocumentSymbol, depth: number = 0): React.ReactNode => {
    const hasChildren = symbol.children && symbol.children.length > 0
    const isCollapsed = collapsedIds.has(symbol.id)
    const isSelected = selectedId === symbol.id

    return (
      <div key={symbol.id}>
        <div
          onClick={() => {
            setSelectedId(symbol.id)
            onSymbolClick(filePath, symbol.range.startLine, symbol.range.startColumn)
          }}
          onDoubleClick={() => hasChildren && toggleCollapse(symbol.id)}
          style={{
            padding: '3px 8px',
            paddingLeft: `${8 + depth * 14}px`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            backgroundColor: isSelected ? c.selectionBg : 'transparent',
            userSelect: 'none',
          }}
          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = c.hoverBg }}
          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
        >
          {/* 折叠指示器 */}
          <span
            onClick={(e) => { e.stopPropagation(); hasChildren && toggleCollapse(symbol.id) }}
            style={{
              width: '10px',
              fontSize: '8px',
              color: c.textFaint,
              visibility: hasChildren ? 'visible' : 'hidden',
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              display: 'inline-block',
              transition: 'transform 0.15s',
            }}
          >
            ▼
          </span>
          {/* 符号图标 */}
          <span style={{ color: SYMBOL_COLORS[symbol.kind], fontSize: '10px', width: '14px', textAlign: 'center', fontFamily: 'serif', fontWeight: 600 }}>
            {SYMBOL_ICONS[symbol.kind]}
          </span>
          {/* 符号名称 */}
          <span style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {symbol.name}
          </span>
          {/* 修饰符 / 类型 */}
          {symbol.detail && (
            <span style={{ color: c.textFaint, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>
              {symbol.detail}
            </span>
          )}
          {/* 行号 */}
          <span style={{ color: c.textFaint, fontSize: '9px', flexShrink: 0 }}>
            L{symbol.range.startLine}
          </span>
        </div>
        {/* 子符号 */}
        {hasChildren && !isCollapsed && (
          <div>
            {symbol.children!.map(child => renderSymbol(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [collapsedIds, selectedId, c, filePath, onSymbolClick, toggleCollapse])

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${c.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: c.bgPanel,
  }

  // 统计符号数量
  const countSymbols = (nodes: DocumentSymbol[]): number => {
    let count = 0
    for (const node of nodes) {
      count++
      if (node.children) count += countSymbols(node.children)
    }
    return count
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 面板头部 */}
      <div style={headerStyle} onClick={() => setExpanded(p => !p)}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          符号大纲
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {symbols.length > 0 && (
            <span style={{ fontSize: '9px', color: c.textFaint }}>
              {countSymbols(symbols)} 个符号
            </span>
          )}
          <span style={{ fontSize: '10px', color: c.textFaint }}>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* 搜索过滤 */}
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.borderSubtle}` }}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="过滤符号..."
              style={{
                width: '100%',
                padding: '3px 8px',
                backgroundColor: c.inputBg,
                border: `1px solid ${c.border}`,
                borderRadius: '3px',
                color: c.text,
                fontSize: '10px',
                outline: 'none',
              }}
            />
          </div>

          {/* 快捷操作 */}
          <div style={{ padding: '4px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setCollapsedIds(new Set())}
              style={{
                padding: '2px 6px',
                border: `1px solid ${c.border}`,
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: c.textMuted,
                cursor: 'pointer',
                fontSize: '9px',
              }}
              title="全部展开"
            >展开</button>
            <button
              onClick={() => {
                const allIds = new Set<string>()
                const collectIds = (nodes: DocumentSymbol[]) => {
                  for (const node of nodes) {
                    if (node.children && node.children.length > 0) {
                      allIds.add(node.id)
                      collectIds(node.children)
                    }
                  }
                }
                collectIds(symbols)
                setCollapsedIds(allIds)
              }}
              style={{
                padding: '2px 6px',
                border: `1px solid ${c.border}`,
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: c.textMuted,
                cursor: 'pointer',
                fontSize: '9px',
              }}
              title="全部折叠"
            >折叠</button>
            <button
              onClick={loadOutline}
              style={{
                padding: '2px 6px',
                border: `1px solid ${c.border}`,
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: c.textMuted,
                cursor: 'pointer',
                fontSize: '9px',
              }}
              title="刷新"
            >↻</button>
          </div>

          {/* 错误信息 */}
          {error && (
            <div style={{ padding: '6px 12px', color: c.errorText, fontSize: '10px' }}>
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div style={{ padding: '12px', color: c.textMuted, fontSize: '11px', textAlign: 'center' }}>
              加载中...
            </div>
          )}

          {/* 符号树 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredSymbols.map(symbol => renderSymbol(symbol))}
          </div>

          {/* 空状态 */}
          {!loading && !error && filteredSymbols.length === 0 && (
            <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
              {filter ? '未找到匹配符号' : '无可用符号'}
            </div>
          )}

          {/* 图例 */}
          <div style={{
            padding: '6px 12px',
            borderTop: `1px solid ${c.borderSubtle}`,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px 8px',
          }}>
            {Object.entries(SYMBOL_KIND_LABELS).slice(0, 8).map(([kind, label]) => (
              <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: c.textFaint }}>
                <span style={{ color: SYMBOL_COLORS[kind as SymbolKind], width: '12px', textAlign: 'center' }}>
                  {SYMBOL_ICONS[kind as SymbolKind]}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default OutlinePanel
