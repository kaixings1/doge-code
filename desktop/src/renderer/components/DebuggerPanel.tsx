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

interface BreakpointItem { file: string; line: number; condition?: string }
interface CallFrame { name: string; file: string; line: number; column: number }
interface DebugSessionInfo { id: string; pid: number; isRunning: boolean; isPaused: boolean; breakpointCount: number }

interface DebuggerPanelProps {
  cwd: string
  theme: ThemeColors
  onClose: () => void
  onNavigateTo?: (filePath: string, line: number) => void
  onBreakpointsChange?: (breakpoints: BreakpointItem[]) => void
  onActiveSessionChange?: (sessionId: string | null) => void
}

export function DebuggerPanel({ cwd, theme, onClose, onNavigateTo, onBreakpointsChange, onActiveSessionChange }: DebuggerPanelProps): JSX.Element {
  const c = theme
  const [sessions, setSessions] = useState<DebugSessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [breakpoints, setBreakpoints] = useState<BreakpointItem[]>([])
  const [callStack, setCallStack] = useState<CallFrame[]>([])
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [variableObjects, setVariableObjects] = useState<Record<string, { objectId: string; type: string; description?: string }>>({})
  const [evalExpr, setEvalExpr] = useState('')
  const [evalResult, setEvalResult] = useState<{ result: string; type: string } | null>(null)
  // 表达式历史（localStorage 持久化）
  const EVAL_HISTORY_KEY = 'doge-debug-eval-history'
  const [evalHistory, setEvalHistory] = useState<string[]>([])
  const [evalHistoryIdx, setEvalHistoryIdx] = useState(-1)
  const [showEvalHistory, setShowEvalHistory] = useState(false)
  const [scriptPath, setScriptPath] = useState('')
  const [scriptArgs, setScriptArgs] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [activeTab, setActiveTab] = useState<'sessions' | 'breakpoints' | 'stack' | 'vars' | 'eval'>('sessions')
  const [pausedAt, setPausedAt] = useState<{ file: string; line: number; functionName: string; reason: string } | null>(null)
  const [watchExpressions, setWatchExpressions] = useState<string[]>([])
  const [watchResults, setWatchResults] = useState<Record<string, string>>({})
  const [newWatch, setNewWatch] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 变量嵌套展开缓存：path → 子属性列表
  const [expandedVars, setExpandedVars] = useState<Record<string, Array<{ name: string; type: string; value?: string; objectId?: string; isExpandable: boolean }>>>({})
  const [expandedVarPaths, setExpandedVarPaths] = useState<Set<string>>(new Set())
  const [loadingVarPath, setLoadingVarPath] = useState<string | null>(null)
  const [bpFile, setBpFile] = useState('')
  const [bpLine, setBpLine] = useState('')
  const [bpCondition, setBpCondition] = useState('')
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubPausedRef = useRef<(() => void) | null>(null)
  const WATCH_STORAGE_KEY = 'doge-debug-watch-expressions'
  const SCHEMES_STORAGE_KEY = 'doge-debug-breakpoint-schemes'
  const [schemes, setSchemes] = useState<Array<{ id: string; name: string; breakpoints: BreakpointItem[]; savedAt: number }>>([])
  const [newSchemeName, setNewSchemeName] = useState('')
  const [showSchemeSave, setShowSchemeSave] = useState(false)
  const [fileSchemes, setFileSchemes] = useState<Array<{ file: string; name: string; breakpointCount: number; exportedAt: string }>>([])
  const [showFileSchemes, setShowFileSchemes] = useState(false)
  const [snapshots, setSnapshots] = useState<Array<{ file: string; name: string; script: string; breakpointCount: number; watchCount: number; savedAt: string }>>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [showSnapshotSave, setShowSnapshotSave] = useState(false)

  // Watch 表达式持久化（localStorage）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WATCH_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setWatchExpressions(parsed.filter((e): e is string => typeof e === 'string'))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(watchExpressions.slice(0, 20)))
    } catch { /* ignore */ }
  }, [watchExpressions])

  // 表达式历史持久化
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EVAL_HISTORY_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setEvalHistory(parsed.filter((e): e is string => typeof e === 'string').slice(0, 20))
      }
    } catch { /* ignore */ }
  }, [])

  const saveEvalHistory = useCallback((exprs: string[]) => {
    try {
      localStorage.setItem(EVAL_HISTORY_KEY, JSON.stringify(exprs.slice(0, 20)))
    } catch { /* ignore */ }
  }, [])

  // 监听断点命中事件（CDP Debugger.paused）
  useEffect(() => {
    const api = window.dogeAPI as Record<string, any>
    if (typeof api?.onDebugPaused === 'function') {
      unsubPausedRef.current = api.onDebugPaused((info: { sessionId: string; file: string; line: number; functionName: string; reason: string }) => {
        setPausedAt({ file: info.file, line: info.line, functionName: info.functionName || '(anonymous)', reason: info.reason })
        // 自�切到调用栈 tab
        setActiveTab('stack')
        // 自动跳转到暂停位置
        if (info.file && onNavigateTo) onNavigateTo(info.file, info.line)
      })
    }
    return () => { unsubPausedRef.current?.() }
  }, [onNavigateTo])

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
        onBreakpointsChange?.(result.breakpoints)
      }
    } catch { /* ignore */ }
  }, [activeSessionId, onBreakpointsChange])

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
        setVariableObjects(result.variableObjects || {})
      }
    } catch { /* ignore */ }
  }, [activeSessionId])

  // 求值所有 watch 表达式（仅在暂停时）
  const refreshWatches = useCallback(async () => {
    if (!activeSessionId || watchExpressions.length === 0) return
    const api = window.dogeAPI as Record<string, any>
    const results: Record<string, string> = {}
    await Promise.all(watchExpressions.map(async (expr) => {
      try {
        const res = await api?.debugEvaluate?.({ sessionId: activeSessionId, expression: expr })
        if (res?.success) results[expr] = res.result || 'nil'
        else results[expr] = `⚠ ${res?.error || '求值失败'}`
      } catch {
        results[expr] = '⚠ 求值失败'
      }
    }))
    setWatchResults(results)
  }, [activeSessionId, watchExpressions])

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

  // 暂停时刷新 watch 表达式
  useEffect(() => {
    if (activeSessionId && pausedAt) {
      refreshWatches()
    }
  }, [activeSessionId, pausedAt, refreshWatches])

  // 变量嵌套展开/收起：点击 ▸ 时获取对象子属性（CDP Runtime.getProperties）
  const toggleVarExpand = useCallback(async (path: string, objectId: string) => {
    if (!activeSessionId) return
    const nextPaths = new Set(expandedVarPaths)
    if (nextPaths.has(path)) {
      nextPaths.delete(path)
      setExpandedVarPaths(nextPaths)
      return
    }
    nextPaths.add(path)
    setExpandedVarPaths(nextPaths)
    if (expandedVars[path]) return // 已缓存
    setLoadingVarPath(path)
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugGetObjectProps?.({ sessionId: activeSessionId, objectId })
      if (res?.success && res.properties) {
        setExpandedVars(prev => ({ ...prev, [path]: res.properties }))
      }
    } catch { /* ignore */ }
    setLoadingVarPath(null)
  }, [activeSessionId, expandedVarPaths, expandedVars])

  // 上报活跃会话给父组件（行号点击设置断点用）
  useEffect(() => {
    onActiveSessionChange?.(activeSessionId)
  }, [activeSessionId, onActiveSessionChange])

  // 断点方案持久化（localStorage）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCHEMES_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setSchemes(parsed.filter((s): s is { id: string; name: string; breakpoints: BreakpointItem[]; savedAt: number } => s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.breakpoints)))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SCHEMES_STORAGE_KEY, JSON.stringify(schemes.slice(0, 20)))
    } catch { /* ignore */ }
  }, [schemes])

  // 保存当前断点列表为命名方案
  const handleSaveScheme = useCallback(() => {
    const name = newSchemeName.trim()
    if (!name) { setError('请输入方案名称'); return }
    if (breakpoints.length === 0) { setError('当前没有断点可保存'); return }
    const scheme = { id: `scheme-${Date.now()}`, name, breakpoints: breakpoints.map(b => ({ file: b.file, line: b.line, condition: b.condition })), savedAt: Date.now() }
    setSchemes(prev => {
      // 同名覆盖
      const next = prev.filter(s => s.name !== name)
      return [scheme, ...next].slice(0, 20)
    })
    setNewSchemeName('')
    setShowSchemeSave(false)
    setError(null)
  }, [newSchemeName, breakpoints])

  // 加载方案：恢复 UI 列表，若有活跃会话则重新设置断点到调试器
  const handleLoadScheme = useCallback(async (scheme: { breakpoints: BreakpointItem[] }) => {
    setBreakpoints(scheme.breakpoints)
    onBreakpointsChange?.(scheme.breakpoints)
    setError(null)
    if (activeSessionId && scheme.breakpoints.length > 0) {
      const api = window.dogeAPI as Record<string, any>
      let ok = 0
      let fail = 0
      for (const bp of scheme.breakpoints) {
        try {
          const bpParams: Record<string, unknown> = { sessionId: activeSessionId, file: bp.file, line: bp.line }
          if (bp.condition) bpParams.condition = bp.condition
          const res = await api?.debugSetBreakpoint?.(bpParams)
          if (res?.success) ok++
          else fail++
        } catch { fail++ }
      }
      if (fail > 0) setError(`方案已加载：${ok} 个断点已应用，${fail} 个失败（文件可能已不存在）`)
      else setError(`✅ 方案已加载并应用 ${ok} 个断点`)
      refreshBreakpoints()
    }
  }, [activeSessionId, onBreakpointsChange, refreshBreakpoints])

  // 删除方案
  const handleDeleteScheme = useCallback((id: string) => {
    setSchemes(prev => prev.filter(s => s.id !== id))
  }, [])

  // 导出方案到文件（.doge/debug-schemes/）
  const handleExportScheme = useCallback(async () => {
    if (breakpoints.length === 0) { setError('当前没有断点可导出'); return }
    const name = newSchemeName.trim() || `scheme-${new Date().toLocaleDateString().replace(/\//g, '-')}`
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugSchemeExport?.({ name, breakpoints: breakpoints.map(b => ({ file: b.file, line: b.line, condition: b.condition })) })
      if (res?.success) {
        setError(`✅ 方案已导出: ${res.path}`)
        refreshFileSchemes()
      } else {
        setError(res?.error || '导出失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    }
  }, [breakpoints, newSchemeName])

  // 刷新文件方案列表
  const refreshFileSchemes = useCallback(async () => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugSchemeList?.()
      if (res?.success && res.schemes) setFileSchemes(res.schemes)
    } catch { /* ignore */ }
  }, [])

  // 保存当前会话为快照
  const handleSaveSnapshot = useCallback(async () => {
    if (!activeSessionId) { setError('没有活跃调试会话可保存'); return }
    const name = snapshotName.trim() || `snapshot-${new Date().toLocaleDateString().replace(/\//g, '-')}`
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugSnapshotSave?.({ sessionId: activeSessionId, name, watchExpressions })
      if (res?.success) {
        setError(`✅ 会话快照已保存: ${res.path}`)
        refreshSnapshots()
        setShowSnapshotSave(false)
        setSnapshotName('')
      } else {
        setError(res?.error || '快照保存失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '快照保存失败')
    }
  }, [activeSessionId, snapshotName, watchExpressions])

  // 刷新快照列表
  const refreshSnapshots = useCallback(async () => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugSnapshotList?.()
      if (res?.success && res.snapshots) setSnapshots(res.snapshots)
    } catch { /* ignore */ }
  }, [])

  // 恢复快照：重启会话 + 应用断点 + 恢复 Watch
  const handleRestoreSnapshot = useCallback(async (fileName: string) => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugSnapshotRestore?.(fileName)
      if (!res?.success) { setError(res?.error || '快照恢复失败'); return }
      // 恢复 Watch 表达式
      if (res.watchExpressions && res.watchExpressions.length > 0) {
        setWatchExpressions(res.watchExpressions)
      }
      // 设置脚本与参数
      setScriptPath(res.script || '')
      setScriptArgs((res.args || []).join(' '))
      // 恢复断点到 UI
      const bps = res.breakpoints || []
      setBreakpoints(bps)
      onBreakpointsChange?.(bps)
      // 启动新会话
      setIsStarting(true)
      try {
        const startRes = await api?.debugStart?.({ cwd, script: res.script, args: res.args || [] })
        if (startRes?.success) {
          setActiveSessionId(startRes.sessionId)
          // 逐个应用断点
          let ok = 0
          for (const bp of bps) {
            try {
              const bpParams: Record<string, unknown> = { sessionId: startRes.sessionId, file: bp.file, line: bp.line }
              if (bp.condition) bpParams.condition = bp.condition
              const r = await api?.debugSetBreakpoint?.(bpParams)
              if (r?.success) ok++
            } catch { /* ignore */ }
          }
          setError(`✅ 快照「${res.name || fileName}」已恢复：${bps.length} 个断点，${ok} 个已应用`)
          setActiveTab('sessions')
        } else {
          setError(startRes?.error || '会话启动失败')
        }
      } finally {
        setIsStarting(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '快照恢复失败')
    }
  }, [cwd, onBreakpointsChange])

  // 从文件导入方案
  const handleImportScheme = useCallback(async (fileName: string) => {
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.debugSchemeImport?.(fileName)
      if (res?.success && res.breakpoints) {
        setBreakpoints(res.breakpoints)
        onBreakpointsChange?.(res.breakpoints)
        setError(`✅ 已从文件导入方案「${res.name || fileName}」(${res.breakpoints.length} 个断点)`)
        if (activeSessionId && res.breakpoints.length > 0) {
          let ok = 0
          for (const bp of res.breakpoints) {
            try {
              const bpParams: Record<string, unknown> = { sessionId: activeSessionId, file: bp.file, line: bp.line }
              if (bp.condition) bpParams.condition = bp.condition
              const r = await api?.debugSetBreakpoint?.(bpParams)
              if (r?.success) ok++
            } catch { /* ignore */ }
          }
          setError(`✅ 已导入 ${res.breakpoints.length} 个断点，${ok} 个已应用到当前会话`)
          refreshBreakpoints()
        }
        setShowFileSchemes(false)
      } else {
        setError(res?.error || '导入失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败')
    }
  }, [activeSessionId, onBreakpointsChange, refreshBreakpoints])

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
    const filePath = bpFile.trim()
    const lineNo = Number(bpLine)
    if (!filePath) { setError('请输入断点文件路径'); return }
    if (!lineNo || lineNo < 1) { setError('请输入有效行号'); return }
    try {
      const api = window.dogeAPI as Record<string, any>
      const bpParams: Record<string, unknown> = { sessionId: activeSessionId, file: filePath, line: lineNo }
      if (bpCondition.trim()) bpParams.condition = bpCondition.trim()
      const result = await api?.debugSetBreakpoint?.(bpParams)
      if (result && !result.success) {
        setError(result.error || '断点设置失败')
      } else {
        setError(null)
        setBpFile('')
        setBpLine('')
        setBpCondition('')
      }
      refreshBreakpoints()
    } catch { /* ignore */ }
  }, [activeSessionId, refreshBreakpoints, bpFile, bpLine, bpCondition])

  const handleEval = useCallback(async () => {
    if (!activeSessionId || !evalExpr.trim()) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const result = await api?.debugEvaluate?.({ sessionId: activeSessionId, expression: evalExpr.trim() })
      if (result?.success) {
        setEvalResult({ result: result.result || 'nil', type: result.type || 'unknown' })
        // 记录历史（去重置顶）
        setEvalHistory(prev => {
          const next = [evalExpr.trim(), ...prev.filter(e => e !== evalExpr.trim())].slice(0, 20)
          saveEvalHistory(next)
          return next
        })
        setEvalHistoryIdx(-1)
      } else {
        setEvalResult({ result: result?.error || '求值失败', type: 'error' })
      }
    } catch { /* ignore */ }
  }, [activeSessionId, evalExpr, saveEvalHistory])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  // 递归渲染变量树（嵌套对象展开）
  const renderVarTree = useCallback((path: string, name: string, val: string, expandable: boolean, objectId?: string, depth = 0): JSX.Element => {
    const isExpanded = expandedVarPaths.has(path)
    const children = expandedVars[path]
    const loading = loadingVarPath === path
    const indent = { paddingLeft: `${8 + depth * 12}px` }
    return (
      <div key={path}>
        <div style={{ ...indent, paddingTop: '3px', paddingBottom: '3px', borderBottom: depth === 0 ? `1px solid ${c.borderSubtle}` : 'none', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '2px', minWidth: 0 }}>
            {expandable ? (
              <button
                onClick={() => objectId && toggleVarExpand(path, objectId)}
                style={{ padding: '0 2px', border: 'none', background: 'transparent', color: c.accent, cursor: 'pointer', fontSize: '8px', flexShrink: 0 }}
                title={isExpanded ? '收起' : '展开查看对象属性'}
              >
                {loading ? '⏳' : isExpanded ? '▼' : '▶'}
              </button>
            ) : (
              <span style={{ width: '12px', flexShrink: 0 }} />
            )}
            <span style={{ color: c.accent, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{name}</span>
          </span>
          <span style={{ color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }} title={val}>{val}</span>
        </div>
        {isExpanded && children && (
          <div>
            {children.length === 0 ? (
              <div style={{ ...indent, padding: '2px 0 2px 14px', color: c.textFaint, fontSize: '9px' }}>（空对象）</div>
            ) : children.map(child => {
              const childPath = `${path}.${child.name}`
              return renderVarTree(childPath, child.name, child.value || `(${child.type})`, child.isExpandable, child.objectId, depth + 1)
            })}
          </div>
        )}
      </div>
    )
  }, [expandedVarPaths, expandedVars, loadingVarPath, toggleVarExpand, c])

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 启动区 */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '4px' }}>
        <input value={scriptPath} onChange={e => setScriptPath(e.target.value)} placeholder="入口脚本 (如 src/main.ts)" style={{ flex: 1, padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '9px', outline: 'none' }} />
        <input value={scriptArgs} onChange={e => setScriptArgs(e.target.value)} placeholder="参数" style={{ width: '80px', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '9px', outline: 'none' }} />
        <button onClick={handleStart} disabled={isStarting} style={{ padding: '3px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}>{isStarting ? '启动中...' : '▶ 启动'}</button>
      </div>

      {/* 暂停位置横幅 */}
      {pausedAt && (
        <div style={{
          padding: '4px 8px', background: 'rgba(245,158,11,0.12)', borderBottom: `1px solid ${c.border}`,
          fontSize: '10px', color: '#f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>⏸ 暂停于 {pausedAt.functionName || '(anonymous)'} — {pausedAt.file.replace(/\\/g, '/').split('/').pop()}:{pausedAt.line}</span>
          <button
            onClick={() => onNavigateTo?.(pausedAt.file, pausedAt.line)}
            style={{
              padding: '1px 6px', border: `1px solid #f59e0b55`, borderRadius: '2px',
              background: 'transparent', color: '#f59e0b', cursor: 'pointer', fontSize: '9px',
            }}
          >
            跳转
          </button>
        </div>
      )}

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
                <div key={`${bp.file}-${bp.line}-${i}`} style={{ padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle}`, fontSize: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: c.text, fontFamily: 'monospace' }}>{bp.file.replace(cwd + '\\', '').replace(cwd + '/', '')}:{bp.line}</span>
                    {bp.condition && (
                      <span style={{ color: '#f59e0b', fontSize: '9px', fontFamily: 'monospace' }}>if {bp.condition}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* 断点方案管理 */}
            <div style={{ borderTop: `1px solid ${c.borderSubtle}`, padding: '4px 8px', background: c.bgPanel }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '9px', color: c.textMuted }}>💾 断点方案</span>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  <button
                    onClick={() => { setShowSchemeSave(v => !v); setNewSchemeName('') }}
                    style={{
                      padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                      background: 'transparent', color: c.accent, cursor: 'pointer', fontSize: '9px',
                    }}
                    title="将当前断点列表保存为可复用方案"
                  >
                    {showSchemeSave ? '取消' : '+ 保存'}
                  </button>
                  <button
                    onClick={() => { setShowFileSchemes(v => { const next = !v; if (next) refreshFileSchemes(); return next }); setShowSchemeSave(false) }}
                    style={{
                      padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                      background: showFileSchemes ? c.accentDim : 'transparent',
                      color: showFileSchemes ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '9px',
                    }}
                    title="从文件导入断点方案（.doge/debug-schemes/）"
                  >
                    📂 导入
                  </button>
                  <button
                    onClick={handleExportScheme}
                    style={{
                      padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                      background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '9px',
                    }}
                    title="导出当前断点为文件（跨机器迁移）"
                  >
                    ⬆ 导出
                  </button>
                </div>
              </div>
              {showFileSchemes && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '3px', maxHeight: '80px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '8px', color: c.textFaint }}>📂 文件方案（.doge/debug-schemes/）</div>
                  {fileSchemes.length === 0 ? (
                    <div style={{ fontSize: '8px', color: c.textFaint }}>暂无已导出的方案文件</div>
                  ) : fileSchemes.map(s => (
                    <div
                      key={s.file}
                      onClick={() => handleImportScheme(s.file)}
                      title={`${s.breakpointCount} 个断点 · ${s.exportedAt}\n点击导入`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '2px 4px', background: c.codeBg, borderRadius: '2px', cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: c.text, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name} <span style={{ color: c.textFaint }}>({s.breakpointCount})</span>
                      </span>
                      <span style={{ color: c.accent, fontSize: '8px', flexShrink: 0 }}>⬇</span>
                    </div>
                  ))}
                </div>
              )}
              {showSchemeSave && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                  <input
                    value={newSchemeName}
                    onChange={e => setNewSchemeName(e.target.value)}
                    placeholder="方案名称（如: 关键路径调试）"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveScheme() }}
                    style={{
                      flex: 1, padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`,
                      borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSaveScheme}
                    disabled={breakpoints.length === 0}
                    style={{
                      padding: '2px 8px', border: 'none', borderRadius: '2px',
                      background: c.accent, color: '#000', cursor: breakpoints.length === 0 ? 'default' : 'pointer',
                      fontSize: '9px', fontWeight: 600, opacity: breakpoints.length === 0 ? 0.5 : 1,
                    }}
                  >
                    保存
                  </button>
                </div>
              )}
              {schemes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '90px', overflowY: 'auto' }}>
                  {schemes.map(s => (
                    <div
                      key={s.id}
                      onClick={() => handleLoadScheme(s)}
                      title={`${s.breakpoints.length} 个断点 · 保存于 ${new Date(s.savedAt).toLocaleString()}\n点击加载`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '2px 4px', background: c.codeBg, borderRadius: '2px', cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: c.accent, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name} <span style={{ color: c.textFaint }}>({s.breakpoints.length})</span>
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteScheme(s.id) }}
                        style={{ padding: '0 3px', border: 'none', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}
                        title="删除方案"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {schemes.length === 0 && !showSchemeSave && (
                <div style={{ fontSize: '8px', color: c.textFaint }}>无方案 · 保存后重启应用断点可一键恢复</div>
              )}
            </div>
            {/* 会话快照 */}
            <div style={{ borderTop: `1px solid ${c.borderSubtle}`, padding: '4px 8px', background: c.bgPanel }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '9px', color: c.textMuted }}>📸 会话快照</span>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  <button
                    onClick={() => { setShowSnapshotSave(v => !v); setSnapshotName('') }}
                    disabled={!activeSessionId}
                    style={{
                      padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                      background: 'transparent', color: activeSessionId ? c.accent : c.textFaint,
                      cursor: activeSessionId ? 'pointer' : 'default', fontSize: '9px', opacity: activeSessionId ? 1 : 0.5,
                    }}
                    title="保存当前会话配置（脚本/参数/断点/Watch）"
                  >
                    {showSnapshotSave ? '取消' : '+ 保存'}
                  </button>
                  <button
                    onClick={() => { setShowSnapshots(v => { const next = !v; if (next) refreshSnapshots(); return next }); setShowSnapshotSave(false) }}
                    style={{
                      padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '2px',
                      background: showSnapshots ? c.accentDim : 'transparent',
                      color: showSnapshots ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '9px',
                    }}
                    title="列出已保存的会话快照（.doge/debug-snapshots/）"
                  >
                    📂 恢复
                  </button>
                </div>
              </div>
              {showSnapshotSave && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                  <input
                    value={snapshotName}
                    onChange={e => setSnapshotName(e.target.value)}
                    placeholder="快照名称（如: 用户登录流程）"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveSnapshot() }}
                    style={{
                      flex: 1, padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`,
                      borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSaveSnapshot}
                    style={{
                      padding: '2px 8px', border: 'none', borderRadius: '2px',
                      background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px', fontWeight: 600,
                    }}
                  >
                    保存
                  </button>
                </div>
              )}
              {showSnapshots && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '80px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '8px', color: c.textFaint }}>📸 已保存快照（点击恢复：重启会话+断点+Watch）</div>
                  {snapshots.length === 0 ? (
                    <div style={{ fontSize: '8px', color: c.textFaint }}>暂无快照</div>
                  ) : snapshots.map(s => (
                    <div
                      key={s.file}
                      onClick={() => handleRestoreSnapshot(s.file)}
                      title={`${s.script}\n${s.breakpointCount} 断点 · ${s.watchCount} Watch · ${s.savedAt}\n点击恢复`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '2px 4px', background: c.codeBg, borderRadius: '2px', cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: c.text, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name} <span style={{ color: c.textFaint }}>({s.breakpointCount}断点)</span>
                      </span>
                      <span style={{ color: c.accent, fontSize: '8px', flexShrink: 0 }}>⏯</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${c.border}`, padding: '6px 8px', display: 'flex', gap: '4px', flexDirection: 'column' }}>
              {error && (
                <div style={{ padding: '3px 6px', background: c.errorBg, color: c.errorText, borderRadius: '2px', fontSize: '9px' }}>
                  {error}
                  <span style={{ marginLeft: '6px', cursor: 'pointer' }} onClick={() => setError(null)}>✕</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '4px' }}>
                <input value={bpFile} onChange={e => setBpFile(e.target.value)} placeholder="文件绝对路径（如 D:/proj/src/main.js）" style={{ flex: 1, padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
                <input value={bpLine} onChange={e => setBpLine(e.target.value)} placeholder="行号" style={{ width: '50px', padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
                <button onClick={handleSetBreakpoint} style={{ padding: '2px 6px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px' }}>+</button>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <input value={bpCondition} onChange={e => setBpCondition(e.target.value)} placeholder="条件（可选，如 i &gt; 5 / status === 'error'）" style={{ flex: 1, padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none', fontFamily: 'monospace' }} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'stack' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {callStack.length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>调用栈为空（会话未暂停）</div> : callStack.map((frame, i) => (
              <div
                key={i}
                onClick={() => onNavigateTo?.(frame.file, frame.line)}
                style={{
                  padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle}`, fontSize: '10px',
                  cursor: onNavigateTo && frame.file ? 'pointer' : 'default',
                  background: i === 0 && pausedAt ? 'rgba(245,158,11,0.08)' : 'transparent',
                }}
                title={frame.file}
              >
                <div style={{ color: c.accent, fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{frame.name}</span>
                  {i === 0 && pausedAt && <span style={{ color: '#f59e0b', fontSize: '9px' }}>← 当前帧</span>}
                </div>
                <div style={{ color: c.textFaint, fontSize: '9px', fontFamily: 'monospace' }}>
                  {frame.file.replace(cwd + '\\', '').replace(cwd + '/', '')}:{frame.line}:{frame.column}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'vars' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Watch 表达式区 */}
            <div style={{ padding: '6px 8px', borderBottom: `1px solid ${c.borderSubtle}` }}>
              <div style={{ fontSize: '9px', color: c.textMuted, marginBottom: '4px' }}>👁 Watch 表达式（暂停时求值）</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={newWatch}
                  onChange={e => setNewWatch(e.target.value)}
                  placeholder="如: this.count / process.pid"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newWatch.trim()) {
                      setWatchExpressions(prev => [...prev, newWatch.trim()])
                      setNewWatch('')
                      if (pausedAt) setTimeout(refreshWatches, 50)
                    }
                  }}
                  style={{
                    flex: 1, padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`,
                    borderRadius: '3px', color: c.text, fontSize: '9px', outline: 'none', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={() => {
                    if (newWatch.trim()) {
                      setWatchExpressions(prev => [...prev, newWatch.trim()])
                      setNewWatch('')
                      if (pausedAt) setTimeout(refreshWatches, 50)
                    }
                  }}
                  style={{
                    padding: '3px 8px', border: 'none', borderRadius: '3px',
                    background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px', fontWeight: 600,
                  }}
                >
                  +
                </button>
              </div>
              {watchExpressions.length > 0 && (
                <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {watchExpressions.map(expr => (
                    <div key={expr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', padding: '2px 4px', background: c.codeBg, borderRadius: '2px' }}>
                      <span style={{ color: c.accent, fontFamily: 'monospace' }}>{expr}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: c.text, fontFamily: 'monospace', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {watchResults[expr] ?? '—'}
                        </span>
                        <button
                          onClick={() => setWatchExpressions(prev => prev.filter(e => e !== expr))}
                          style={{ padding: '0 3px', border: 'none', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {Object.keys(variables).length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>无变量（会话未暂停）</div> : Object.entries(variables).map(([k, v]) => {
              const obj = variableObjects[k]
              return renderVarTree(k, k, String(v), !!obj && !!obj.objectId, obj?.objectId, 0)
            })}
          </div>
        )}

        {activeTab === 'eval' && (
          <div style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                value={evalExpr}
                onChange={e => { setEvalExpr(e.target.value); setEvalHistoryIdx(-1) }}
                placeholder="输入表达式 (如: process.pid)"
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleEval() }
                  else if (e.key === 'ArrowUp' && evalHistory.length > 0) {
                    e.preventDefault()
                    const next = evalHistoryIdx < 0 ? evalHistory.length - 1 : Math.max(0, evalHistoryIdx - 1)
                    setEvalHistoryIdx(next)
                    setEvalExpr(evalHistory[next] || '')
                  } else if (e.key === 'ArrowDown' && evalHistoryIdx >= 0) {
                    e.preventDefault()
                    if (evalHistoryIdx === evalHistory.length - 1) { setEvalHistoryIdx(-1); setEvalExpr('') }
                    else { const next = evalHistoryIdx + 1; setEvalHistoryIdx(next); setEvalExpr(evalHistory[next] || '') }
                  }
                }}
                style={{ flex: 1, padding: '4px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none', fontFamily: 'monospace' }}
              />
              <button onClick={handleEval} disabled={!activeSessionId} style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>求值</button>
              {evalHistory.length > 0 && (
                <button
                  onClick={() => setShowEvalHistory(v => !v)}
                  title="表达式历史"
                  style={{ padding: '4px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: showEvalHistory ? c.accentDim : c.bgPanel, color: showEvalHistory ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px' }}
                >
                  🕘 {evalHistory.length}
                </button>
              )}
            </div>
            {showEvalHistory && evalHistory.length > 0 && (
              <div style={{ marginTop: '4px', maxHeight: '80px', overflowY: 'auto', border: `1px solid ${c.borderSubtle}`, borderRadius: '3px', background: c.bgPanel, padding: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '9px', color: c.textMuted }}>🕘 历史（↑↓ 键浏览）</span>
                  <button
                    onClick={() => { setEvalHistory([]); saveEvalHistory([]); setShowEvalHistory(false) }}
                    style={{ padding: '0 4px', border: 'none', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}
                    title="清空历史"
                  >
                    清空
                  </button>
                </div>
                {evalHistory.map((h, i) => (
                  <div
                    key={`${h}-${i}`}
                    onClick={() => { setEvalExpr(h); setEvalHistoryIdx(i); setShowEvalHistory(false) }}
                    style={{ padding: '2px 4px', cursor: 'pointer', fontSize: '9px', fontFamily: 'monospace', color: evalHistoryIdx === i ? c.accent : c.text, background: evalHistoryIdx === i ? c.accentDim : 'transparent', borderRadius: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {h}
                  </div>
                ))}
              </div>
            )}
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
