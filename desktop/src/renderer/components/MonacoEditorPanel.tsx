/**
 * MonacoEditorPanel — Monaco 编辑器面板 + LSP 深度集成
 *
 * 功能：
 * - Monaco Editor 组件（使用 @monaco-editor/react 动态导入）
 * - LSP 集成（自动启动服务器、补全、定义、引用、悬停、文档符号、工作区符号、高亮、诊断标记）
 * - 内联补全（灰色文字跟随光标）
 * - 主题适配（dark/light → vs-dark/vs）
 * - 文件编辑 IPC（openEditor/saveEditor）
 * - 编辑器标签页（多文件切换 + Dirty 标记）
 * - 快捷键 Ctrl+S 保存
 * - 语言自动检测 + 手动切换
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { useCallChain } from '../hooks/useCallChain.js'
import { CallChainPanel } from './CallChainPanel.js'

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
  const inlineEditPosRef = useRef<{ lineNumber: number; column: number } | null>(null)
  const inlineEditSelectionRef = useRef<string>('')
  const [inlineEditVisible, setInlineEditVisible] = useState(false)
  const [inlineEditPrompt, setInlineEditPrompt] = useState('')
  const [inlineEditLoading, setInlineEditLoading] = useState(false)

  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const diagnosticsRef = useRef<any>(null)
  const lspStartedRef = useRef<Set<string>>(new Set())
  const highlightsDecorationsRef = useRef<Set<string>>(new Set())
  const [bookmarks, setBookmarks] = useState<{line: number; column: number}[]>([])
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [symbols, setSymbols] = useState<any[]>([])
  const [showOutline, setShowOutline] = useState(false)
  const [columnSelectMode, setColumnSelectMode] = useState(false)
  const [showCallChain, setShowCallChain] = useState(false)
  const [showTypeHint, setShowTypeHint] = useState(false)
  const [typeHint, setTypeHint] = useState<{ text: string; line: number; column: number } | null>(null)
  const typeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bookmarksRef = useRef<Set<number>>(new Set())
  const bookmarkDecorationsRef = useRef<Map<number, string[]>>(new Map())

  const activeTab = tabs.find(t => t.id === activeTabId)

  // 调用链分析
  const callChainResult = useCallChain({
    filePath: activeTab?.filePath || '',
    content: activeTab?.content || '',
    enabled: !!activeTab && showCallChain,
  })

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
        setLspStatus(` 错误: LSP 启动失败: ${result?.error || ''}`)
      }
    } catch {
      setLspStatus(' 错误: LSP 启动失败')
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

  // 书签操作
  const toggleBookmark = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const position = editor.getPosition()
    if (!position) return
    const line = position.lineNumber
    const monaco = monacoRef.current
    if (bookmarksRef.current.has(line)) {
      // 移除书签
      setBookmarks(prev => prev.filter(b => b.line !== line))
      bookmarksRef.current.delete(line)
      const oldDecos = bookmarkDecorationsRef.current.get(line) || []
      editor.deltaDecorations(oldDecos, [])
      bookmarkDecorationsRef.current.delete(line)
    } else {
      // 添加书签
      setBookmarks(prev => [...prev, { line, column: position.column }])
      bookmarksRef.current.add(line)
      const decoIds = editor.deltaDecorations([], [{
        range: new (monaco as any).Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'bookmark-line', glyphMarginClassName: 'bookmark-glyph', glyphMarginHoverMessage: { value: '书签' } }
      }])
      bookmarkDecorationsRef.current.set(line, decoIds)
    }
  }, [])

  const clearBookmarks = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    // 清除所有书签装饰
    bookmarkDecorationsRef.current.forEach((decoIds, _line) => {
      editor.deltaDecorations(decoIds, [])
    })
    bookmarkDecorationsRef.current.clear()
    setBookmarks([])
    bookmarksRef.current.clear()
  }, [])

  const jumpToPrevBookmark = useCallback(() => {
    const editor = editorRef.current
    if (!editor || bookmarks.length === 0) return
    const currentLine = editor.getPosition()?.lineNumber || 0
    const sorted = [...bookmarks].sort((a, b) => a.line - b.line)
    const prev = [...sorted].reverse().find(b => b.line < currentLine) || sorted[sorted.length - 1]
    if (prev) editor.setPosition({ lineNumber: prev.line, column: prev.column })
  }, [bookmarks])

  const jumpToNextBookmark = useCallback(() => {
    const editor = editorRef.current
    if (!editor || bookmarks.length === 0) return
    const currentLine = editor.getPosition()?.lineNumber || 0
    const sorted = [...bookmarks].sort((a, b) => a.line - b.line)
    const next = sorted.find(b => b.line > currentLine) || sorted[0]
    if (next) editor.setPosition({ lineNumber: next.line, column: next.column })
  }, [bookmarks])

  // 列选择模式
  const toggleColumnSelect = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const newMode = !columnSelectMode
    setColumnSelectMode(newMode)
    // Monaco 通过 changeConfiguration 切换 columnSelection
    editor.updateOptions({ columnSelection: newMode })
  }, [columnSelectMode])

  // 类型推导提示切换
  const toggleTypeHint = useCallback(() => {
    setShowTypeHint(p => !p)
  }, [])

  // 监听光标变化，实时获取类型信息
  const handleCursorChange = useCallback(async () => {
    if (!showTypeHint) { setTypeHint(null); return }
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const position = editor.getPosition()
    if (!position) return
    const filePath = model.uri.path
    const line = position.lineNumber - 1
    const character = position.column - 1
    try {
      const contents = await fetchLspHover(filePath, line, character)
      if (contents && contents.trim()) {
        setTypeHint({ text: contents.trim(), line: position.lineNumber, column: position.column })
      } else {
        setTypeHint(null)
      }
    } catch {
      setTypeHint(null)
    }
  }, [showTypeHint])

  // 最近文件
  const pushRecentFile = useCallback((fp: string) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f !== fp)
      return [fp, ...filtered].slice(0, 20)
    })
  }, [])

  const switchToRecentFile = useCallback(async (index: number) => {
    const fp = recentFiles[index]
    if (!fp) return
    setFilePath(fp)
    await handleOpenFile()
  }, [recentFiles, handleOpenFile])

  // 符号大纲
  const loadSymbols = useCallback(async () => {
    if (!activeTab) { setSymbols([]); return }
    try {
      const result = (window as any).dogeAPI?.lspDocumentSymbol?.(activeTab.filePath)
      if (result?.success && result.symbols) {
        setSymbols(result.symbols)
      } else {
        setSymbols([])
      }
    } catch { setSymbols([]) }
  }, [activeTab])

  // 跳转到定义
  const goToDefinition = useCallback(() => {
    editorRef.current?.getAction('editor.action.goToDefinition')?.run()
  }, [])

  // 查找引用
  const findReferences = useCallback(() => {
    editorRef.current?.getAction('editor.action.referenceSearch.trigger')?.run()
  }, [])

  // 内联编辑 (Ctrl+K)
  const handleInlineEdit = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const selection = editor.getSelection()
    const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : ''
    inlineEditSelectionRef.current = selectedText
    if (selection && !selection.isEmpty()) {
      inlineEditPosRef.current = { lineNumber: selection.startLineNumber, column: selection.startColumn }
    } else {
      const pos = editor.getPosition()
      inlineEditPosRef.current = pos ? { lineNumber: pos.lineNumber, column: pos.column } : null
    }
    setInlineEditVisible(true)
    setInlineEditPrompt('')
  }, [])

  const handleInlineEditSubmit = useCallback(async () => {
    if (!inlineEditPrompt.trim()) return
    setInlineEditLoading(true)
    try {
      const api = (window as any).dogeAPI as Record<string, any> | undefined
      const model = editorRef.current?.getModel()
      const code = model ? model.getValue() : ''
      const pos = inlineEditPosRef.current
      if (!api?.sendMessage || !pos) { setInlineEditLoading(false); return }
      const sysMsg = '你是代码编辑器助手。根据用户修改意图输出替换代码片段。只输出代码。'
      const userContent = '当前代码：\n```\n' + code + '\n```\n' + (inlineEditSelectionRef.current ? '选中代码：\n' + inlineEditSelectionRef.current + '\n' : '') + '修改意图：' + inlineEditPrompt
      const fullPrompt = sysMsg + '\n\n' + userContent
      const result = await api.sendMessage(fullPrompt)
      const reply = result?.content || ''
      const cleanCode = reply.replace(/```[\w]*\n?/, '').replace(/```$/, '').trim()
      if (cleanCode && editorRef.current) {
        const ed = editorRef.current
        const selectedText = inlineEditSelectionRef.current
        const startLine = pos.lineNumber
        const startCol = pos.column
        const newlineCount = (selectedText.match(/\n/g) || []).length
        const endLine = startLine + newlineCount
        const lastLineText = (selectedText.split('\n').pop() || '')
        const endCol = selectedText ? startCol + lastLineText.length : startCol + 200
        ed.executeEdits('ai-edit', [{ range: new monacoRef.current.Range(startLine, startCol, endLine, endCol), text: cleanCode }])
        ed.focus()
      }
    } catch (err) {
      console.error('Inline edit failed:', err)
    } finally {
      setInlineEditLoading(false)
      setInlineEditVisible(false)
      setInlineEditPrompt('')
    }
  }, [])

  // 快捷键绑定
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        if (recentFiles.length > 0) switchToRecentFile(0)
      }
      if (e.key === 'F12') { e.preventDefault(); goToDefinition() }
      if (e.shiftKey && e.key === 'F12') { e.preventDefault(); findReferences() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') { e.preventDefault(); setShowOutline(p => !p) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); handleInlineEdit() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') { e.preventDefault(); setShowCallChain(p => !p) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') { e.preventDefault(); toggleTypeHint() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recentFiles, switchToRecentFile, goToDefinition, findReferences, handleInlineEdit, toggleTypeHint, setShowCallChain])

  // 当文件打开时更新最近文件和符号
  useEffect(() => {
    if (activeTab) {
      pushRecentFile(activeTab.filePath)
      if (showOutline) loadSymbols()
    }
  }, [activeTab?.id, pushRecentFile, loadSymbols, showOutline])

  // 当激活标签页切换时，更新语言
  useEffect(() => {
    if (activeTab) {
      setLanguage(activeTab.language)
    }
  }, [activeTab])

  // 切换符号大纲可见性时重新加载
  useEffect(() => {
    if (showOutline && activeTab) {
      loadSymbols()
    }
  }, [showOutline, activeTab?.id, loadSymbols])

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
        <button onClick={toggleBookmark} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: bookmarks.length > 0 ? c.accentDim : 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }} title="添加/删除书签 (Ctrl+F2)">🔖 书签</button>
        <button onClick={clearBookmarks} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }} title="清除所有书签">清除</button>
        <button onClick={jumpToPrevBookmark} disabled={bookmarks.length === 0} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: 'transparent', color: c.text, cursor: bookmarks.length > 0 ? 'pointer' : 'default', fontSize: '9px' }} title="上一书签 (F2)">↑书签</button>
        <button onClick={jumpToNextBookmark} disabled={bookmarks.length === 0} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: 'transparent', color: c.text, cursor: bookmarks.length > 0 ? 'pointer' : 'default', fontSize: '9px' }} title="下一书签 (Shift+F2)">↓书签</button>
        <button onClick={toggleColumnSelect} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: columnSelectMode ? c.accentDim : 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }} title="列选择模式 (Alt+Shift+拖拽)">▦ 列选</button>
        <button onClick={() => setShowOutline(p => !p)} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: showOutline ? c.accentDim : 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }} title="切换符号大纲 (Ctrl+Shift+O)">📑 大纲</button>
        <button onClick={() => setShowCallChain(p => !p)} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: showCallChain ? c.accentDim : 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }} title="调用链分析 (Ctrl+Shift+C)">🔗 调用链</button>
        <button onClick={toggleTypeHint} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: showTypeHint ? c.accentDim : 'transparent', color: c.text, cursor: 'pointer', fontSize: '9px' }} title="切换类型推导提示 (Ctrl+Shift+T)"> 类型</button>
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
            {columnSelectMode && <span style={{ color: '#FFB74D' }}>列选模式</span>}
            {showCallChain && <span style={{ color: '#4FC3F7' }}>调用链分析</span>}
            {showTypeHint && <span style={{ color: '#81C784' }}>类型提示</span>}
          </div>
        </div>
      )}

      {/* 编辑器或空状态 */}
      {!activeTab ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: c.textFaint, gap: '8px' }}>
          <div style={{ fontSize: '36px', opacity: 0.3 }}>📝</div>
          <div style={{ fontSize: '11px' }}>输入文件路径并点击"打开"开始编辑</div>
          <div style={{ fontSize: '9px', color: c.textFaint }}>支持 Ctrl+S 保存 · LSP 补全/定义/引用/符号 · F12 跳转定义 · Shift+F12 查找引用 · 内联补全 · Ctrl+Click 多光标 · F2 书签 · Ctrl+Shift+O 大纲 · Ctrl+Shift+C 调用链 · Ctrl+Tab 最近文件 · Alt+Shift+拖拽 列选择</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {showCallChain && (
              <CallChainPanel
                result={callChainResult}
                filePath={activeTab.filePath}
                theme={theme}
                onClose={() => setShowCallChain(false)}
                onGoToDefinition={(fp, line, column) => {
                  // 切换标签页到目标文件
                  if (fp !== activeTab.filePath) {
                    setFilePath(fp)
                    handleOpenFile()
                  }
                  // 跳转行
                  setTimeout(() => {
                    const editor = editorRef.current
                    if (editor) {
                      editor.setPosition({ lineNumber: line, column })
                      editor.revealLineInCenter(line)
                      editor.focus()
                    }
                  }, 300)
                }}
              />
            )}
            {showTypeHint && typeHint && (
              <div style={{ position: 'absolute', bottom: '8px', left: '8px', zIndex: 100, background: c.bgPanel, border: `1px solid ${c.accent}`, borderRadius: '4px', padding: '6px 10px', maxWidth: '400px', maxHeight: '120px', overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                <span style={{ color: c.accent, fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{typeHint.text}</span>
              </div>
            )}
            {inlineEditVisible && (
              <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 100, background: c.bgPanel, border: '1px solid ' + c.accent, borderRadius: '6px', padding: '8px', display: 'flex', gap: '4px', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                <span style={{ color: c.accent, fontSize: '10px', fontWeight: 600 }}>AI Edit</span>
                <input
                  value={inlineEditPrompt}
                  onChange={e => setInlineEditPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleInlineEditSubmit(); if (e.key === 'Escape') { setInlineEditVisible(false); setInlineEditPrompt('') } }}
                  placeholder="Describe changes..."
                  autoFocus
                  style={{ padding: '4px 8px', background: c.inputBg, border: '1px solid ' + c.border, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none', width: '200px' }}
                />
                <button
                  onClick={handleInlineEditSubmit}
                  disabled={inlineEditLoading}
                  style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: inlineEditLoading ? c.border : c.accent, color: inlineEditLoading ? c.textFaint : '#000', cursor: inlineEditLoading ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600 }}
                >{inlineEditLoading ? '...' : 'Run'}</button>
                <button
                  onClick={() => { setInlineEditVisible(false); setInlineEditPrompt('') }}
                  style={{ padding: '2px 6px', border: '1px solid ' + c.border, borderRadius: '3px', background: 'transparent', color: c.textFaint, cursor: 'pointer', fontSize: '10px' }}
                >X</button>
              </div>
            )}
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
                // 注册光标变化监听器（类型推导提示）
                editor.onDidChangeCursorPosition(() => {
                  if (typeHintTimerRef.current) {
                    clearTimeout(typeHintTimerRef.current)
                  }
                  typeHintTimerRef.current = setTimeout(() => {
                    handleCursorChange()
                  }, 300)
                })
                // 注册 LSP 补全 Provider
                registerLspCompletion(monaco, editor, cwd)
                // 注册 LSP 跳转定义 Provider
                registerLspDefinition(monaco, editor, cwd)
                // 注册 LSP 查找引用 Provider
                registerLspReferences(monaco, editor)
                // 注册 LSP 悬停 Provider
                registerLspHover(monaco, editor, cwd)
                // 注册 LSP 文档符号 Provider
                registerLspDocumentSymbol(monaco, editor)
                // 注册 LSP 工作区符号 Provider
                registerLspWorkspaceSymbol(monaco, editor)
                // 注册 LSP 文档高亮 Provider
                registerLspDocumentHighlight(monaco, editor)
                // 注册内联补全 Provider
                registerInlineCompletion(monaco, editor, cwd)
              }}
            />
          </div>
          {/* 符号大纲侧边栏 */}
          {showOutline && symbols.length > 0 && (
            <div style={{ width: '200px', borderLeft: `1px solid ${c.border}`, background: c.bgPanel, overflowY: 'auto', fontSize: '10px' }}>
              <div style={{ padding: '6px 8px', borderBottom: `1px solid ${c.border}`, fontWeight: 600, color: c.text, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>符号大纲</div>
              <div>
                {symbols.map((s: any, i: number) => (
                  <div
                    key={i}
                    style={{ padding: '4px 8px', cursor: 'pointer', color: c.text, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      if (!editorRef.current) return
                      editorRef.current.setPosition({ lineNumber: s.range.start.line + 1, column: s.range.start.character + 1 })
                      editorRef.current.revealLineInCenter(s.range.start.line + 1)
                      editorRef.current.focus()
                    }}
                  >
                    <span style={{ color: c.textFaint, fontSize: '8px' }}>●</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
        {saveStatus && !saveStatus.includes('已保存') && <span style={{ color: '#f59e0b', fontSize: '9px' }}>{saveStatus}</span>}
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

async function fetchLspReferences(filePath: string, line: number, character: number): Promise<any[]> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspReferences) return []
  try {
    const result = await api.lspReferences(filePath, line, character)
    if (result?.success && result.locations) {
      return result.locations.map((loc: any) => ({
        uri: loc.uri,
        range: loc.range,
      }))
    }
  } catch { /* ignore */ }
  return []
}

async function fetchLspDocumentSymbol(filePath: string): Promise<any[]> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspDocumentSymbol) return []
  try {
    const result = await api.lspDocumentSymbol(filePath)
    if (result?.success && result.symbols) {
      return result.symbols.map((s: any) => ({
        name: s.name,
        kind: s.kind,
        range: s.range,
        children: s.children || [],
      }))
    }
  } catch { /* ignore */ }
  return []
}

async function fetchLspWorkspaceSymbol(query: string): Promise<any[]> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspWorkspaceSymbol) return []
  try {
    const result = await api.lspWorkspaceSymbol(query)
    if (result?.success && result.symbols) {
      return result.symbols.map((s: any) => ({
        name: s.name,
        kind: s.kind,
        containerName: s.containerName || '',
        location: s.location,
      }))
    }
  } catch { /* ignore */ }
  return []
}

async function fetchLspDocumentHighlight(filePath: string, line: number, character: number): Promise<any[]> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspDocumentHighlight) return []
  try {
    const result = await api.lspDocumentHighlight(filePath, line, character)
    if (result?.success && result.highlights) {
      return result.highlights.map((h: any) => ({
        range: h.range,
        kind: h.kind,
      }))
    }
  } catch { /* ignore */ }
  return []
}

async function fetchLspInlineCompletion(filePath: string, line: number, character: number): Promise<string> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.lspCompletion) return ''
  try {
    const result = await api.lspCompletion(filePath, line, character)
    if (result?.success && result.items && result.items.length > 0) {
      const best = result.items[0]
      return best.insertText || best.label || ''
    }
  } catch { /* ignore */ }
  return ''
}

// ─── LSP Provider 注册函数 ───

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

function registerLspReferences(monaco: any, editor: any) {
  monaco.languages.registerReferenceProvider('*', {
    async provideReferences(model: any, position: any, context: any) {
      const filePath = model.uri.path
      const line = position.lineNumber - 1
      const character = position.column - 1
      const locations = await fetchLspReferences(filePath, line, character)
      if (locations.length === 0) return { references: [] }
      return {
        references: locations.map((loc: any) => ({
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

function registerLspDocumentSymbol(monaco: any, editor: any) {
  monaco.languages.registerDocumentSymbolProvider('*', {
    async provideDocumentSymbols(model: any) {
      const filePath = model.uri.path
      const symbols = await fetchLspDocumentSymbol(filePath)
      if (symbols.length === 0) return { symbols: [] }
      return {
        symbols: symbols.map((s: any) => ({
          name: s.name,
          kind: s.kind,
          range: new monaco.Range(
            s.range.start.line + 1, s.range.start.character + 1,
            s.range.end.line + 1, s.range.end.character + 1
          ),
          detail: '',
          children: s.children?.length ? s.children.map((child: any) => ({
            name: child.name,
            kind: child.kind,
            range: new monaco.Range(
              child.range.start.line + 1, child.range.start.character + 1,
              child.range.end.line + 1, child.range.end.character + 1
            ),
            detail: '',
          })) : undefined,
        }))
      }
    }
  })
}

function registerLspWorkspaceSymbol(monaco: any, editor: any) {
  monaco.languages.registerWorkspaceSymbolProvider({
    async provideWorkspaceSymbols(query: string) {
      const symbols = await fetchLspWorkspaceSymbol(query)
      return {
        symbols: symbols.map((s: any) => ({
          name: s.name,
          kind: s.kind,
          containerName: s.containerName || '',
          location: {
            uri: monaco.Uri.parse(s.location?.uri || ''),
            range: s.location?.range ? new monaco.Range(
              s.location.range.start.line + 1, s.location.range.start.character + 1,
              s.location.range.end.line + 1, s.location.range.end.character + 1
            ) : new monaco.Range(1, 1, 1, 1),
          },
        }))
      }
    }
  })
}

function registerLspDocumentHighlight(monaco: any, editor: any) {
  monaco.languages.registerDocumentHighlightProvider('*', {
    async provideDocumentHighlights(model: any, position: any) {
      const filePath = model.uri.path
      const line = position.lineNumber - 1
      const character = position.column - 1
      const highlights = await fetchLspDocumentHighlight(filePath, line, character)
      if (highlights.length === 0) return { highlights: [] }
      const monacoInstance = monaco
      return {
        highlights: highlights.map((h: any) => ({
          range: new monacoInstance.Range(
            h.range.start.line + 1, h.range.start.character + 1,
            h.range.end.line + 1, h.range.end.character + 1
          ),
          kind: h.kind,
        }))
      }
    }
  })
}

async function fetchAiInlineCompletion(filePath: string, line: number, column: number): Promise<string> {
  const api = (window as any).dogeAPI as Record<string, any> | undefined
  if (!api?.aiComplete) return ''
  try {
    const result = await api.aiComplete({ filePath, code: '', line, column })
    if (result?.success && result.completions && result.completions.length > 0) {
      return result.completions[0].insertText || ''
    }
  } catch { /* ignore */ }
  return ''
}

function registerInlineCompletion(monaco: any, editor: any, cwd: string) {
  if (!monaco.languages.registerInlineCompletionItemProvider) return
  monaco.languages.registerInlineCompletionItemProvider('*', {
    async provideInlineCompletions(model: any, position: any) {
      const filePath = model.uri.path
      const line = position.lineNumber - 1
      const character = position.column - 1
      const code = model.getValue()
      const api = (window as any).dogeAPI as Record<string, any> | undefined
      // 优先使用 AI 补全，fallback 到 LSP
      let text = ''
      if (api?.aiComplete) {
        text = await fetchAiInlineCompletion(filePath, line, character)
      }
      if (!text) {
        text = await fetchLspInlineCompletion(filePath, line, character)
      }
      if (!text) return { items: [] }
      return {
        items: [{
          insertText: text,
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        }]
      }
    },
    freeInlineCompletions(completions: any) { /* keep completions */ },
  })
}

// ─── Monaco Editor 子组件（动态导入避免 SSR 问题） ───

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
    }).catch(() => setLoadError(' 错误: Monaco Editor 加载失败'))
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
        foldingStrategy: 'indentation',
        bracketPairColorization: { enabled: true, guides: true },
        bracketPairGuides: { enabled: true, activeScopeBrackets: 'hover' },
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        formatOnPaste: true,
        formatOnType: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
        lightbulb: { enabled: true },
        multiCursorModifier: 'ctrlCmd',
        autoIndent: 'full',
        goToDefinition: true,
        find: { addExtraSpaceOnTop: false },
        inlineSuggest: { enabled: true },
        suggest: {
          showKeywords: true,
          showSnippets: true,
          showFunctions: true,
          showVariables: true,
          showClasses: true,
        },
      }}
    />
  )
}
