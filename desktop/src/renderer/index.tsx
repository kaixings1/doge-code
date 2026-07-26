/**
 * 渲染进程入口：在 Electron BrowserWindow 中渲染桌面聊天 UI
 */

import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { DesktopConfig } from '../desktop/types'
import type { DogeAPI } from '../preload/index.js'

declare global {
  interface Window {
    dogeAPI: DogeAPI
  }
}

// ─── 状态类型 ───
type QueryState = 'idle' | 'responding' | 'needs_user' | 'should_continue' | 'done' | 'crashed' | 'aborted_by_user'

// ─── 数据模型 ───
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
  expanded?: boolean
}

interface GitFile {
  path: string
  status: string
  staged: boolean
}

// ─── 样式 ───
const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#000000', color: '#F5F5F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '13px' },
  sidebar: { width: 260, minWidth: 260, backgroundColor: '#0A0A0A', borderRight: '1px solid #262626', display: 'flex', flexDirection: 'column' },
  sidebarHeader: { padding: '16px', borderBottom: '1px solid #262626', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' },
  modelBadge: { padding: '4px 10px', fontSize: '11px', backgroundColor: '#1A1A1A', border: '1px solid #262626', borderRadius: '4px', color: '#888888' },
  chatView: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#000000', minWidth: 0 },
  chatMessages: { flex: 1, overflowY: 'auto', padding: '24px' },
  chatInput: { padding: '16px 24px', borderTop: '1px solid #262626' },
  inputBox: { width: '100%', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '8px', padding: '10px 14px', color: '#F5F5F5', fontSize: '13px', outline: 'none' },
  messageBubble: { marginBottom: '16px', maxWidth: '85%', padding: '10px 14px', borderRadius: '8px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  userBubble: { backgroundColor: '#1A3A5C', marginLeft: 'auto' },
  assistantBubble: { backgroundColor: '#0F0F0F' },
  roleLabel: { fontSize: '11px', color: '#888888', marginBottom: '4px' },
  welcomeBlock: { textAlign: 'center' as const, padding: '60px 20px', color: '#888888' },
  welcomeTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: '#F5F5F5' },
  welcomeSubtitle: { fontSize: '13px', color: '#666666' },
  statusBar: { padding: '6px 16px', fontSize: '11px', color: '#666666', borderTop: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between' },
  thinkingIndicator: { color: '#888888', fontSize: '12px', fontStyle: 'italic' },
  errorBubble: { backgroundColor: '#3A1A1A', border: '1px solid #5C2A2A', color: '#FF6B6B', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' },
  clearButton: { background: 'none', border: '1px solid #262626', color: '#888888', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
  rightPanel: { width: 280, minWidth: 280, backgroundColor: '#0A0A0A', borderLeft: '1px solid #262626', display: 'flex', flexDirection: 'column' },
  panelHeader: { padding: '12px 16px', borderBottom: '1px solid #262626', fontSize: '12px', fontWeight: 600, color: '#888888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  fileItem: { padding: '4px 12px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' as const },
  fileItemDir: { color: '#F5F5F5' },
  fileItemFile: { color: '#888888' },
  gitFile: { padding: '4px 12px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1A1A1A' },
  gitStatus: { fontSize: '10px', padding: '1px 4px', borderRadius: '2px' },
  gitModified: { color: '#FF6B6B' },
  gitAdded: { color: '#4ECB71' },
  gitDeleted: { color: '#FF6B6B' },
  gitRenamed: { color: '#FFB347' },
  loadingOverlay: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#000', color: '#888' },
}

const STATUS_COLORS: Record<string, string> = {
  ' M': '#FF6B6B', 'M ': '#FF6B6B', 'MM': '#FF6B6B',
  'A ': '#4ECB71', 'A  ': '#4ECB71',
  'D ': '#FF6B6B', 'D  ': '#FF6B6B',
  'R ': '#FFB347', 'R  ': '#FFB347',
  '??': '#FFB347',
  'M': '#FF6B6B',
}

// ─── 文件树组件 ───
function FileTree({ cwd }: { cwd: string }) {
  const [tree, setTree] = React.useState<FileTreeNode[]>([])
  const [loading, setLoading] = React.useState(true)

  // 用 Set 记录正在加载的目录路径
  const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    async function load() {
      try {
        const items = await window.dogeAPI.listDir(cwd)
        const nodes: FileTreeNode[] = items
          .filter((item: { name: string; isDirectory: boolean }) => !item.name.startsWith('.') && !item.name.startsWith('node_modules') && !item.name.startsWith('dist'))
          .sort((a: { isDirectory: boolean }, b: { isDirectory: boolean }) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1))
          .map((item: { name: string; isDirectory: boolean }) => ({
            name: item.name,
            path: item.isDirectory ? `${cwd}/${item.name}` : `${cwd}/${item.name}`,
            isDirectory: item.isDirectory,
            expanded: false,
          }))
        setTree(nodes)
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [cwd])

  const toggleDir = async (node: FileTreeNode) => {
    if (!node.isDirectory) return

    // 折叠
    if (node.expanded) {
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: false } : n))
      return
    }

    // 如果已有 children，直接展开
    if (node.children && node.children.length > 0) {
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: true } : n))
      return
    }

    // 展开并异步加载子目录
    setLoadingPaths((prev) => new Set(prev).add(node.path))
    setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: true, children: [] } : n))

    try {
      const items = await window.dogeAPI.listDir(node.path)
      const children: FileTreeNode[] = items
        .filter((item: { name: string; isDirectory: boolean }) => !item.name.startsWith('.') && !item.name.startsWith('node_modules') && !item.name.startsWith('dist'))
        .sort((a: { isDirectory: boolean }, b: { isDirectory: boolean }) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1))
        .map((item: { name: string; isDirectory: boolean }) => ({
          name: item.name,
          path: item.isDirectory ? `${node.path}/${item.name}` : `${node.path}/${item.name}`,
          isDirectory: item.isDirectory,
          expanded: false,
        }))
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, children, expanded: true } : n))
    } catch { /* ignore */ } finally {
      setLoadingPaths((prev) => { const next = new Set(prev); next.delete(node.path); return next })
    }
  }

  const renderNode = (node: FileTreeNode, depth: number = 0): JSX.Element[] => {
    const result: JSX.Element[] = []
    const isLoading = loadingPaths.has(node.path)
    result.push(
      <div
        key={node.path}
        style={{ ...styles.fileItem, paddingLeft: `${12 + depth * 16}px`, color: node.isDirectory ? '#F5F5F5' : '#888888' }}
        onClick={() => toggleDir(node)}
      >
        <span>{node.isDirectory ? (node.expanded ? '▼' : '▶') : '📄'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
          {isLoading && ' ...'}
        </span>
      </div>
    )
    if (node.isDirectory && node.expanded && node.children) {
      node.children.forEach((child) => {
        result.push(...renderNode(child, depth + 1))
      })
    }
    return result
  }

  if (loading) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>加载中...</div>
  if (tree.length === 0) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>空目录</div>
  return <>{tree.flatMap((node) => renderNode(node))}</>
}

// ─── Git 变更组件 ───
function GitChanges({ cwd, onSelectFile }: { cwd: string; onSelectFile: (path: string) => void }) {
  const [files, setFiles] = React.useState<GitFile[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const result = await window.dogeAPI.getGitStatus(cwd)
        setFiles(result)
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [cwd])

  if (loading) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>加载中...</div>
  if (files.length === 0) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>无变更</div>

  return (
    <>
      {files.map((f) => {
        const color = STATUS_COLORS[f.status] || '#888888'
        const label = f.status.trim() || '??'
        return (
          <div key={f.path} style={{ ...styles.gitFile, cursor: 'pointer' }} onClick={() => onSelectFile(f.path)} title="点击查看变更">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{f.path.replace(cwd + '/', '')}</span>
            <span style={{ ...styles.gitStatus, color }}>{label}</span>
          </div>
        )
      })}
    </>
  )
}

function GitDiff({ cwd, filePath }: { cwd: string; filePath: string }) {
  const [diff, setDiff] = React.useState<string>('加载中...')
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const result = await window.dogeAPI.getGitDiff(cwd, filePath)
        setDiff(result || '无差异')
      } catch (e) {
        setDiff('读取失败')
      } finally { setLoading(false) }
    }
    load()
  }, [cwd, filePath])

  if (loading) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>加载中...</div>
  return (
    <pre style={{ padding: '8px', fontSize: '11px', color: '#aaa', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
      {diff}
    </pre>
  )
}

// ─── 主组件 ───
function App(): JSX.Element {
  const [config, setConfig] = React.useState<DesktopConfig>({ provider: 'openai', apiKey: '', model: 'gpt-4o', workingDir: '' })
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState('')
  const [state, setState] = React.useState<QueryState>('idle')
  const [currentStreaming, setCurrentStreaming] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [selectedGitFile, setSelectedGitFile] = React.useState<string | null>(null)
  const [gitDiff, setGitDiff] = React.useState<string>('')
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, currentStreaming])

  // 加载配置
  React.useEffect(() => {
    async function load(): Promise<void> {
      try {
        const apiConfig = await window.dogeAPI.getConfig()
        const cwd = await window.dogeAPI.getCwd()
        const apiKeyData = await window.dogeAPI.readConfig(`${cwd}/.doge/api.json`) as
          | { activePreset?: string; presets?: Record<string, { provider?: string; apiKey?: string; model?: string }> }
          | null

        let provider = 'openai', apiKeyStr = '', model = 'gpt-4o'
        if (apiKeyData) {
          const presetName = apiKeyData.activePreset
          const preset = presetName && apiKeyData.presets?.[presetName] ? apiKeyData.presets[presetName] : apiKeyData.presets?.default || {}
          provider = preset.provider || 'openai'
          apiKeyStr = preset.apiKey || ''
          model = preset.model || 'gpt-4o'
        }

        setConfig({ provider, apiKey: apiKeyStr, model, workingDir: apiConfig.workingDir || cwd })

        const history = await window.dogeAPI.getHistory()
        if (history.messages?.length) {
          setMessages(history.messages.map((m, i) => ({ id: `history-${i}`, role: m.role as Message['role'], content: m.content })))
        }
      } catch { /* ignore */ } finally { setLoaded(true) }
    }
    load()
  }, [])

  React.useEffect(() => {
    const unsub1 = window.dogeAPI.onStateChange((s) => setState(s as QueryState))
    const unsub2 = window.dogeAPI.onChunk((chunk) => setCurrentStreaming((p) => p + chunk.text))
    return () => { unsub1(); unsub2() }
  }, [])

  const handleSend = React.useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (!text || state === 'responding') return
    setInput(''); setError(null); setCurrentStreaming('')
    const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text }
    setMessages((p) => [...p, userMsg])

    // 设置流式接收状态
    setState('responding')

    let result: { success?: boolean; content?: string; error?: string } | null = null
    try {
      result = await window.dogeAPI.sendMessage(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败')
      setState('idle')
      return
    }

    if (result.error) {
      setError(result.error)
    } else if (result.content) {
      const assistantMsg: Message = { id: `msg-${Date.now() + 1}`, role: 'assistant', content: result.content }
      setMessages((p) => [...p, assistantMsg])
    }
    setCurrentStreaming('')
    setState('idle')
  }, [input, state])

  const handleAbort = React.useCallback(async () => { await window.dogeAPI.abort(); setCurrentStreaming('') }, [])
  const handleClear = React.useCallback(async () => { await window.dogeAPI.clearHistory(); setMessages([]); setCurrentStreaming('') }, [])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); state === 'responding' ? handleAbort() : handleSend() }
  }, [handleSend, handleAbort, state])

  if (!loaded) return <div style={{ ...styles.loadingOverlay }}>加载中...</div>
  const isProcessing = state === 'responding'
  const workingDir = config.workingDir || '/'

  return (
    <div style={styles.container}>
      {/* 左栏：对话历史 */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={{ fontSize: '18px' }}>{'🐕'}</span>
          <span>Doge Code</span>
        </div>
        <div style={{ padding: '8px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={styles.modelBadge}>{config.provider}</span>
          <span style={styles.modelBadge}>{config.model}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {messages.length === 0 && !currentStreaming ? (
            <div style={{ padding: '16px', color: '#555555', fontSize: '12px' }}>开始新对话</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ padding: '8px 16px', borderBottom: '1px solid #1A1A1A', cursor: 'pointer' }}>
                <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统'}
                </div>
                <div style={{ fontSize: '11px', color: '#555555', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.content.slice(0, 50)}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={styles.statusBar}>
          <span>{isProcessing ? '正在回复...' : '就绪'}</span>
          {messages.length > 0 && (
            <button style={styles.clearButton} onClick={handleClear}>清除</button>
          )}
        </div>
      </div>

      {/* 中栏：聊天界面 */}
      <div style={styles.chatView}>
        <div style={styles.chatMessages}>
          {messages.length === 0 && !currentStreaming ? (
            <div style={styles.welcomeBlock}>
              <div style={styles.welcomeTitle}>Doge Code</div>
              <div style={styles.welcomeSubtitle}>{config.provider} / {config.model}</div>
              <div style={{ marginTop: '24px', fontSize: '13px', color: '#666666' }}>输入消息开始对话</div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <div key={m.id} style={{ ...styles.messageBubble, ...(m.role === 'user' ? styles.userBubble : styles.assistantBubble) }}>
                  <div style={styles.roleLabel}>{m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统'}</div>
                  <div>{m.content}</div>
                </div>
              ))}
              {currentStreaming && (
                <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
                  <div style={styles.roleLabel}>助手</div>
                  <div>{currentStreaming}</div>
                  <div style={styles.thinkingIndicator}>...</div>
                </div>
              )}
              {error && <div style={styles.errorBubble}>{error}</div>}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div style={styles.chatInput}>
          <form onSubmit={(e) => { e.preventDefault(); isProcessing ? handleAbort() : handleSend() }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isProcessing ? '按 Enter 中断...' : '输入消息... (Enter 发送)'}
              style={styles.inputBox}
              disabled={!config.apiKey}
              autoFocus
            />
          </form>
          {!config.apiKey && (
            <div style={{ color: '#FF6B6B', fontSize: '11px', marginTop: '6px' }}>
              未配置 API Key。请在 .doge/api.json 中配置。
            </div>
          )}
        </div>
      </div>

      {/* 右栏：文件树 + Git 变更 */}
      <div style={styles.rightPanel}>
        <div style={styles.panelHeader}>📁 文件树</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <FileTree cwd={workingDir} />
        </div>
        <div style={{ ...styles.panelHeader, borderTop: '1px solid #262626' }}>🔄 Git 变更</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <GitChanges cwd={workingDir} onSelectFile={(path) => { setSelectedGitFile(path); setGitDiff('') }} />
          {selectedGitFile && (
            <div style={{ borderTop: '1px solid #262626' }}>
              <div style={{ padding: '4px 12px', fontSize: '11px', color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedGitFile}>{selectedGitFile.replace(workingDir + '/', '')}</span>
                <span style={{ cursor: 'pointer', color: '#555' }} onClick={() => setSelectedGitFile(null)}>✕</span>
              </div>
              <GitDiff cwd={workingDir} filePath={selectedGitFile} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 启动 ───
async function main(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) return

  // 全局错误处理
  window.onerror = (msg, url, line) => {
    container.innerHTML = `<div style="color:#ff6b6b;padding:20px;font-family:monospace;white-space:pre-wrap;">ERROR: ${msg}\n${url}:${line}</div>`
  }

  // 检查 dogeAPI 是否可用
  if (!window.dogeAPI) {
    container.innerHTML = `<div style="color:#ff6b6b;padding:20px;font-family:monospace;">ERROR: dogeAPI not found on window object.\npreload script may have failed to load.</div>`
    return
  }

  try {
    const root = createRoot(container)
    root.render(<StrictMode><App /></StrictMode>)
  } catch (e) {
    container.innerHTML = `<div style="color:#ff6b6b;padding:20px;font-family:monospace;white-space:pre-wrap;">RENDER ERROR:\n${e instanceof Error ? e.message : String(e)}\n${e instanceof Error ? e.stack : ''}</div>`
  }
}
main().catch((e) => {
  const container = document.getElementById('root')
  if (container) {
    container.innerHTML = `<div style="color:#ff6b6b;padding:20px;font-family:monospace;white-space:pre-wrap;">FATAL ERROR:\n${e instanceof Error ? e.message : String(e)}\n${e instanceof Error ? e.stack : ''}</div>`
  }
})
