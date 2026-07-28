/**
 * LspPanel — LSP 功能面板组件
 *
 * 提供 LSP 服务器管理和代码智能功能：
 * - 服务器启动/停止（TypeScript/JavaScript/Python/Go/Rust 等）
 * - 代码补全（completion）
 * - 转到定义（go to definition）
 * - 查找引用（find references）
 * - 悬停信息（hover）
 * - 文档符号（document symbol）
 * - 工作区符号（workspace symbol）
 * - 诊断信息显示
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { useLsp, type LspCompletionItem, type LspLocation, type LspDiagnostic } from '../hooks/useLsp.js'

interface LspPanelProps {
  /** 当前文件路径 */
  filePath: string
  /** 文件内容 */
  content: string
  /** 光标行号（0-based） */
  cursorLine: number
  /** 光标列号（0-based） */
  cursorColumn: number
  /** 主题颜色 */
  theme: ThemeColors
  /** 关闭回调 */
  onClose: () => void
  /** 跳转到定义回调 */
  onGoToDefinition?: (filePath: string, line: number, column: number) => void
}

// ─── 语言 ID 选项 ───

const LANGUAGE_OPTIONS = [
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'tsx'] },
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'jsx'] },
  { id: 'python', label: 'Python', extensions: ['py'] },
  { id: 'go', label: 'Go', extensions: ['go'] },
  { id: 'rust', label: 'Rust', extensions: ['rs'] },
  { id: 'java', label: 'Java', extensions: ['java'] },
  { id: 'csharp', label: 'C#', extensions: ['cs'] },
  { id: 'ruby', label: 'Ruby', extensions: ['rb'] },
  { id: 'php', label: 'PHP', extensions: ['php'] },
  { id: 'swift', label: 'Swift', extensions: ['swift'] },
  { id: 'kotlin', label: 'Kotlin', extensions: ['kt'] },
  { id: 'scala', label: 'Scala', extensions: ['scala'] },
  { id: 'c', label: 'C', extensions: ['c', 'h'] },
  { id: 'cpp', label: 'C++', extensions: ['cpp', 'hpp'] },
]

// ─── Tab 类型 ───

type TabType = 'servers' | 'completion' | 'navigation' | 'diagnostics' | 'symbols'

// ─── 辅助函数 ───

function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || ''
}

function detectLanguageId(filePath: string): string {
  const ext = getFileExtension(filePath)
  const extMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust',
    java: 'java', cs: 'csharp', rb: 'ruby',
    php: 'php', swift: 'swift', kt: 'kotlin',
    scala: 'scala', c: 'c', cpp: 'cpp',
    h: 'c', hpp: 'cpp',
  }
  return extMap[ext] || 'typescript'
}

function getSeverityLabel(severity: number): string {
  switch (severity) {
    case 1: return '错误'
    case 2: return '警告'
    case 3: return '提示'
    case 4: return '忽略'
    default: return '未知'
  }
}

function getSeverityColor(severity: number, theme: ThemeColors): string {
  switch (severity) {
    case 1: return '#FF6B6B'
    case 2: return '#FFB347'
    case 3: return '#4ECB71'
    case 4: return '#888'
    default: return theme.textSecondary
  }
}

// ─── 组件 ───

export function LspPanel({ filePath, content, cursorLine, cursorColumn, theme, onClose, onGoToDefinition }: LspPanelProps) {
  const c = theme
  const {
    connectedServers, isConnected, startServer, stopServer, stopAll,
    completion, definition, references, hover, documentSymbol, workspaceSymbol, diagnostics, error,
  } = useLsp()

  const [activeTab, setActiveTab] = useState<TabType>('servers')
  const [selectedLanguage, setSelectedLanguage] = useState(detectLanguageId(filePath))
  const [isStarting, setIsStarting] = useState(false)
  const [completions, setCompletions] = useState<LspCompletionItem[]>([])
  const [isLoadingCompletions, setIsLoadingCompletions] = useState(false)
  const [definitions, setDefinitions] = useState<LspLocation[]>([])
  const [refs, setRefs] = useState<LspLocation[]>([])
  const [hoverInfo, setHoverInfo] = useState<{ contents?: unknown } | null>(null)
  const [symbols, setSymbols] = useState<{ name: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } } }[]>([])
  const [wsQuery, setWsQuery] = useState('')
  const [wsResults, setWsResults] = useState<{ name: string; kind: number; location: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } }[]>([])
  const [serverError, setServerError] = useState<string | null>(null)

  // 当文件路径变化时自动检测语言
  useEffect(() => {
    setSelectedLanguage(detectLanguageId(filePath))
  }, [filePath])

  // 启动服务器
  const handleStartServer = useCallback(async (langId: string) => {
    setIsStarting(true)
    setServerError(null)
    try {
      const result = await startServer(langId)
      if (result.error) setServerError(result.error)
    } finally {
      setIsStarting(false)
    }
  }, [startServer])

  // 停止服务器
  const handleStopServer = useCallback(async (langId: string) => {
    setServerError(null)
    await stopServer(langId)
  }, [stopServer])

  // 获取补全
  const handleCompletion = useCallback(async () => {
    if (!isConnected || !filePath) return
    setIsLoadingCompletions(true)
    setCompletions([])
    try {
      const items = await completion(filePath, cursorLine, cursorColumn)
      setCompletions(items)
      if (items.length > 0) {
        setActiveTab('completion')
      }
    } finally {
      setIsLoadingCompletions(false)
    }
  }, [isConnected, filePath, cursorLine, cursorColumn, completion])

  // 转到定义
  const handleDefinition = useCallback(async () => {
    if (!isConnected || !filePath) return
    const locs = await definition(filePath, cursorLine, cursorColumn)
    setDefinitions(locs)
    if (locs.length > 0) {
      setActiveTab('navigation')
    }
  }, [isConnected, filePath, cursorLine, cursorColumn, definition])

  // 查找引用
  const handleReferences = useCallback(async () => {
    if (!isConnected || !filePath) return
    const locs = await references(filePath, cursorLine, cursorColumn)
    setRefs(locs)
    if (locs.length > 0) {
      setActiveTab('navigation')
    }
  }, [isConnected, filePath, cursorLine, cursorColumn, references])

  // 悬停信息
  const handleHover = useCallback(async () => {
    if (!isConnected || !filePath) return
    const info = await hover(filePath, cursorLine, cursorColumn)
    setHoverInfo(info)
    if (info) {
      setActiveTab('navigation')
    }
  }, [isConnected, filePath, cursorLine, cursorColumn, hover])

  // 文档符号
  const handleDocumentSymbol = useCallback(async () => {
    if (!isConnected || !filePath) return
    const syms = await documentSymbol(filePath)
    setSymbols(syms)
    if (syms.length > 0) {
      setActiveTab('symbols')
    }
  }, [isConnected, filePath, documentSymbol])

  // 工作区符号搜索
  const handleWorkspaceSymbol = useCallback(async () => {
    if (!wsQuery.trim()) return
    const results = await workspaceSymbol(wsQuery)
    setWsResults(results)
  }, [wsQuery, workspaceSymbol])

  // 诊断数据
  const diagnosticEntries = useMemo(() => {
    const entries: { uri: string; diagnostics: LspDiagnostic[] }[] = []
    diagnostics.forEach((diags, uri) => {
      entries.push({ uri, diagnostics: diags })
    })
    return entries
  }, [diagnostics])

  // ─── 样式 ───

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: c.bgPrimary,
    color: c.textPrimary,
    fontFamily: c.fontFamily,
    fontSize: c.fontSize,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: `1px solid ${c.borderColor}`,
    background: c.bgSecondary,
  }

  const tabsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '2px',
    borderBottom: `1px solid ${c.borderColor}`,
    background: c.bgSecondary,
    overflowX: 'auto',
  }

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    border: 'none',
    background: active ? c.bgPrimary : 'transparent',
    color: active ? c.textPrimary : c.textSecondary,
    cursor: 'pointer',
    fontSize: c.fontSize,
    fontFamily: c.fontFamily,
    whiteSpace: 'nowrap',
    borderBottom: active ? `2px solid ${c.accent}` : '2px solid transparent',
  })

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: `1px solid ${c.borderColor}`,
    borderRadius: '4px',
    background: c.bgSecondary,
    color: c.textPrimary,
    cursor: 'pointer',
    fontSize: c.fontSize,
    fontFamily: c.fontFamily,
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#fff',
    border: 'none',
  }

  const selectStyle: React.CSSProperties = {
    padding: '4px 8px',
    border: `1px solid ${c.borderColor}`,
    borderRadius: '4px',
    background: c.bgPrimary,
    color: c.textPrimary,
    fontSize: c.fontSize,
    fontFamily: c.fontFamily,
  }

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    border: `1px solid ${c.borderColor}`,
    borderRadius: '4px',
    background: c.bgPrimary,
    color: c.textPrimary,
    fontSize: c.fontSize,
    fontFamily: c.fontFamily,
    flex: 1,
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px',
    border: `1px solid ${c.borderColor}`,
    borderRadius: '4px',
    marginBottom: '6px',
    background: c.bgSecondary,
  }

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: color + '22',
    color,
    fontSize: '11px',
    fontFamily: c.fontFamily,
  })

  const errorStyle: React.CSSProperties = {
    color: '#FF6B6B',
    padding: '8px',
    fontSize: c.fontSize,
  }

  // ─── 渲染服务器列表 ───

  const renderServersTab = () => (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            style={selectStyle}
          >
            {LANGUAGE_OPTIONS.map(lang => (
              <option key={lang.id} value={lang.id}>{lang.label}</option>
            ))}
          </select>
          {!connectedServers.includes(selectedLanguage) ? (
            <button
              onClick={() => handleStartServer(selectedLanguage)}
              disabled={isStarting}
              style={isStarting ? { ...primaryButtonStyle, opacity: 0.6 } : primaryButtonStyle}
            >
              {isStarting ? '启动中...' : '启动'}
            </button>
          ) : (
            <button onClick={() => handleStopServer(selectedLanguage)} style={buttonStyle}>
              停止
            </button>
          )}
        </div>

        <button onClick={stopAll} style={{ ...buttonStyle, marginRight: '4px' }}>
          停止所有服务器
        </button>
        <button onClick={() => { setCompletions([]); setDefinitions([]); setRefs([]); setHoverInfo(null); setSymbols([]); setWsResults([]); }} style={buttonStyle}>
          清除结果
        </button>
      </div>

      {error && <div style={errorStyle}>错误: {error}</div>}
      {serverError && <div style={errorStyle}>{serverError}</div>}

      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: 600, marginBottom: '6px', color: c.textSecondary, fontSize: '12px' }}>
          已连接服务器 ({connectedServers.length})
        </div>
        {connectedServers.length === 0 ? (
          <div style={{ color: c.textSecondary, fontSize: '12px', fontStyle: 'italic' }}>
            无已连接的 LSP 服务器。请选择语言并点击"启动"。
          </div>
        ) : (
          connectedServers.map(name => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ECB71' }} />
                <span style={{ fontSize: c.fontSize }}>{name}</span>
              </div>
              <button onClick={() => handleStopServer(name)} style={{ ...buttonStyle, padding: '2px 8px', fontSize: '11px' }}>
                停止
              </button>
            </div>
          ))
        )}
      </div>

      {!isConnected && (
        <div style={cardStyle}>
          <div style={{ color: c.textSecondary, fontSize: '12px', lineHeight: 1.5 }}>
            <strong>使用说明:</strong>
            <ol style={{ margin: '4px 0', paddingLeft: '16px' }}>
              <li>选择当前文件对应的语言</li>
              <li>点击"启动"启动 LSP 服务器</li>
              <li>切换到其他标签页使用 LSP 功能</li>
            </ol>
            <p style={{ margin: '4px 0 0 0' }}>
              注意: 需要全局安装对应的 LSP 服务器（如 <code>npm install -g typescript-language-server</code>）。
            </p>
          </div>
        </div>
      )}
    </div>
  )

  // ─── 渲染补全结果 ───

  const renderCompletionTab = () => (
    <div>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '4px' }}>
        <button onClick={handleCompletion} disabled={!isConnected || isLoadingCompletions} style={!isConnected || isLoadingCompletions ? { ...primaryButtonStyle, opacity: 0.6 } : primaryButtonStyle}>
          {isLoadingCompletions ? '获取中...' : '获取补全'}
        </button>
        <span style={{ color: c.textSecondary, fontSize: '12px', alignSelf: 'center' }}>
          位置: 行 {cursorLine + 1}, 列 {cursorColumn + 1}
        </span>
      </div>

      {completions.length === 0 ? (
        <div style={{ color: c.textSecondary, fontSize: '12px', fontStyle: 'italic' }}>
          {isConnected ? '点击"获取补全"查看代码补全建议' : '请先启动 LSP 服务器'}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px' }}>
            共 {completions.length} 个补全建议
          </div>
          {completions.map((item, idx) => (
            <div key={idx} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: item.detail ? '2px' : '0' }}>
                <span style={{ fontWeight: 600, fontSize: c.fontSize }}>{item.label}</span>
                {item.kind !== undefined && (
                  <span style={badgeStyle(c.accent)}>kind: {item.kind}</span>
                )}
              </div>
              {item.detail && (
                <div style={{ color: c.textSecondary, fontSize: '12px' }}>{item.detail}</div>
              )}
              {item.documentation && (
                <div style={{ color: c.textSecondary, fontSize: '11px', marginTop: '2px' }}>
                  {typeof item.documentation === 'string' ? item.documentation : JSON.stringify(item.documentation)}
                </div>
              )}
              <div style={{
                marginTop: '4px',
                padding: '4px',
                background: c.bgPrimary,
                borderRadius: '2px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: c.textPrimary,
              }}>
                {item.insertText}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── 渲染导航结果 ───

  const renderNavigationTab = () => (
    <div>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <button onClick={handleDefinition} disabled={!isConnected} style={!isConnected ? { ...primaryButtonStyle, opacity: 0.6 } : primaryButtonStyle}>
          转到定义 ({definitions.length})
        </button>
        <button onClick={handleReferences} disabled={!isConnected} style={!isConnected ? { ...buttonStyle, opacity: 0.6 } : buttonStyle}>
          查找引用 ({refs.length})
        </button>
        <button onClick={handleHover} disabled={!isConnected} style={!isConnected ? { ...buttonStyle, opacity: 0.6 } : buttonStyle}>
          悬停信息
        </button>
      </div>

      {hoverInfo && (
        <div style={{ ...cardStyle, marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px' }}>悬停信息:</div>
          <div style={{ fontSize: c.fontSize }}>
            {typeof hoverInfo.contents === 'string' ? hoverInfo.contents : JSON.stringify(hoverInfo.contents, null, 2)}
          </div>
        </div>
      )}

      {definitions.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px' }}>定义位置:</div>
          {definitions.map((loc, idx) => (
            <div key={idx} style={cardStyle}>
              <div style={{ fontSize: c.fontSize }}>
                {loc.uri.replace('file:///', '')}
              </div>
              <div style={{ fontSize: '12px', color: c.textSecondary }}>
                行 {loc.range.start.line + 1}, 列 {loc.range.start.character + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {refs.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px' }}>引用位置:</div>
          {refs.map((loc, idx) => (
            <div key={idx} style={cardStyle}>
              <div style={{ fontSize: c.fontSize }}>
                {loc.uri.replace('file:///', '')}
              </div>
              <div style={{ fontSize: '12px', color: c.textSecondary }}>
                行 {loc.range.start.line + 1}, 列 {loc.range.start.character + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isConnected && definitions.length === 0 && refs.length === 0 && !hoverInfo && (
        <div style={{ color: c.textSecondary, fontSize: '12px', fontStyle: 'italic' }}>
          请先启动 LSP 服务器
        </div>
      )}
    </div>
  )

  // ─── 渲染符号 ───

  const renderSymbolsTab = () => (
    <div>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '4px' }}>
        <button onClick={handleDocumentSymbol} disabled={!isConnected} style={!isConnected ? { ...primaryButtonStyle, opacity: 0.6 } : primaryButtonStyle}>
          文档符号 ({symbols.length})
        </button>
      </div>

      <div style={{ marginBottom: '8px', display: 'flex', gap: '4px' }}>
        <input
          type="text"
          placeholder="搜索工作区符号..."
          value={wsQuery}
          onChange={(e) => setWsQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleWorkspaceSymbol()}
          style={inputStyle}
        />
        <button onClick={handleWorkspaceSymbol} disabled={!isConnected || !wsQuery.trim()} style={!isConnected || !wsQuery.trim() ? { ...buttonStyle, opacity: 0.6 } : buttonStyle}>
          搜索
        </button>
      </div>

      {symbols.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px' }}>文档符号:</div>
          {symbols.map((sym, idx) => (
            <div key={idx} style={{ ...cardStyle, cursor: 'pointer' }}
              onClick={() => onGoToDefinition?.(filePath, sym.range.start.line, sym.range.start.character)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={badgeStyle(c.accent)}>kind: {sym.kind}</span>
                <span style={{ fontSize: c.fontSize }}>{sym.name}</span>
              </div>
              <div style={{ fontSize: '12px', color: c.textSecondary, marginTop: '2px' }}>
                行 {sym.range.start.line + 1}, 列 {sym.range.start.character + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {wsResults.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px' }}>
            工作区搜索结果 ({wsResults.length}):
          </div>
          {wsResults.map((result, idx) => (
            <div key={idx} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={badgeStyle(c.accent)}>kind: {result.kind}</span>
                <span style={{ fontSize: c.fontSize }}>{result.name}</span>
              </div>
              <div style={{ fontSize: '12px', color: c.textSecondary, marginTop: '2px' }}>
                {result.location.uri.replace('file:///', '')} — 行 {result.location.range.start.line + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {symbols.length === 0 && wsResults.length === 0 && (
        <div style={{ color: c.textSecondary, fontSize: '12px', fontStyle: 'italic' }}>
          点击"文档符号"查看当前文件符号，或在搜索框中输入关键词搜索工作区符号
        </div>
      )}
    </div>
  )

  // ─── 渲染诊断 ───

  const renderDiagnosticsTab = () => (
    <div>
      <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '8px' }}>
        {diagnosticEntries.length === 0 ? '暂无诊断信息。打开文件后 LSP 服务器会自动发送诊断。' : `${diagnosticEntries.reduce((sum, e) => sum + e.diagnostics.length, 0)} 个问题`}
      </div>

      {diagnosticEntries.map(({ uri, diagnostics: diags }) => (
        <div key={uri} style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: c.textSecondary, marginBottom: '4px', fontWeight: 600 }}>
            {uri.replace('file:///', '')}
          </div>
          {diags.map((diag, idx) => (
            <div key={idx} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={badgeStyle(getSeverityColor(diag.severity, theme))}>
                  {getSeverityLabel(diag.severity)}
                </span>
                {diag.source && (
                  <span style={{ fontSize: '11px', color: c.textSecondary }}>{diag.source}</span>
                )}
              </div>
              <div style={{ fontSize: c.fontSize, marginBottom: '2px' }}>{diag.message}</div>
              <div style={{ fontSize: '12px', color: c.textSecondary }}>
                行 {diag.range.start.line + 1}, 列 {diag.range.start.character + 1}
                {diag.code !== undefined && ` — 代码: ${diag.code}`}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  // ─── 主渲染 ───

  const tabs: { type: TabType; label: string }[] = [
    { type: 'servers', label: '服务器' },
    { type: 'completion', label: '补全' },
    { type: 'navigation', label: '导航' },
    { type: 'symbols', label: '符号' },
    { type: 'diagnostics', label: `诊断 (${diagnosticEntries.reduce((s, e) => s + e.diagnostics.length, 0)})` },
  ]

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>LSP 智能功能</span>
        <button onClick={onClose} style={{ ...buttonStyle, padding: '2px 8px', fontSize: '12px' }}>关闭</button>
      </div>

      <div style={tabsStyle}>
        {tabs.map(tab => (
          <button key={tab.type} onClick={() => setActiveTab(tab.type)} style={tabButtonStyle(activeTab === tab.type)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={contentStyle}>
        {activeTab === 'servers' && renderServersTab()}
        {activeTab === 'completion' && renderCompletionTab()}
        {activeTab === 'navigation' && renderNavigationTab()}
        {activeTab === 'symbols' && renderSymbolsTab()}
        {activeTab === 'diagnostics' && renderDiagnosticsTab()}
      </div>
    </div>
  )
}
