/**
 * MonacoEditorPanel — Monaco 编辑器面板 + LSP 深度集成
 *
 * 功能：
 * - Monaco Editor 组件（使用 @monaco-editor/react 动态导入）
 * - LSP 集成（自动启动服务器、内联补全、诊断标记、跳转定义）
 * - 主题适配（dark/light → vs-dark/vs）
 * - 文件编辑 IPC（openEditor/saveEditor）
 * - 编辑器标签页（多文件切换 + Dirty 标记）
 * - 快捷键 Ctrl+S 保存
 * - 语言自动检测 + 手动切换
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface EditorTab {
  id: string
  filePath: string
  content: string
  isDirty: boolean
  language: string
  lastSaved?: number
}

export function MonacoEditorPanel({ cwd, theme, themeName, onClose }: { cwd: string; theme: ThemeColors; themeName: string; onClose: () => void }): JSX.Element {
  const c = theme
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [filePath, setFilePath] = useState('')
  const [openStatus, setOpenStatus] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [language, setLanguage] = useState('typescript')
  const [fontSize, setFontSize] = useState(14)
  const [lspStatus, setLspStatus] = useState('')

  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const diagnosticsRef = useRef<any>(null)
  const lspStartedRef = useRef<Set<string>>(new Set())

  const activeTab = tabs.find(t => t.id === activeTabId)

  // 检测语言
  const detectLanguage = useCallback((fp: string): string => {
    const ext = fp.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
      'json': 'json', 'md': 'markdown', 'py': 'python', 'rs': 'rust', 'go': 'go',
      'java': 'java', 'cpp': 'cpp', 'c': 'c', 'html': 'html', 'css': 'css',
      'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml', 'sh': 'shell', 'bash': 'shell',
      'sql': 'sql', 'rb': 'ruby', 'php': 'php', 'swift': 'swift', 'kt': 'kotlin'
    }
    return langMap[ext] || 'plaintext'
  }, [])

  // 启动 LSP 服务器
  const startLspServer = useCallback(async (langId: string) => {
    if (lspStartedRef.current.has(langId)) return
    const api = (window as any).dogeAPI as Record<string, any> | undefined
    if (!api?.lspStart) return
    setLspStatus(`启动 LSP (${langId})...`)
    try {
      const result = await api.lspStart(langId)
      if (result?.success) {
        lspStartedRef.current.add(langId)
        setLspStatus(`LSP: ${result.serverName || langId} 已连接`)
        setTimeout(() => setLspStatus(''), 3000)
      } else {
        setLspStatus(`LSP 启动失败: ${result?.error || ''}`)
      }
    } catch {
      setLspStatus('LSP 启动失败')
    }
  }, [])

  // 订阅 LSP 诊断事件
  useEffect(() => {
    const api = (window as any).dogeAPI as Record<string, any> | undefined
    if (!api?.onLspDiagnostic || !monacoRef.current) return

    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!model) return

    diagnosticsRef.current = monaco.editor.createDiagnosticCollection()
    diagnosticsRef.current.set(model.uri, [])

    const unsubscribe = api.onLspDiagnostic((uri: string, diags: any[]) => {
      if (!diagnosticsRef.current || !editorRef.current) return
      const currentModel = editorRef.current.getModel()
      if (!currentModel) return
      // 只处理当前文件
      const currentUri = currentModel.uri.toString()
      const targetUri = uri.replace('file://', '')
      if (!currentUri.includes(targetUri) && !targetUri.includes(currentUri.split('/').pop() || '')) return

      const markers = diags.map((d: any) => ({
        severity: d.severity === 1 ? monaco.MarkerSeverity.Error : d.severity === 2 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
        message: d.message,
        source: d.source || 'lsp',
        code: d.code,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
      }))
      diagnosticsRef.current.set(currentModel.uri, markers)
    })

    return () => {
      if (unsubscribe) unsubscribe()
      if (diagnosticsRef.current) {
        diagnosticsRef.current.dispose()
        diagnosticsRef.current = null
      }
    }
  }, [activeTabId])

  // 打开文件
  const handleOpenFile = useCallback(async () => {
    const fp = filePath.trim()
    if (!fp) return
    setOpenStatus('正在读取...')
    try {
      const api = (window as any).dogeAPI as Record<string, any> | undefined
      const result = await api?.readFile?.(fp)
      if (result?.success && result?.content !== undefined) {
        const lang = detectLanguage(fp)
        const newTab: EditorTab = {
          id: `tab-${Date.now()}`,
          filePath: fp,
          content: result.content,
          isDirty: false,
          language: lang,
          lastSaved: Date.now()
        }
        setTabs(prev => [...prev, newTab])
        setActiveTabId(newTab.id)
        setOpenStatus('')
        // 启动对应语言的 LSP 服务器
        if (lang !== 'plaintext' && lang !== 'markdown') {
          startLspServer(lang)
        }
      } else {
        setOpenStatus('读取失败')
      }
    } catch {
      setOpenStatus('读取失败')
    }
  }, [filePath, detectLanguage, startLspServer])

  // 保存文件
  const handleSave = useCallback(async () => {
    if (!activeTab) return
    setSaveStatus('保存中...')
    try {
      const api = (window as any).dogeAPI as Record<string, any> | undefined
      if (api?.writeFile) {
        const result = await api.writeFile(activeTab.filePath, activeTab.content)
        if (result?.success) {
          setTabs(prev => prev.map(t =>
            t.id === activeTab.id ? { ...t, isDirty: false, lastSaved: Date.now() } : t
          ))
          setSaveStatus('已保存')
        } else {
          setSaveStatus('保存失败: ' + (result?.error || '未知错误'))
        }
      }
    } catch {
      setSaveStatus('保存失败')
    }
    setTimeout(() => setSaveStatus(''), 2000)
  }, [activeTab])

  // 格式化代码
  const handleFormat = useCallback(async () => {
    if (!activeTab?.content) return
    try {
      const api = (window as any).dogeAPI as Record<string, any> | undefined
      if (api?.formatCode) {
        const result = await api.formatCode({ code: activeTab.content, language, tool: 'prettier', cwd })
        if (result?.success && result.output) {
          setTabs(prev => prev.map(t =>
            t.id === activeTab.id ? { ...t, content: result.output } : t
          ))
        }
      }
    } catch { /* ignore */ }
  }, [activeTab, language, cwd])

  // 关闭标签页
  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      }
      return newTabs
    })
  }, [activeTabId])

  // 编辑器内容变更
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTabId || value === undefined) return
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, content: value, isDirty: true } : t
    ))
  }, [activeTabId])

  // 快捷键：Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // 当激活标签页切换时，更新语言
  useEffect(() => {
    if (activeTab) {
      setLanguage(activeTab.language)
    }
  }, [activeTab])

  const monacoTheme = themeName === 'light' ? 'vs' : 'vs-dark'

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏 */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          value={filePath}
          onChange={e => setFilePath(e.target.value)}
          placeholder="文件路径 (如 src/main.ts)"
          style={{ flex: 1, padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }}
          onKeyDown={e => { if (e.key === 'Enter') handleOpenFile() }}
        />
        <button onClick={handleOpenFile} style={{ padding: '3px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>打开</button>
        <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }}>
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="json">JSON</option>
          <option value="markdown">Markdown</option>
          <option value="python">Python</option>
          <option value="rust">Rust</option>
          <option value="go">Go</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="plaintext">Plain Text</option>
        </select>
        <button onClick={handleFormat} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }}>格式化</button>
      </div>

      {/* 标签页栏 */}
      {tabs.length > 0 && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, background: c.bgPanel, overflowX: 'auto' }}>
          {tabs.map(tab => {
            const fileName = tab.filePath.split(/[/\\]/).pop() || tab.filePath
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  padding: '5px 10px', cursor: 'pointer', fontSize: '10px', borderRight: `1px solid ${c.border}`,
                  background: activeTabId === tab.id ? c.accentDim : 'transparent',
                  color: activeTabId === tab.id ? c.accent : c.text,
                  display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                }}
              >
                <span>{fileName}</span>
                {tab.isDirty && <span style={{ color: c.accent, fontSize: '8px' }}>●</span>}
                <span
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                  style={{ color: c.textFaint, fontSize: '10px', cursor: 'pointer', marginLeft: '2px' }}
                >✕</span>
              </div>
            )
          })}
        </div>
      )}

      {/* 状态栏 */}
      {activeTab && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderBottom: `1px solid ${c.border}`, background: c.bgPanel, fontSize: '9px', color: c.textFaint }}>
          <span>{activeTab.filePath} {activeTab.isDirty ? '● 未保存' : ''} {saveStatus ? `· ${saveStatus}` : ''}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span>Ln 1, Col 1</span>
            <span>{language}</span>
            <span>UTF-8</span>
            {lspStatus && <span style={{ color: '#4ECB71' }}>{lspStatus}</span>}
          </div>
        </div>
      )}

      {/* 编辑器或空状态 */}
      {!activeTab ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: c.textFaint, gap: '8px' }}>
          <div style={{ fontSize: '36px', opacity: 0.3 }}>📝</div>
          <div style={{ fontSize: '11px' }}>输入文件路径并点击"打开"开始编辑</div>
          <div style={{ fontSize: '9px', color: c.textFaint }}>支持 Ctrl+S 保存 · LSP 自动补全 · F12 跳转定义</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <MonacoEditor
            path={activeTab.filePath}
            value={activeTab.content}
            language={language}
            theme={monacoTheme}
            fontSize={fontSize}
            cwd={cwd}
            onChange={handleEditorChange}
            onMount={(editor: any, monaco: any) => {
              editorRef.current = editor
              monacoRef.current = monaco
              // 注册 LSP 补全 Provider
              registerLspCompletion(monaco, editor, cwd)
              // 注册 LSP 跳转定义 Provider
              registerLspDefinition(monaco, editor, cwd)
              // 注册 LSP 悬停 Provider
              registerLspHover(monaco, editor, cwd)
            }}
          />
        </div>
      )}

      {/* 底部工具栏 */}
      <div style={{ borderTop: `1px solid ${c.border}`, padding: '4px 8px', display: 'flex', gap: '4px', alignItems: 'center', background: c.bgPanel }}>
        <span style={{ color: c.textFaint, fontSize: '9px' }}>字体:</span>
        <input
          type="number"
          value={fontSize}
          onChange={e => setFontSize(Number(e.target.value) || 12)}
          min={10}
          max={24}
          style={{ width: '40px', padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }}
        />
        <button onClick={handleSave} disabled={!activeTab?.isDirty} style={{ padding: '3px 10px', border: 'none', borderRadius: '3px', background: activeTab?.isDirty ? c.accent : c.border, color: activeTab?.isDirty ? '#000' : c.textFaint, cursor: activeTab?.isDirty ? 'pointer' : 'default', fontSize: '10px', fontWeight: 600 }}>💾 保存</button>
        {openStatus && <span style={{ color: c.textFaint, fontSize: '9px' }}>{openStatus}</span>}
        {saveStatus && !saveStatus.includes('已保存') && <span style={{ color: c.errorText || '#f59e0b', fontSize: '9px' }}>{saveStatus}</span>}
      </div>
    </div>
  )
}

// ─── LSP 集成辅助函数 ───

async function fetchLspCompletion(filePath: string, line: number, character: number, cwd: string): Promise<any[]> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspCompletion) return []
  try {
    const result = await api.lspCompletion(filePath, line, character)
    if (result?.success && result.items) {
      return result.items.map((item: any) => ({
        label: item.label,
        kind: item.kind || 1,
        detail: item.detail || '',
        documentation: item.documentation || '',
        insertText: item.insertText || item.label,
        filterText: item.filterText || item.label,
        sortText: item.sortText || '0',
      }))
    }
  } catch { /* ignore */ }
  return []
}

async function fetchLspDefinition(filePath: string, line: number, character: number): Promise<any[]> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspDefinition) return []
  try {
    const result = await api.lspDefinition(filePath, line, character)
    if (result?.success && result.locations) {
      return result.locations.map((loc: any) => ({
        uri: loc.uri,
        range: loc.range,
      }))
    }
  } catch { /* ignore */ }
  return []
}

async function fetchLspHover(filePath: string, line: number, character: number): Promise<string | null> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspHover) return null
  try {
    const result = await api.lspHover(filePath, line, character)
    if (result?.success && result.result?.contents) {
      const contents = result.result.contents
      if (typeof contents === 'string') return contents
      if (Array.isArray(contents)) return contents.map((c: any) => typeof c === 'string' ? c : c.value || '').join('\n')
      return ''
    }
  } catch { /* ignore */ }
  return null
}

function registerLspCompletion(monaco: any, editor: any, cwd: string) {
  monaco.languages.registerCompletionItemProvider('*', {
    triggerCharacters: ['.', '<', ' ', '/'],
    async provideCompletionItems(model: any, position: any) {
      const filePath = model.uri.path
      const line = position.lineNumber - 1
      const character = position.column - 1
      const items = await fetchLspCompletion(filePath, line, character, cwd)
      return { suggestions: items }
    }
  })
}

function registerLspDefinition(monaco: any, editor: any, _cwd: string) {
  monaco.languages.registerDefinitionProvider('*', {
    async provideDefinition(model: any, position: any) {
      const filePath = model.uri.path
      const line = position.lineNumber - 1
      const character = position.column - 1
      const locations = await fetchLspDefinition(filePath, line, character)
      if (locations.length === 0) return { definitions: [] }
      return {
        definitions: locations.map((loc: any) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: new monaco.Range(
            loc.range.start.line + 1, loc.range.start.character + 1,
            loc.range.end.line + 1, loc.range.end.character + 1
          ),
        }))
      }
    }
  })
}

function registerLspHover(monaco: any, editor: any, _cwd: string) {
  monaco.languages.registerHoverProvider('*', {
    async provideHover(model: any, position: any) {
      const filePath = model.uri.path
      const line = position.lineNumber - 1
      const character = position.column - 1
      const contents = await fetchLspHover(filePath, line, character)
      if (!contents) return null
      return {
        contents: [{ value: contents }],
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
      }
    }
  })
}

// Monaco Editor 子组件（动态导入避免 SSR 问题）
function MonacoEditor({
  path, value, language, theme, fontSize, cwd, onChange, onMount
}: {
  path: string; value: string; language: string; theme: string; fontSize: number;
  cwd: string; onChange: (value: string | undefined) => void; onMount: (editor: any, monaco: any) => void
}) {
  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<any> | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    import('@monaco-editor/react').then(mod => {
      setEditorComponent(() => mod.default)
    }).catch(() => setLoadError('Monaco Editor 加载失败'))
  }, [])

  if (loadError) {
    return <div style={{ padding: '16px', color: '#f59e0b', fontSize: '11px' }}>{loadError}</div>
  }

  if (!EditorComponent) {
    return <div style={{ padding: '16px', textAlign: 'center', color: '#888', fontSize: '10px' }}>加载编辑器中...</div>
  }

  return (
    <EditorComponent
      height="100%"
      language={language}
      theme={theme}
      value={value}
      onChange={onChange}
      onMount={onMount}
      path={path}
      options={{
        fontSize,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        lineNumbers: 'on',
        folding: true,
        bracketPairColorization: { enabled: true },
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        formatOnPaste: true,
        formatOnType: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
        lightbulb: { enabled: true },
        goToDefinition: true,
        find: { addExtraSpaceOnTop: false },
      }}
    />
  )
}
