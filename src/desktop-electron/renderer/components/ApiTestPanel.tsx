/**
 * ApiTestPanel — API 测试工具组件
 *
 * 提供类似 Postman 的 API 测试功能：
 * - HTTP 方法选择
 * - URL 输入（带历史记录自动补全）
 * - 请求头编辑器
 * - 请求体编辑器（JSON/Text/Raw）
 * - 请求集合管理
 * - 响应面板
 * - 环境变量管理
 * - 请求历史
 * - 导入导出
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { useApiTest, type HttpMethod, type BodyType, type EnvName, type ApiHeader } from '../hooks/useApiTest.js'

interface ApiTestPanelProps {
  theme: ThemeColors
  onClose: () => void
}

// ─── HTTP 方法选项 ───
const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'raw', label: 'Raw' },
]
const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#4ECB71',
  POST: '#FFB347',
  PUT: '#569CD6',
  DELETE: '#FF6B6B',
  PATCH: '#BD83E0',
}

export function ApiTestPanel({ theme, onClose }: ApiTestPanelProps) {
  const c = theme
  const {
    requests, collections, environments, activeEnv, history,
    currentRequest, currentResponse, isLoading,
    setCurrentRequest, updateRequest, sendRequest, saveRequest, deleteRequest,
    duplicateRequest, createRequest, createCollection, deleteCollection,
    addToCollection, removeFromCollection, setActiveEnv, updateEnvironment,
    clearHistory, replayHistoryEntry, searchHistory,
  } = useApiTest()

  const [activeTab, setActiveTab] = useState<'headers' | 'body' | 'params'>('headers')
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'info'>('body')
  const [historySearch, setHistorySearch] = useState('')
  const [showCollections, setShowCollections] = useState(true)
  const [showEnvironments, setShowEnvironments] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [envVariables, setEnvVariables] = useState<Record<string, string>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [formattedResponse, setFormattedResponse] = useState('')
  const urlInputRef = useRef<HTMLInputElement>(null)
  const bodyEditorRef = useRef<HTMLTextAreaElement>(null)

  // 同步环境变量
  useEffect(() => {
    const env = environments.find(e => e.name === activeEnv)
    if (env) setEnvVariables(env.variables)
  }, [activeEnv, environments])

  // 格式化响应
  useEffect(() => {
    if (!currentResponse) {
      setFormattedResponse('')
      return
    }
    try {
      const parsed = JSON.parse(currentResponse.body)
      setFormattedResponse(JSON.stringify(parsed, null, 2))
    } catch {
      setFormattedResponse(currentResponse.body)
    }
  }, [currentResponse])

  // 过滤历史记录
  const filteredHistory = historySearch ? searchHistory(historySearch) : history

  // 添加请求头
  const addHeader = useCallback(() => {
    const newHeader: ApiHeader = {
      id: `h-${Date.now()}`,
      key: '',
      value: '',
      enabled: true,
    }
    updateRequest({ headers: [...currentRequest.headers, newHeader] })
  }, [currentRequest.headers, updateRequest])

  // 更新请求头
  const updateHeader = useCallback((id: string, updates: Partial<ApiHeader>) => {
    updateRequest({
      headers: currentRequest.headers.map(h => h.id === id ? { ...h, ...updates } : h),
    })
  }, [currentRequest.headers, updateRequest])

  // 删除请求头
  const removeHeader = useCallback((id: string) => {
    updateRequest({ headers: currentRequest.headers.filter(h => h.id !== id) })
  }, [currentRequest.headers, updateRequest])

  // 发送请求
  const handleSend = useCallback(async () => {
    await sendRequest()
  }, [sendRequest])

  // 保存请求
  const handleSave = useCallback(() => {
    saveRequest()
  }, [saveRequest])

  // 创建集合
  const handleCreateCollection = useCallback(() => {
    if (newCollectionName.trim()) {
      createCollection(newCollectionName.trim())
      setNewCollectionName('')
    }
  }, [newCollectionName, createCollection])

  // 更新环境变量
  const handleEnvChange = useCallback((key: string, value: string) => {
    const newVars = { ...envVariables, [key]: value }
    setEnvVariables(newVars)
    updateEnvironment(activeEnv, newVars)
  }, [envVariables, activeEnv, updateEnvironment])

  // 添加环境变量
  const addEnvVar = useCallback(() => {
    const key = `var${Object.keys(envVariables).length + 1}`
    handleEnvChange(key, '')
  }, [envVariables, handleEnvChange])

  // 导出集合
  const handleExport = useCallback(() => {
    const exportData = {
      info: { name: 'Doge API Collection', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: requests.map(req => ({
        name: req.name,
        request: {
          method: req.method,
          header: req.headers.filter(h => h.enabled).map(h => ({ key: h.key, value: h.value })),
          url: { raw: '{{baseUrl}}' + req.url, host: ['{{baseUrl}}'], path: req.url.split('/').filter(Boolean) },
          body: req.body ? { mode: 'raw', raw: req.body } : undefined,
        },
      })),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'doge-api-collection.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [requests])

  // 导入集合
  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const data = JSON.parse(text)
        if (data.item && Array.isArray(data.item)) {
          data.item.forEach((item: any) => {
            if (item.request) {
              createRequest()
              updateRequest({
                name: item.name || 'Imported',
                method: item.request.method || 'GET',
                url: item.request.url?.raw?.replace('{{baseUrl}}', '') || '',
                headers: (item.request.header || []).map((h: any, i: number) => ({
                  id: `h-${Date.now()}-${i}`,
                  key: h.key || '',
                  value: h.value || '',
                  enabled: true,
                })),
                body: item.request.body?.raw || '',
              })
              saveRequest(item.name || 'Imported')
            }
          })
        }
      } catch { /* ignore */ }
    }
    input.click()
  }, [createRequest, updateRequest, saveRequest])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSend, handleSave])

  // 状态码颜色
  const getStatusColor = (status: number): string => {
    if (status >= 200 && status < 300) return c.accent
    if (status >= 300 && status < 400) return '#FFB347'
    if (status >= 400) return c.errorText
    return c.textMuted
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
        <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>API Test</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleImport} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '4px',
          background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
        }}>导入</button>
        <button onClick={handleExport} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '4px',
          background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
        }}>导出</button>
        <button onClick={onClose} style={{
          padding: '4px 10px', border: `1px solid ${c.border}`, borderRadius: '4px',
          background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
        }}>关闭</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧面板：集合 + 历史 */}
        <div style={{
          width: '240px', minWidth: '200px', background: c.bgAlt,
          borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 集合管理 */}
          <div style={{ borderBottom: `1px solid ${c.border}` }}>
            <div style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px',
              cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: c.textMuted,
            }} onClick={() => setShowCollections(!showCollections)}>
              <span style={{ fontSize: '10px' }}>{showCollections ? '▼' : '▶'}</span>
              <span style={{ flex: 1 }}>集合 ({collections.length})</span>
              <span
                onClick={(e) => { e.stopPropagation(); handleCreateCollection() }}
                style={{ cursor: 'pointer', color: c.accent, fontSize: '14px' }}
                title="新建集合"
              >+</span>
            </div>
            {showCollections && (
              <div style={{ padding: '4px 12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="集合名称..."
                    style={{
                      flex: 1, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                      borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCollection() }}
                  />
                </div>
                {collections.map(col => (
                  <div key={col.id} style={{
                    padding: '3px 6px', fontSize: '10px', color: c.textMuted,
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: c.bgPanel, borderRadius: '3px',
                  }}>
                    <span style={{ flex: 1 }}>{col.name} ({col.requestIds.length})</span>
                    <span
                      onClick={() => deleteCollection(col.id)}
                      style={{ cursor: 'pointer', color: c.errorText, fontSize: '10px' }}
                    >✕</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 请求列表 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: c.textMuted }}>
              请求 ({requests.length})
            </div>
            {requests.map(req => (
              <div
                key={req.id}
                onClick={() => setCurrentRequest(req)}
                style={{
                  padding: '4px 12px', fontSize: '10px', cursor: 'pointer',
                  background: currentRequest.id === req.id ? c.accentDim : 'transparent',
                  color: currentRequest.id === req.id ? c.accent : c.textMuted,
                  display: 'flex', alignItems: 'center', gap: '6px',
                  borderBottom: `1px solid ${c.borderSubtle}`,
                }}
              >
                <span style={{ color: METHOD_COLORS[req.method], fontWeight: 600, minWidth: '40px', fontSize: '9px' }}>
                  {req.method}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {req.name}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); duplicateRequest(req.id) }}
                  style={{ cursor: 'pointer', fontSize: '10px', opacity: 0.6 }}
                  title="复制"
                >⧉</span>
                <span
                  onClick={(e) => { e.stopPropagation(); deleteRequest(req.id) }}
                  style={{ cursor: 'pointer', color: c.errorText, fontSize: '10px', opacity: 0.6 }}
                  title="删除"
                >✕</span>
              </div>
            ))}
          </div>

          {/* 历史记录 */}
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            <div style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px',
              cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: c.textMuted,
            }} onClick={() => setShowHistory(!showHistory)}>
              <span style={{ fontSize: '10px' }}>{showHistory ? '▼' : '▶'}</span>
              <span style={{ flex: 1 }}>历史 ({history.length})</span>
              {history.length > 0 && (
                <span
                  onClick={(e) => { e.stopPropagation(); clearHistory() }}
                  style={{ cursor: 'pointer', fontSize: '10px', color: c.textFaint }}
                  title="清空"
                >清空</span>
              )}
            </div>
            {showHistory && (
              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                <div style={{ padding: '4px 12px' }}>
                  <input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="搜索历史..."
                    style={{
                      width: '100%', padding: '3px 6px', background: c.bgPanel,
                      border: `1px solid ${c.border}`, borderRadius: '3px',
                      color: c.text, fontSize: '10px', outline: 'none',
                    }}
                  />
                </div>
                {filteredHistory.slice(-20).reverse().map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => replayHistoryEntry(entry.id)}
                    style={{
                      padding: '4px 12px', fontSize: '10px', cursor: 'pointer',
                      borderBottom: `1px solid ${c.borderSubtle}`,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    <span style={{ color: METHOD_COLORS[entry.request.method], fontWeight: 600, minWidth: '40px', fontSize: '9px' }}>
                      {entry.request.method}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c.textMuted }}>
                      {entry.request.url}
                    </span>
                    {entry.response && (
                      <span style={{ color: getStatusColor(entry.response.status), fontSize: '9px' }}>
                        {entry.response.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 主区域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* URL 栏 */}
          <div style={{
            display: 'flex', gap: '8px', padding: '12px 16px',
            background: c.bgPanel, borderBottom: `1px solid ${c.border}`,
            alignItems: 'center',
          }}>
            {/* 方法选择 */}
            <select
              value={currentRequest.method}
              onChange={(e) => updateRequest({ method: e.target.value as HttpMethod })}
              style={{
                padding: '6px 10px', background: c.inputBg, border: `1px solid ${c.border}`,
                borderRadius: '4px', color: METHOD_COLORS[currentRequest.method],
                fontSize: '12px', fontWeight: 600, outline: 'none', cursor: 'pointer',
              }}
            >
              {HTTP_METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* URL 输入 */}
            <input
              ref={urlInputRef}
              value={currentRequest.url}
              onChange={(e) => updateRequest({ url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              style={{
                flex: 1, padding: '6px 12px', background: c.inputBg, border: `1px solid ${c.border}`,
                borderRadius: '4px', color: c.text, fontSize: '12px', outline: 'none',
                fontFamily: 'monospace',
              }}
            />

            {/* 发送按钮 */}
            <button
              onClick={handleSend}
              disabled={isLoading || !currentRequest.url.trim()}
              style={{
                padding: '6px 16px', border: 'none', borderRadius: '4px',
                background: isLoading ? c.surface : c.accent,
                color: isLoading ? c.textFaint : '#000',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '12px', fontWeight: 600,
              }}
            >
              {isLoading ? '发送中...' : '发送'}
            </button>

            {/* 保存按钮 */}
            <button
              onClick={handleSave}
              style={{
                padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: '4px',
                background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
              }}
            >保存</button>

            {/* 新建按钮 */}
            <button
              onClick={createRequest}
              style={{
                padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: '4px',
                background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
              }}
            >新建</button>
          </div>

          {/* 标签页切换 */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${c.border}`,
            background: c.bgPanel,
          }}>
            {(['headers', 'body', 'params'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px', border: 'none', borderBottom: `2px solid ${activeTab === tab ? c.accent : 'transparent'}`,
                  background: 'transparent', color: activeTab === tab ? c.accent : c.textMuted,
                  cursor: 'pointer', fontSize: '11px', fontWeight: 500,
                }}
              >
                {tab === 'headers' ? '请求头' : tab === 'body' ? '请求体' : '参数'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {/* 环境变量选择 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px' }}>
              <span style={{ fontSize: '10px', color: c.textFaint }}>环境:</span>
              {(['dev', 'test', 'prod'] as EnvName[]).map(env => (
                <button
                  key={env}
                  onClick={() => setActiveEnv(env)}
                  style={{
                    padding: '2px 8px', border: '1px solid', borderColor: activeEnv === env ? c.accent : c.border,
                    borderRadius: '3px', background: activeEnv === env ? c.accentDim : 'transparent',
                    color: activeEnv === env ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px',
                  }}
                >{env}</button>
              ))}
              <span
                onClick={() => setShowEnvironments(!showEnvironments)}
                style={{ cursor: 'pointer', fontSize: '10px', color: c.textFaint }}
                title="管理环境变量"
              >⚙</span>
            </div>
          </div>

          {/* 编辑器区域 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            {activeTab === 'headers' && (
              <div>
                {currentRequest.headers.map(header => (
                  <div key={header.id} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={header.enabled}
                      onChange={(e) => updateHeader(header.id, { enabled: e.target.checked })}
                      style={{ accentColor: c.accent }}
                    />
                    <input
                      value={header.key}
                      onChange={(e) => updateHeader(header.id, { key: e.target.value })}
                      placeholder="Header Key"
                      style={{
                        flex: 1, padding: '4px 8px', background: c.inputBg, border: `1px solid ${c.border}`,
                        borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none',
                      }}
                    />
                    <input
                      value={header.value}
                      onChange={(e) => updateHeader(header.id, { value: e.target.value })}
                      placeholder="Header Value"
                      style={{
                        flex: 2, padding: '4px 8px', background: c.inputBg, border: `1px solid ${c.border}`,
                        borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none',
                      }}
                    />
                    <span
                      onClick={() => removeHeader(header.id)}
                      style={{ cursor: 'pointer', color: c.errorText, fontSize: '14px' }}
                    >✕</span>
                  </div>
                ))}
                <button
                  onClick={addHeader}
                  style={{
                    padding: '4px 12px', border: `1px solid ${c.border}`, borderRadius: '4px',
                    background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '11px',
                  }}
                >+ 添加请求头</button>
              </div>
            )}

            {activeTab === 'body' && (
              <div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {BODY_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      onClick={() => updateRequest({ bodyType: bt.value })}
                      style={{
                        padding: '3px 10px', border: '1px solid',
                        borderColor: currentRequest.bodyType === bt.value ? c.accent : c.border,
                        borderRadius: '3px',
                        background: currentRequest.bodyType === bt.value ? c.accentDim : 'transparent',
                        color: currentRequest.bodyType === bt.value ? c.accent : c.textMuted,
                        cursor: 'pointer', fontSize: '10px',
                      }}
                    >{bt.label}</button>
                  ))}
                </div>
                <textarea
                  ref={bodyEditorRef}
                  value={currentRequest.body}
                  onChange={(e) => updateRequest({ body: e.target.value })}
                  placeholder={currentRequest.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Enter body content...'}
                  style={{
                    width: '100%', minHeight: '200px', background: c.codeBg, border: `1px solid ${c.border}`,
                    borderRadius: '4px', padding: '10px', color: c.text, fontSize: '11px',
                    fontFamily: 'Consolas, Monaco, monospace', lineHeight: '1.5',
                    resize: 'vertical', outline: 'none', whiteSpace: 'pre',
                  }}
                />
              </div>
            )}

            {activeTab === 'params' && (
              <div>
                <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '8px' }}>
                  URL 查询参数 (?key1=value1&key2=value2)
                </div>
                <textarea
                  value={currentRequest.url.includes('?') ? currentRequest.url.split('?')[1] : ''}
                  onChange={(e) => {
                    const baseUrl = currentRequest.url.split('?')[0]
                    const params = e.target.value
                    updateRequest({ url: params ? `${baseUrl}?${params}` : baseUrl })
                  }}
                  placeholder="key1=value1&key2=value2"
                  style={{
                    width: '100%', minHeight: '150px', background: c.codeBg, border: `1px solid ${c.border}`,
                    borderRadius: '4px', padding: '10px', color: c.text, fontSize: '11px',
                    fontFamily: 'monospace', lineHeight: '1.5', resize: 'vertical', outline: 'none',
                  }}
                />
              </div>
            )}

            {/* 环境变量编辑器 */}
            {showEnvironments && activeTab !== 'params' && (
              <div style={{ marginTop: '16px', borderTop: `1px solid ${c.border}`, paddingTop: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, marginBottom: '8px' }}>
                  环境变量 ({activeEnv})
                </div>
                {Object.entries(envVariables).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                      value={key}
                      readOnly
                      style={{
                        width: '120px', padding: '3px 6px', background: c.bgAlt,
                        border: `1px solid ${c.border}`, borderRadius: '3px',
                        color: c.textMuted, fontSize: '10px', outline: 'none',
                      }}
                    />
                    <input
                      value={value}
                      onChange={(e) => handleEnvChange(key, e.target.value)}
                      style={{
                        flex: 1, padding: '3px 6px', background: c.inputBg,
                        border: `1px solid ${c.border}`, borderRadius: '3px',
                        color: c.text, fontSize: '10px', outline: 'none',
                      }}
                    />
                  </div>
                ))}
                <button
                  onClick={addEnvVar}
                  style={{
                    padding: '3px 10px', border: `1px solid ${c.border}`, borderRadius: '3px',
                    background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px',
                  }}
                >+ 添加变量</button>
                <div style={{ fontSize: {'envVariables': '10px', 'envVariablesUnmatch': '10px' }['envVariables'] || '10px', color: c.textFaint, marginTop: '6px' }}>
                  使用 {'{{variableName}}'} 在 URL/请求头/请求体中引用变量
                </div>
              </div>
            )}
          </div>

          {/* 响应区域 */}
          {currentResponse && (
            <div style={{ borderTop: `2px solid ${c.border}`, maxHeight: '40%', display: 'flex', flexDirection: 'column' }}>
              {/* 响应状态栏 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px',
                background: c.bgPanel, borderBottom: `1px solid ${c.border}`,
              }}>
                <span style={{ color: getStatusColor(currentResponse.status), fontWeight: 600, fontSize: '12px' }}>
                  {currentResponse.status} {currentResponse.statusText}
                </span>
                <span style={{ color: c.textMuted, fontSize: '11px' }}>
                  耗时: {currentResponse.duration}ms
                </span>
                <span style={{ color: c.textMuted, fontSize: '11px' }}>
                  大小: {(currentResponse.size / 1024).toFixed(2)} KB
                </span>
                <div style={{ flex: 1 }} />
                {(['body', 'headers', 'info'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setResponseTab(tab)}
                    style={{
                      padding: '3px 10px', border: 'none', borderBottom: `2px solid ${responseTab === tab ? c.accent : 'transparent'}`,
                      background: 'transparent', color: responseTab === tab ? c.accent : c.textMuted,
                      cursor: 'pointer', fontSize: '10px',
                    }}
                  >{tab === 'body' ? '响应体' : tab === 'headers' ? '响应头' : '信息'}</button>
                ))}
              </div>

              {/* 响应内容 */}
              <div style={{ flex: 1, overflow: 'auto', padding: '10px 16px' }}>
                {responseTab === 'body' && (
                  <pre style={{
                    margin: 0, fontSize: '11px', fontFamily: 'Consolas, Monaco, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: c.text,
                    lineHeight: '1.5',
                  }}>{formattedResponse}</pre>
                )}
                {responseTab === 'headers' && (
                  <div>
                    {Object.entries(currentResponse.headers).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '11px' }}>
                        <span style={{ color: c.accent, fontWeight: 500, minWidth: '150px' }}>{key}:</span>
                        <span style={{ color: c.textMuted, fontFamily: 'monospace' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {responseTab === 'info' && (
                  <div style={{ fontSize: '11px', color: c.textMuted, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div><strong>URL:</strong> {currentRequest.url}</div>
                    <div><strong>Method:</strong> {currentRequest.method}</div>
                    <div><strong>Status:</strong> <span style={{ color: getStatusColor(currentResponse.status) }}>{currentResponse.status} {currentResponse.statusText}</span></div>
                    <div><strong>Duration:</strong> {currentResponse.duration}ms</div>
                    <div><strong>Size:</strong> {currentResponse.size} bytes</div>
                    <div><strong>Timestamp:</strong> {new Date().toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
