/**
 * FindReplacePanel — 查找/替换增强面板
 *
 * 说明：
 * - 首选使用 Monaco 的 findMatches API 进行搜索/高亮；
 * - 若未传入 editor/monaco，则回退到 FindReplaceEngine 纯文本匹配。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { find, type FindMatch } from '../utils/FindReplaceEngine.js'

export interface FindReplacePanelProps {
  theme: ThemeColors
  onClose: () => void
  /** 可选：当前编辑器实例，用于 Monaco 原生搜索 */
  editor?: any
  /** 可选：Monaco 实例 */
  monaco?: any
  /** 可选：当前文本，fallback 搜索用 */
  text?: string
  /** 替换后文本变更回调 */
  onReplace?: (nextText: string) => void
}

type Mode = 'find' | 'replace'

export function FindReplacePanel({ theme, onClose, editor, monaco, text = '', onReplace }: FindReplacePanelProps): JSX.Element {
  const c = theme
  const [mode, setMode] = useState<Mode>('find')
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [replaceSuccess, setReplaceSuccess] = useState<string | null>(null)

  const options = useMemo(() => ({ caseSensitive, regex, wholeWord }), [caseSensitive, regex, wholeWord])

  const monacoMatches = useMemo(() => {
    if (!editor || !monaco || !query) return [] as FindMatch[]
    try {
      const model = editor.getModel()
      if (!model) return [] as FindMatch[]
      const raw = monaco.editor.findMatches(model.getValue(), query, false, options.caseSensitive, options.regex, false, options.wholeWord)
      return (raw || []).map((m: any) => ({
        start: m.range.startColumn,
        end: m.range.endColumn,
        line: m.range.startLineNumber,
        column: m.range.startColumn,
        text: model.getValueInRange(m.range),
      }))
    } catch {
      return [] as FindMatch[]
    }
  }, [editor, monaco, query, options, text])

  const matches: FindMatch[] = monacoMatches.length > 0 ? monacoMatches : find(text, query, options)

  const count = matches.length

  useEffect(() => {
    setCurrentIndex(0)
  }, [query, options])

  const goToMatch = useCallback((index: number) => {
    if (count === 0) return
    const safeIndex = ((index % count) + count) % count
    setCurrentIndex(safeIndex)
    const m = matches[safeIndex]
    if (!m) return
    if (editor) {
      try {
        editor.setPosition({ lineNumber: m.line, column: m.column })
        editor.revealRangeInCenterIfOutside(new (monaco as any).Range(m.line, m.column, m.line, m.column))
        editor.focus()
      } catch { /* ignore */ }
    }
  }, [count, matches, editor, monaco])

  const handleNext = useCallback(() => {
    goToMatch(currentIndex + 1)
  }, [currentIndex, goToMatch])

  const handlePrev = useCallback(() => {
    goToMatch(currentIndex - 1)
  }, [currentIndex, goToMatch])

  const handleReplaceCurrent = useCallback(() => {
    if (!onReplace || count === 0) return
    const current = matches[currentIndex]
    if (!current) return
    const before = text.substring(0, current.start)
    const after = text.substring(current.end)
    const nextText = before + replacement + after
    onReplace(nextText)
    setReplaceSuccess('已替换 1 处')
    setTimeout(() => setReplaceSuccess(null), 1500)
  }, [count, currentIndex, matches, onReplace, replacement, text])

  const handleReplaceAll = useCallback(() => {
    if (!onReplace || !query) return
    let nextText = text
    let replaced = 0
    const sorted = [...matches].sort((a, b) => b.start - a.start)
    for (const m of sorted) {
      nextText = nextText.substring(0, m.start) + replacement + nextText.substring(m.end)
      replaced++
    }
    onReplace(nextText)
    setReplaceSuccess(`已替换 ${replaced} 处`)
    setTimeout(() => setReplaceSuccess(null), 1500)
  }, [matches, onReplace, query, replacement, text])

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '4px 8px',
    background: c.inputBg,
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    color: c.text,
    fontSize: '11px',
    outline: 'none',
  }

  const toggleBtn = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        border: `1px solid ${active ? c.accent : c.border}`,
        borderRadius: '3px',
        background: active ? `${c.accent}22` : 'transparent',
        color: active ? c.accent : c.textMuted,
        cursor: 'pointer',
        fontSize: '10px',
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        position: 'fixed',
        top: '52px',
        right: '20px',
        width: '520px',
        maxWidth: 'calc(100% - 40px)',
        background: c.bgPanel,
        border: `1px solid ${c.border}`,
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '12px',
        color: c.text,
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${c.border}`,
          background: c.bgAlt,
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            onClick={() => setMode('find')}
            style={{
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              color: mode === 'find' ? c.accent : c.textMuted,
              borderBottom: mode === 'find' ? `2px solid ${c.accent}` : '2px solid transparent',
              paddingBottom: '2px',
            }}
          >
            查找
          </span>
          <span
            onClick={() => setMode('replace')}
            style={{
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              color: mode === 'replace' ? c.accent : c.textMuted,
              borderBottom: mode === 'replace' ? `2px solid ${c.accent}` : '2px solid transparent',
              paddingBottom: '2px',
            }}
          >
            替换
          </span>
          <span style={{ color: c.textFaint, fontSize: '11px' }}>
            {count > 0 ? `${currentIndex + 1}/${count}` : count === 0 && query ? '无匹配' : '0/0'}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>✕</button>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="查找..."
          autoFocus
          style={inputStyle}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleNext() }
            if (e.key === 'Escape') { onClose() }
          }}
        />
        <button onClick={handlePrev} disabled={count === 0} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: 'transparent', color: c.textMuted, cursor: count > 0 ? 'pointer' : 'default', fontSize: '10px' }} title="上一个">↑</button>
        <button onClick={handleNext} disabled={count === 0} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: 'transparent', color: c.textMuted, cursor: count > 0 ? 'pointer' : 'default', fontSize: '10px' }} title="下一个">↓</button>
      </div>

      {/* 替换框 */}
      {mode === 'replace' && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            value={replacement}
            onChange={e => setReplacement(e.target.value)}
            placeholder="替换为..."
            style={inputStyle}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleReplaceCurrent() }
            }}
          />
          <button onClick={handleReplaceCurrent} disabled={count === 0} style={{ padding: '3px 10px', border: 'none', borderRadius: '3px', background: count > 0 ? c.accent : c.border, color: count > 0 ? '#000' : c.textFaint, cursor: count > 0 ? 'pointer' : 'default', fontSize: '10px', fontWeight: 600 }}>替换</button>
          <button onClick={handleReplaceAll} disabled={count === 0} style={{ padding: '3px 10px', border: 'none', borderRadius: '3px', background: count > 0 ? c.accent : c.border, color: count > 0 ? '#000' : c.textFaint, cursor: count > 0 ? 'pointer' : 'default', fontSize: '10px', fontWeight: 600 }}>全部替换</button>
          {replaceSuccess && <span style={{ color: c.accent, fontSize: '11px', whiteSpace: 'nowrap' }}>{replaceSuccess}</span>}
        </div>
      )}

      {/* 选项 */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '8px', alignItems: 'center' }}>
        {toggleBtn(options.caseSensitive, 'Aa', () => setOption('caseSensitive', !options.caseSensitive))}
        {toggleBtn(options.regex, '.*', () => setOption('regex', !options.regex))}
        {toggleBtn(options.wholeWord, '\\b', () => setOption('wholeWord', !options.wholeWord))}
      </div>

      {/* 匹配列表预览 */}
      {count > 0 && (
        <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px 0' }}>
          {matches.slice(0, 50).map((m, idx) => (
            <div
              key={idx}
              onClick={() => goToMatch(idx)}
              style={{
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: '11px',
                background: idx === currentIndex ? c.accentDim : 'transparent',
                color: idx === currentIndex ? c.accent : c.textMuted,
                borderBottom: `1px solid ${c.borderSubtle}`,
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                L{m.line}:{m.column} — {m.text}
              </span>
            </div>
          ))}
          {matches.length > 50 && (
            <div style={{ padding: '4px 12px', color: c.textFaint, fontSize: '10px' }}>仅展示前 50 项匹配</div>
          )}
        </div>
      )}
    </div>
  )
}
