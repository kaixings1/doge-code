/**
 * DebuggerPanel — 调试器面板基础框架
 *
 * 提供调试功能：
 * - 断点管理面板
 * - 变量检查面板
 * - 调用栈面板
 * - 调试控制台（REPL 式交互）
 * - 调试控制按钮
 * - 调试配置选择
 * - 调试状态指示
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface DebuggerPanelProps {
  theme: ThemeColors
  onClose: () => void
}

// ─── 类型定义 ───

type DebugConfig = 'node' | 'python' | 'chrome'
type DebugStatus = 'stopped' | 'running' | 'paused'

interface Breakpoint {
  id: string
  file: string
  line: number
  condition?: string
  hitCount: number
  enabled: boolean
}

interface DebugVariable {
  name: string
  value: string
  type: string
  children?: DebugVariable[]
}

interface CallStackFrame {
  id: string
  name: string
  file: string
  line: number
  column: number
}

interface ConsoleMessage {
  id: string
  type: 'input' | 'output' | 'error' | 'info'
  content: string
  timestamp: number
}

// ─── 默认值 ───

const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: 'bp-1', file: 'src/index.ts', line: 42, hitCount: 0, enabled: true },
  { id: 'bp-2', file: 'src/utils/helper.ts', line: 15, condition: 'x > 10', hitCount: 3, enabled: true },
]

const DEFAULT_VARIABLES: DebugVariable[] = [
  { name: 'localScope', value: '', type: 'Object', children: [
    { name: 'count', value: '42', type: 'number' },
    { name: 'name', value: '"hello"', type: 'string' },
    { name: 'items', value: 'Array(3)', type: 'Array', children: [
      { name: '0', value: '"item1"', type: 'string' },
      { name: '1', value: '"item2"', type: 'string' },
      { name: '2', value: '"item3"', type: 'string' },
    ]},
  ]},
  { name: 'this', value: 'Window', type: 'Window', children: [
    { name: 'location', value: 'Location', type: 'Location' },
    { name: 'document', value: '#document', type: 'Document' },
  ]},
]

const DEFAULT_CALLSTACK: CallStackFrame[] = [
  { id: 'frame-1', name: 'handleClick', file: 'src/App.tsx', line: 28, column: 4 },
  { id: 'frame-2', name: 'onClick', file: 'src/components/Button.tsx', line: 15, column: 2 },
  { id: 'frame-3', name: 'anonymous', file: 'src/index.tsx', line: 10, column: 0 },
]

export function DebuggerPanel({ theme, onClose }: DebuggerPanelProps) {
  const c = theme

  // ─── 状态 ───
  const [debugConfig, setDebugConfig] = useState<DebugConfig>('node')
  const [debugStatus, setDebugStatus] = useState<DebugStatus>('stopped')
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>(DEFAULT_BREAKPOINTS)
  const [variables, setVariables] = useState<DebugVariable[]>(DEFAULT_VARIABLES)
  const [callStack, setCallStack] = useState<CallStackFrame[]>(DEFAULT_CALLSTACK)
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([
    { id: 'msg-1', type: 'info', content: '调试器已就绪', timestamp: Date.now() },
  ])
  const [consoleInput, setConsoleInput] = useState('')
  const [activeFrame, setActiveFrame] = useState<string | null>('frame-1')
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set(['localScope']))

  // ─── 调试控制 ───
  const handleStart = useCallback(async () => {
    setDebugStatus('running')
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'info',
      content: `启动 ${debugConfig} 调试会话...`,
      timestamp: Date.now(),
    }])
    // 模拟启动
    setTimeout(() => {
      setDebugStatus('paused')
      setConsoleMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        type: 'info',
        content: '程序在断点处暂停',
        timestamp: Date.now(),
      }])
    }, 500)
  }, [debugConfig])

  const handleStop = useCallback(() => {
    setDebugStatus('stopped')
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'info',
      content: '调试会话已结束',
      timestamp: Date.now(),
    }])
  }, [])

  const handleContinue = useCallback(() => {
    setDebugStatus('running')
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'info',
      content: '继续执行...',
      timestamp: Date.now(),
    }])
    // 模拟继续后暂停
    setTimeout(() => {
      setDebugStatus('paused')
    }, 300)
  }, [])

  const handleStepOver = useCallback(() => {
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'info',
      content: '单步跳过 (Step Over)',
      timestamp: Date.now(),
    }])
    // 更新调用栈
    if (callStack.length > 0) {
      setCallStack(prev => prev.map((f, i) => i === 0 ? { ...f, line: f.line + 1 } : f))
    }
  }, [callStack])

  const handleStepInto = useCallback(() => {
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'info',
      content: '单步进入 (Step Into)',
      timestamp: Date.now(),
    }])
  }, [])

  const handleStepOut = useCallback(() => {
    if (callStack.length > 1) {
      setCallStack(prev => prev.slice(1))
      setActiveFrame(callStack[1]?.id || null)
    }
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'info',
      content: '单步跳出 (Step Out)',
      timestamp: Date.now(),
    }])
  }, [callStack])

  const handleRestart = useCallback(() => {
    handleStop()
    setTimeout(() => handleStart(), 200)
  }, [handleStop, handleStart])

  // ─── 断点管理 ───
  const toggleBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev => prev.map(bp =>
      bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
    ))
  }, [])

  const removeBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev => prev.filter(bp => bp.id !== id))
  }, [])

  const addBreakpoint = useCallback((file: string, line: number) => {
    const newBp: Breakpoint = {
      id: `bp-${Date.now()}`,
      file,
      line,
      hitCount: 0,
      enabled: true,
    }
    setBreakpoints(prev => [...prev, newBp])
  }, [])

  // ─── 控制台 ───
  const handleConsoleSubmit = useCallback(() => {
    if (!consoleInput.trim()) return

    // 添加输入消息
    setConsoleMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'input',
      content: consoleInput,
      timestamp: Date.now(),
    }])

    // 模拟求值
    try {
      let result: string
      if (consoleInput.startsWith('print ') || consoleInput.startsWith('console.log')) {
        result = consoleInput.replace(/^(print |console.log\()/, '').replace(/\)$/, '')
      } else {
        result = `[求值] ${consoleInput}`
      }
      setConsoleMessages(prev => [...prev, {
        id: `msg-${Date.now() + 1}`,
        type: 'output',
        content: result,
        timestamp: Date.now(),
      }])
    } catch (err) {
      setConsoleMessages(prev => [...prev, {
        id: `msg-${Date.now() + 1}`,
        type: 'error',
        content: err instanceof Error ? err.message : 'Error',
        timestamp: Date.now(),
      }])
    }

    setConsoleInput('')
  }, [consoleInput])

  // ─── 变量展开/折叠 ───
  const toggleVarExpand = useCallback((name: string) => {
    setExpandedVars(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }, [])

  // ─── 渲染变量树 ───
  const renderVariable = (variable: DebugVariable, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedVars.has(variable.name)
    const hasChildren = variable.children && variable.children.length > 0

    return (
      <div key={variable.name}>
        <div
          onClick={() => hasChildren && toggleVarExpand(variable.name)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', paddingLeft: `${8 + depth * 16}px`,
            cursor: hasChildren ? 'pointer' : 'default',
            fontSize: '11px', color: c.text,
            background: 'transparent',
          }}
        >
          <span style={{ fontSize: '8px', color: c.textFaint, width: '10px' }}>
            {hasChildren ? (isExpanded ? '▼' : '▶') : ''}
          </span>
          <span style={{ color: '#9CDCFE', fontFamily: 'monospace' }}>{variable.name}</span>
          <span style={{ color: c.textFaint, marginLeft: '8px' }}>:</span>
          <span style={{ color: '#CE9178', fontFamily: 'monospace', marginLeft: '4px' }}>{variable.value}</span>
          <span style={{ color: c.textFaint, fontSize: '9px', marginLeft: 'auto' }}>{variable.type}</span>
        </div>
        {hasChildren && isExpanded && variable.children!.map(child => renderVariable(child, depth + 1))}
      </div>
    )
  }

  // ─── 状态颜色 ───
  const getStatusColor = (): string => {
    switch (debugStatus) {
      case 'running': return c.accent
      case 'paused': return '#FFB347'
      case 'stopped': return c.textFaint
    }
  }

  const getStatusText = (): string => {
    switch (debugStatus) {
      case 'running': return '运行中'
      case 'paused': return '已暂停'
      case 'stopped': return '已停止'
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9997, background: `${c.bg}98`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
        background: c.bgPanel, borderBottom: `1px solid ${c.border}`,
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>Debugger</span>
        <div style={{ flex: 1 }} />

        {/* 调试配置选择 */}
        <select
          value={debugConfig}
          onChange={(e) => setDebugConfig(e.target.value as DebugConfig)}
          style={{
            padding: '4px 8px', background: c.inputBg, border: `1px solid ${c.border}`,
            borderRadius: '4px', color: c.text, fontSize: '11px', outline: 'none',
          }}
        >
          <option value="node">Node.js</option>
          <option value="python">Python</option>
          <option value="chrome">Chrome</option>
        </select>

        {/* 状态指示 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '4px 10px', background: c.bgAlt, borderRadius: '4px',
          border: `1px solid ${c.border}`,
        }}>
          <span style={{ fontSize: '8px', color: getStatusColor() }}>●</span>
          <span style={{ fontSize: '11px', color: getStatusColor() }}>{getStatusText()}</span>
        </div>

        <button onClick={onClose} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '4px',
          background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
        }}>关闭</button>
      </div>

      {/* 调试控制按钮 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px',
        background: c.bgPanel, borderBottom: `1px solid ${c.border}`,
      }}>
        {debugStatus === 'stopped' ? (
          <button
            onClick={handleStart}
            style={{
              padding: '4px 12px', border: 'none', borderRadius: '3px',
              background: c.accent, color: '#000', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >▶ 启动</button>
        ) : (
          <>
            <button
              onClick={handleContinue}
              disabled={debugStatus !== 'paused'}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: '3px',
                background: debugStatus === 'paused' ? c.accent : c.surface,
                color: debugStatus === 'paused' ? '#000' : c.textFaint,
                cursor: debugStatus === 'paused' ? 'pointer' : 'not-allowed',
                fontSize: '11px', fontWeight: 600,
              }}
            >▶ 继续</button>
            <button
              onClick={handleStepOver}
              disabled={debugStatus !== 'paused'}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: '3px',
                background: debugStatus === 'paused' ? c.bgAlt : c.surface,
                color: debugStatus === 'paused' ? c.text : c.textFaint,
                cursor: debugStatus === 'paused' ? 'pointer' : 'not-allowed',
                fontSize: '11px',
              }}
            >⤵ 单步跳过</button>
            <button
              onClick={handleStepInto}
              disabled={debugStatus !== 'paused'}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: '3px',
                background: debugStatus === 'paused' ? c.bgAlt : c.surface,
                color: debugStatus === 'paused' ? c.text : c.textFaint,
                cursor: debugStatus === 'paused' ? 'pointer' : 'not-allowed',
                fontSize: '11px',
              }}
            >⤓ 单步进入</button>
            <button
              onClick={handleStepOut}
              disabled={debugStatus !== 'paused'}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: '3px',
                background: debugStatus === 'paused' ? c.bgAlt : c.surface,
                color: debugStatus === 'paused' ? c.text : c.textFaint,
                cursor: debugStatus === 'paused' ? 'pointer' : 'not-allowed',
                fontSize: '11px',
              }}
            >⤴ 单步跳出</button>
            <button
              onClick={handleRestart}
              style={{
                padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '3px',
                background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
              }}
            >↻ 重启</button>
            <button
              onClick={handleStop}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: '3px',
                background: c.errorBg, color: c.errorText, cursor: 'pointer', fontSize: '11px',
              }}
            >■ 停止</button>
          </>
        )}
      </div>

      {/* 主区域 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧面板：断点 + 调用栈 */}
        <div style={{
          width: '280px', minWidth: '240px', background: c.bgAlt,
          borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 断点管理 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px',
              borderBottom: `1px solid ${c.border}`,
            }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, flex: 1 }}>
                断点 ({breakpoints.filter(bp => bp.enabled).length}/{breakpoints.length})
              </span>
              <span
                onClick={() => addBreakpoint('src/newfile.ts', 1)}
                style={{ cursor: 'pointer', color: c.accent, fontSize: '14px' }}
                title="添加断点"
              >+</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {breakpoints.map(bp => (
                <div
                  key={bp.id}
                  style={{
                    padding: '6px 12px', fontSize: '10px',
                    borderBottom: `1px solid ${c.borderSubtle}`,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: bp.enabled ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={bp.enabled}
                    onChange={() => toggleBreakpoint(bp.id)}
                    style={{ accentColor: c.accent }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bp.file}:{bp.line}
                    </div>
                    {bp.condition && (
                      <div style={{ color: c.textFaint, fontSize: '9px' }}>条件: {bp.condition}</div>
                    )}
                  </div>
                  <span style={{ color: c.textFaint, fontSize: '9px', flexShrink: 0 }}>
                    命中: {bp.hitCount}
                  </span>
                  <span
                    onClick={() => removeBreakpoint(bp.id)}
                    style={{ cursor: 'pointer', color: c.errorText, fontSize: '10px', flexShrink: 0 }}
                  >✕</span>
                </div>
              ))}
            </div>
          </div>

          {/* 调用栈 */}
          <div style={{ borderTop: `1px solid ${c.border}`, maxHeight: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: c.textMuted,
              borderBottom: `1px solid ${c.border}`,
            }}>
              调用栈 ({callStack.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {callStack.map(frame => (
                <div
                  key={frame.id}
                  onClick={() => setActiveFrame(frame.id)}
                  style={{
                    padding: '4px 12px', fontSize: '10px', cursor: 'pointer',
                    background: activeFrame === frame.id ? c.accentDim : 'transparent',
                    borderBottom: `1px solid ${c.borderSubtle}`,
                  }}
                >
                  <div style={{ color: activeFrame === frame.id ? c.accent : c.text, fontWeight: 500 }}>
                    {frame.name}
                  </div>
                  <div style={{ color: c.textFaint, fontSize: '9px', fontFamily: 'monospace' }}>
                    {frame.file}:{frame.line}:{frame.column}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中间区域：变量 + 控制台 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 变量检查面板 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderBottom: `1px solid ${c.border}` }}>
            <div style={{
              padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: c.textMuted,
              borderBottom: `1px solid ${c.border}`,
            }}>
              变量检查
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {variables.map(v => renderVariable(v))}
            </div>
          </div>

          {/* 调试控制台 */}
          <div style={{ height: '200px', minHeight: '100px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px',
              borderBottom: `1px solid ${c.border}`,
            }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted }}>控制台</span>
              <div style={{ flex: 1 }} />
              <span
                onClick={() => setConsoleMessages([])}
                style={{ cursor: 'pointer', fontSize: '10px', color: c.textFaint }}
              >清空</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {consoleMessages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    padding: '2px 12px', fontSize: '11px', fontFamily: 'monospace',
                    color: msg.type === 'error' ? c.errorText :
                           msg.type === 'info' ? c.textFaint :
                           msg.type === 'input' ? c.accent : c.text,
                    display: 'flex', gap: '8px',
                  }}
                >
                  <span style={{ color: c.textFaint, flexShrink: 0 }}>
                    {msg.type === 'input' ? '>' : msg.type === 'error' ? '✗' : ' '}
                  </span>
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{msg.content}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', borderTop: `1px solid ${c.border}` }}>
              <span style={{ padding: '6px 8px', color: c.accent, fontSize: '12px' }}>{'>'}</span>
              <input
                value={consoleInput}
                onChange={(e) => setConsoleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConsoleSubmit() }}
                placeholder="输入表达式..."
                style={{
                  flex: 1, padding: '6px 8px', background: 'transparent', border: 'none',
                  color: c.text, fontSize: '11px', fontFamily: 'monospace', outline: 'none',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
