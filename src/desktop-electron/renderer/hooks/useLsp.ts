/**
 * useLsp — LSP 客户端 Hook
 *
 * 提供 LSP 功能调用：
 * - 启动/停止 LSP 服务器
 * - 代码补全、转到定义、悬停、查找引用
 * - 文档符号、工作区符号
 * - 诊断信息订阅
 */

import { useState, useCallback, useEffect, useRef } from 'react'

// ─── 类型定义 ───

export interface LspServerState {
  name: string
  languageId: string
  connected: boolean
  initializing: boolean
  pid?: number
  error?: string
}

export interface LspCompletionItem {
  label: string
  insertText: string
  kind?: number
  detail?: string
  documentation?: string
}

export interface LspLocation {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  severity: number
  message: string
  source?: string
  code?: string | number
}

export interface LspSymbol {
  name: string
  kind: number
  uri?: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  containerName?: string
}

export interface LspHighlight {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  kind: number
}

// ─── Hook ───

export interface UseLspReturn {
  // 服务器状态
  connectedServers: string[]
  isConnected: boolean
  serverStates: Map<string, LspServerState>
  error: string | null

  // 操作
  startServer: (languageId: string) => Promise<{ success: boolean; error?: string }>
  stopServer: (languageId: string) => Promise<{ success: boolean; error?: string }>
  stopAll: () => Promise<{ success: boolean; error?: string }>

  // LSP 功能
  completion: (filePath: string, line: number, character: number) => Promise<LspCompletionItem[]>
  definition: (filePath: string, line: number, character: number) => Promise<LspLocation[]>
  hover: (filePath: string, line: number, character: number) => Promise<{ contents?: unknown } | null>
  references: (filePath: string, line: number, character: number) => Promise<LspLocation[]>
  documentSymbol: (filePath: string) => Promise<LspSymbol[]>
  workspaceSymbol: (query: string) => Promise<LspSymbol[]>
  documentHighlight: (filePath: string, line: number, character: number) => Promise<LspHighlight[]>

  // 诊断
  diagnostics: Map<string, LspDiagnostic[]>
  onDiagnostic: (callback: (uri: string, diagnostics: LspDiagnostic[]) => void) => () => void
}

export function useLsp(): UseLspReturn {
  const [connectedServers, setConnectedServers] = useState<string[]>([])
  const [serverStates, setServerStates] = useState<Map<string, LspServerState>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<Map<string, LspDiagnostic[]>>(new Map())
  const diagnosticCallbackRef = useRef<((uri: string, diagnostics: LspDiagnostic[]) => void) | null>(null)

  // 订阅诊断事件
  useEffect(() => {
    if (!window.dogeAPI.onLspDiagnostic) return

    const cleanup = window.dogeAPI.onLspDiagnostic((uri: string, diags: LspDiagnostic[]) => {
      setDiagnostics(prev => {
        const next = new Map(prev)
        next.set(uri, diags)
        return next
      })
      if (diagnosticCallbackRef.current) {
        diagnosticCallbackRef.current(uri, diags)
      }
    })

    return cleanup
  }, [])

  // 刷新服务器列表
  const refreshServers = useCallback(async () => {
    try {
      if (!window.dogeAPI.lspConnectedServers) return
      const result = await window.dogeAPI.lspConnectedServers()
      if (result.success && result.servers) {
        setConnectedServers(result.servers)
      }
    } catch {
      // 静默忽略
    }
  }, [])

  // 定期刷新服务器状态
  useEffect(() => {
    refreshServers()
    const interval = setInterval(refreshServers, 5000)
    return () => clearInterval(interval)
  }, [refreshServers])

  const startServer = useCallback(async (languageId: string) => {
    setError(null)
    try {
      if (!window.dogeAPI.lspStart) {
        return { success: false, error: 'LSP API 不可用' }
      }
      const result = await window.dogeAPI.lspStart(languageId)
      if (result.error) setError(result.error)
      await refreshServers()
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : '启动 LSP 服务器失败'
      setError(message)
      return { success: false, error: message }
    }
  }, [refreshServers])

  const stopServer = useCallback(async (languageId: string) => {
    setError(null)
    try {
      if (!window.dogeAPI.lspStop) {
        return { success: false, error: 'LSP API 不可用' }
      }
      const result = await window.dogeAPI.lspStop(languageId)
      if (result.error) setError(result.error)
      await refreshServers()
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : '停止 LSP 服务器失败'
      setError(message)
      return { success: false, error: message }
    }
  }, [refreshServers])

  const stopAll = useCallback(async () => {
    setError(null)
    try {
      if (!window.dogeAPI.lspStopAll) {
        return { success: false, error: 'LSP API 不可用' }
      }
      const result = await window.dogeAPI.lspStopAll()
      if (result.error) setError(result.error)
      setDiagnostics(new Map())
      await refreshServers()
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : '停止 LSP 服务器失败'
      setError(message)
      return { success: false, error: message }
    }
  }, [refreshServers])

  const completion = useCallback(async (filePath: string, line: number, character: number): Promise<LspCompletionItem[]> => {
    try {
      if (!window.dogeAPI.lspCompletion) return []
      const result = await window.dogeAPI.lspCompletion(filePath, line, character)
      if (result.success && result.items) return result.items
      return []
    } catch {
      return []
    }
  }, [])

  const definition = useCallback(async (filePath: string, line: number, character: number): Promise<LspLocation[]> => {
    try {
      if (!window.dogeAPI.lspDefinition) return []
      const result = await window.dogeAPI.lspDefinition(filePath, line, character)
      if (result.success && result.locations) return result.locations
      return []
    } catch {
      return []
    }
  }, [])

  const hover = useCallback(async (filePath: string, line: number, character: number) => {
    try {
      if (!window.dogeAPI.lspHover) return null
      const result = await window.dogeAPI.lspHover(filePath, line, character)
      if (result.success && result.result) return result.result
      return null
    } catch {
      return null
    }
  }, [])

  const references = useCallback(async (filePath: string, line: number, character: number): Promise<LspLocation[]> => {
    try {
      if (!window.dogeAPI.lspReferences) return []
      const result = await window.dogeAPI.lspReferences(filePath, line, character)
      if (result.success && result.locations) return result.locations
      return []
    } catch {
      return []
    }
  }, [])

  const documentSymbol = useCallback(async (filePath: string): Promise<LspSymbol[]> => {
    try {
      if (!window.dogeAPI.lspDocumentSymbol) return []
      const result = await window.dogeAPI.lspDocumentSymbol(filePath)
      if (result.success && result.symbols) return result.symbols
      return []
    } catch {
      return []
    }
  }, [])

  const workspaceSymbol = useCallback(async (query: string): Promise<LspSymbol[]> => {
    try {
      if (!window.dogeAPI.lspWorkspaceSymbol) return []
      const result = await window.dogeAPI.lspWorkspaceSymbol(query)
      if (result.success && result.symbols) {
        // 适配 IPC 返回格式（location.uri + location.range）到 LspSymbol 格式（uri + range）
        return result.symbols.map((s: any) => ({
          name: s.name,
          kind: s.kind,
          uri: s.location?.uri || s.uri,
          range: s.location?.range || s.range,
        }))
      }
      return []
    } catch {
      return []
    }
  }, [])

  const documentHighlight = useCallback(async (filePath: string, line: number, character: number): Promise<LspHighlight[]> => {
    try {
      if (!window.dogeAPI.lspDocumentHighlight) return []
      const result = await window.dogeAPI.lspDocumentHighlight(filePath, line, character)
      if (result.success && result.highlights) return result.highlights
      return []
    } catch {
      return []
    }
  }, [])

  const onDiagnostic = useCallback((callback: (uri: string, diagnostics: LspDiagnostic[]) => void) => {
    diagnosticCallbackRef.current = callback
    return () => {
      diagnosticCallbackRef.current = null
    }
  }, [])

  return {
    connectedServers,
    isConnected: connectedServers.length > 0,
    serverStates,
    error,
    startServer,
    stopServer,
    stopAll,
    completion,
    definition,
    hover,
    references,
    documentSymbol,
    workspaceSymbol,
    documentHighlight,
    diagnostics,
    onDiagnostic,
  }
}
