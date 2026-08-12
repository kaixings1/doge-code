/**
 * DatabaseBrowser — 数据库浏览器组件
 *
 * 提供数据库浏览功能：
 * - 数据库连接管理
 * - 连接配置表单
 * - 表结构查看
 * - 数据浏览（分页表格，筛选排序）
 * - SQL 查询编辑器
 * - 查询结果展示
 * - 导入导出
 * - 查询历史
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { useDatabase, type DbType, type DbConnection, type DbTable } from '../hooks/useDatabase.js'

interface DatabaseBrowserProps {
  theme: ThemeColors
  onClose: () => void
}

const DB_TYPES: { value: DbType; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'mongodb', label: 'MongoDB' },
]

export function DatabaseBrowser({ theme, onClose }: DatabaseBrowserProps) {
  const c = theme
  const {
    connections, activeConnectionId, isConnected, isConnecting, connectionError,
    tables, queryResult, queryHistory, isQuerying,
    currentPage, pageSize, totalRows,
    addConnection, updateConnection, deleteConnection, connect, disconnect,
    testConnection, setActiveConnectionId, getDefaultPort,
    executeQuery, fetchTableData, fetchTables,
    setPage, setPageSize,
    clearQueryHistory, searchQueryHistory,
    exportToCSV, exportToJSON,
  } = useDatabase()

  const [viewMode, setViewMode] = useState<'connect' | 'tables' | 'query'>('connect')
  const [sqlQuery, setSqlQuery] = useState('')
  const [querySearch, setQuerySearch] = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [showNewConnForm, setShowNewConnForm] = useState(false)
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null)
  const [resultView, setResultView] = useState<'table' | 'json'>('table')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filterText, setFilterText] = useState('')

  // 新连接表单状态
  const [newConn, setNewConn] = useState<Omit<DbConnection, 'id' | 'createdAt'>>({
    name: 'New Connection',
    type: 'sqlite',
    host: 'localhost',
    port: 5432,
    username: '',
    password: '',
    database: '',
  })

  // 当连接成功后刷新表列表
  useEffect(() => {
    if (isConnected && activeConnectionId) {
      fetchTables()
      setViewMode('tables')
    }
  }, [isConnected, activeConnectionId, fetchTables])

  // 连接处理
  const handleConnect = useCallback(async (id: string) => {
    const success = await connect(id)
    if (success) {
      setViewMode('tables')
    }
  }, [connect])

  // 断开连接
  const handleDisconnect = useCallback(() => {
    disconnect()
    setViewMode('connect')
    setSelectedTable(null)
  }, [disconnect])

  // 新建连接
  const handleCreateConnection = useCallback(() => {
    if (!newConn.name.trim()) return
    addConnection(newConn)
    setNewConn({
      name: 'New Connection',
      type: 'sqlite',
      host: 'localhost',
      port: 5432,
      username: '',
      password: '',
      database: '',
    })
    setShowNewConnForm(false)
  }, [newConn, addConnection])

  // 更新连接
  const handleUpdateConnection = useCallback(() => {
    if (!editingConn) return
    updateConnection(editingConn.id, editingConn)
    setEditingConn(null)
  }, [editingConn, updateConnection])

  // 执行查询
  const handleExecuteQuery = useCallback(async () => {
    if (!sqlQuery.trim()) return
    await executeQuery(sqlQuery)
  }, [sqlQuery, executeQuery])

  // 查看表数据
  const handleViewTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName)
    setViewMode('query')
    const query = `SELECT * FROM ${tableName} LIMIT ${pageSize}`
    setSqlQuery(query)
    await executeQuery(query)
  }, [executeQuery, pageSize])

  // 排序处理
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }, [sortColumn])

  // 过滤后的数据
  const filteredRows = queryResult?.rows.filter(row => {
    if (!filterText.trim()) return true
    const lower = filterText.toLowerCase()
    return Object.values(row).some(v => String(v).toLowerCase().includes(lower))
  }) || []

  // 排序后的数据
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortColumn) return 0
    const aVal = a[sortColumn]
    const bVal = b[sortColumn]
    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
    return sortDirection === 'asc' ? cmp : -cmp
  })

  // 导出结果
  const handleExportCSV = useCallback(() => {
    if (!queryResult) return
    const csv = exportToCSV(queryResult.rows, queryResult.columns)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-result-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [queryResult, exportToCSV])

  const handleExportJSON = useCallback(() => {
    if (!queryResult) return
    const json = exportToJSON(queryResult.rows)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-result-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [queryResult, exportToJSON])

  // 过滤历史
  const filteredHistory = querySearch ? searchQueryHistory(querySearch) : queryHistory

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
        <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>Database Browser</span>
        <div style={{ flex: 1 }} />
        {isConnected && (
          <>
            <button onClick={() => setViewMode('tables')} style={{
              padding: '4px 10px', border: '1px solid', borderColor: viewMode === 'tables' ? c.accent : c.border,
              borderRadius: '4px', background: viewMode === 'tables' ? c.accentDim : c.bgAlt,
              color: viewMode === 'tables' ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '11px',
            }}>表结构</button>
            <button onClick={() => setViewMode('query')} style={{
              padding: '4px 10px', border: '1px solid', borderColor: viewMode === 'query' ? c.accent : c.border,
              borderRadius: '4px', background: viewMode === 'query' ? c.accentDim : c.bgAlt,
              color: viewMode === 'query' ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '11px',
            }}>SQL 查询</button>
            <button onClick={handleDisconnect} style={{
              padding: '4px 10px', border: '1px solid', borderColor: c.errorBorder,
              borderRadius: '4px', background: c.errorBg, color: c.errorText,
              cursor: 'pointer', fontSize: '11px',
            }}>断开</button>
          </>
        )}
        <button onClick={onClose} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '4px',
          background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
        }}>关闭</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧面板 */}
        <div style={{
          width: '240px', minWidth: '200px', background: c.bgAlt,
          borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 连接管理 */}
          <div style={{ borderBottom: `1px solid ${c.border}` }}>
            <div style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '11px', fontWeight: 600, color: c.textMuted,
            }}>
              <span style={{ flex: 1 }}>连接 ({connections.length})</span>
              <span
                onClick={() => setShowNewConnForm(!showNewConnForm)}
                style={{ cursor: 'pointer', color: c.accent, fontSize: '14px' }}
                title="新建连接"
              >+</span>
            </div>

            {showNewConnForm && (
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input
                  value={newConn.name}
                  onChange={(e) => setNewConn(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="连接名称"
                  style={{
                    padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                    borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                  }}
                />
                <select
                  value={newConn.type}
                  onChange={(e) => {
                    const type = e.target.value as DbType
                    setNewConn(prev => ({ ...prev, type, port: getDefaultPort(type) }))
                  }}
                  style={{
                    padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                    borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                  }}
                >
                  {DB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {newConn.type !== 'sqlite' && (
                  <>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        value={newConn.host}
                        onChange={(e) => setNewConn(prev => ({ ...prev, host: e.target.value }))}
                        placeholder="Host"
                        style={{
                          flex: 2, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                          borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                        }}
                      />
                      <input
                        value={newConn.port || ''}
                        onChange={(e) => setNewConn(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                        placeholder="Port"
                        type="number"
                        style={{
                          flex: 1, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                          borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                        }}
                      />
                    </div>
                    <input
                      value={newConn.username}
                      onChange={(e) => setNewConn(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="用户名"
                      style={{
                        padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                        borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                      }}
                    />
                    <input
                      value={newConn.password}
                      onChange={(e) => setNewConn(prev => ({ ...prev, password: e.target.value }))}
                      type="password"
                      placeholder="密码"
                      style={{
                        padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                        borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                      }}
                    />
                  </>
                )}
                <input
                  value={newConn.database}
                  onChange={(e) => setNewConn(prev => ({ ...prev, database: e.target.value }))}
                  placeholder={newConn.type === 'sqlite' ? '文件路径' : '数据库名'}
                  style={{
                    padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                    borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={handleCreateConnection}
                    style={{
                      flex: 1, padding: '4px', border: 'none', borderRadius: '3px',
                      background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                    }}
                  >保存</button>
                  <button
                    onClick={() => setShowNewConnForm(false)}
                    style={{
                      padding: '4px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                      background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px',
                    }}
                  >取消</button>
                </div>
              </div>
            )}

            {/* 连接列表 */}
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {connections.map(conn => (
                <div
                  key={conn.id}
                  style={{
                    padding: '6px 12px', fontSize: '10px',
                    background: activeConnectionId === conn.id ? c.accentDim : 'transparent',
                    borderBottom: `1px solid ${c.borderSubtle}`,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <span
                    onClick={() => setActiveConnectionId(conn.id)}
                    style={{ flex: 1, cursor: 'pointer', color: activeConnectionId === conn.id ? c.accent : c.textMuted }}
                  >
                    {conn.name}
                  </span>
                  <span style={{ color: c.textFaint, fontSize: '9px' }}>{conn.type}</span>
                  {!isConnected || activeConnectionId !== conn.id ? (
                    <span
                      onClick={() => handleConnect(conn.id)}
                      style={{ cursor: 'pointer', color: c.accent, fontSize: '10px' }}
                    >连接</span>
                  ) : (
                    <span style={{ color: c.accent, fontSize: '10px' }}>已连接</span>
                  )}
                  <span
                    onClick={() => deleteConnection(conn.id)}
                    style={{ cursor: 'pointer', color: c.errorText, fontSize: '10px' }}
                  >✕</span>
                </div>
              ))}
            </div>
          </div>

          {/* 表列表 */}
          {isConnected && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: c.textMuted }}>
                表 ({tables.length})
              </div>
              {tables.map(table => (
                <div
                  key={table.name}
                  onClick={() => handleViewTable(table.name)}
                  style={{
                    padding: '4px 12px', fontSize: '10px', cursor: 'pointer',
                    background: selectedTable === table.name ? c.accentDim : 'transparent',
                    color: selectedTable === table.name ? c.accent : c.textMuted,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    borderBottom: `1px solid ${c.borderSubtle}`,
                  }}
                >
                  <span style={{ fontSize: '9px' }}>📊</span>
                  <span style={{ flex: 1 }}>{table.name}</span>
                  <span style={{ color: c.textFaint, fontSize: '9px' }}>{table.columns.length} 列</span>
                </div>
              ))}
            </div>
          )}

          {/* 查询历史 */}
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            <div style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '11px', fontWeight: 600, color: c.textMuted,
            }}>
              <span style={{ flex: 1 }}>查询历史 ({queryHistory.length})</span>
              {queryHistory.length > 0 && (
                <span
                  onClick={clearQueryHistory}
                  style={{ cursor: 'pointer', fontSize: '10px', color: c.textFaint }}
                >清空</span>
              )}
            </div>
            <div style={{ padding: '4px 12px' }}>
              <input
                value={querySearch}
                onChange={(e) => setQuerySearch(e.target.value)}
                placeholder="搜索历史..."
                style={{
                  width: '100%', padding: '3px 6px', background: c.bgPanel,
                  border: `1px solid ${c.border}`, borderRadius: '3px',
                  color: c.text, fontSize: '10px', outline: 'none',
                }}
              />
            </div>
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {filteredHistory.slice(-15).reverse().map(entry => (
                <div
                  key={entry.id}
                  onClick={() => setSqlQuery(entry.sql)}
                  style={{
                    padding: '4px 12px', fontSize: '10px', cursor: 'pointer',
                    borderBottom: `1px solid ${c.borderSubtle}`,
                    color: entry.success ? c.textMuted : c.errorText,
                  }}
                  title={entry.sql}
                >
                  {entry.sql.slice(0, 50)}{entry.sql.length > 50 ? '...' : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 主区域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewMode === 'connect' && !isConnected && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: c.textMuted }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗄</div>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>未连接到数据库</div>
                <div style={{ fontSize: '11px' }}>请在左侧创建或选择连接</div>
                {connectionError && (
                  <div style={{ color: c.errorText, fontSize: '11px', marginTop: '8px' }}>{connectionError}</div>
                )}
              </div>
            </div>
          )}

          {viewMode === 'tables' && isConnected && (
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: c.text, marginBottom: '12px' }}>
                数据库表 ({tables.length})
              </div>
              {tables.map(table => (
                <div key={table.name} style={{
                  marginBottom: '16px', border: `1px solid ${c.border}`, borderRadius: '6px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '8px 12px', background: c.bgPanel, borderBottom: `1px solid ${c.border}`,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ fontWeight: 600, color: c.text, fontSize: '12px' }}>{table.name}</span>
                    <span style={{ color: c.textFaint, fontSize: '10px' }}>{table.columns.length} 列</span>
                    {table.rowCount !== undefined && (
                      <span style={{ color: c.textFaint, fontSize: '10px' }}>{table.rowCount} 行</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span
                      onClick={() => handleViewTable(table.name)}
                      style={{ cursor: 'pointer', color: c.accent, fontSize: '10px' }}
                    >查看数据</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: c.bgAlt }}>
                          <th style={{ padding: '4px 8px', textAlign: 'left', color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>列名</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left', color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>类型</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left', color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>可空</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left', color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>主键</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left', color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>默认值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map(col => (
                          <tr key={col.name} style={{ borderBottom: `1px solid ${c.borderSubtle}` }}>
                            <td style={{ padding: '4px 8px', color: c.text, fontFamily: 'monospace' }}>{col.name}</td>
                            <td style={{ padding: '4px 8px', color: c.textMuted }}>{col.type}</td>
                            <td style={{ padding: '4px 8px', color: col.nullable ? c.textFaint : c.errorText }}>
                              {col.nullable ? 'YES' : 'NO'}
                            </td>
                            <td style={{ padding: '4px 8px', color: col.isPrimaryKey ? c.accent : c.textFaint }}>
                              {col.isPrimaryKey ? '🔑' : ''}
                            </td>
                            <td style={{ padding: '4px 8px', color: c.textFaint }}>{col.defaultValue || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'query' && isConnected && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* SQL 编辑器 */}
              <div style={{ borderBottom: `1px solid ${c.border}` }}>
                <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted }}>SQL 查询</span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={handleExecuteQuery}
                    disabled={isQuerying || !sqlQuery.trim()}
                    style={{
                      padding: '4px 12px', border: 'none', borderRadius: '3px',
                      background: isQuerying ? c.surface : c.accent,
                      color: isQuerying ? c.textFaint : '#000',
                      cursor: isQuerying ? 'not-allowed' : 'pointer',
                      fontSize: '11px', fontWeight: 600,
                    }}
                  >{isQuerying ? '执行中...' : '执行 (Ctrl+Enter)'}</button>
                </div>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="输入 SQL 查询..."
                  style={{
                    width: '100%', minHeight: '100px', background: c.codeBg, border: 'none',
                    borderTop: `1px solid ${c.border}`, padding: '10px 12px', color: c.text,
                    fontSize: '12px', fontFamily: 'Consolas, Monaco, monospace',
                    lineHeight: '1.5', resize: 'vertical', outline: 'none', whiteSpace: 'pre',
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleExecuteQuery()
                    }
                  }}
                />
              </div>

              {/* 查询结果 */}
              {queryResult && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* 结果工具栏 */}
                  <div style={{
                    padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                    borderBottom: `1px solid ${c.border}`, background: c.bgPanel,
                  }}>
                    <span style={{ fontSize: '11px', color: c.textMuted }}>
                      {queryResult.rowCount} 行 ({queryResult.duration}ms)
                    </span>
                    {queryResult.affectedRows !== undefined && (
                      <span style={{ fontSize: '11px', color: c.accent }}>
                        影响 {queryResult.affectedRows} 行
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <input
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="过滤..."
                      style={{
                        padding: '2px 6px', background: c.bgAlt, border: `1px solid ${c.border}`,
                        borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                        width: '120px',
                      }}
                    />
                    <button
                      onClick={() => setResultView('table')}
                      style={{
                        padding: '2px 8px', border: '1px solid', borderColor: resultView === 'table' ? c.accent : c.border,
                        borderRadius: '3px', background: resultView === 'table' ? c.accentDim : 'transparent',
                        color: resultView === 'table' ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px',
                      }}
                    >表格</button>
                    <button
                      onClick={() => setResultView('json')}
                      style={{
                        padding: '2px 8px', border: '1px solid', borderColor: resultView === 'json' ? c.accent : c.border,
                        borderRadius: '3px', background: resultView === 'json' ? c.accentDim : 'transparent',
                        color: resultView === 'json' ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px',
                      }}
                    >JSON</button>
                    <button onClick={handleExportCSV} style={{
                      padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                      background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px',
                    }}>CSV</button>
                    <button onClick={handleExportJSON} style={{
                      padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                      background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px',
                    }}>JSON</button>
                  </div>

                  {/* 结果内容 */}
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {resultView === 'table' ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: c.bgPanel, zIndex: 1 }}>
                          <tr>
                            {queryResult.columns.map(col => (
                              <th
                                key={col}
                                onClick={() => handleSort(col)}
                                style={{
                                  padding: '6px 10px', textAlign: 'left', cursor: 'pointer',
                                  borderBottom: `1px solid ${c.border}`, color: c.textMuted,
                                  whiteSpace: 'nowrap', userSelect: 'none',
                                }}
                              >
                                {col}
                                {sortColumn === col && (
                                  <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRows.slice(0, 1000).map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: `1px solid ${c.borderSubtle}` }}>
                              {queryResult.columns.map(col => (
                                <td key={col} style={{
                                  padding: '4px 10px', color: c.text, maxWidth: '300px',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  fontFamily: 'monospace', fontSize: '10px',
                                }}>
                                  {row[col] === null ? (
                                    <span style={{ color: c.textFaint, fontStyle: 'italic' }}>NULL</span>
                                  ) : (
                                    String(row[col])
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <pre style={{
                        margin: 0, padding: '12px', fontSize: '11px', fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: c.text,
                      }}>{JSON.stringify(queryResult.rows, null, 2)}</pre>
                    )}
                  </div>

                  {/* 分页 */}
                  {totalRows > pageSize && (
                    <div style={{
                      padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                      borderTop: `1px solid ${c.border}`, background: c.bgPanel,
                    }}>
                      <span style={{ fontSize: '10px', color: c.textMuted }}>
                        第 {currentPage} 页 / 共 {Math.ceil(totalRows / pageSize)} 页
                      </span>
                      <button
                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage <= 1}
                        style={{
                          padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                          background: c.bgAlt, color: currentPage <= 1 ? c.textFaint : c.textMuted,
                          cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '10px',
                        }}
                      >上一页</button>
                      <button
                        onClick={() => setPage(currentPage + 1)}
                        disabled={currentPage >= Math.ceil(totalRows / pageSize)}
                        style={{
                          padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                          background: c.bgAlt, color: currentPage >= Math.ceil(totalRows / pageSize) ? c.textFaint : c.textMuted,
                          cursor: currentPage >= Math.ceil(totalRows / pageSize) ? 'not-allowed' : 'pointer', fontSize: '10px',
                        }}
                      >下一页</button>
                      <span style={{ fontSize: '10px', color: c.textFaint }}>每页</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(parseInt(e.target.value))}
                        style={{
                          padding: '2px 4px', background: c.bgAlt, border: `1px solid ${c.border}`,
                          borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                        }}
                      >
                        {[50, 100, 200, 500].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
