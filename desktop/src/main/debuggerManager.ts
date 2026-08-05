/**
 * debuggerManager.ts — 真实 Node.js 调试器后端（CDP / Inspector 协议）
 *
 * 替换 index.ts 中只 spawn 进程不连接 inspector 的伪实现。
 * - 启动 --inspect-brk 子进程，从 stderr 解析 ws:// 调试 URL
 * - 使用 Node 原生 WebSocket（Electron 43 / Node 22+）连接 CDP endpoint
 * - Debugger.enable / setBreakpointByUrl / resume / pause / stepOver / stepInto / stepOut
 * - Runtime.evaluate 表达式求值
 * - Debugger.paused 事件 → 调用栈 + 作用域变量
 */

import { spawn, type ChildProcess } from 'node:child_process'
import * as path from 'node:path'

// ─── 类型 ───

export interface DebugBreakpoint {
  file: string
  line: number
  condition?: string
  breakpointId?: string
}

export interface DebugCallFrame {
  name: string
  file: string
  line: number
  column: number
}

export interface DebugSessionInfo {
  id: string
  pid: number
  isRunning: boolean
  isPaused: boolean
  breakpointCount: number
  script: string
}

interface CDPMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
}

interface CallFrameParams {
  callFrames?: Array<{
    functionName?: string
    location?: { scriptId?: string; lineNumber?: number; columnNumber?: number }
    scopeChain?: Array<{ type?: string; object?: { objectId?: string } }>
  }>
  reason?: string
}

// ─── CDP 会话 ───

interface DebugSession {
  id: string
  pid: number
  script: string
  args: string[]
  child: ChildProcess
  ws: WebSocket | null
  nextId: number
  pending: Map<number, (msg: CDPMessage) => void>
  isPaused: boolean
  breakpoints: DebugBreakpoint[]
  callStack: DebugCallFrame[]
  variables: Record<string, string>
  /** 变量 → 对象引用（用于嵌套展开） */
  variableObjects: Record<string, { objectId: string; type: string; description?: string }>
  scriptIdToUrl: Map<string, string>
  urlToScriptId: Map<string, string>
  lastEvalResult: { result: string; type: string } | null
}

// ─── 对象属性（变量嵌套展开用） ───

export interface ObjectProperty {
  name: string
  type: string
  value?: string
  objectId?: string
  isExpandable: boolean
}

// ─── 调试器管理器 ───

export class DebuggerManager {
  private sessions = new Map<string, DebugSession>()

  list(): DebugSessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      pid: s.pid,
      isRunning: !s.isPaused,
      isPaused: s.isPaused,
      breakpointCount: s.breakpoints.length,
      script: s.script,
    }))
  }

  get(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 启动调试会话：spawn --inspect-brk 子进程并连接 CDP
   */
  async start(cwd: string, script: string, args: string[] = []): Promise<{ sessionId: string; pid: number; error?: string }> {
    const sessionId = `dbg-${Date.now()}`
    // 使用 --inspect-brk 固定端口 0（自动分配），解析 ws URL
    const child = spawn(process.execPath, ['--inspect-brk=0', script, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })

    const session: DebugSession = {
      id: sessionId,
      pid: child.pid || 0,
      script,
      args,
      child,
      ws: null,
      nextId: 1,
      pending: new Map(),
      isPaused: true,
      breakpoints: [],
      callStack: [],
      variables: {},
      variableObjects: {},
      scriptIdToUrl: new Map(),
      urlToScriptId: new Map(),
      lastEvalResult: null,
    }
    this.sessions.set(sessionId, session)

    // 从 stderr 解析 ws:// URL（Node 输出 "Debugger listening on ws://..."）
    const wsUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('等待调试端口超时')), 10000)
      const onData = (buf: Buffer) => {
        const text = buf.toString()
        const m = text.match(/ws:\/\/[^\s]+/)
        if (m) {
          clearTimeout(timeout)
          child.stderr?.off('data', onData)
          resolve(m[0])
        }
      }
      child.stderr?.on('data', onData)
      child.once('exit', (code) => {
        clearTimeout(timeout)
        reject(new Error(`调试进程提前退出 (code ${code})`))
      })
    })

    // 连接 CDP
    try {
      const ws = new WebSocket(wsUrl)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000)
        ws.onopen = () => { clearTimeout(timer); resolve() }
        ws.onerror = (e) => { clearTimeout(timer); reject(new Error(`WebSocket 错误: ${e instanceof Error ? e.message : String(e)}`)) }
      })

      session.ws = ws
      ws.onmessage = (event) => this.handleMessage(session, event)
      ws.onclose = () => {
        session.isPaused = false
        try { session.child.kill() } catch { /* ignore */ }
      }

      await this.send(session, 'Debugger.enable')
      await this.send(session, 'Runtime.enable')
      // 等待首次暂停（--inspect-brk）
      await this.waitPaused(session)
      // 收集初始脚本映射
      await this.send(session, 'Debugger.getScriptSource', {})
      return { sessionId, pid: child.pid || 0 }
    } catch (e) {
      try { child.kill() } catch { /* ignore */ }
      this.sessions.delete(sessionId)
      return { sessionId: '', pid: 0, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async stop(sessionId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    try { s.ws?.close() } catch { /* ignore */ }
    try { s.child.kill() } catch { /* ignore */ }
    this.sessions.delete(sessionId)
    return true
  }

  async setBreakpoint(sessionId: string, file: string, line: number, condition?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const s = this.sessions.get(sessionId)
    if (!s) return { success: false, error: '会话不存在' }
    // 已有断点则更新条件
    const existing = s.breakpoints.find(b => b.file === file && b.line === line)
    if (existing) {
      if (condition !== undefined) existing.condition = condition
      return { success: true, message: '已更新' }
    }
    const scriptId = this.findScriptId(s, file)
    if (!scriptId) return { success: false, error: `无法定位脚本: ${file}（可能未加载）` }
    try {
      const res = await this.send(s, 'Debugger.setBreakpointByUrl', {
        lineNumber: line - 1, // CDP 是 0-based
        url: undefined,
        urlRegex: undefined,
        scriptId,
        condition: condition || undefined,
      })
      const bp = res?.breakpointId ? { file, line, condition, breakpointId: res.breakpointId as string } : { file, line, condition }
      s.breakpoints.push(bp)
      return { success: true, message: '断点已设置', breakpointId: bp.breakpointId }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  removeBreakpoint(sessionId: string, file: string, line: number): boolean {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    const idx = s.breakpoints.findIndex(b => b.file === file && b.line === line)
    if (idx === -1) return false
    const [bp] = s.breakpoints.splice(idx, 1)
    if (bp.breakpointId) {
      void this.send(s, 'Debugger.removeBreakpoint', { breakpointId: bp.breakpointId }).catch(() => { /* ignore */ })
    }
    return true
  }

  listBreakpoints(sessionId: string): DebugBreakpoint[] {
    return this.sessions.get(sessionId)?.breakpoints || []
  }

  /** 获取会话配置（快照用）：脚本路径 + 参数 + 断点 */
  getSessionConfig(sessionId: string): { script: string; args: string[]; breakpoints: DebugBreakpoint[] } | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return { script: s.script, args: s.args || [], breakpoints: s.breakpoints.map(b => ({ file: b.file, line: b.line, condition: b.condition })) }
  }

  async resume(sessionId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId)
    if (!s || !s.isPaused) return false
    s.isPaused = false
    s.callStack = []
    s.variables = {}
    s.variableObjects = {}
    await this.send(s, 'Debugger.resume')
    return true
  }

  async pause(sessionId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId)
    if (!s || s.isPaused) return false
    await this.send(s, 'Debugger.pause')
    return true
  }

  async step(sessionId: string, kind: 'over' | 'into' | 'out'): Promise<boolean> {
    const s = this.sessions.get(sessionId)
    if (!s || !s.isPaused) return false
    const method = kind === 'over' ? 'Debugger.stepOver' : kind === 'into' ? 'Debugger.stepInto' : 'Debugger.stepOut'
    s.isPaused = false
    await this.send(s, method)
    return true
  }

  async evaluate(sessionId: string, expression: string): Promise<{ success: boolean; result?: string; type?: string; error?: string }> {
    const s = this.sessions.get(sessionId)
    if (!s) return { success: false, error: '会话不存在' }
    try {
      const res = await this.send(s, 'Runtime.evaluate', { expression, returnByValue: true })
      const r = res?.result as { result?: { type?: string; value?: unknown; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } } | undefined
      if (r?.exceptionDetails) {
        const desc = r.exceptionDetails.exception?.description || r.exceptionDetails.text || '异常'
        return { success: false, error: desc }
      }
      const v = r?.result
      const val = v?.value !== undefined ? String(v.value) : (v?.description ?? 'undefined')
      return { success: true, result: val, type: v?.type || 'unknown' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 获取对象的子属性（变量嵌套展开用） */
  async getObjectProperties(sessionId: string, objectId: string): Promise<{ success: boolean; properties?: ObjectProperty[]; error?: string }> {
    const s = this.sessions.get(sessionId)
    if (!s) return { success: false, error: '会话不存在' }
    if (!objectId) return { success: false, error: '缺少 objectId' }
    try {
      const res = await this.send(s, 'Runtime.getProperties', { objectId, ownProperties: true })
      const raw = (res?.result as Array<{ name?: string; value?: { description?: string; value?: unknown; type?: string; objectId?: string } }>) || []
      const properties: ObjectProperty[] = []
      for (const p of raw) {
        if (!p.name) continue
        if (p.name.startsWith('#')) continue // 忽略 V8 内部属性
        const v = p.value
        const val = String(v?.value ?? v?.description ?? '')
        const isExpandable = v?.type === 'object' && !!v.objectId && v.objectId !== objectId
        properties.push({
          name: p.name,
          type: v?.type || 'unknown',
          value: val,
          ...(isExpandable && v?.objectId ? { objectId: v.objectId } : {}),
          isExpandable,
        })
      }
      return { success: true, properties }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // ─── 内部：CDP 消息 ───

  private handleMessage(s: DebugSession, event: MessageEvent): void {
    let msg: CDPMessage
    try { msg = JSON.parse(String(event.data)) } catch { return }

    if (msg.id !== undefined) {
      const pending = s.pending.get(msg.id)
      if (pending) { s.pending.delete(msg.id); pending(msg) }
      return
    }

    switch (msg.method) {
      case 'Debugger.paused':
        this.onPaused(s, msg.params as CallFrameParams)
        break
      case 'Debugger.scriptParsed': {
        const p = msg.params as Record<string, unknown>
        const scriptId = String(p.scriptId || '')
        const url = String(p.url || '')
        if (scriptId && url) {
          s.scriptIdToUrl.set(scriptId, url)
          s.urlToScriptId.set(url, scriptId)
        }
        break
      }
      case 'Debugger.resumed':
        s.isPaused = false
        break
      default:
        break
    }
  }

  private onPaused(s: DebugSession, params: CallFrameParams): void {
    s.isPaused = true
    s.callStack = []
    s.variables = {}

    for (const frame of params.callFrames || []) {
      const loc = frame.location
      const scriptId = loc?.scriptId || ''
      const url = s.scriptIdToUrl.get(scriptId) || ''
      s.callStack.push({
        name: frame.functionName || '(anonymous)',
        file: url,
        line: (loc?.lineNumber ?? 0) + 1, // 转 1-based
        column: (loc?.columnNumber ?? 0) + 1,
      })
      // 提取局部变量（第一个 scope）
      const scope = frame.scopeChain?.[0]
      if (scope?.object?.objectId) {
        this.send(s, 'Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true })
          .then(res => {
            const props = (res?.result as Array<{ name?: string; value?: { description?: string; value?: unknown; type?: string; objectId?: string } }>) || []
            for (const p of props) {
              if (!p.name) continue
              const v = p.value
              const val = v?.value !== undefined ? String(v.value) : (v?.description ?? '')
              s.variables[p.name] = val
            }
            // 保留对象引用（对象/数组等可展开的）
            for (const p of props) {
              const v = p.value
              if (v?.type === 'object' && v.objectId && p.name) {
                s.variableObjects[p.name] = { objectId: v.objectId, type: v.type, description: String(v.description ?? '') }
              }
            }
          })
          .catch(() => { /* ignore */ })
      }
    }

    // 推送暂停事件到渲染进程（断点命中高亮）
    const topFrame = s.callStack[0]
    if (topFrame && topFrame.file) {
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('doge:debug-paused', {
          sessionId: s.id,
          pid: s.pid,
          reason: params.reason || 'breakpoint',
          file: topFrame.file,
          line: topFrame.line,
          functionName: topFrame.name,
          stackDepth: s.callStack.length,
        })
      })
    }
  }

  private findScriptId(s: DebugSession, filePath: string): string | null {
    const normalized = path.resolve(filePath)
    for (const [scriptId, url] of s.scriptIdToUrl) {
      try {
        if (path.resolve(url) === normalized) return scriptId
      } catch { /* ignore */ }
      if (url === filePath) return scriptId
      if (url.includes(filePath) || filePath.includes(url)) return scriptId
    }
    return null
  }

  private send(s: DebugSession, method: string, params?: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
      if (!s.ws) { reject(new Error('WebSocket 未连接')); return }
      const id = s.nextId++
      const timer = setTimeout(() => { s.pending.delete(id); reject(new Error(`CDP 调用超时: ${method}`)) }, 5000)
      s.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg.result) })
      try {
        s.ws.send(JSON.stringify({ id, method, params: params || {} }))
      } catch (e) {
        clearTimeout(timer)
        s.pending.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  private waitPaused(s: DebugSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等待断点暂停超时')), 10000)
      const check = (): boolean => {
        if (s.isPaused) { clearTimeout(timer); resolve(); return true }
        return false
      }
      if (check()) return
      const iv = setInterval(() => {
        if (check()) clearInterval(iv)
      }, 100)
      // 10s 后清理
      setTimeout(() => clearInterval(iv), 11000).unref?.()
    })
  }
}

export function createDebuggerManager(): DebuggerManager {
  return new DebuggerManager()
}
