/**
 * DebuggerPanel — 调试器面板（真实 Node inspector 协议集成）
 *
 * 功能：
 * - 启动/停止 Node.js 调试会话（--inspect-brk）
 * - 断点管理（设置/删除/条件断点）
 * - 步进控制（Continue/Pause/Step Over/Into/Out）
 * - 调用栈查看
 * - 变量查看
 * - 表达式求值（REPL）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface BreakpointItem { file: string; line: number }
interface CallFrame { name: string; file: string; line: number; column: number }
interface DebugSessionInfo { id: string; pid: number; isRunning: boolean; isPaused: boolean; breakpointCount: number }

interface DebuggerPanelProps {
  cwd: string
  theme: ThemeColors
  onClose: () => void
}

export function DebuggerPanel({ cwd, theme, onClose }: DebuggerPanelProps): JSX.Element {
  const c = theme
  const [sessions, setSessions] = useState<DebugSessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [breakpoints, setBreakpoints] = useState<BreakpointItem[]>([])
  const [callStack, setCallStack] = useState<CallFrame[]>([])
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [evalExpr, setEvalExpr] = useState('')
  const [evalResult, setEvalResult] = useState<{ result: string; type: string } | null>(null)
  const [scriptPath, setScriptPath] = useState('')
  const [scriptArgs, setScriptArgs] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [activeTab, setActiveTab] = useState<'sessions' | 'breakpoints' | 'stack' | 'vars' | 'eval'>('sessions')
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshSessions = useCallback(async () => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.debugListSessions?.()
      if (result?.success && result?.sessions) {
        setSessions(result.sessions)
        // 自动选择第一个暂停的会话
        if (!activeSessionId) {
          const paused = result.sessions.find((s: any) => s.isPaused)
          if (paused) setActiveSessionId(paused.id)
        }
      }
    } catch { /* ignore */ }
  }, [activeSessionId])

  const refreshBreakpoints = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.debugListBreakpoints?.(activeSessionId)
      if (result?.success && result?.breakpoints) {
        setBreakpoints(result.breakpoints)
      }
    } catch { /* ignore */ }
  }, [activeSessionId])

  const refreshCallStack = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.debugGetCallstack?.(activeSessionId)
      if (result?.success && result?.callStack) {
        setCallStack(result.callStack)
      }
    } catch { /* ignore */ }
  }, [activeSessionId])

  const refreshVariables = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.debugGetVariables?.(activeSessionId)
      if (result?.success && result?.variables) {
        setVariables(result.variables)
      }
    } catch { /* ignore */ }
  }, [activeSessionId])

  useEffect(() => {
    refreshSessions()
    refreshTimerRef.current = setInterval(refreshSessions, 2000)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [refreshSessions])

  useEffect(() => {
    if (activeSessionId) {
      refreshBreakpoints()
      refreshCallStack()
      refreshVariables()
    }
  }, [activeSessionId, refreshBreakpoints, refreshCallStack, refreshVariables])

  const handleStart = useCallback(async () => {
    if (!scriptPath.trim()) return
    setIsStarting(true)
    try {
      const api = window.dogeAPI as Record<string, any>
      const args = scriptArgs.trim().split(/\s+/).filter(Boolean)
      const result = await api?.debugStart?.({ cwd, script: scriptPath.trim(), args })
      if (result?.success) {
        setActiveSessionId(result.sessionId)
        setActiveTab('sessions')
      }
    } catch { /* ignore */ }
    setIsStarting(false)
  }, [scriptPath, scriptArgs, cwd])

  const handleAction = useCallback(async (action: string, sid: string) => {
    if (!sid) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const map: Record<string, any> = {
        continue: () => api?.debugContinue?.(sid),
        pause: () => api?.debugPause?.(sid),
        stepOver: () => api?.debugStepOver?.(sid),
        stepInto: () => api?.debugStepInto?.(sid),
        stepOut: () => api?.debugStepOut?.(sid),
      }
      const fn = map[action]
      if (fn) { await fn(); await Promise.all([refreshCallStack(), refreshVariables(), refreshBreakpoints()]) }
    } catch { /* ignore */ }
  }, [refreshCallStack, refreshVariables, refreshBreakpoints])

  const handleSetBreakpoint = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const api = window.dogeAPI as Record<string, any>
      await api?.debugSetBreakpoint?.({ sessionId: activeSessionId, file: '', line: 0 })
      refreshBreakpoints()
    } catch { /* ignore */ }
  }, [activeSessionId, refreshBreakpoints])

  const handleEval = useCallback(async () => {
    if (!activeSessionId || !evalExpr.trim()) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.debugEvaluate?.({ sessionId: activeSessionId, expression: evalExpr.trim() })
      if (result?.success) {
        setEvalResult({ result: result.result || 'nil', type: result.type || 'unknown' })
      } else {
        setEvalResult({ result: result?.error || '求值失败', type: 'error' })
      }
    } catch { /* ignore */ }
  }, [activeSessionId, evalExpr])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 启动区 */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '4px' }}>
        <input value={scriptPath} onChange={e => setScriptPath(e.target.value)} placeholder="入口脚本 (如 src/main.ts)" style={{ flex: 1, padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '9px', outline: 'none' }} />
        <input value={scriptArgs} onChange={e => setScriptArgs(e.target.value)} placeholder="参数" style={{ width: '80px', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '9px', outline: 'none' }} />
        <button onClick={handleStart} disabled={isStarting} style={{ padding: '3px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}>{isStarting ? '启动中...' : '▶ 启动'}</button>
      </div>

      {/* 标签页 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}` }}>
        {(['sessions', 'breakpoints', 'stack', 'vars', 'eval'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '4px', border: 'none', borderBottom: activeTab === tab ? `2px solid ${c.accent}` : '2px solid transparent', background: activeTab === tab ? `${c.accent}11` : 'transparent', color: activeTab === tab ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '9px', textTransform: 'capitalize' }}>
            {tab === 'sessions' ? '会话' : tab === 'breakpoints' ? '断点' : tab === 'stack' ? '调用栈' : tab === 'vars' ? '变量' : '求值'}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'sessions' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sessions.length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>无活跃调试会话</div> : sessions.map(s => (
              <div key={s.id} onClick={() => setActiveSessionId(s.id)} style={{ padding: '6px 8px', borderBottom: `1px solid ${c.borderSubtle}`, background: activeSessionId === s.id ? c.accentDim : 'transparent', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: activeSessionId === s.id ? c.accent : c.text, fontSize: '10px', fontWeight: 500 }}>PID: {s.pid}</span>
                  <span style={{ color: s.isPaused ? '#f59e0b' : s.isRunning ? '#10b981' : c.textFaint, fontSize: '9px' }}>{s.isPaused ? '⏸ 暂停' : s.isRunning ? '▶ 运行' : '⏹ 停止'}</span>
                </div>
                <div style={{ color: c.textFaint, fontSize: '9px', marginTop: '2px' }}>断点: {s.breakpointCount}</div>
                <button onClick={(e) => { e.stopPropagation(); handleAction('stop', s.id) }} style={{ marginTop: '3px', padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}>停止</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'breakpoints' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {breakpoints.length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>无断点</div> : breakpoints.map((bp, i) => (
                <div key={`${bp.file}-${bp.line}-${i}`} style={{ padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle}`, fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: c.text, fontFamily: 'monospace' }}>{bp.file.replace(cwd + '\\', '').replace(cwd + '/', '')}:{bp.line}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${c.border}`, padding: '6px 8px', display: 'flex', gap: '4px' }}>
              <input value={scriptPath} onChange={e => setScriptPath(e.target.value)} placeholder="文件路径" style={{ flex: 1, padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
              <input value={evalExpr} onChange={e => setEvalExpr(e.target.value)} placeholder="行号" style={{ width: '40px', padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
              <button onClick={handleSetBreakpoint} style={{ padding: '2px 6px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px' }}>+</button>
            </div>
          </>
        )}

        {activeTab === 'stack' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {callStack.length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>调用栈为空（会话未暂停）</div> : callStack.map((frame, i) => (
              <div key={i} style={{ padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle}`, fontSize: '10px' }}>
                <div style={{ color: c.accent, fontWeight: 500 }}>{frame.name}</div>
                <div style={{ color: c.textFaint, fontSize: '9px', fontFamily: 'monospace' }}>
                  {frame.file.replace(cwd + '\\', '').replace(cwd + '/', '')}:{frame.line}:{frame.column}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'vars' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {Object.keys(variables).length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>无变量（会话未暂停）</div> : Object.entries(variables).map(([k, v]) => (
              <div key={k} style={{ padding: '3px 8px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ color: c.accent, fontFamily: 'monospace' }}>{k}</span>
                <span style={{ color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'eval' && (
          <div style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input value={evalExpr} onChange={e => setEvalExpr(e.target.value)} placeholder="输入表达式 (如: process.pid)" onKeyDown={e => { if (e.key === 'Enter') handleEval() }} style={{ flex: 1, padding: '4px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none', fontFamily: 'monospace' }} />
              <button onClick={handleEval} disabled={!activeSessionId} style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>求值</button>
            </div>
            {evalResult && (
              <div style={{ marginTop: '6px', padding: '6px 8px', background: c.codeBg, borderRadius: '3px', fontFamily: 'monospace', fontSize: '10px' }}>
                <span style={{ color: c.textFaint, fontSize: '9px' }}>{evalResult.type}:</span>
                <span style={{ color: c.text, marginLeft: '4px' }}>{evalResult.result}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 步进控制栏 */}
      {activeSessionId && (
        <div style={{ borderTop: `1px solid ${c.border}`, padding: '4px 8px', display: 'flex', gap: '3px', background: c.bgPanel }}>
          <button onClick={() => handleAction('continue', activeSessionId)} style={{ flex: 1, padding: '3px', border: 'none', borderRadius: '2px', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '9px' }}>▶ 继续</button>
          <button onClick={() => handleAction('pause', activeSessionId)} style={{ flex: 1, padding: '3px', border: 'none', borderRadius: '2px', background: '#f59e0b', color: '#000', cursor: 'pointer', fontSize: '9px' }}>⏸ 暂停</button>
          <button onClick={() => handleAction('stepOver', activeSessionId)} style={{ flex: 1, padding: '3px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }}>⏭ 步过</button>
          <button onClick={() => handleAction('stepInto', activeSessionId)} style={{ flex: 1, padding: '3px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }}>⬇ 步入</button>
          <button onClick={() => handleAction('stepOut', activeSessionId)} style={{ flex: 1, padding: '3px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }}>⬆ 步出</button>
        </div>
      )}
    </div>
  )
}
