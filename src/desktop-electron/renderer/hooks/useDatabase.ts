/**
 * useDatabase — 数据库浏览器 Hook
 *
 * 提供数据库浏览功能：
 * - 连接管理（连接/断开/测试连接）
 * - 查询执行（通过 IPC 主进程执行）
 * - 表结构缓存
 * - 数据分页加载
 */

import { useCallback, useState } from 'react'

// ─── 类型定义 ───

export type DbType = 'mysql' | 'postgresql' | 'sqlite' | 'mongodb'

export interface DbConnection {
  id: string
  name: string
  type: DbType
  host: string
  port: number
  username: string
  password: string
  database: string
  createdAt: number
}

export interface DbTable {
  name: string
  columns: DbColumn[]
  indexes: DbIndex[]
  rowCount?: number
}

export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  defaultValue?: string
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface DbIndex {
  name: string
  columns: string[]
  unique: boolean
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  duration: number
  affectedRows?: number
}

export interface QueryHistoryEntry {
  id: string
  sql: string
  connectionId: string
  timestamp: number
  duration: number
  success: boolean
}

// ─── 常量 ───

const STORAGE_KEY_CONNECTIONS = 'doge-db-connections'
const STORAGE_KEY_QUERY_HISTORY = 'doge-db-query-history'
const MAX_QUERY_HISTORY = 100

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

function createDefaultConnection(): DbConnection {
  return {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'New Connection',
    type: 'sqlite',
    host: 'localhost',
    port: 5432,
    username: '',
    password: '',
    database: '',
    createdAt: Date.now(),
  }
}

const DEFAULT_PORTS: Record<DbType, number> = {
  mysql: 3306,
  postgresql: 5432,
  sqlite: 0,
  mongodb: 27017,
}

// ─── Hook ───

export interface UseDatabaseReturn {
  // 连接状态
  connections: DbConnection[]
  activeConnectionId: string | null
  isConnected: boolean
  isConnecting: boolean
  connectionError: string | null

  // 数据状态
  tables: DbTable[]
  queryResult: QueryResult | null
  queryHistory: QueryHistoryEntry[]
  isQuerying: boolean

  // 分页
  currentPage: number
  pageSize: number
  totalRows: number

  // 连接管理
  addConnection: (conn: Omit<DbConnection, 'id' | 'createdAt'>) => void
  updateConnection: (id: string, updates: Partial<DbConnection>) => void
  deleteConnection: (id: string) => void
  connect: (id: string) => Promise<boolean>
  disconnect: () => void
  testConnection: (id: string) => Promise<boolean>
  setActiveConnectionId: (id: string | null) => void
  getDefaultPort: (type: DbType) => number

  // 查询执行
  executeQuery: (sql: string) => Promise<QueryResult | null>
  fetchTableData: (tableName: string, page?: number, pageSize?: number) => Promise<QueryResult | null>
  fetchTables: () => Promise<DbTable[]>

  // 分页
  setPage: (page: number) => void
  setPageSize: (size: number) => void

  // 历史
  clearQueryHistory: () => void
  searchQueryHistory: (query: string) => QueryHistoryEntry[]

  // 导入导出
  exportToCSV: (data: Record<string, unknown>[], columns: string[]) => string
  exportToJSON: (data: Record<string, unknown>[]) => string
}

export function useDatabase(): UseDatabaseReturn {
  const [connections, setConnections] = useState<DbConnection[]>(() =>
    loadJSON<DbConnection[]>(STORAGE_KEY_CONNECTIONS, [])
  )
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [tables, setTables] = useState<DbTable[]>([])
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>(() =>
    loadJSON<QueryHistoryEntry[]>(STORAGE_KEY_QUERY_HISTORY, [])
  )
  const [isQuerying, setIsQuerying] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [totalRows, setTotalRows] = useState(0)

  // ─── 持久化同步 ───
  const persistConnections = useCallback((next: DbConnection[]) => {
    setConnections(next)
    saveJSON(STORAGE_KEY_CONNECTIONS, next)
  }, [])

  const persistQueryHistory = useCallback((next: QueryHistoryEntry[]) => {
    const trimmed = next.slice(-MAX_QUERY_HISTORY)
    setQueryHistory(trimmed)
    saveJSON(STORAGE_KEY_QUERY_HISTORY, trimmed)
  }, [])

  // ─── 连接管理 ───
  const getDefaultPort = useCallback((type: DbType): number => {
    return DEFAULT_PORTS[type] || 5432
  }, [])

  const addConnection = useCallback((conn: Omit<DbConnection, 'id' | 'createdAt'>) => {
    const newConn: DbConnection = {
      ...conn,
      id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    }
    persistConnections([...connections, newConn])
  }, [connections, persistConnections])

  const updateConnection = useCallback((id: string, updates: Partial<DbConnection>) => {
    persistConnections(connections.map(c => c.id === id ? { ...c, ...updates } : c))
  }, [connections, persistConnections])

  const deleteConnection = useCallback((id: string) => {
    persistConnections(connections.filter(c => c.id !== id))
    if (activeConnectionId === id) {
      setActiveConnectionId(null)
      setIsConnected(false)
      setTables([])
    }
  }, [connections, persistConnections, activeConnectionId])

  const connect = useCallback(async (id: string): Promise<boolean> => {
    const conn = connections.find(c => c.id === id)
    if (!conn) return false

    setIsConnecting(true)
    setConnectionError(null)

    try {
      if (!window.dogeAPI.dbConnect || !window.dogeAPI.dbTables) {
        setConnectionError('数据库功能尚未实现')
        return false
      }
      const result = await window.dogeAPI.dbConnect({ ...conn, path: conn.database || ':memory:' })
      if (result.success) {
        setActiveConnectionId(id)
        setIsConnected(true)
        // 加载表列表
        const tablesResult = await window.dogeAPI.dbTables(id)
        if (tablesResult.success && tablesResult.tables) {
          setTables(tablesResult.tables as DbTable[])
        }
        return true
      } else {
        setConnectionError(result.error || 'Connection failed')
        return false
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Connection failed')
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [connections])

  const disconnect = useCallback(() => {
    setIsConnected(false)
    setActiveConnectionId(null)
    setTables([])
    setQueryResult(null)
    setCurrentPage(1)
    setTotalRows(0)
  }, [])

  const testConnection = useCallback(async (id: string): Promise<boolean> => {
    const conn = connections.find(c => c.id === id)
    if (!conn) return false

    try {
      if (!window.dogeAPI.dbConnect) return false
      const result = await window.dogeAPI.dbConnect({ ...conn, path: conn.database || ':memory:' })
      return result.success
    } catch {
      return false
    }
  }, [connections])

  // ─── 查询执行 ───
  const executeQuery = useCallback(async (sql: string): Promise<QueryResult | null> => {
    if (!activeConnectionId || !sql.trim()) return null

    setIsQuerying(true)
    const startTime = Date.now()

    try {
      if (!window.dogeAPI.dbQuery) return null
      const result = await window.dogeAPI.dbQuery!(activeConnectionId, sql)
      const duration = Date.now() - startTime

      if (result.success) {
        const queryRes: QueryResult = {
          columns: (result as Record<string, unknown>).columns || [],
          rows: result.rows || [],
          rowCount: (result as Record<string, unknown>).rowCount || result.rows?.length || 0,
          duration,
          affectedRows: (result as Record<string, unknown>).affectedRows,
        }
        setQueryResult(queryRes)
        setTotalRows(queryRes.rowCount)
        setCurrentPage(1)

        // 添加到历史
        const entry: QueryHistoryEntry = {
          id: `qh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sql,
          connectionId: activeConnectionId,
          timestamp: Date.now(),
          duration,
          success: true,
        }
        persistQueryHistory([...queryHistory, entry])

        return queryRes
      } else {
        const errorResult: QueryResult = {
          columns: ['error'],
          rows: [{ error: result.error || 'Query failed' }],
          rowCount: 0,
          duration,
        }
        setQueryResult(errorResult)

        const entry: QueryHistoryEntry = {
          id: `qh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sql,
          connectionId: activeConnectionId,
          timestamp: Date.now(),
          duration,
          success: false,
        }
        persistQueryHistory([...queryHistory, entry])

        return errorResult
      }
    } catch (err) {
      const duration = Date.now() - startTime
      const errorResult: QueryResult = {
        columns: ['error'],
        rows: [{ error: err instanceof Error ? err.message : 'Query failed' }],
        rowCount: 0,
        duration,
      }
      setQueryResult(errorResult)
      return errorResult
    } finally {
      setIsQuerying(false)
    }
  }, [activeConnectionId, queryHistory, persistQueryHistory])

  const fetchTableData = useCallback(async (tableName: string, page: number = 1, size: number = pageSize): Promise<QueryResult | null> => {
    const offset = (page - 1) * size
    const sql = `SELECT * FROM ${tableName} LIMIT ${size} OFFSET ${offset}`
    return executeQuery(sql)
  }, [executeQuery, pageSize])

  const fetchTables = useCallback(async (): Promise<DbTable[]> => {
    if (!activeConnectionId || !window.dogeAPI.dbTables) return []
    try {
      const result = await window.dogeAPI.dbTables!(activeConnectionId)
      if (result.success && result.tables) {
        setTables(result.tables)
        return result.tables
      }
    } catch { /* ignore */ }
    return []
  }, [activeConnectionId])

  // ─── 分页 ───
  const setPage = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // ─── 历史 ───
  const clearQueryHistory = useCallback(() => {
    persistQueryHistory([])
  }, [persistQueryHistory])

  const searchQueryHistory = useCallback((query: string): QueryHistoryEntry[] => {
    if (!query.trim()) return queryHistory
    const lower = query.toLowerCase()
    return queryHistory.filter(h => h.sql.toLowerCase().includes(lower))
  }, [queryHistory])

  // ─── 导入导出 ───
  const exportToCSV = useCallback((data: Record<string, unknown>[], columns: string[]): string => {
    const header = columns.join(',')
    const rows = data.map(row =>
      columns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ''
        const str = String(val)
        // Escape quotes and wrap in quotes if contains comma
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    )
    return [header, ...rows].join('\n')
  }, [])

  const exportToJSON = useCallback((data: Record<string, unknown>[]): string => {
    return JSON.stringify(data, null, 2)
  }, [])

  return {
    connections,
    activeConnectionId,
    isConnected,
    isConnecting,
    connectionError,
    tables,
    queryResult,
    queryHistory,
    isQuerying,
    currentPage,
    pageSize,
    totalRows,
    addConnection,
    updateConnection,
    deleteConnection,
    connect,
    disconnect,
    testConnection,
    setActiveConnectionId,
    getDefaultPort,
    executeQuery,
    fetchTableData,
    fetchTables,
    setPage,
    setPageSize,
    clearQueryHistory,
    searchQueryHistory,
    exportToCSV,
    exportToJSON,
  }
}
