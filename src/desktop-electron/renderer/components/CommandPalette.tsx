/**
 * 命令面板组件 - 文件搜索和命令执行
 */

import React, { useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { MarkdownRenderer } from './MarkdownRenderer.js'

interface CommandPaletteProps {
  cwd: string
  onClose: () => void
  mode: 'files' | 'commands'
  setMode: (m: 'files' | 'commands') => void
  commandHistory?: Array<{ cmd: string; time: number }>
  theme: ThemeColors
}

export function CommandPalette({ cwd, onClose, mode, setMode, commandHistory = [], theme }: CommandPaletteProps) {
  const c = theme
  const [query, setQuery] = useState('')
  const [commands, setCommands] = useState<Array<{ name: string; description: string; category: string }>>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [results, setResults] = useState<{ success: boolean; output?: string; error?: string } | null>(null)
  const [executing, setExecuting] = useState(false)
  const [files, setFiles] = useState<Array<{ name: string; path: string }>>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (mode === 'commands') {
      async function load() {
        try {
          const cmds = await window.dogeAPI.getCommands()
          setCommands(cmds)
        } catch { /* ignore */ }
      }
      load()
    } else if (mode === 'files') {
      setLoadingFiles(true)
      window.dogeAPI.listDir(cwd).then(items => {
        const fileList = items
          .filter((item: { name: string; isDirectory: boolean }) => !item.name.startsWith('.') && !item.name.startsWith('node_modules') && !item.name.startsWith('dist'))
          .map((item: { name: string; isDirectory: boolean; path?: string }) => ({ name: item.name, path: item.path || `${cwd}/${item.name}` }))
        setFiles(fileList)
        setLoadingFiles(false)
      }).catch(() => setLoadingFiles(false))
    }
  }, [cwd, mode])

  const filtered = mode === 'files'
    ? files.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : commands.filter(cmd =>
        cmd.name.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description.toLowerCase().includes(query.toLowerCase())
      )

  const handleSelect = async (name: string) => {
    if (mode === 'files') {
      onClose()
      window.dogeAPI.readFile(files.find(f => f.name === name)?.path || '').then(result => {
        if (result.success) {
          window.dispatchEvent(new CustomEvent('doge:preview-file', { detail: files.find(f => f.name === name)?.path }))
        }
      })
      return
    }
    const args = query.slice(name.length).trim().split(' ').filter(Boolean)
    setExecuting(true)
    setResults(null)
    try {
      const result = await window.dogeAPI.executeCommand(name, args)
      setResults(result)
    } catch (e) {
      setResults({ success: false, error: e instanceof Error ? e.message : '执行失败' })
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex].name)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const placeholder = mode === 'files' ? '输入文件名搜索 (Ctrl+P 打开)...' : '输入命令 (如 /commit, /status)...'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: `${theme.bg}99`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '20vh'
    }} onClick={onClose}>
      <div style={{
        width: '500px', maxHeight: '500px', background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: '8px', boxShadow: `0 8px 32px ${theme.bg}80`, display: 'flex', flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '4px' }}>
          <button
            onClick={() => { setMode('files'); setQuery(''); setSelectedIndex(0) }}
            style={{
              flex: 1, padding: '4px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px',
              background: mode === 'files' ? theme.border : 'transparent', color: mode === 'files' ? theme.text : theme.textMuted
            }}
          >📄 文件</button>
          <button
            onClick={() => { setMode('commands'); setQuery(''); setSelectedIndex(0) }}
            style={{
              flex: 1, padding: '4px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px',
              background: mode === 'commands' ? theme.border : 'transparent', color: mode === 'commands' ? theme.text : theme.textMuted
            }}
          >⚡ 命令</button>
        </div>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              width: '100%', background: theme.bgPanel, border: `1px solid ${theme.border}`, borderRadius: '4px',
              padding: '8px 12px', color: theme.text, fontSize: '14px', outline: 'none'
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
          {loadingFiles ? (
            <div style={{ padding: '16px', color: theme.textFaint, textAlign: 'center' }}>加载文件列表...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '16px', color: theme.textFaint, textAlign: 'center' }}>无匹配结果</div>
          ) : (
            filtered.map((item: { name: string; description?: string; category?: string }, i: number) => (
              <div
                key={item.name}
                onClick={() => handleSelect(item.name)}
                style={{
                  padding: '8px 16px', cursor: 'pointer', background: i === selectedIndex ? theme.hoverBg : 'transparent',
                  borderBottom: `1px solid ${theme.borderSubtle}`, display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                {mode === 'files' ? (
                  <>
                    <span style={{ color: '#569CD6', fontSize: '13px' }}>📄</span>
                    <span style={{ color: theme.text, fontSize: '12px', flex: 1 }}>{item.name}</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: theme.accent, fontFamily: 'monospace', fontSize: '13px', minWidth: '120px' }}>{item.name}</span>
                    <span style={{ color: theme.textMuted, fontSize: '12px', flex: 1 }}>{item.description}</span>
                    <span style={{ color: theme.textFaint, fontSize: '10px' }}>{item.category}</span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
        {results && mode === 'commands' && !showHistory && (
          <div style={{ borderTop: `1px solid ${theme.border}`, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px 16px', fontSize: '10px', color: theme.textMuted, borderBottom: `1px solid ${theme.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>执行结果</span>
              <button onClick={() => setResults(null)} style={{ background: 'none', border: 'none', color: theme.textFaint, cursor: 'pointer', fontSize: '10px' }}>清除</button>
            </div>
            {results.success ? (
              <div style={{ padding: '8px 16px' }}>
                <MarkdownRenderer content={results.output || '(无输出)'} maxHeight={150} />
              </div>
            ) : (
              <pre style={{
                padding: '12px 16px', margin: 0, color: theme.errorText,
                fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
              }}>{results.error}</pre>
            )}
          </div>
        )}
        {executing && !showHistory && (
          <div style={{ padding: '8px 16px', color: c.textMuted, fontSize: '11px', borderTop: `1px solid ${c.border}` }}>
            执行中...
          </div>
        )}
        {/* 命令历史记录 */}
        {showHistory && mode === 'commands' && (
          <div style={{ borderTop: `1px solid ${c.border}`, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px 16px', fontSize: '10px', color: c.textMuted, borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>命令历史 ({commandHistory.length})</span>
              <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '10px' }}>返回</button>
            </div>
            {commandHistory.length === 0 ? (
              <div style={{ padding: '16px', color: c.textFaint, textAlign: 'center', fontSize: '11px' }}>暂无命令历史</div>
            ) : (
              [...commandHistory].reverse().map((h, i) => (
                <div
                  key={i}
                  onClick={() => { setQuery(h.cmd); setShowHistory(false) }}
                  style={{
                    padding: '6px 16px', cursor: 'pointer', borderBottom: `1px solid ${c.borderSubtle}`,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <span style={{ color: c.accent, fontFamily: 'monospace', fontSize: '11px', flex: 1 }}>{h.cmd}</span>
                  <span style={{ color: c.textFaint, fontSize: '9px', flexShrink: 0 }}>
                    {new Date(h.time).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
        {/* 底部工具栏 */}
        <div style={{ borderTop: `1px solid ${c.border}`, padding: '6px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: c.textFaint }}>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
          {commandHistory.length > 0 && mode === 'commands' && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                marginLeft: 'auto', padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                background: showHistory ? c.border : c.bgPanel, color: showHistory ? c.text : c.textMuted,
                cursor: 'pointer', fontSize: '10px',
              }}
            >
              📜 历史
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
