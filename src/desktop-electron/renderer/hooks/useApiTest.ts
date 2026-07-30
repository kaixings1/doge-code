/**
 * useApiTest — API 测试工具 Hook
 *
 * 提供 API 测试功能：
 * - 请求发送逻辑（通过 IPC）
 * - 请求/响应状态管理
 * - 集合管理（增删改查）
 * - 环境变量管理
 * - 历史记录管理（localStorage 持久化）
 */

import { useCallback, useRef, useState } from 'react'

// ─── 类型定义 ───

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type BodyType = 'json' | 'text' | 'raw'
export type EnvName = 'dev' | 'test' | 'prod'

export interface ApiHeader {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: ApiHeader[]
  bodyType: BodyType
  body: string
  collectionId?: string
  createdAt: number
}

export interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  duration: number
  size: number
}

export interface ApiCollection {
  id: string
  name: string
  requestIds: string[]
  createdAt: number
}

export interface Environment {
  name: EnvName
  variables: Record<string, string>
}

export interface HistoryEntry {
  id: string
  request: ApiRequest
  response: ApiResponse | null
  timestamp: number
}

// ─── 常量 ───

const STORAGE_KEY_REQUESTS = 'doge-api-requests'
const STORAGE_KEY_COLLECTIONS = 'doge-api-collections'
const STORAGE_KEY_ENVIRONMENTS = 'doge-api-environments'
const STORAGE_KEY_HISTORY = 'doge-api-history'
const MAX_HISTORY = 50
const MAX_REQUESTS = 200

// ─── 持久化工具 ───

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    if (saved) return JSON.parse(saved) as T
  } catch { /* ignore */ }
  return fallback
}

function saveJSON<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* ignore */ }
}

// ─── 默认值 ───

function createDefaultEnvironment(): Environment {
  return { name: 'dev', variables: { baseUrl: 'http://localhost:3000', token: '' } }
}

function createDefaultRequest(): ApiRequest {
  return {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'New Request',
    method: 'GET',
    url: '',
    headers: [],
    bodyType: 'json',
    body: '',
    createdAt: Date.now(),
  }
}

// ─── Hook ───

export interface UseApiTestReturn {
  // 请求状态
  requests: ApiRequest[]
  collections: ApiCollection[]
  environments: Environment[]
  activeEnv: EnvName
  history: HistoryEntry[]
  currentRequest: ApiRequest
  currentResponse: ApiResponse | null
  isLoading: boolean

  // 请求操作
  setCurrentRequest: (req: ApiRequest) => void
  updateRequest: (updates: Partial<ApiRequest>) => void
  sendRequest: () => Promise<ApiResponse | null>
  saveRequest: (name?: string) => void
  deleteRequest: (id: string) => void
  duplicateRequest: (id: string) => void
  createRequest: () => void

  // 集合管理
  createCollection: (name: string) => void
  deleteCollection: (id: string) => void
  addToCollection: (requestId: string, collectionId: string) => void
  removeFromCollection: (requestId: string, collectionId: string) => void

  // 环境管理
  setActiveEnv: (env: EnvName) => void
  updateEnvironment: (env: EnvName, variables: Record<string, string>) => void

  // 历史管理
  clearHistory: () => void
  replayHistoryEntry: (entryId: string) => void
  searchHistory: (query: string) => HistoryEntry[]
}

export function useApiTest(): UseApiTestReturn {
  const [requests, setRequests] = useState<ApiRequest[]>(() =>
    loadJSON<ApiRequest[]>(STORAGE_KEY_REQUESTS, [])
  )
  const [collections, setCollections] = useState<ApiCollection[]>(() =>
    loadJSON<ApiCollection[]>(STORAGE_KEY_COLLECTIONS, [])
  )
  const [environments, setEnvironments] = useState<Environment[]>(() =>
    loadJSON<Environment[]>(STORAGE_KEY_ENVIRONMENTS, [createDefaultEnvironment()])
  )
  const [activeEnv, setActiveEnv] = useState<EnvName>('dev')
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadJSON<HistoryEntry[]>(STORAGE_KEY_HISTORY, [])
  )
  const [currentRequest, setCurrentRequest] = useState<ApiRequest>(createDefaultRequest)
  const [currentResponse, setCurrentResponse] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const sendAbortRef = useRef<AbortController | null>(null)

  // ─── 持久化同步 ───
  const persistRequests = useCallback((next: ApiRequest[]) => {
    setRequests(next)
    saveJSON(STORAGE_KEY_REQUESTS, next.slice(-MAX_REQUESTS))
  }, [])

  const persistCollections = useCallback((next: ApiCollection[]) => {
    setCollections(next)
    saveJSON(STORAGE_KEY_COLLECTIONS, next)
  }, [])

  const persistEnvironments = useCallback((next: Environment[]) => {
    setEnvironments(next)
    saveJSON(STORAGE_KEY_ENVIRONMENTS, next)
  }, [])

  const persistHistory = useCallback((next: HistoryEntry[]) => {
    const trimmed = next.slice(-MAX_HISTORY)
    setHistory(trimmed)
    saveJSON(STORAGE_KEY_HISTORY, trimmed)
  }, [])

  // ─── 环境变量替换 ───
  const replaceEnvVars = useCallback((text: string): string => {
    const env = environments.find(e => e.name === activeEnv)
    if (!env) return text
    return text.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
      return env.variables[varName] || `{{${varName}}}`
    })
  }, [environments, activeEnv])

  // ─── 发送请求 ───
  const sendRequest = useCallback(async (): Promise<ApiResponse | null> => {
    if (!currentRequest.url.trim()) return null

    if (sendAbortRef.current) {
      sendAbortRef.current.abort()
    }
    sendAbortRef.current = new AbortController()

    setIsLoading(true)
    setCurrentResponse(null)
    const startTime = Date.now()

    try {
      const resolvedUrl = replaceEnvVars(currentRequest.url)
      const resolvedHeaders: Record<string, string> = {}
      currentRequest.headers
        .filter(h => h.enabled && h.key.trim())
        .forEach(h => { resolvedHeaders[h.key.trim()] = replaceEnvVars(h.value) })

      let resolvedBody = ''
      if (currentRequest.method !== 'GET' && currentRequest.body) {
        resolvedBody = replaceEnvVars(currentRequest.body)
      }

      // 通过 IPC 发送请求（主进程代理以绕过 CORS）
      const result = await window.dogeAPI.apiTestSend({
        url: resolvedUrl,
        method: currentRequest.method,
        headers: resolvedHeaders,
        body: resolvedBody || undefined,
        bodyType: currentRequest.bodyType,
      })

      const duration = Date.now() - startTime

      if (result.success) {
        const response: ApiResponse = {
          status: result.status || 0,
          statusText: result.statusText || '',
          headers: result.responseHeaders || {},
          body: result.body || '',
          duration,
          size: (result.body || '').length,
        }
        setCurrentResponse(response)

        // 添加到历史
        const entry: HistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          request: { ...currentRequest },
          response,
          timestamp: Date.now(),
        }
        persistHistory([...history, entry])

        return response
      } else {
        const errorResponse: ApiResponse = {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: result.error || 'Unknown error',
          duration,
          size: 0,
        }
        setCurrentResponse(errorResponse)
        return errorResponse
      }
    } catch (err) {
      const duration = Date.now() - startTime
      const errorResponse: ApiResponse = {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: err instanceof Error ? err.message : 'Request failed',
        duration,
        size: 0,
      }
      setCurrentResponse(errorResponse)
      return errorResponse
    } finally {
      setIsLoading(false)
      sendAbortRef.current = null
    }
  }, [currentRequest, replaceEnvVars, history, persistHistory])

  // ─── 请求 CRUD ───
  const updateRequest = useCallback((updates: Partial<ApiRequest>) => {
    setCurrentRequest(prev => ({ ...prev, ...updates }))
  }, [])

  const saveRequest = useCallback((name?: string) => {
    const reqToSave = name ? { ...currentRequest, name } : currentRequest
    const existing = requests.findIndex(r => r.id === reqToSave.id)
    if (existing >= 0) {
      const next = [...requests]
      next[existing] = reqToSave
      persistRequests(next)
    } else {
      persistRequests([...requests, reqToSave])
    }
  }, [currentRequest, requests, persistRequests])

  const deleteRequest = useCallback((id: string) => {
    persistRequests(requests.filter(r => r.id !== id))
  }, [requests, persistRequests])

  const duplicateRequest = useCallback((id: string) => {
    const original = requests.find(r => r.id === id)
    if (!original) return
    const duplicate: ApiRequest = {
      ...original,
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${original.name} (copy)`,
      createdAt: Date.now(),
    }
    persistRequests([...requests, duplicate])
  }, [requests, persistRequests])

  const createRequest = useCallback(() => {
    setCurrentRequest(createDefaultRequest())
  }, [])

  // ─── 集合管理 ───
  const createCollection = useCallback((name: string) => {
    const collection: ApiCollection = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      requestIds: [],
      createdAt: Date.now(),
    }
    persistCollections([...collections, collection])
  }, [collections, persistCollections])

  const deleteCollection = useCallback((id: string) => {
    persistCollections(collections.filter(c => c.id !== id))
  }, [collections, persistCollections])

  const addToCollection = useCallback((requestId: string, collectionId: string) => {
    const next = collections.map(c => {
      if (c.id === collectionId && !c.requestIds.includes(requestId)) {
        return { ...c, requestIds: [...c.requestIds, requestId] }
      }
      return c
    })
    persistCollections(next)
  }, [collections, persistCollections])

  const removeFromCollection = useCallback((requestId: string, collectionId: string) => {
    const next = collections.map(c => {
      if (c.id === collectionId) {
        return { ...c, requestIds: c.requestIds.filter(id => id !== requestId) }
      }
      return c
    })
    persistCollections(next)
  }, [collections, persistCollections])

  // ─── 环境管理 ───
  const updateEnvironment = useCallback((envName: EnvName, variables: Record<string, string>) => {
    const next = environments.map(e => e.name === envName ? { ...e, variables } : e)
    persistEnvironments(next)
  }, [environments, persistEnvironments])

  // ─── 历史管理 ───
  const clearHistory = useCallback(() => {
    persistHistory([])
  }, [persistHistory])

  const replayHistoryEntry = useCallback((entryId: string) => {
    const entry = history.find(h => h.id === entryId)
    if (entry) {
      setCurrentRequest({ ...entry.request, id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
    }
  }, [history])

  const searchHistory = useCallback((query: string): HistoryEntry[] => {
    if (!query.trim()) return history
    const lower = query.toLowerCase()
    return history.filter(h =>
      h.request.url.toLowerCase().includes(lower) ||
      h.request.name.toLowerCase().includes(lower) ||
      h.request.method.toLowerCase().includes(lower)
    )
  }, [history])

  return {
    requests,
    collections,
    environments,
    activeEnv,
    history,
    currentRequest,
    currentResponse,
    isLoading,
    setCurrentRequest,
    updateRequest,
    sendRequest,
    saveRequest,
    deleteRequest,
    duplicateRequest,
    createRequest,
    createCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,
    setActiveEnv,
    updateEnvironment,
    clearHistory,
    replayHistoryEntry,
    searchHistory,
  }
}
