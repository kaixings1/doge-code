/**
 * 桌面端主应用组件
 */

import React, { useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import type { DesktopConfig } from '../desktop/types'
import type { DogeAPI } from '../preload/index.js'
import { useMemoryUsage } from './hooks/useMemoryUsage.js'
import { FileTree, type FileTreeNode } from './components/FileTree.js'
import { GitChanges, type GitFile } from './components/GitChanges.js'
import { GitDiff } from './components/GitDiff.js'
import { ToolPanel } from './components/ToolPanel.js'
import { CommandPalette } from './components/CommandPalette.js'
import { HighlightedDiff } from './components/HighlightedDiff.js'
import { ToolErrorBanner } from './components/ToolErrorBanner.js'
import { ToolProgressBar } from './components/ToolProgressBar.js'
import { ToolResultRenderer } from './components/MarkdownRenderer.js'
import { getStyles, getEffectiveTheme, THEMES, type ThemeName, type ThemeColors } from './theme.js'

declare global {
  interface Window {
    dogeAPI: DogeAPI
  }
}

// ─── 主题 Context ───
interface ThemeCtx {
  name: ThemeName
  colors: ThemeColors
  styles: Record<string, React.CSSProperties>
}
export const ThemeContext = React.createContext<ThemeCtx>({ name: 'dark', colors: THEMES.dark, styles: getStyles('dark') })

// ─── 状态类型 ───
type QueryState = 'idle' | 'responding' | 'needs_user' | 'should_continue' | 'done' | 'crashed' | 'aborted_by_user'

// ─── 消息内容块类型 ───
interface TextBlock { type: 'text'; text: string }
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface ThinkingBlock { type: 'thinking'; text: string; signature?: string }
interface ImageBlock { type: 'image'; url: string; alt?: string }
type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock | ImageBlock

// ─── 数据模型 ───
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool'
  content: string
}

// ─── 消息内容解析：将 assistant 消息拆分为文本块 + 工具调用块 ───
function parseMessageContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const toolUseRegex = /<tool_use>\s*<name>([^<]+)<\/name>\s*<input>(.*?)<\/input>\s*<\/tool_use>/gs

  const events: Array<{ type: 'tool_use'; start: number; end: number; name: string; input: string } | { type: 'thinking'; start: number; end: number; text: string } | { type: 'text'; start: number; end: number }> = []

  let match: RegExpExecArray | null
  while ((match = toolUseRegex.exec(content)) !== null) {
    events.push({ type: 'tool_use', start: match.index, end: match.index + match[0].length, name: match[1], input: match[2] })
  }

  // Extract <thinking> blocks
  const thinkingRegex = /<thinking>(.*?)<\/thinking>/gs
  let tMatch
  while ((tMatch = thinkingRegex.exec(content)) !== null) {
    events.push({ type: 'thinking', start: tMatch.index, end: tMatch.index + tMatch[0].length, text: tMatch[1].trim() })
  }

  // Sort by position
  events.sort((a, b) => a.start - b.start)

  // Build blocks in document order
  let lastIndex = 0
  for (const ev of events) {
    if (ev.start > lastIndex) {
      blocks.push({ type: 'text', text: content.slice(lastIndex, ev.start) })
    }
    if (ev.type === 'tool_use') {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(ev.input) } catch { input = { raw: ev.input } }
      blocks.push({ type: 'tool_use', id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: ev.name, input })
    } else if (ev.type === 'thinking') {
      blocks.push({ type: 'thinking', text: ev.text })
    }
    lastIndex = ev.end
  }
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', text: content.slice(lastIndex) })
  }
  if (blocks.length === 0 && content.trim()) {
    blocks.push({ type: 'text', text: content })
  }
  return blocks
}

function InlineToolUseBlock({ block, onExecute, executingIds }: { block: ToolUseBlock; onExecute: (block: ToolUseBlock) => void; executingIds: Set<string> }) {
  const [expanded, setExpanded] = React.useState(false)
  const inputStr = typeof block.input === 'string' ? block.input : JSON.stringify(block.input, null, 2)
  const truncated = expanded ? inputStr : (inputStr.length > 200 ? inputStr.slice(0, 200) + '...' : inputStr)
  const isExecuting = executingIds.has(block.id)

  return (
    <div style={{ background: '#0A0A0A', border: '1px solid #262626', borderRadius: '4px', padding: '8px 10px', margin: '4px 0', fontFamily: 'monospace', fontSize: '11px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ color: '#4ECB71', fontWeight: 600 }}>🔧 {block.name}</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setExpanded(!expanded)} style={{ padding: '1px 6px', border: '1px solid #333', borderRadius: '3px', background: '#0F0F0F', color: '#888', cursor: 'pointer', fontSize: '10px' }}>
            {expanded ? '收起' : '展开'}
          </button>
          <button onClick={() => onExecute(block)} disabled={isExecuting} style={{ padding: '1px 8px', border: 'none', borderRadius: '3px', background: isExecuting ? '#333' : '#4ECB71', color: isExecuting ? '#555' : '#000', cursor: isExecuting ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600 }}>
            {isExecuting ? '执行中...' : '执行'}
          </button>
        </div>
      </div>
      <div style={{ color: '#888', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{truncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
  )
}

// ─── 轻量语法高亮 ───
function highlightCode(code: string, lang: string): string {
  let result = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  if (['typescript', 'ts', 'javascript', 'js'].includes(lang)) {
    result = result.replace(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span style="color:#CE9178">$1</span>')
    result = result.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof|interface|type|extends|implements|static|get|set|yield|of|in|switch|case|break|default|void|null|undefined|true|false)\b/g, '<span style="color:#569CD6">$1</span>')
    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>')
    result = result.replace(/(\/\/[^\n]*)/g, '<span style="color:#6A9955">$1</span>')
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6A9955">$1</span>')
  } else if (lang === 'json') {
    result = result.replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:#9CDCFE">$1</span>:')
    result = result.replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:#CE9178">$1</span>')
    result = result.replace(/:\s*(\d+\.?\d*)/g, ': <span style="color:#B5CEA8">$1</span>')
    result = result.replace(/:\s*(true|false|null)/g, ': <span style="color:#569CD6">$1</span>')
  } else if (['css', 'scss'].includes(lang)) {
    result = result.replace(/\.([\w-]+)/g, '.<span style="color:#9CDCFE">$1</span>')
    result = result.replace(/([\w-]+)\s*:/g, '<span style="color:#9CDCFE">$1</span>:')
    result = result.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span style="color:#CE9178">$1</span>')
    result = result.replace(/\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms)?)\b/g, '<span style="color:#B5CEA8">$1</span>')
  } else if (lang === 'html') {
    result = result.replace(/(&lt;\/?)([\w-]+)/g, '$1<span style="color:#569CD6">$2</span>')
    result = result.replace(/([\w-]+)=/g, '<span style="color:#9CDCFE">$1</span>=')
    result = result.replace(/="([^"]*)"/g, '=<span style="color:#CE9178">"$1"</span>')
  } else if (lang === 'python' || lang === 'py') {
    result = result.replace(/(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|"""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span style="color:#CE9178">$1</span>')
    result = result.replace(/\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|with|yield|lambda|pass|break|continue|and|or|not|in|is|True|False|None|self|async|await)\b/g, '<span style="color:#569CD6">$1</span>')
    result = result.replace(/#[^\n]*/g, '<span style="color:#6A9955">$&</span>')
    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>')
  } else if (['bash', 'sh', 'shell'].includes(lang)) {
    result = result.replace(/(#.*)$/gm, '<span style="color:#6A9955">$1</span>')
    result = result.replace(/\b(echo|cd|ls|rm|cp|mv|mkdir|cat|grep|find|sed|awk|git|npm|bun|node|export|source|sudo|chmod|chown|pwd|touch|head|tail|wc|sort|uniq|diff|tar|zip|curl|wget)\b/g, '<span style="color:#569CD6">$1</span>')
  } else if (lang === 'sql') {
    result = result.replace(/\b(SELECT|FROM|WHERE|AND|OR|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|IN|NOT|NULL|IS|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MAX|MIN|INTO|VALUES|SET|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|VIEW)\b/gi, '<span style="color:#569CD6">$1</span>')
  } else if (['yaml', 'yml'].includes(lang)) {
    result = result.replace(/^(\s*)([\w-]+)(\s*:)/gm, '$1<span style="color:#9CDCFE">$2</span>$3')
    result = result.replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:#CE9178">$1</span>')
    result = result.replace(/:\s*(\d+\.?\d*)/g, ': <span style="color:#B5CEA8">$1</span>')
    result = result.replace(/(#[^\n]*)/g, '<span style="color:#6A9955">$1</span>')
  } else if (['markdown', 'md'].includes(lang)) {
    result = result.replace(/^(#{1,6}\s.+)$/gm, '<span style="color:#569CD6">$1</span>')
    result = result.replace(/(\*\*[^*]+\*\*|__[^_]+__)/g, '<span style="color:#CE9178">$1</span>')
    result = result.replace(/(`[^`]+`)/g, '<span style="color:#CE9178">$1</span>')
  } else if (['rust', 'rs'].includes(lang)) {
    result = result.replace(/\b(fn|let|mut|pub|struct|enum|impl|trait|use|mod|where|for|in|if|else|match|return|loop|while|break|continue|move|async|await|unsafe|dyn|type|const|static|ref|self|super|crate|true|false|Some|None|Ok|Err|Result|Option|Vec|String|Box|Rc|Arc)\b/g, '<span style="color:#569CD6">$1</span>')
    result = result.replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:#CE9178">$1</span>')
    result = result.replace(/\/\/[^\n]*/g, '<span style="color:#6A9955">$&</span>')
  }

  return result
}

// ─── 轻量 Markdown 渲染器 ───
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 代码块（带语法高亮 + 复制按钮）
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const rawCode = code.trim()
    const highlighted = highlightCode(rawCode, lang.toLowerCase())
    const langLabel = lang ? `<span style="color:#888;font-size:10px">${lang}</span>` : '<span></span>'
    const escaped = rawCode.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<div style="position:relative;margin:4px 0" data-code="${escaped}"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">${langLabel}<button onclick="navigator.clipboard.writeText(this.closest('div').getAttribute('data-code')).catch(()=>{})" style="background:#262626;border:1px solid #333;color:#888;padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px">复制</button></div><pre style="background:#0A0A0A;border:1px solid #262626;border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:0"><code>${highlighted}</code></pre></div>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:#1A1A1A;padding:1px 4px;border-radius:2px;font-size:12px;font-family:monospace">$1</code>')

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;color:#F5F5F5;margin:8px 0 4px">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:600;color:#F5F5F5;margin:10px 0 4px">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:600;color:#F5F5F5;margin:12px 0 4px">$1</h1>')

  // 粗体 & 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#F5F5F5">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4ECB71;text-decoration:none" target="_blank">$1</a>')

  // 无序列表
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li style="margin-left:16px;list-style:disc">$2</li>')

  // 有序列表
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li style="margin-left:16px;list-style:decimal">$2</li>')

  // 换行
  html = html.replace(/\n/g, '<br/>')

  return html
}

// ─── 主组件 ───
export function App(): JSX.Element {
  const [config, setConfig] = useState<DesktopConfig>({ provider: 'openai', apiKey: '', model: 'gpt-4o', workingDir: '' })
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; url: string; name: string }>>([])
  const [state, setState] = useState<QueryState>('idle')
  const [currentStreaming, setCurrentStreaming] = useState('')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [previewTabs, setPreviewTabs] = useState<Array<{ id: string; path: string; content: string; size?: number }>>([])
  const [activePreviewTabId, setActivePreviewTabId] = useState<string | null>(null)
  const previewTabCounter = useRef(0)
  const activePreviewFile = previewTabs.find(t => t.id === activePreviewTabId) || null
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ start: number; end: number }>>([])
  const [currentResultIndex, setCurrentResultIndex] = useState(-1)
  const [msgSearchQuery, setMsgSearchQuery] = useState('')
  const [msgSearchMatches, setMsgSearchMatches] = useState<number[]>([])
  const [executingToolIds, setExecutingToolIds] = useState<Set<string>>(new Set())
  const [toolProgress, setToolProgress] = useState<{ toolName: string; status: 'pending' | 'running' | 'success' | 'error'; progress?: number; duration?: number } | null>(null)
  const [commandHistory, setCommandHistory] = useState<Array<{ cmd: string; time: number }>>([])
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [paletteMode, setPaletteMode] = useState<'files' | 'commands'>('files')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string; baseUrl: string; hasApiKey: boolean } | null>(null)
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number; lastResponseLength: number; messageCount: number } | null>(null)
  const [themeSettings, setThemeSettings] = useState<{ theme: string; fontSize: number; fontFamily: string; sidebarWidth: number; rightPanelWidth: number }>({ theme: 'dark', fontSize: 13, fontFamily: 'system', sidebarWidth: 260, rightPanelWidth: 280 })
  const [showSettings, setShowSettings] = useState(false)
  const [editProvider, setEditProvider] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; messageCount: number }>>([])
  const [showSessions, setShowSessions] = useState(false)
  const [recentFiles, setRecentFiles] = useState<Array<{ path: string; name: string }>>([])
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [splitScreen, setSplitScreen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const memoryUsage = useMemoryUsage()
  const recognitionRef = useRef<any>(null)
  const utteranceRef = useRef<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [mcpServers, setMcpServers] = useState<Array<{ name: string; command: string; args: string[]; transport: string }>>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [showMcpPanel, setShowMcpPanel] = useState(false)
  const [mcpNewName, setMcpNewName] = useState('')
  const [mcpNewCommand, setMcpNewCommand] = useState('')
  const [mcpNewArgs, setMcpNewArgs] = useState('')
  const [agents, setAgents] = useState<Array<{ id: string; name: string; description: string; model: string }>>([])
  const [showAgentPanel, setShowAgentPanel] = useState(false)

  // ─── 多 Tab 会话管理 ───
  interface AppTab {
    id: string
    sessionId: string
    title: string
    messages: Message[]
  }
  const [tabs, setTabs] = useState<AppTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const tabIdCounter = useRef(0)

  const effectiveTheme = getEffectiveTheme(themeSettings.theme as ThemeName | 'auto')
  const styles = getStyles(effectiveTheme)
  const theme = THEMES[effectiveTheme]

  // 切换到指定 tab
  const switchTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      setActiveTabId(tabId)
      setMessages(tab.messages)
      setCurrentStreaming('')
      setError(null)
    }
  }, [tabs])

  // 将当前 messages 保存回 tabs
  const saveMessagesToTab = useCallback((msgs: Message[]) => {
    if (!activeTabId) return
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, messages: msgs } : t))
  }, [activeTabId])

  const persistActiveTabMessages = useCallback((msgs: Message[]) => {
    saveMessagesToTab(msgs)
  }, [saveMessagesToTab])

  // 根据第一条用户消息自动更新 Tab 标题
  const titleUpdatedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!activeTabId) return
    if (titleUpdatedRef.current.has(activeTabId)) return

    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId || t.title !== `对话 ${tabIdCounter.current}`) {
        if (t.title !== `对话 ${tabIdCounter.current}`) {
          titleUpdatedRef.current.add(activeTabId)
        }
        return t
      }
      const firstUserMsg = t.messages.find(m => m.role === 'user')
      if (firstUserMsg) {
        const title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '')
        titleUpdatedRef.current.add(activeTabId)
        return { ...t, title }
      }
      return t
    }))
  }, [activeTabId])

  // Tab 数据持久化
  interface PersistedTabMeta { id: string; sessionId: string; title: string }
  useEffect(() => {
    try {
      const saved = localStorage.getItem('doge-tabs')
      if (saved && tabs.length === 0) {
        const parsed = JSON.parse(saved) as PersistedTabMeta[]
        if (parsed.length > 0) {
          const restored = parsed.map(t => ({ ...t, messages: [] }))
          setTabs(restored)
          tabIdCounter.current = parsed.length
          setActiveTabId(restored[0]?.id ?? null)
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      const meta: PersistedTabMeta[] = tabs.map(t => ({ id: t.id, sessionId: t.sessionId, title: t.title }))
      localStorage.setItem('doge-tabs', JSON.stringify(meta))
    } catch { /* ignore */ }
  }, [tabs])

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null }, 3000)
  }, [])

  const refreshMcpServers = useCallback(async () => {
    try { setMcpServers(await window.dogeAPI.mcpList()) } catch { /* ignore */ }
  }, [])

  const refreshAgents = useCallback(async () => {
    try { setAgents(await window.dogeAPI.agentList()) } catch { /* ignore */ }
  }, [])

  const handleMcpAdd = useCallback(async () => {
    if (!mcpNewName.trim() || !mcpNewCommand.trim()) return
    setMcpLoading(true)
    const args = mcpNewArgs.trim() ? mcpNewArgs.split(/\s+/).filter(Boolean) : []
    const result = await window.dogeAPI.mcpAdd(mcpNewName.trim(), mcpNewCommand.trim(), args, 'stdio')
    setMcpLoading(false)
    if (result.success) { showToast('MCP 服务器已添加', 'success'); setMcpNewName(''); setMcpNewCommand(''); setMcpNewArgs(''); refreshMcpServers() }
    else { showToast(result.error || '添加失败', 'error') }
  }, [mcpNewName, mcpNewCommand, mcpNewArgs, refreshMcpServers, showToast])

  const handleMcpRemove = useCallback(async (name: string) => {
    setMcpLoading(true)
    const result = await window.dogeAPI.mcpRemove(name)
    setMcpLoading(false)
    if (result.success) { showToast(`已移除: ${name}`, 'success'); refreshMcpServers() }
    else { showToast(result.error || '移除失败', 'error') }
  }, [refreshMcpServers, showToast])

  // 网络状态监听
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])

  const executeToolFromBlock = useCallback(async (block: ToolUseBlock) => {
    if (executingToolIds.has(block.id)) return
    setExecutingToolIds(prev => new Set(prev).add(block.id))
    const toolInput = typeof block.input === 'string' ? JSON.parse(block.input) : block.input
    const startTime = Date.now()
    setToolProgress({ toolName: block.name, status: 'running', progress: 0, duration: 0 })
    const progressInterval = setInterval(() => {
      setToolProgress(prev => {
        if (!prev || prev.status !== 'running') return prev
        const elapsed = Date.now() - startTime
        return { ...prev, progress: Math.min(90, (elapsed / 5000) * 100), duration: elapsed }
      })
    }, 200)
    try {
      const result = await window.dogeAPI.executeTool({ name: block.name, input: toolInput })
      clearInterval(progressInterval)
      setToolProgress({ toolName: block.name, status: 'success', progress: 100, duration: Date.now() - startTime })
      const toolMsg: Message = { id: `msg-${Date.now()}`, role: 'tool', content: JSON.stringify(result) }
      setMessages(prev => [...prev, toolMsg])
      setTimeout(() => setToolProgress(null), 2000)
    } catch (e) {
      clearInterval(progressInterval)
      setToolProgress({ toolName: block.name, status: 'error', progress: 100, duration: Date.now() - startTime })
      setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'error', content: e instanceof Error ? e.message : '工具执行失败' }])
      setTimeout(() => setToolProgress(null), 3000)
    } finally {
      setExecutingToolIds(prev => { const next = new Set(prev); next.delete(block.id); return next })
    }
  }, [executingToolIds])

  const handlePreviewFile = useCallback(async (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f.path !== filePath)
      return [{ path: filePath, name: fileName }, ...filtered].slice(0, 20)
    })
    const existing = previewTabs.find(t => t.path === filePath)
    if (existing) { setActivePreviewTabId(existing.id); return }
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await window.dogeAPI.readFile(filePath)
      if (result.success) {
        previewTabCounter.current += 1
        const newTab = { id: `preview-${previewTabCounter.current}-${Date.now()}`, path: filePath, content: result.content || '', size: result.size }
        setPreviewTabs(prev => [...prev, newTab])
        setActivePreviewTabId(newTab.id)
      } else {
        setPreviewError(result.error || '无法读取文件')
      }
    } catch { setPreviewError('读取文件失败') } finally { setPreviewLoading(false) }
  }, [previewTabs])

  const handleStartEdit = useCallback(() => {
    if (activePreviewFile) { setEditContent(activePreviewFile.content); setIsEditing(true) }
  }, [activePreviewFile])

  const runSearch = useCallback(() => {
    if (!activePreviewFile || !searchQuery) { setSearchResults([]); setCurrentResultIndex(-1); return }
    const content = activePreviewFile.content
    const results: Array<{ start: number; end: number }> = []
    let pos = 0
    while (true) {
      const idx = content.toLowerCase().indexOf(searchQuery.toLowerCase(), pos)
      if (idx === -1) break
      results.push({ start: idx, end: idx + searchQuery.length })
      pos = idx + 1
    }
    setSearchResults(results)
    setCurrentResultIndex(results.length > 0 ? 0 : -1)
  }, [activePreviewFile, searchQuery])

  const handleNextResult = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentResultIndex(prev => (prev + 1) % searchResults.length)
  }, [searchResults])

  const handlePrevResult = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentResultIndex(prev => (prev - 1 + searchResults.length) % searchResults.length)
  }, [searchResults])

  const handleReplace = useCallback(async () => {
    if (!activePreviewFile || !searchQuery || !replaceQuery || currentResultIndex === -1) return
    const result = searchResults[currentResultIndex]
    if (!result) return
    const newContent = activePreviewFile.content.substring(0, result.start) + replaceQuery + activePreviewFile.content.substring(result.end)
    setPreviewTabs(prev => prev.map(t => t.id === activePreviewFile.id ? { ...t, content: newContent } : t))
    setEditContent(newContent)
    runSearch()
  }, [activePreviewFile, searchQuery, replaceQuery, currentResultIndex, searchResults, runSearch])

  const handleReplaceAll = useCallback(async () => {
    if (!activePreviewFile || !searchQuery || !replaceQuery || searchResults.length === 0) return
    let newContent = activePreviewFile.content
    const result = searchResults[currentResultIndex >= 0 ? currentResultIndex : 0]
    if (!result) return
    newContent = newContent.substring(0, result.start) + replaceQuery + newContent.substring(result.end)
    setPreviewTabs(prev => prev.map(t => t.id === activePreviewFile.id ? { ...t, content: newContent } : t))
    setEditContent(newContent)
    runSearch()
  }, [activePreviewFile, searchQuery, replaceQuery, searchResults, currentResultIndex, runSearch])

  const handleSaveEdit = useCallback(async () => {
    if (!activePreviewFile || isSaving) return
    setIsSaving(true)
    try {
      const result = await window.dogeAPI.writeFile(activePreviewFile.path, editContent)
      if (result.success) {
        setPreviewTabs(prev => prev.map(t => t.id === activePreviewFile.id ? { ...t, content: editContent } : t))
        setIsEditing(false)
        setEditContent('')
      } else {
        setPreviewError(result.error || '保存失败')
      }
    } catch { setPreviewError('保存文件失败') } finally { setIsSaving(false) }
  }, [activePreviewFile, editContent, isSaving])

  const handleCancelEdit = useCallback(() => { setIsEditing(false); setEditContent('') }, [])

  const handleCopyContent = useCallback(async () => {
    if (!activePreviewFile) return
    try { await navigator.clipboard.writeText(activePreviewFile.content); showToast('文件内容已复制', 'success') }
    catch { showToast('复制失败', 'error') }
  }, [activePreviewFile, showToast])

  const handleRevealInExplorer = useCallback(async () => {
    if (!activePreviewFile) return
    try {
      const result = await window.dogeAPI.revealInExplorer(activePreviewFile.path)
      if (result.success) showToast('已打开文件所在位置', 'success')
      else showToast(result.error || '打开失败', 'error')
    } catch { showToast('打开失败', 'error') }
  }, [activePreviewFile, showToast])

  const handleOpenTerminal = useCallback(async () => {
    if (!activePreviewFile) return
    try {
      const dirPath = activePreviewFile.path.includes('/') ? activePreviewFile.path.substring(0, activePreviewFile.path.lastIndexOf('/')) : ''
      const result = await window.dogeAPI.openTerminal(dirPath)
      if (result.success) showToast('终端已打开', 'success')
      else showToast(result.error || '打开终端失败', 'error')
    } catch { showToast('打开终端失败', 'error') }
  }, [activePreviewFile, showToast])

  // textarea 自动高度
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(200, Math.max(44, el.scrollHeight)) + 'px'
  }, [input])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, currentStreaming])

  // 初始化配置
  useEffect(() => {
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

  useEffect(() => {
    const unsub1 = window.dogeAPI.onStateChange((s) => setState(s as QueryState))
    const unsub2 = window.dogeAPI.onChunk((chunk) => setCurrentStreaming((p) => p + chunk.text))
    return () => { unsub1(); unsub2() }
  }, [])

  useEffect(() => {
    async function loadModelInfo() {
      try { const info = await window.dogeAPI.getModelInfo(); setModelInfo(info) } catch { /* ignore */ }
    }
    loadModelInfo()
  }, [])

  useEffect(() => {
    const interval = setInterval(async () => {
      try { const usage = await window.dogeAPI.getTokenUsage(); setTokenUsage(usage) } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function loadTheme() {
      try { const theme = await window.dogeAPI.getTheme(); setThemeSettings(theme) } catch { /* ignore */ }
    }
    loadTheme()
  }, [])

  // 监听系统主题变化（auto 模式）
  useEffect(() => {
    if (themeSettings.theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => setThemeSettings(p => ({ ...p }))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themeSettings.theme])

  useEffect(() => {
    if (modelInfo) {
      setEditProvider(modelInfo.provider)
      setEditModel(modelInfo.model)
      setEditApiKey(modelInfo.hasApiKey ? '***' : '')
      setEditBaseUrl(modelInfo.baseUrl || '')
    }
  }, [modelInfo])

  const loadSessions = useCallback(async () => {
    try { const result = await window.dogeAPI.listSessions(); if (Array.isArray(result)) setSessions(result) } catch { /* ignore */ }
  }, [])

  const handleNewSession = useCallback(async () => {
    await window.dogeAPI.newSession()
    const sid = await window.dogeAPI.getCurrentSessionId()
    tabIdCounter.current += 1
    const newTab = { id: `tab-${tabIdCounter.current}-${Date.now()}`, sessionId: sid || '', title: `对话 ${tabIdCounter.current}`, messages: [] as Message[] }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
    setMessages([])
    setCurrentStreaming('')
    setError(null)
    setShowSessions(false)
    loadSessions()
    window.dogeAPI.notify('Doge Code', '新会话已开始')
  }, [loadSessions])

  useEffect(() => { window.dogeAPI.getCurrentSessionId().then(sid => setCurrentSessionId(sid)) }, [])

  const historyRef = useRef<Message[]>([])
  useEffect(() => { historyRef.current = messages }, [messages])

  useEffect(() => {
    if (tabs.length === 0 && loaded) {
      const sid = currentSessionId || ''
      tabIdCounter.current = 1
      const initialMsgs = historyRef.current
      const defaultTab = { id: 'tab-1', sessionId: sid, title: '对话 1', messages: initialMsgs }
      setTabs([defaultTab])
      setActiveTabId('tab-1')
      setMessages(initialMsgs)
    }
  }, [loaded, tabs.length, currentSessionId])

  const handleLoadSession = useCallback(async (sessionId: string) => {
    const result = await window.dogeAPI.loadSession(sessionId)
    if (result.success) {
      const history = await window.dogeAPI.getHistory()
      const loadedMessages = history.messages?.length
        ? history.messages.map((m, i) => ({ id: `history-${i}`, role: m.role as Message['role'], content: m.content }))
        : []
      setMessages(loadedMessages)
      setCurrentSessionId(sessionId)
      if (activeTabId) { setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sessionId, messages: loadedMessages } : t)) }
      setShowSessions(false)
      window.dogeAPI.notify('Doge Code', `已加载会话 (${result.messageCount} 条消息)`)
    } else { alert(result.error || '加载失败') }
  }, [activeTabId])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const result = await window.dogeAPI.deleteSession(sessionId)
    if (result.success) { setSessions(p => p.filter(s => s.id !== sessionId)); showToast('会话已删除', 'success') }
    else { alert(result.error || '删除失败') }
  }, [showToast])

  const handleSaveConfig = useCallback(async () => {
    setSavingConfig(true)
    try {
      const apiKeyValue = editApiKey === '***' ? '' : editApiKey
      const result = await window.dogeAPI.updateConfig({ provider: editProvider, model: editModel, apiKey: apiKeyValue, baseUrl: editBaseUrl })
      if (result.success) { showToast('配置已保存', 'success'); setConfig(p => ({ ...p, provider: editProvider, model: editModel })) }
      else { alert(result.error || '保存失败') }
    } catch { alert('保存失败') } finally { setSavingConfig(false) }
  }, [editProvider, editModel, editApiKey, editBaseUrl, showToast])

  const handleNewTab = useCallback(async () => {
    try {
      const result = await window.dogeAPI.closeSession()
      if (!result.success) { alert(result.error || '创建失败'); return }
      const newSessionId = result.sessionId || ''
      tabIdCounter.current += 1
      const newTab = { id: `tab-${tabIdCounter.current}-${Date.now()}`, sessionId: newSessionId, title: `对话 ${tabIdCounter.current}`, messages: [] as Message[] }
      setTabs(prev => [...prev, newTab])
      switchTab(newTab.id)
      showToast('已创建新标签页')
    } catch { alert('创建新标签失败') }
  }, [switchTab, showToast])

  const toggleSplitScreen = useCallback(() => {
    setSplitScreen(p => !p)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch { /* ignore */ }
  }, [])

  const handleCloseTab = useCallback(async (tabId: string) => {
    const idx = tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    const remaining = tabs.filter(t => t.id !== tabId)
    if (tabId === activeTabId) {
      if (remaining.length > 0) { switchTab(remaining[Math.min(idx, remaining.length - 1)].id) }
      else { await handleNewTab(); return }
    }
    setTabs(remaining)
  }, [tabs, activeTabId, switchTab, handleNewTab])

  useEffect(() => { loadSessions() }, [loadSessions])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowCommandPalette(p => !p) }
      else if (e.key === '?' && !showCommandPalette && !showSettings) { setShowShortcuts(p => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCommandPalette, showSettings])

  const handleSend = useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (!text || state === 'responding') return
    if (!isOnline) { showToast('网络已断开，无法发送消息', 'error'); return }
    setInput(''); setError(null); setCurrentStreaming('')

    const appendMsg = (msg: Message) => {
      setMessages(prev => { const next = [...prev, msg]; persistActiveTabMessages(next); return next })
    }

    if (text.startsWith('/')) {
      const parts = text.split(' ')
      const cmdName = parts[0]
      const cmdArgs = parts.slice(1)
      setState('responding')
      const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text }
      appendMsg(userMsg)
      let result: { success: boolean; output?: string; error?: string }
      try {
        result = await window.dogeAPI.executeCommand(cmdName, cmdArgs)
      } catch (e) {
        result = { success: false, error: e instanceof Error ? e.message : '执行失败' }
      }
      const assistantMsg: Message = { id: `msg-${Date.now() + 1}`, role: 'assistant', content: result.success ? (result.output || '(无输出)') : `错误: ${result.error}` }
      appendMsg(assistantMsg)
      setCommandHistory(prev => [...prev, { cmd: text, time: Date.now() }].slice(-50))
      setState('idle')
      return
    }

    const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text }
    appendMsg(userMsg)
    setState('responding')

    const sendPayload = pendingImages.length > 0
      ? { text, images: pendingImages.map(img => ({ type: 'image', url: img.url })) }
      : text

    let result: { success?: boolean; content?: string; error?: string } | null = null
    try {
      result = await window.dogeAPI.sendMessage(typeof sendPayload === 'string' ? sendPayload : JSON.stringify(sendPayload))
      setPendingImages([])
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '发送失败'
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'error', content: errMsg })
      setState('idle')
      return
    }

    if (result?.error) {
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'error', content: result.error! })
      if (!document.hasFocus()) window.dogeAPI.notify('Doge Code', `错误: ${result.error.slice(0, 100)}`).catch(() => {})
    } else if (result?.content) {
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'assistant', content: result.content })
      if (!document.hasFocus()) window.dogeAPI.notify('Doge Code', `回复完成: ${result.content.slice(0, 80)}`).catch(() => {})
      // 自动朗读（用户开启时）
      if (autoSpeak && 'speechSynthesis' in window && result.content) {
        setTimeout(() => speakText(result.content), 200)
      }
    }
    setCurrentStreaming('')
    setState('idle')
  }, [input, state, persistActiveTabMessages, isOnline, showToast, autoSpeak])

  const handleAbort = useCallback(async () => { await window.dogeAPI.abort(); setCurrentStreaming('') }, [])
  const handleClear = useCallback(async () => { await window.dogeAPI.clearHistory(); setMessages([]); persistActiveTabMessages([]); setCurrentStreaming('') }, [persistActiveTabMessages])

  // ─── 语音输出（浏览器 SpeechSynthesis API） ───
  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.0
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('zh'))
    if (zhVoice) utterance.voice = zhVoice
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [])

  const toggleSpeak = useCallback(() => {
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return }
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (lastAssistant) speakText(lastAssistant.content)
  }, [messages, isSpeaking, speakText])

  // ─── 全局快捷键 ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const onCtrl = e.ctrlKey || e.metaKey

      if (!onCtrl && e.key === 'Escape') {
        e.preventDefault()
        if (showCommandPalette) setShowCommandPalette(false)
        else if (showSettings) setShowSettings(false)
        else if (showShortcuts) setShowShortcuts(false)
        else if (showSessions) setShowSessions(false)
        else if (terminalVisible) setTerminalVisible(false)
        return
      }

      if (!showCommandPalette && !showSettings && !showShortcuts && !showSessions) {
        if (e.key === '?' && !terminalVisible) { e.preventDefault(); setShowShortcuts(p => !p); return }
      }

      if (!onCtrl) return
      switch (e.key.toLowerCase()) {
        case 'p': e.preventDefault(); setPaletteMode(e.shiftKey ? 'commands' : 'files'); setShowCommandPalette(p => !p); break
        case 'n': case 'N': e.preventDefault(); handleNewTab(); break
        case 'w': case 'W': e.preventDefault(); if (activeTabId) handleCloseTab(activeTabId); break
        case ',': e.preventDefault(); setShowSettings(p => !p); break
        case '/': e.preventDefault(); inputRef.current?.focus(); break
        case 'l': case 'L': e.preventDefault(); handleClear(); break
        case 'b': case 'B': e.preventDefault(); setSidebarVisible(p => !p); break
        case 'r': case 'R': e.preventDefault(); setMsgSearchQuery(p => p ? '' : '/'); break
        case '`': e.preventDefault(); setTerminalVisible(p => !p); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCommandPalette, showSettings, showShortcuts, showSessions, terminalVisible, activeTabId, handleNewTab, handleCloseTab, handleClear])

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || isCommitting) return
    setIsCommitting(true)
    const result = await window.dogeAPI.gitCommit(config.workingDir, commitMessage.trim())
    if (!result.success) alert(result.error || '提交失败')
    else { setCommitMessage(''); setSelectedGitFile(null) }
    setIsCommitting(false)
  }, [commitMessage, isCommitting, config.workingDir])

  // 输入历史导航
  const historyIndexRef = useRef(-1)
  const [historyDraft, setHistoryDraft] = useState('')
  useEffect(() => { historyIndexRef.current = -1 }, [messages])

  const navigateHistory = (direction: 'up' | 'down') => {
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).reverse()
    if (userMessages.length === 0) return
    const current = historyIndexRef.current
    if (direction === 'up') {
      const next = Math.min(current + 1, userMessages.length - 1)
      historyIndexRef.current = next
      setHistoryDraft(next === userMessages.length - 1 && current === -1 ? '' : userMessages[next])
      setInput(next === userMessages.length - 1 && current === -1 ? '' : userMessages[next])
    } else {
      const next = Math.max(current - 1, -1)
      historyIndexRef.current = next
      setInput(next === -1 ? historyDraft : userMessages[next])
    }
  }

  // Tab 自动补全
  const [completions, setCompletions] = useState<{ text: string; display: string }[]>([])
  const [completionIndex, setCompletionIndex] = useState(0)
  const completionIndexRef = useRef(0)

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      const newImages: Array<{ id: string; url: string; name: string }> = []
      for (const file of imageFiles) {
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        newImages.push({ id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url, name: file.name })
      }
      setPendingImages(prev => [...prev, ...newImages])
    }
  }, [])

  const removePendingImage = useCallback((id: string) => {
    setPendingImages(prev => prev.filter(img => img.id !== id))
  }, [])

  const toggleVoiceInput = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      setInterimTranscript('')
      return
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      showToast('当前浏览器不支持语音识别 API', 'error')
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => {
      setIsRecording(true)
      setInterimTranscript('')
    }

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }
      if (interim) setInterimTranscript(interim)
      if (final) {
        setInput(prev => prev ? prev + ' ' + final : final)
        setInterimTranscript('')
      }
    }

    recognition.onerror = (event: any) => {
      setIsRecording(false)
      setInterimTranscript('')
      if (event.error !== 'no-speech') {
        showToast(`语音识别错误: ${event.error}`, 'error')
      }
    }

    recognition.onend = () => {
      setIsRecording(false)
      setInterimTranscript('')
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isRecording, showToast])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return }
    if (e.key === '\\' && e.ctrlKey) { e.preventDefault(); toggleSplitScreen(); return }
    if (e.key === 'Tab') {
      e.preventDefault()
      const value = input.trim()
      if (!value) return
      const lastWord = value.split(/\s+/).pop() || ''
      if (!lastWord) return

      let candidates: { text: string; display: string }[] = []

      if (lastWord.startsWith('/')) {
        const cmds = [
          { text: '/clear', display: '/clear — 清除对话' },
          { text: '/rstk', display: '/rstk — 重启会话' },
          { text: '/commit', display: '/commit — 提交' },
          { text: '/branch', display: '/branch — 分支' },
          { text: '/review', display: '/review — 审查' },
          { text: '/diff', display: '/diff — Diff' },
          { text: '/status', display: '/status — 状态' },
          { text: '/help', display: '/help — 帮助' },
          { text: '/plan', display: '/plan — 计划模式' },
          { text: '/config', display: '/config — 配置' },
          { text: '/model', display: '/model — 模型' },
          { text: '/session', display: '/session — 会话' },
          { text: '/skills', display: '/skills — 技能' },
          { text: '/memory', display: '/memory — 记忆' },
          { text: '/compact', display: '/compact — 压缩' },
          { text: '/stats', display: '/stats — 统计' },
          { text: '/cost', display: '/cost — 费用' },
          { text: '/todo', display: '/todo — TODO' },
          { text: '/task', display: '/task — 任务' },
          { text: '/export', display: '/export — 导出' },
          { text: '/mcp', display: '/mcp — MCP' },
        ].filter(c => c.text.startsWith(lastWord))
        candidates = candidates.map(c => ({ text: c.text, display: c.text }))
      } else {
        const parts = value.split(/\s+/)
        const lastPart = parts.pop() || ''
        const slashIdx = lastPart.lastIndexOf('/')
        const partialFile = slashIdx >= 0 ? lastPart.slice(slashIdx + 1) : lastPart
        const dirPath = slashIdx >= 0 ? lastPart.slice(0, slashIdx) : ''
        const baseDir = dirPath ? `${config.workingDir}/${dirPath}` : (config.workingDir || '')

        if (partialFile && !partialFile.includes('*')) {
          window.dogeAPI.listDir(baseDir).then((items: Array<{ name: string; isDirectory: boolean }>) => {
            const matches = items
              .filter((item: { name: string; isDirectory: boolean }) => item.name.toLowerCase().includes(partialFile.toLowerCase()))
              .slice(0, 10)
              .map((item: { name: string; isDirectory: boolean }) => ({
                text: dirPath ? `${dirPath}/${item.name}${item.isDirectory ? '/' : ''}` : `${item.name}${item.isDirectory ? '/' : ''}`,
                display: dirPath ? `${dirPath}/${item.name}${item.isDirectory ? '/' : ''}` : `${item.name}${item.isDirectory ? '/' : ''}`
              }))
            setCompletions(matches)
            completionIndexRef.current = 0
            setCompletionIndex(0)
          }).catch(() => {})
          return
        }
      }

      if (candidates.length === 0) return
      const idx = completionIndexRef.current % candidates.length
      completionIndexRef.current = idx + 1
      setCompletionIndex(idx)

      const selected = candidates[idx]
      const words = value.split(/\s+/)
      words[words.length - 1] = selected.text
      setInput(words.join(' ') + ' ')
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (state === 'responding') { handleAbort() } else { handleSend() }
    } else if (e.key === 'ArrowUp' && !e.shiftKey && e.ctrlKey === false) {
      e.preventDefault(); navigateHistory('up')
    } else if (e.key === 'ArrowDown' && !e.shiftKey && e.ctrlKey === false) {
      e.preventDefault(); navigateHistory('down')
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault(); const inputEl = e.currentTarget; inputEl.scrollTop = Math.max(0, inputEl.scrollTop - 40)
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault(); const inputEl = e.currentTarget; inputEl.scrollTop = Math.min(inputEl.scrollHeight, inputEl.scrollTop + 40)
    }
  }, [handleSend, handleAbort, state, messages, input, config.workingDir])

  if (!loaded) return <div style={{ ...styles.loadingOverlay }}>加载中...</div>
  const isProcessing = state === 'responding'
  const workingDir = config.workingDir || '/'
  const displayMessages = messages
  const msgSearchQueryLower = msgSearchQuery.toLowerCase()
  const filteredDisplayMessages = msgSearchQuery
    ? displayMessages.map((m, i) => ({ ...m, _origIndex: i, _match: m.content.toLowerCase().includes(msgSearchQueryLower) }))
    : displayMessages.map((m, i) => ({ ...m, _origIndex: i, _match: true }))

  useEffect(() => {
    if (!msgSearchQuery) { setMsgSearchMatches([]); return }
    const matches: number[] = []
    displayMessages.forEach((m, i) => { if (m.content.toLowerCase().includes(msgSearchQueryLower)) matches.push(i) })
    setMsgSearchMatches(matches)
  }, [msgSearchQuery, displayMessages, msgSearchQueryLower])

  // 主题感知颜色辅助
  const _tp = theme.bgPanel
  const _bs = theme.border
  const _tm = theme.textMuted
  const c = theme

  return (
    <ThemeContext.Provider value={{ name: effectiveTheme, colors: theme, styles }}>
      <div style={styles.container}>
        {toast && (
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', padding: '8px 20px', borderRadius: '6px', background: toast.type === 'error' ? c.errorBg : `${c.accent}22`, color: toast.type === 'error' ? c.errorText : c.accent, fontSize: '12px', fontWeight: 600, zIndex: 1000, boxShadow: `0 4px 12px ${c.bg}80`, transition: 'opacity 0.3s' }}>
            {toast.text}
          </div>
        )}
        {/* Tab 栏 */}
        <div style={{ display: 'flex', background: _tp, borderBottom: `1px solid ${_bs}`, minHeight: '32px', alignItems: 'stretch', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px',
                cursor: 'pointer', fontSize: '12px', borderRight: `1px solid ${_bs}`,
                background: tab.id === activeTabId ? c.bg : 'transparent',
                color: tab.id === activeTabId ? c.text : _tm,
                whiteSpace: 'nowrap', minWidth: 0, maxWidth: '180px'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{tab.title}</span>
              <span
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                style={{ cursor: 'pointer', fontSize: '10px', color: _tm, padding: '0 2px', borderRadius: '2px', flexShrink: 0 }}
                title="关闭"
              >✕</span>
            </div>
          ))}
          <div
            onClick={handleNewTab}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#555', borderRight: 'none' }}
            title="新建标签页"
          >+</div>
        </div>
        {/* 左栏：对话历史 */}
        <div style={{ ...styles.sidebar, display: sidebarVisible ? 'flex' : 'none' }}>
          <div style={styles.sidebarHeader}>
            <span style={{ fontSize: '18px' }}>{'🐕'}</span>
            <span style={{ flex: 1 }}>Doge Code</span>
            <span style={{ cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #262626', color: '#888' }} onClick={() => setShowSettings(p => !p)}>⚙</span>
          </div>
          <div style={{ padding: '8px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={styles.modelBadge}>{config.provider}</span>
            <span style={styles.modelBadge}>{config.model}</span>
          </div>
          {/* 会话侧边栏 */}
          <div style={{ borderBottom: '1px solid #262626', background: '#0F0F0F', display: 'flex', flexDirection: 'column', maxHeight: '320px' }}>
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #262626', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#888', flex: 1 }}>历史会话</span>
              <button onClick={handleNewSession} style={{ padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#4ECB71', cursor: 'pointer', fontSize: '10px' }} title="新会话">+</button>
              <button onClick={loadSessions} style={{ padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#888', cursor: 'pointer', fontSize: '10px' }} title="刷新">↻</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sessions.length === 0 ? (
                <div style={{ padding: '8px 12px', color: '#555', fontSize: '11px', textAlign: 'center' }}>无历史会话</div>
              ) : (
                sessions.slice(0, 20).map((s) => {
                  const isActive = currentSessionId === s.id
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleLoadSession(s.id)}
                      style={{
                        padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #1A1A1A', cursor: 'pointer',
                        background: isActive ? 'rgba(78,203,113,0.08)' : 'transparent',
                        color: isActive ? '#4ECB71' : '#888',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                      title={`${s.messageCount} 条消息 · 点击加载`}
                    >
                      <span style={{ fontSize: '10px', flexShrink: 0 }}>💬</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{s.id}</div>
                        <div style={{ color: '#555', fontSize: '9px', marginTop: '1px' }}>{new Date(s.createdAt).toLocaleString()} · {s.messageCount} 条</div>
                      </div>
                      <span
                        style={{ color: '#555', fontSize: '9px', cursor: 'pointer', padding: '1px 3px', borderRadius: '2px', border: '1px solid #262626', flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id) }}
                        title="删除"
                      >✕</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          {/* 最近文件 */}
          {recentFiles.length > 0 && (
            <div style={{ borderBottom: '1px solid #262626', background: '#0F0F0F', flexDirection: 'column', maxHeight: '200px' }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #262626', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#888', flex: 1 }}>最近文件</span>
                <button onClick={() => setRecentFiles([])} style={{ padding: '1px 5px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#555', cursor: 'pointer', fontSize: '9px' }} title="清空">清空</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {recentFiles.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => handlePreviewFile(f.path)}
                    style={{ padding: '4px 12px', fontSize: '11px', borderBottom: '1px solid #1A1A1A', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={f.path}
                  >
                    <span style={{ fontSize: '9px', flexShrink: 0, color: '#569CD6' }}>📄</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 设置面板 */}
          {showSettings && (
            <div style={{ borderBottom: `1px solid ${c.border}`, padding: '12px', background: c.bgPanel }}>
              <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '8px', fontWeight: 600 }}>主题设置</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {['dark', 'light', 'auto'].map((t) => (
                  <button key={t} onClick={async () => { await window.dogeAPI.setTheme({ theme: t }); setThemeSettings(p => ({ ...p, theme: t })) }} style={{ flex: 1, padding: '4px', border: '1px solid', borderColor: themeSettings.theme === t ? c.accent : c.border, borderRadius: '3px', background: themeSettings.theme === t ? `${c.accent}22` : c.bgPanel, color: themeSettings.theme === t ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px', textTransform: 'capitalize' }}>
                    {t === 'auto' ? '自动' : t === 'dark' ? '深色' : '浅色'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>字体大小: {themeSettings.fontSize}px</div>
              <input type="range" min="11" max="18" value={themeSettings.fontSize} onChange={(e) => { const v = Number(e.target.value); setThemeSettings(p => ({ ...p, fontSize: v })); window.dogeAPI.setTheme({ fontSize: v }) }} style={{ width: '100%', accentColor: c.accent }} />
              <div style={{ borderTop: `1px solid ${c.border}`, marginTop: '12px', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '8px', fontWeight: 600 }}>模型配置</div>
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '3px' }}>提供商</div>
                  <select value={editProvider} onChange={(e) => setEditProvider(e.target.value)} style={{ width: '100%', padding: '4px 6px', backgroundColor: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '3px' }}>模型</div>
                  <input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="gpt-4o" style={{ width: '100%', padding: '4px 6px', backgroundColor: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '3px' }}>API Key</div>
                  <input value={editApiKey} onChange={(e) => setEditApiKey(e.target.value)} type="password" placeholder="sk-..." style={{ width: '100%', padding: '4px 6px', backgroundColor: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '3px' }}>Base URL</div>
                  <input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" style={{ width: '100%', padding: '4px 6px', backgroundColor: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }} />
                </div>
                <button onClick={handleSaveConfig} disabled={savingConfig} style={{ width: '100%', padding: '5px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: (!savingConfig) ? c.accent : c.bgPanel, color: (!savingConfig) ? '#000' : c.textFaint, fontSize: '11px', fontWeight: 600 }}>
                  {savingConfig ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {displayMessages.length === 0 && !currentStreaming ? (
              <div style={{ padding: '16px', color: '#555555', fontSize: '12px' }}>开始新对话</div>
            ) : (
              (() => {
                const turns: Array<{ userMsg: Message; assistantMsg: Message | null }> = []
                let i = 0
                while (i < displayMessages.length) {
                  if (displayMessages[i].role === 'user') {
                    const next = i + 1 < displayMessages.length && displayMessages[i + 1].role === 'assistant' ? displayMessages[i + 1] : null
                    turns.push({ userMsg: displayMessages[i], assistantMsg: next })
                    i = next ? i + 2 : i + 1
                  } else if (displayMessages[i].role === 'assistant') {
                    turns.push({ userMsg: { id: '', role: 'user' as const, content: '(系统)' }, assistantMsg: displayMessages[i] })
                    i++
                  } else { i++ }
                }
                if (turns.length === 0 && currentStreaming) {
                  const lastUser = [...displayMessages].reverse().find(m => m.role === 'user')
                  if (lastUser) turns.push({ userMsg: lastUser, assistantMsg: null })
                }
                return turns.map((turn, idx) => (
                  <div key={idx} style={{ padding: '6px 12px', borderBottom: '1px solid #1A1A1A', cursor: 'pointer' }}>
                    <div style={{ fontSize: '12px', color: '#F5F5F5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.4' }}>
                      <span style={{ color: '#4ECB71', marginRight: '4px' }}>❯</span>
                      {turn.userMsg.content || '(空消息)'}
                    </div>
                    {turn.assistantMsg && (
                      <div style={{ fontSize: '10px', color: '#555555', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '12px' }}>
                        {turn.assistantMsg.content.slice(0, 60)}
                      </div>
                    )}
                  </div>
                ))
              })()
            )}
          </div>
          <div style={styles.statusBar}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: isProcessing ? '#4ECB71' : '#666' }}>{isProcessing ? '● 回复中' : '○ 就绪'}</span>
              {modelInfo && (<span style={{ color: '#555' }}>{modelInfo.provider}/{modelInfo.model}</span>)}
              {tokenUsage && tokenUsage.totalTokens > 0 && (
                <>
                  <span style={{ color: '#56B6C2' }}>In: {tokenUsage.inputTokens.toLocaleString()}</span>
                  <span style={{ color: '#E06C75' }}>Out: {tokenUsage.outputTokens.toLocaleString()}</span>
                  <span style={{ color: '#555' }}>Total: {tokenUsage.totalTokens.toLocaleString()}</span>
                  <span style={{ color: '#444', fontSize: '10px' }}>| {displayMessages.length} 条消息</span>
                </>
              )}
              {memoryUsage && memoryUsage.status !== 'normal' && (
                <span style={{ color: memoryUsage.status === 'critical' ? '#E06C75' : '#E5C07B' }}>
                  MEM: {(memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB
                </span>
              )}
              <span style={{ color: isOnline ? '#4ECB71' : '#E06C75', fontSize: '10px' }}>
                {isOnline ? '🟢' : '🔴 离线'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#444', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={workingDir}>{workingDir}</span>
              {displayMessages.length > 0 && (<button style={styles.clearButton} onClick={handleClear}>清除</button>)}
              <button style={styles.clearButton} onClick={toggleSplitScreen} title="分屏模式 (Ctrl+\\)">{splitScreen ? '⧉ 退出分屏' : '⧉ 分屏'}</button>
              <button style={styles.clearButton} onClick={toggleFullscreen} title="全屏模式 (F11)">{isFullscreen ? '⧸ 退出全屏' : '⛶ 全屏'}</button>
            </div>
          </div>
        </div>

        {/* 中栏：聊天界面 */}
        <div style={{ ...styles.chatView, ...(splitScreen ? { flex: 1, width: 'auto', maxWidth: '50%' } : {}) }}>
          {messages.length > 0 && (
            <div style={{ padding: '4px 12px', borderBottom: '1px solid #1A1A1A', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                value={msgSearchQuery}
                onChange={(e) => setMsgSearchQuery(e.target.value)}
                placeholder="搜索消息..."
                style={{ flex: 1, padding: '3px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '11px', outline: 'none' }}
              />
              {msgSearchQuery && (<span style={{ color: '#555', fontSize: '10px', whiteSpace: 'nowrap' }}>{msgSearchMatches.length} 条匹配</span>)}
            </div>
          )}
          <div style={styles.chatMessages}>
            {messages.length === 0 && !currentStreaming ? (
              <div style={styles.welcomeBlock}>
                <div style={styles.welcomeTitle}>Doge Code</div>
                <div style={styles.welcomeSubtitle}>{config.provider} / {config.model}</div>
                <div style={{ marginTop: '24px', fontSize: '13px', color: '#666666' }}>输入消息开始对话</div>
              </div>
            ) : (
              <>
                {messages.map((m) => {
                  if (m.role === 'error') {
                    return (<div key={m.id} style={styles.errorBubble}><div style={styles.roleLabel}>错误</div><div>{m.content}</div></div>)
                  }
                  const isAssistant = m.role === 'assistant'
                  const isTool = m.role === 'tool'
                  const blocks = isAssistant ? parseMessageContent(m.content) : null

                  let toolResultContent: { success?: boolean; output?: unknown; error?: string } | null = null
                  if (isTool) { try { toolResultContent = JSON.parse(m.content) } catch { /* not JSON */ } }

                  const matchesSearch = !msgSearchQuery || m.content.toLowerCase().includes(msgSearchQueryLower)
                  return (
                    <div key={m.id} style={{ ...styles.messageBubble, ...(m.role === 'user' ? styles.userBubble : isTool ? styles.toolResultBubble : styles.assistantBubble), opacity: msgSearchQuery ? (matchesSearch ? 1 : 0.3) : 1, transition: 'opacity 0.2s' }}>
                      <div style={styles.roleLabel}>{m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role === 'tool' ? '🔧 工具结果' : '系统'}</div>
                      {isTool && toolResultContent
                        ? (<div>{toolResultContent.success != null && (<div style={{ color: toolResultContent.success ? '#4ECB71' : '#FF6B6B', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>{toolResultContent.success ? '✓ 执行成功' : '✗ 执行失败'}</div>)}{toolResultContent.error && <ToolErrorBanner error={toolResultContent.error} toolName={m.id} />}<ToolResultRenderer output={toolResultContent.output} error={toolResultContent.error} success={toolResultContent.success} maxHeight={250} /></div>)
                        : blocks
                          ? blocks.map((block, i) => {
                              if (block.type === 'tool_use') { return <InlineToolUseBlock key={i} block={block} onExecute={executeToolFromBlock} executingIds={executingToolIds} /> }
                              if (block.type === 'thinking') { return <div key={i} style={{ padding: '6px 10px', margin: '4px 0', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '4px', fontSize: '11px', color: '#888', fontStyle: 'italic' }}>{block.text}</div> }
                              if (block.type === 'image') { return <div key={i} style={{ margin: '4px 0' }}><img src={block.url} alt={block.alt || ''} style={{ maxWidth: '100%', borderRadius: '4px' }} /></div> }
                              return <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }} />
                            })
                          : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                      }
                    </div>
                  )
                })}
                {currentStreaming && (
                  <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
                    <div style={styles.roleLabel}>助手</div>
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(currentStreaming) }} />
                    <div style={styles.thinkingIndicator}>...</div>
                  </div>
                )}
                {toolProgress && toolProgress.status !== 'success' && (
                  <ToolProgressBar
                    toolName={toolProgress.toolName}
                    status={toolProgress.status}
                    progress={toolProgress.progress}
                    duration={toolProgress.duration}
                    onCancel={() => window.dogeAPI.abort()}
                  />
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
          <div style={styles.chatInput}>
            {pendingImages.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {pendingImages.map(img => (
                  <div key={img.id} style={{ position: 'relative', width: '48px', height: '48px' }}>
                    <img src={img.url} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #262626' }} />
                    <span onClick={() => removePendingImage(img.id)} style={{ position: 'absolute', top: '-4px', right: '-4px', width: '14px', height: '14px', borderRadius: '50%', background: '#FF6B6B', color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
              <form onSubmit={(e) => { e.preventDefault(); isProcessing ? handleAbort() : handleSend() }} style={{ flex: 1 }}>
                <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); setCompletions([]); completionIndexRef.current = 0 }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onDrop={(e) => { const path = e.dataTransfer.getData('text/plain'); if (path) { e.preventDefault(); setInput(prev => prev ? prev + ' ' + path : path) } }}
                onDragOver={(e) => e.preventDefault()}
                placeholder={isProcessing ? '按 Enter 中断... (Shift+Enter 换行)' : '输入消息... (Enter 发送, Shift+Enter 换行, ↑↓ 历史导航)'}
                style={{ ...styles.inputBox, minHeight: '44px', maxHeight: '200px', resize: 'none', overflowY: 'auto', lineHeight: '1.5', fontFamily: 'inherit', fontSize: `${themeSettings.fontSize}px` }}
                disabled={!config.apiKey}
                autoFocus
                rows={1}
              />
            </form>
            <button
              type="button"
              onClick={toggleVoiceInput}
              title={isRecording ? '停止录音' : '语音输入'}
              style={{
                padding: '6px 10px', border: '1px solid', borderColor: isRecording ? '#FF6B6B' : '#262626',
                borderRadius: '4px', background: isRecording ? 'rgba(255,107,107,0.15)' : '#0F0F0F',
                color: isRecording ? '#FF6B6B' : '#888', cursor: 'pointer', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '36px', height: '36px',
                flexShrink: 0
              }}
            >
              {isRecording ? '⏹' : '🎤'}
            </button>
            <button
              type="button"
              onClick={toggleSpeak}
              title={isSpeaking ? '停止朗读' : '朗读最后回复'}
              style={{
                padding: '6px 10px', border: '1px solid', borderColor: isSpeaking ? '#4ECB71' : '#262626',
                borderRadius: '4px', background: isSpeaking ? 'rgba(78,203,113,0.15)' : '#0F0F0F',
                color: isSpeaking ? '#4ECB71' : '#888', cursor: 'pointer', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '36px', height: '36px',
                flexShrink: 0
              }}
            >
              {isSpeaking ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={() => setAutoSpeak(p => !p)}
              title={autoSpeak ? '关闭自动朗读' : '开启自动朗读'}
              style={{
                padding: '6px 10px', border: '1px solid', borderColor: autoSpeak ? '#569CD6' : '#262626',
                borderRadius: '4px', background: autoSpeak ? 'rgba(86,156,214,0.15)' : '#0F0F0F',
                color: autoSpeak ? '#569CD6' : '#888', cursor: 'pointer', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '36px', height: '36px',
                flexShrink: 0
              }}
            >
              {autoSpeak ? '🗣️' : '🔕'}
            </button>
            {interimTranscript && (
              <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic', marginBottom: '4px', padding: '0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                识别中: {interimTranscript}
              </div>
            )}
            {completions.length > 0 && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1A1A1A', border: '1px solid #333', borderRadius: '4px', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px', zIndex: 100 }}>
                {completions.map((c, i) => (
                  <div key={i} style={{ padding: '4px 10px', cursor: 'pointer', background: i === completionIndex ? '#333' : 'transparent', color: '#F5F5F5', fontSize: '11px' }}
                    onMouseDown={(e) => { e.preventDefault(); const words = input.split(/\s+/); words[words.length - 1] = c.text; setInput(words.join(' ') + ' '); setCompletions([]); completionIndexRef.current = 0 }}
                  >{c.display}</div>
                ))}
              </div>
            )}
            {!config.apiKey && (<div style={{ color: '#FF6B6B', fontSize: '11px', marginTop: '6px' }}>未配置 API Key。请在 .doge/api.json 中配置。</div>)}
            </div>
          </div>
        </div>

        {/* 右栏：文件树 + Git 变更 + 工具面板 */}
        <div style={{ ...styles.rightPanel, display: 'flex' }}>
          <div style={styles.panelHeader}>📁 文件树</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <FileTree cwd={workingDir} onPreviewFile={handlePreviewFile} />
          </div>

          {terminalVisible && (
            <div style={{ borderTop: '1px solid #262626', height: '200px', display: 'flex', flexDirection: 'column', background: '#0A0A0A' }}>
              <div style={{ ...styles.panelHeader, borderTop: 'none', justifyContent: 'space-between' }}>
                <span>💻 终端</span>
                <span style={{ cursor: 'pointer', color: '#555', fontSize: '12px' }} onClick={() => setTerminalVisible(false)}>✕</span>
              </div>
              <div style={{ flex: 1, padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', color: '#D4D4D4', overflowY: 'auto', background: '#0F0F0F' }}>
                <span style={{ color: '#888' }}>终端集成需要安装 xterm.js 库。当前为占位界面。</span>
              </div>
            </div>
          )}

          {previewTabs.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #262626', borderBottom: '1px solid #262626', display: 'flex', background: '#0A0A0A', overflowX: 'auto' }}>
                {previewTabs.map(tab => (
                  <div
                    key={tab.id}
                    style={{ padding: '4px 8px', fontSize: '10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: '4px', background: tab.id === activePreviewTabId ? '#1A1A1A' : 'transparent', color: tab.id === activePreviewTabId ? '#F5F5F5' : '#888' }}
                    onClick={() => { setActivePreviewTabId(tab.id); setIsEditing(false); setEditContent('') }}
                  >
                    <span>{tab.path.split('/').pop()}</span>
                    <span style={{ color: '#555', fontSize: '9px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setPreviewTabs(prev => prev.filter(t => t.id !== tab.id)); if (activePreviewTabId === tab.id) setActivePreviewTabId(previewTabs.find(t => t.id !== tab.id)?.id || null) }}>✕</span>
                  </div>
                ))}
              </div>
              {activePreviewFile ? (
                <div style={{ borderBottom: '1px solid #262626', padding: '4px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>{isEditing ? '✏️ 编辑中' : '👁️'} {activePreviewFile.path.split('/').pop()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {isEditing ? (
                        <>
                          <span style={{ cursor: 'pointer', color: '#4ECB71', fontSize: '11px' }} onClick={handleSaveEdit}>{isSaving ? '保存中...' : '💾 保存'}</span>
                          <span style={{ cursor: 'pointer', color: '#555', fontSize: '11px' }} onClick={handleCancelEdit}>✕ 取消</span>
                        </>
                      ) : (
                        <>
                          <span style={{ cursor: 'pointer', color: '#888', fontSize: '11px' }} onClick={handleOpenTerminal} title="在终端中打开">💻</span>
                          <span style={{ cursor: 'pointer', color: '#569CD6', fontSize: '11px' }} onClick={handleStartEdit}>✏️ 编辑</span>
                          <span style={{ cursor: 'pointer', color: '#888', fontSize: '11px' }} onClick={handleCopyContent}>📝 复制内容</span>
                          <span style={{ cursor: 'pointer', color: '#888', fontSize: '11px' }} onClick={handleRevealInExplorer}>📂 所在位置</span>
                          <span style={{ cursor: 'pointer', color: '#555', fontSize: '11px' }} onClick={() => { navigator.clipboard.writeText(activePreviewFile.path); showToast('路径已复制', 'success') }}>📋</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!isEditing && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                      <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); runSearch() }} placeholder="搜索..." style={{ flex: 1, padding: '2px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '10px', outline: 'none' }} />
                      <span style={{ color: '#555', fontSize: '10px', minWidth: '40px', textAlign: 'center' }}>{searchResults.length > 0 ? `${currentResultIndex + 1}/${searchResults.length}` : '0/0'}</span>
                      <button onClick={handlePrevResult} style={{ padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#888', cursor: 'pointer', fontSize: '10px' }} title="上一个">↑</button>
                      <button onClick={handleNextResult} style={{ padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#888', cursor: 'pointer', fontSize: '10px' }} title="下一个">↓</button>
                      <input value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} placeholder="替换为..." style={{ flex: 1, padding: '2px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '10px', outline: 'none' }} />
                      <button onClick={handleReplace} disabled={currentResultIndex === -1} style={{ padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: currentResultIndex === -1 ? '#555' : '#4ECB71', cursor: 'pointer', fontSize: '10px' }} title="替换">替换</button>
                      <button onClick={handleReplaceAll} disabled={searchResults.length === 0} style={{ padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: searchResults.length === 0 ? '#555' : '#4ECB71', cursor: 'pointer', fontSize: '10px' }} title="全部替换">全部</button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ borderBottom: '1px solid #262626', padding: '8px', color: '#555', fontSize: '10px', textAlign: 'center' }}>所有标签页已关闭</div>
              )}
              {activePreviewFile && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', borderBottom: '1px solid #262626', maxHeight: '50%' }}>
                  {previewLoading && <div style={{ color: '#888', fontSize: '11px', textAlign: 'center' }}>加载中...</div>}
                  {previewError && <div style={{ color: '#FF6B6B', fontSize: '11px' }}>{previewError}</div>}
                  <div>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{activePreviewFile.path}</span>
                      <span>{activePreviewFile.size != null ? `${(activePreviewFile.size / 1024).toFixed(1)} KB` : ''} {activePreviewFile.content ? `${activePreviewFile.content.split('\n').length} 行` : ''}</span>
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{ width: '100%', minHeight: '200px', background: '#0A0A0A', border: '1px solid #569CD6', borderRadius: '4px', padding: '8px', color: '#D4D4D4', fontSize: '11px', fontFamily: 'Consolas, Monaco, monospace', lineHeight: '1.5', resize: 'vertical', outline: 'none', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
                        onKeyDown={(e) => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSaveEdit() } }}
                      />
                    ) : (
                      (() => {
                        const ext = activePreviewFile.path.split('.').pop()?.toLowerCase() || ''
                        const langMap: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rb: 'ruby', sh: 'bash', yml: 'yaml', md: 'markdown', rs: 'rust', cpp: 'cpp', c: 'c', go: 'go', java: 'java', php: 'php', xml: 'html', json: 'json', css: 'css', scss: 'css', html: 'html', sql: 'sql', bash: 'bash', yaml: 'yaml', markdown: 'markdown', typescript: 'typescript', javascript: 'javascript', python: 'python', rust: 'rust', ruby: 'ruby' }
                        const codeExts = ['ts','tsx','js','jsx','py','css','html','json','md','bash','sh','yaml','yml','sql','rust','go','java','c','cpp','php','ruby','rs','toml','ini','env','conf','xml','svg','tex','r','swift','kt','kts','scala','hs','lua','vim','dockerfile','makefile','gitignore']
                        const detectedLang = langMap[ext] || (codeExts.includes(ext) ? ext : '')
                        const highlighted = detectedLang ? highlightCode(activePreviewFile.content || '', detectedLang) : null
                        if (highlighted !== null) {
                          const codeLines = activePreviewFile.content.split('\n')
                          const lineNums = codeLines.map((_, i) => i + 1).join('\n')
                          return (
                            <pre style={{ display: 'flex', background: '#0A0A0A', border: '1px solid #262626', borderRadius: '4px', fontSize: '11px', lineHeight: '1.5', overflowX: 'auto', maxHeight: '300px', overflowY: 'auto', margin: 0 }}>
                              <div style={{ color: '#444', textAlign: 'right', paddingRight: '8px', userSelect: 'none', minWidth: '36px', borderRight: '1px solid #1A1A1A', flexShrink: 0 }}>
                                {lineNums.split('\n').map((n, i) => (<div key={i} style={{ height: '1.5em' }}>{n}</div>))}
                              </div>
                              <div style={{ flex: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: '0 8px', color: '#D4D4D4' }} dangerouslySetInnerHTML={{ __html: highlighted }} />
                            </pre>
                          )
                        }
                        return (
                          <pre style={{ background: '#0A0A0A', border: '1px solid #262626', borderRadius: '4px', padding: '8px', fontSize: '11px', lineHeight: '1.5', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#D4D4D4', margin: 0, maxHeight: '300px', overflowY: 'auto' }}>
                            {activePreviewFile.content || '(空文件)'}
                          </pre>
                        )
                      })()
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ ...styles.panelHeader, borderTop: '1px solid #262626' }}>🔄 Git 变更</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <GitChanges cwd={workingDir} onSelectFile={(path) => { setSelectedGitFile(path); setCommitMessage('') }} />
            {selectedGitFile && (
              <div style={{ borderTop: '1px solid #262626' }}>
                <div style={{ padding: '4px 12px', fontSize: '11px', color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedGitFile}>{selectedGitFile.replace(workingDir + '/', '')}</span>
                  <span style={{ cursor: 'pointer', color: '#555' }} onClick={() => setSelectedGitFile(null)}>✕</span>
                </div>
                <GitDiff cwd={workingDir} filePath={selectedGitFile} />
                <div style={{ padding: '8px 12px', borderTop: '1px solid #262626' }}>
                  <input
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="提交信息..."
                    style={{ width: '100%', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '4px', padding: '6px 10px', color: '#F5F5F5', fontSize: '12px', outline: 'none', marginBottom: '6px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit() } }}
                  />
                  <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || isCommitting}
                    style={{ width: '100%', padding: '6px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: commitMessage.trim() ? '#4ECB71' : '#1A1A1A', color: commitMessage.trim() ? '#000' : '#555', fontSize: '12px', fontWeight: 600 }}
                  >
                    {isCommitting ? '提交中...' : '提交'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ ...styles.panelHeader, borderTop: '1px solid #262626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🔧 工具</span>
            <span style={{ cursor: 'pointer', fontSize: '10px', color: '#4ECB71' }} onClick={() => { setShowMcpPanel(p => !p); if (!showMcpPanel) { refreshMcpServers(); refreshAgents() } }}>{showMcpPanel ? '收起 MCP' : 'MCP 管理'}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <ToolPanel cwd={workingDir} />
          </div>
          {showMcpPanel && (
            <div style={{ borderTop: '1px solid #262626', padding: '8px 12px', maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>MCP 服务器</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input value={mcpNewName} onChange={e => setMcpNewName(e.target.value)} placeholder="名称" style={{ flex: 1, padding: '3px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '10px', outline: 'none' }} />
                <input value={mcpNewCommand} onChange={e => setMcpNewCommand(e.target.value)} placeholder="命令 (npx ...)" style={{ flex: 2, padding: '3px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '10px', outline: 'none' }} />
                <input value={mcpNewArgs} onChange={e => setMcpNewArgs(e.target.value)} placeholder="参数" style={{ flex: 1, padding: '3px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '10px', outline: 'none' }} />
                <button onClick={handleMcpAdd} disabled={mcpLoading || !mcpNewName.trim() || !mcpNewCommand.trim()} style={{ padding: '3px 8px', border: 'none', borderRadius: '3px', background: mcpLoading ? '#333' : '#4ECB71', color: mcpLoading ? '#555' : '#000', cursor: mcpLoading ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600 }}>+</button>
              </div>
              {mcpServers.length === 0 && <div style={{ fontSize: '10px', color: '#555' }}>暂无 MCP 服务器。使用 /mcp add 或上方表单添加。</div>}
              {mcpServers.map(s => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px' }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', color: '#F5F5F5', fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: '9px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command} {(s.args || []).join(' ')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ cursor: 'pointer', fontSize: '9px', color: '#4ECB71' }} onClick={async () => { const r = await window.dogeAPI.mcpTest(s.name); showToast(r.success ? (r.message || '已连接') : (r.error || '测试失败'), r.success ? 'success' : 'error') }}>测试</span>
                    <span style={{ cursor: 'pointer', fontSize: '9px', color: '#FF6B6B' }} onClick={() => handleMcpRemove(s.name)}>删除</span>
                  </div>
                </div>
              ))}
              {agents.length > 0 && <div style={{ fontSize: '10px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Agents ({agents.length})</div>}
              {agents.slice(0, 5).map(a => (
                <div key={a.id} style={{ fontSize: '10px', color: '#666', padding: '2px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name} {a.model ? `(${a.model})` : ''}</div>
              ))}
            </div>
          )}
        </div>
        {showCommandPalette && <CommandPalette cwd={workingDir} onClose={() => setShowCommandPalette(false)} mode={paletteMode} setMode={setPaletteMode} commandHistory={commandHistory} />}
        {showShortcuts && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowShortcuts(false)}>
            <div style={{ background: '#1A1A1A', border: '1px solid #333', borderRadius: '8px', padding: '20px', minWidth: '360px', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#F5F5F5', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⌨ 快捷键</span>
                <span style={{ cursor: 'pointer', color: '#555', fontSize: '18px' }} onClick={() => setShowShortcuts(false)}>✕</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  ['Ctrl + P', '文件搜索'], ['Ctrl + Shift + P', '命令面板'], ['Ctrl + N', '新建会话'],
                  ['Ctrl + W', '关闭当前会话'], ['Ctrl + ,', '设置'], ['Ctrl + /', '聚焦输入框'],
                  ['Ctrl + L', '清除对话'], ['Ctrl + B', '切换侧边栏'], ['Ctrl + R', '历史搜索'],
                  ['Ctrl + `', '切换终端'], ['Ctrl + Enter', '发送消息'], ['Shift + Enter', '换行'],
                  ['F11', '全屏'], ['Ctrl + \\', '分屏模式'],
                  ['Esc', '关闭面板'], ['?', '快捷键帮助'],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #262626' }}>
                    <span style={{ color: '#888', fontSize: '12px' }}>{desc}</span>
                    <kbd style={{ background: '#0F0F0F', border: '1px solid #333', borderRadius: '3px', padding: '1px 6px', fontSize: '11px', color: '#4ECB71', fontFamily: 'monospace' }}>{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeContext.Provider>
  )
}

// ─── 启动 ───
export async function main(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) return

  window.onerror = (msg, url, line) => {
    container.innerHTML = `<div style="color:#ff6b6b;padding:20px;font-family:monospace;white-space:pre-wrap;">ERROR: ${msg}\n${url}:${line}</div>`
  }

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
