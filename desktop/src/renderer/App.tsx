/**
 * 桌面端主应用组件
 */

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'

// ─── 日志辅助 ───
function tsLog(tag: string, ...args: unknown[]): void {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  console.log(`[${t}] [${tag}]`, ...args)
}
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import type { DesktopConfig } from '../desktop/types'
import type { DogeAPI } from '../preload/index.js'
import { FileTree, type FileTreeNode } from './components/FileTree.js'
import { GitChanges, type GitFile } from './components/GitChanges.js'
import { GitDiff } from './components/GitDiff.js'
import { ToolPanel } from './components/ToolPanel.js'
import { CommandPalette } from './components/CommandPalette.js'
import { ReferencesPanel } from './components/ReferencesPanel.js'
import { HighlightedDiff } from './components/HighlightedDiff.js'
import { ToolErrorBanner } from './components/ToolErrorBanner.js'
import { ToolProgressBar } from './components/ToolProgressBar.js'
import { ToolResultRenderer } from './components/MarkdownRenderer.js'
import { VirtualMessageList } from './components/VirtualMessageList.js'
import TerminalPanel from './TerminalPanel.js'
import { AgentPanel } from './components/AgentPanel.js'
import { PluginPanel } from './components/PluginPanel.js'
import { DatabaseBrowser } from './components/DatabaseBrowser.js'
import { ApiTestPanel } from './components/ApiTestPanel.js'
import { SnippetPanel } from './components/SnippetPanel.js'
import { LspPanel } from './components/LspPanel.js'
import { KanbanBoard } from './components/KanbanBoard.js'
import { TimeTracker } from './components/TimeTracker.js'
import { ProgressReport } from './components/ProgressReport.js'
import { useTimeTracker } from './hooks/useTimeTracker.js'
import { useGitStats } from './hooks/useGitStats.js'
import { useWorkflowMode } from './hooks/useWorkflowMode.js'
import { useLsp } from './hooks/useLsp.js'
import { usePreAnalysis } from './hooks/usePreAnalysis.js'
import { useSmartImport } from './hooks/useSmartImport.js'
import { InlineSuggestion } from './components/InlineSuggestion.js'
import { SmartImportSuggestion } from './components/SmartImportSuggestion.js'
import { getStyles, getEffectiveTheme, THEMES, type ThemeName, type ThemeColors } from './theme.js'
import { AdvancedCodeEditor } from './components/AdvancedCodeEditor.js'
import { SemanticSearchPanel } from './components/SemanticSearchPanel.js'
import { AICodeReviewPanel } from './components/AICodeReviewPanel.js'
import { OutlinePanel } from './components/OutlinePanel.js'
import { DebuggerPanel } from './components/DebuggerPanel.js'
import { CollaborationPanel } from './components/CollaborationPanel.js'
import { MonacoEditorPanel } from './components/MonacoEditorPanel.js'
import { SecurityAuditPanel } from './components/SecurityAuditPanel.js'
import { PerformanceRefactorPanel } from './components/PerformanceRefactorPanel.js'
import { WorkflowPanel } from './components/WorkflowPanel.js'
import { CallChainPanel } from './components/CallChainPanel.js'
import { ProjectStructurePlanner } from './components/ProjectStructurePlanner.js'
import { GitMergePanel } from './components/GitMergePanel.js'
import { GitBranchManager } from './components/GitBranchManager.js'
import { useWorkflowAutomation } from './hooks/useWorkflowAutomation.js'
import { useCallChain } from './hooks/useCallChain.js'
import { parseMessageContent, InlineToolUseBlock, renderMarkdown } from './shared.js'
import type { Message, ContentBlock, ToolUseBlock } from './shared.js'
import { useDesktopVimInput, type VimMode } from '../hooks/useDesktopVimInput.js'
import { useCommandHistory } from './hooks/useCommandHistory.js'
import { useTabManager } from './hooks/useTabManager.js'

/** 包装 TerminalPanel，注入 window.dogeAPI */
function TerminalPanelWrapper({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: '4px', right: '8px', zIndex: 10,
          background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '12px',
        }}
        title="关闭终端"
      >✕</button>
      <TerminalPanel cwd={cwd} dogeAPI={window.dogeAPI as any} />
    </div>
  )
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

// ─── 语法高亮颜色（主题感知） ───
interface SyntaxColors {
  string: string; keyword: string; number: string; comment: string;
  property: string;
}

const DARK_SYNTAX: SyntaxColors = {
  string: '#CE9178', keyword: '#569CD6', number: '#B5CEA8', comment: '#6A9955',
  property: '#9CDCFE',
}

const LIGHT_SYNTAX: SyntaxColors = {
  string: '#A31515', keyword: '#0000FF', number: '#098658', comment: '#008000',
  property: '#001080',
}

function getSyntaxColors(isDark: boolean): SyntaxColors {
  return isDark ? DARK_SYNTAX : LIGHT_SYNTAX
}

// ─── 轻量语法高亮（主题感知） ───
function highlightCode(code: string, lang: string, isDark = true, fontSize?: number): string {
  const c = getSyntaxColors(isDark)
  const fs = fontSize ? `font-size:${fontSize}px;` : ''
  let result = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  if (['typescript', 'ts', 'javascript', 'js'].includes(lang)) {
    result = result.replace(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof|interface|type|extends|implements|static|get|set|yield|of|in|switch|case|break|default|void|null|undefined|true|false)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:' + c.number + '">$1</span>')
    result = result.replace(/(\/\/[^\n]*)/g, '<span style="color:' + c.comment + '">$1</span>')
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:' + c.comment + '">$1</span>')
  } else if (lang === 'json') {
    result = result.replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:' + c.property + '">$1</span>:')
    result = result.replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:' + c.string + '">$1</span>')
    result = result.replace(/:\s*(\d+\.?\d*)/g, ': <span style="color:' + c.number + '">$1</span>')
    result = result.replace(/:\s*(true|false|null)/g, ': <span style="color:' + c.keyword + '">$1</span>')
  } else if (['css', 'scss'].includes(lang)) {
    result = result.replace(/\.([\w-]+)/g, '.<span style="color:' + c.property + '">$1</span>')
    result = result.replace(/([\w-]+)\s*:/g, '<span style="color:' + c.property + '">$1</span>:')
    result = result.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms)?)\b/g, '<span style="color:' + c.number + '">$1</span>')
  } else if (lang === 'html') {
    result = result.replace(/(&lt;\/?)([\w-]+)/g, '$1<span style="color:' + c.keyword + '">$2</span>')
    result = result.replace(/([\w-]+)=/g, '<span style="color:' + c.property + '">$1</span>=')
    result = result.replace(/="([^"]*)"/g, '=<span style="color:' + c.string + '">"$1"</span>')
  } else if (lang === 'python' || lang === 'py') {
    result = result.replace(/(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|"""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|with|yield|lambda|pass|break|continue|and|or|not|in|is|True|False|None|self|async|await)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
    result = result.replace(/#[^\n]*/g, '<span style="color:' + c.comment + '">$&</span>')
    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:' + c.number + '">$1</span>')
  } else if (['bash', 'sh', 'shell'].includes(lang)) {
    result = result.replace(/(#.*)$/gm, '<span style="color:' + c.comment + '">$1</span>')
    result = result.replace(/\b(echo|cd|ls|rm|cp|mv|mkdir|cat|grep|find|sed|awk|git|npm|bun|node|export|source|sudo|chmod|chown|pwd|touch|head|tail|wc|sort|uniq|diff|tar|zip|curl|wget)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
  } else if (lang === 'sql') {
    result = result.replace(/\b(SELECT|FROM|WHERE|AND|OR|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|IN|NOT|NULL|IS|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MAX|MIN|INTO|VALUES|SET|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|VIEW)\b/gi, '<span style="color:' + c.keyword + '">$1</span>')
  } else if (['yaml', 'yml'].includes(lang)) {
    result = result.replace(/^(\s*)([\w-]+)(\s*:)/gm, '$1<span style="color:' + c.property + '">$2</span>$3')
    result = result.replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:' + c.string + '">$1</span>')
    result = result.replace(/:\s*(\d+\.?\d*)/g, ': <span style="color:' + c.number + '">$1</span>')
    result = result.replace(/(#[^\n]*)/g, '<span style="color:' + c.comment + '">$1</span>')
  } else if (['markdown', 'md'].includes(lang)) {
    result = result.replace(/^(#{1,6}\s.+)$/gm, '<span style="color:' + c.keyword + '">$1</span>')
    result = result.replace(/(\*\*[^*]+\*\*|__[^_]+__)/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/(`[^`]+`)/g, '<span style="color:' + c.string + '">$1</span>')
  } else if (['rust', 'rs'].includes(lang)) {
    result = result.replace(/\b(fn|let|mut|pub|struct|enum|impl|trait|use|mod|where|for|in|if|else|match|return|loop|while|break|continue|move|async|await|unsafe|dyn|type|const|static|ref|self|super|crate|true|false|Some|None|Ok|Err|Result|Option|Vec|String|Box|Rc|Arc)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
    result = result.replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/\/\/[^\n]*/g, '<span style="color:' + c.comment + '">$&</span>')
  }

  return result
}

// ─── 主组件 ───
export function App(): JSX.Element {
  const [config, setConfig] = useState<DesktopConfig>({ provider: 'openai', apiKey: '', model: 'gpt-4o', workingDir: '' })
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; url: string; name: string }>>([])
  const [state, setState] = useState<QueryState>('idle')
  const stateRef = useRef('idle')
  const [isSending, setIsSending] = useState(false)
  const [currentStreaming, setCurrentStreaming] = useState('')
  const currentStreamingRef = useRef('')
  const streamingActiveRef = useRef(false) // result 处理完成后锁定，阻止延迟 chunk 污染
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [previewTabs, setPreviewTabs] = useState<Array<{ id: string; path: string; content: string; size?: number }>>([])
  const [activePreviewTabId, setActivePreviewTabId] = useState<string | null>(null)
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
  // commandHistory 使用 Hook 管理（替代内联状态）
  const [commandHistory] = useState<Array<{ cmd: string; time: number }>>([])
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
  const [memoryUsage, setMemoryUsage] = useState<{ heapUsed: number; status: 'normal' | 'high' | 'critical' } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [mcpServers, setMcpServers] = useState<Array<{ name: string; command: string; args: string[]; transport: string }>>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [showMcpPanel, setShowMcpPanel] = useState(false)
  const [showDbPanel, setShowDbPanel] = useState(false)
  const [showApiTestPanel, setShowApiTestPanel] = useState(false)
  const [showSnippetPanel, setShowSnippetPanel] = useState(false)
  const [showLspPanel, setShowLspPanel] = useState(false)
  const [mcpNewName, setMcpNewName] = useState('')
  const [mcpNewCommand, setMcpNewCommand] = useState('')
  const [mcpNewArgs, setMcpNewArgs] = useState('')
  const [mcpConnectedTools, setMcpConnectedTools] = useState<Record<string, Array<{ name: string; description: string }>>>({})
  const [mcpSelectedServer, setMcpSelectedServer] = useState<string | null>(null)
  const [mcpToolInput, setMcpToolInput] = useState('')
  const [mcpToolResult, setMcpToolResult] = useState<string | null>(null)
  const [agents, setAgents] = useState<Array<{ id: string; name: string; description: string; model: string }>>([])
  const [showAgentPanel, setShowAgentPanel] = useState(false)
  const [showPluginPanel, setShowPluginPanel] = useState(false)
  const [showSemanticSearch, setShowSemanticSearch] = useState(false)
  const [showDebuggerPanel, setShowDebuggerPanel] = useState(false)
  const [showCollabPanel, setShowCollabPanel] = useState(false)
  const [showMonacoPanel, setShowMonacoPanel] = useState(false)
  const [showAIOutline, setShowAIOutline] = useState(false)
  const [showCodeReview, setShowCodeReview] = useState(false)
  const [showSecurityAudit, setShowSecurityAudit] = useState(false)
  const [showPerformanceRefactor, setShowPerformanceRefactor] = useState(false)
  const [showWorkflowPanel, setShowWorkflowPanel] = useState(false)
  const [showReferencesPanel, setShowReferencesPanel] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [activeReviewFile, setActiveReviewFile] = useState<string | null>(null)
  const [showKanban, setShowKanban] = useState(false)
  const [showTimeTracker, setShowTimeTracker] = useState(false)
  const [showProgressReport, setShowProgressReport] = useState(false)
  const [showCallChain, setShowCallChain] = useState(false)
  const [showProjectStructure, setShowProjectStructure] = useState(false)
  const [showGitMerge, setShowGitMerge] = useState(false)
  const [showGitBranch, setShowGitBranch] = useState(false)
  const [cursorOffset, setCursorOffset] = useState(0)
  const [vimEnabled, setVimEnabled] = useState(false)
  const previewTabCounter = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const utteranceRef = useRef<any>(null)

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

  // ─── Vim 模式 ───
  const vim = useDesktopVimInput({
    value: input,
    onChange: setInput,
    onSubmit: () => { if (input.trim()) handleSend() },
    onCursorOffsetChange: setCursorOffset,
    cursorOffset,
  })

  // ─── 命令历史 Hook ───
  const cmdHistory = useCommandHistory()

  // ─── Tab 管理 Hook ───
  const tabMgr = useTabManager()

  // ─── Agent 编排层 Hook ───
  const [gitChangesCount, setGitChangesCount] = useState(0)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())
  const [dismissedSmartImports, setDismissedSmartImports] = useState<Set<string>>(new Set())
  const workflowMode = useWorkflowMode(selectedFile, gitChangesCount, showDebuggerPanel)

  // ─── AI 工作流自动化 Hook ───
  const wf = useWorkflowAutomation(selectedFile || '')

  // ─── LSP Hook ───
  const lsp = useLsp()

  // ─── 调用链分析 Hook ───
  const callChain = useCallChain({
    content: activePreviewFile?.content || '',
    filePath: activePreviewFile?.path || '',
    fetchReferences: lsp.references,
    fetchDefinition: lsp.definition,
    enabled: !!activePreviewFile,
  })

  // ─── 预测性 AI 助手：静态分析 Hook ───
  const preAnalysis = usePreAnalysis(
    activePreviewFile?.content || '',
    { extension: activePreviewFile?.path?.split('.').pop() || '', enabled: !!activePreviewFile }
  )

  // ─── 智能导入建议 Hook ───
  const smartImports = useSmartImport({
    content: activePreviewFile?.content || '',
    filePath: activePreviewFile?.path || '',
    enabled: !!activePreviewFile,
  })

  // ─── 工作流模式面板自动联动 ───
  useEffect(() => {
    if (workflowMode.locked) return
    const m = workflowMode.mode
    switch (m) {
      case 'edit':
        // 编码模式: 打开 Monaco 编辑器 + LSP 面板, 显示终端
        setShowMonacoPanel(true)
        setShowLspPanel(!!activePreviewFile)
        setTerminalVisible(true)
        setShowDebuggerPanel(false)
        setShowCodeReview(false)
        setShowSecurityAudit(false)
        setShowPerformanceRefactor(false)
        setShowDbPanel(false)
        setShowApiTestPanel(false)
        break
      case 'review':
        // 审查模式: 打开代码审查 + LSP 面板
        setShowCodeReview(true)
        setShowLspPanel(!!activePreviewFile)
        setShowMonacoPanel(false)
        setShowDebuggerPanel(false)
        setTerminalVisible(false)
        setShowSecurityAudit(false)
        setShowPerformanceRefactor(false)
        break
      case 'debug':
        // 调试模式: 打开调试器 + 终端
        setShowDebuggerPanel(true)
        setTerminalVisible(true)
        setShowMonacoPanel(false)
        setShowCodeReview(false)
        setShowLspPanel(false)
        setShowSecurityAudit(false)
        setShowPerformanceRefactor(false)
        break
      case 'chat':
      default:
        // 对话模式: 关闭所有专业面板, 保持终端状态
        setShowMonacoPanel(false)
        setShowCodeReview(false)
        setShowDebuggerPanel(false)
        setShowLspPanel(false)
        setShowSecurityAudit(false)
        setShowPerformanceRefactor(false)
        break
    }
  }, [workflowMode.mode, workflowMode.locked, activePreviewFile])

  const effectiveTheme = getEffectiveTheme(themeSettings.theme as ThemeName | 'auto')
  const styles = getStyles(effectiveTheme, themeSettings.fontSize)
  const theme = THEMES[effectiveTheme]
  const c = theme

  // ─── Ctrl+滚轮缩放 ───
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setThemeSettings(prev => ({
        ...prev,
        fontSize: Math.min(24, Math.max(8, prev.fontSize + (e.deltaY < 0 ? 1 : -1)))
      }))
    }
  }, [])

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

  // MCP 连接与工具调用
  const handleMcpConnect = useCallback(async (name: string) => {
    setMcpLoading(true)
    try {
      const result = await window.dogeAPI.mcpConnect(name)
      if (result.success && result.tools) {
        setMcpConnectedTools(prev => ({ ...prev, [name]: result.tools! }))
        showToast(`已连接 ${name} (${result.tools.length} 个工具)`, 'success')
      } else {
        showToast(result.error || '连接失败', 'error')
      }
    } catch { showToast('连接失败', 'error') } finally { setMcpLoading(false) }
  }, [showToast])

  const handleMcpCallTool = useCallback(async (serverName: string, toolName: string, args: Record<string, unknown>) => {
    setMcpLoading(true)
    setMcpToolResult(null)
    try {
      const result = await window.dogeAPI.mcpCallTool(serverName, toolName, args)
      if (result.success) {
        setMcpToolResult(result.output || '(无输出)')
        showToast(`工具 ${toolName} 调用成功`, 'success')
      } else {
        setMcpToolResult(`错误: ${result.error}`)
        showToast(`工具 ${toolName} 调用失败`, 'error')
      }
    } catch { showToast('工具调用失败', 'error') } finally { setMcpLoading(false) }
  }, [showToast])

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

  // textarea 高度
  const [inputHeight, setInputHeight] = useState(44)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    requestAnimationFrame(() => {
      const h = Math.min(200, Math.max(44, el.scrollHeight))
      setInputHeight(h)
    })
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
          setMessages(history.messages.map((m, i) => ({ id: `history-${i}`, role: m.role as Message['role'], content: typeof m.content === 'string' ? m.content : '' })))
        }
      } catch { /* ignore */ } finally { setLoaded(true) }
    }
    load()
  }, [])

  useEffect(() => {
    const unsub1 = window.dogeAPI.onStateChange((s) => { stateRef.current = s; setState(s as QueryState) })
    const unsub2 = window.dogeAPI.onChunk((chunk) => {
      if (!chunk || !chunk.text) return
      if (!streamingActiveRef.current) {
        tsLog('RENDERER', 'onChunk ignored (locked):', chunk.text.slice(0, 50))
        return
      }
      tsLog('RENDERER', 'onChunk received:', chunk.text.slice(0, 50))
      setCurrentStreaming((p) => {
        const next = p + chunk.text
        currentStreamingRef.current = next
        return next
      })
    })
    return () => { unsub1(); unsub2() }
  }, [])

  // 自动发送测试消息（用于调试）- 必须在 handleSend 之后
  const autoSendRef = useRef<() => void>(() => {})
  useEffect(() => {
    autoSendRef.current = handleSend
  })
  useEffect(() => {
    const unsub = window.dogeAPI.onAutoSend((text) => {
      tsLog('RENDERER', 'auto-send received:', text)
      setInput(text)
      setTimeout(() => {
        autoSendRef.current()
      }, 500)
    })
    return () => unsub()
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

  // ─── 自动测试命令序列（启动后自动执行，在 UI 中显示结果） ───
  // 使用 ref 追踪命令索引，避免依赖 currentSessionId 导致的循环重触发
  const autoTestCmdIndexRef = useRef(0)

  useEffect(() => {
    if (!loaded) return

    const TEST_CMDS = [
      '使用 dir 命令列出当前工作目录的文件和文件夹',
      '使用 ls 命令列出当前目录内容',
      '使用 pwd 命令显示当前工作目录路径',
      '使用 echo 命令输出 "Doge Code Desktop 自动测试完成"',
      '请帮我查看项目根目录下的 src/main/index.ts 文件内容，使用 cat 命令读取',
    ]

    let cancelled = false
    autoTestCmdIndexRef.current = 0

    async function sendNext(): Promise<void> {
      if (cancelled || autoTestCmdIndexRef.current >= TEST_CMDS.length) return
      const idx = autoTestCmdIndexRef.current++
      const cmd = TEST_CMDS[idx]
      const cmdNumber = idx + 1
      tsLog('AUTO-TEST', `[${cmdNumber}/${TEST_CMDS.length}] 发送: ${cmd}`)

      // 标记系统提示
      const sysMsg: Message = {
        id: `auto-sys-${Date.now()}`,
        role: 'system',
        content: `[自动测试 ${cmdNumber}/${TEST_CMDS.length}] 执行命令: ${cmd}`,
      }
      const appendMsg = (msg: Message) => {
        setMessages(prev => { const next = [...prev, msg]; persistActiveTabMessages(next); return next })
      }
      appendMsg(sysMsg)

      // 每次发送前新建会话，避免 conversation 累积导致 API 格式错误
      await window.dogeAPI.newSession()
      setCurrentSessionId(null)

      try {
        streamingActiveRef.current = true
        const result = await window.dogeAPI.sendMessage(cmd)
        streamingActiveRef.current = false
        setCurrentStreaming(''); currentStreamingRef.current = ''
        if (result?.error) {
          const errMsgEl: Message = {
            id: `auto-err-${Date.now()}`,
            role: 'error',
            content: `[自动测试错误] ${result.error}`,
          }
          appendMsg(errMsgEl)
        } else {
          const finalContent = result?.content || currentStreamingRef.current
          if (finalContent) {
            const asstMsg: Message = {
              id: `auto-asst-${Date.now()}`,
              role: 'assistant',
              content: finalContent,
            }
            appendMsg(asstMsg)
          } else {
            // 文本内容为空：工具调用结果可能在历史消息中
            // 工具结果消息 role 为 'tool'，content 为 JSON 或错误字符串
            try {
              const history = await window.dogeAPI.getHistory()
              const allMsgs = history.messages || []

              // 优先查找 tool 角色消息（包含成功或失败的工具执行结果）
              const toolMsgs = allMsgs.filter(m => m.role === 'tool' && typeof m.content === 'string')
              if (toolMsgs.length > 0) {
                const lastTool = toolMsgs[toolMsgs.length - 1].content
                try {
                  const parsed = JSON.parse(lastTool)
                  if (typeof parsed.output === 'string') {
                    const ec = parsed.exitCode
                    const suffix = (ec === 0 || ec === null) ? '' : `[exit code: ${ec}]\n`
                    appendMsg({ id: `auto-asst-${Date.now()}`, role: 'assistant', content: suffix + parsed.output.replace(/\u001b\[[0-9;]*m/g, '') })
                  } else if (typeof parsed.error === 'string') {
                    appendMsg({ id: `auto-err-${Date.now()}`, role: 'error', content: `工具执行失败: ${parsed.error}` })
                  } else {
                    appendMsg({ id: `auto-asst-${Date.now()}`, role: 'assistant', content: '(命令已执行)' })
                  }
                } catch {
                  // tool content 不是 JSON（可能是纯错误字符串）
                  if (lastTool.includes('failed') || lastTool.includes('error') || lastTool.includes('Error')) {
                    appendMsg({ id: `auto-err-${Date.now()}`, role: 'error', content: `工具执行失败: ${lastTool.slice(0, 300)}` })
                  } else {
                    appendMsg({ id: `auto-asst-${Date.now()}`, role: 'assistant', content: lastTool.slice(0, 2000) })
                  }
                }
              } else if (allMsgs.length > 1) {
                appendMsg({ id: `auto-asst-${Date.now()}`, role: 'assistant', content: '(命令已执行，无文本输出)' })
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : '发送失败'
        tsLog('AUTO-TEST', '发送失败:', errMsg)
        const errMsgEl: Message = {
          id: `auto-err-${Date.now()}`,
          role: 'error',
          content: `[自动测试错误] ${errMsg}`,
        }
        appendMsg(errMsgEl)
      }

      // 等待响应完成（state 回到 idle 或 crashed）
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (cancelled || stateRef.current === 'idle' || stateRef.current === 'crashed') { clearInterval(check); resolve() }
        }, 300)
        setTimeout(() => { clearInterval(check); resolve() }, 90000)
      })

      // 间隔 2s 再发下一条
      if (!cancelled && autoTestCmdIndexRef.current < TEST_CMDS.length) {
        await new Promise(r => setTimeout(r, 2000))
        sendNext()
      }
    }

    // 延迟 3s 启动（等 UI 完全就绪）
    const startTimer = setTimeout(() => sendNext(), 3000)
    return () => { cancelled = true; clearTimeout(startTimer) }
  }, [loaded])

  const handleLoadSession = useCallback(async (sessionId: string) => {
    const result = await window.dogeAPI.loadSession(sessionId)
    if (result.success) {
      const history = await window.dogeAPI.getHistory()
      const loadedMessages = history.messages?.length
        ? history.messages.map((m, i) => ({ id: `history-${i}`, role: m.role as Message['role'], content: typeof m.content === 'string' ? m.content : '' }))
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
    if (result.success) {
      setSessions(p => p.filter(s => s.id !== sessionId))
      // 如果删除的是当前会话，清空消息和会话 ID，使 UI 与引擎状态同步
      if (currentSessionId === sessionId) {
        setMessages([])
        setCurrentSessionId(null)
        setCurrentStreaming('')
        persistActiveTabMessages([])
      }
      showToast('会话已删除', 'success')
    }
    else { alert(result.error || '删除失败') }
  }, [showToast, currentSessionId, persistActiveTabMessages])

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
    tsLog('RENDERER', 'handleSend called, text:', text, 'state:', state)
    if (!text || state === 'responding' || isSending) return
    if (!isOnline) { showToast('网络已断开，无法发送消息', 'error'); return }
    setInput(''); setError(null); setCurrentStreaming(''); currentStreamingRef.current = ''; setIsSending(true)
    streamingActiveRef.current = true // 打开请求级锁，允许 chunk 进入 currentStreaming

    const appendMsg = (msg: Message) => {
      setMessages(prev => { const next = [...prev, msg]; persistActiveTabMessages(next); return next })
    }

    if (text.startsWith('/')) {
      // Project management commands
      if (text === '/kanban') { setShowKanban(p => !p); setInput(''); setState('idle'); return }
      if (text === '/timer') { setShowTimeTracker(p => !p); setInput(''); setState('idle'); return }
      if (text === '/report') { setShowProgressReport(p => !p); setInput(''); setState('idle'); return }

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
      // /clear 成功后同步清除界面上的历史消息
      if (result.success && cmdName === '/clear') {
        setMessages([])
        setCurrentSessionId(null)
        setCurrentStreaming('')
        currentStreamingRef.current = ''
        persistActiveTabMessages([])
      }
      cmdHistory.addCommand(text)
      setState('idle'); setIsSending(false)
      return
    }

    const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text }
    appendMsg(userMsg)
    setState('responding')

    // 构建发送载荷：纯文本或包含图片的 JSON
    let result: { success?: boolean; content?: string; error?: string } | null = null
    try {
      tsLog('RENDERER', 'calling window.dogeAPI.sendMessage, text:', text)
      if (pendingImages.length > 0) {
        // 多模态消息：文本 + 图片 base64
        const payload = {
          text,
          images: pendingImages.map(img => ({ type: 'image', url: img.url })),
        }
        result = await window.dogeAPI.sendMessage(JSON.stringify(payload))
        setPendingImages([])
      } else {
        // 纯文本消息
        result = await window.dogeAPI.sendMessage(text)
      }
      tsLog('RENDERER', 'sendMessage returned, result:', JSON.stringify(result))
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '发送失败'
      tsLog('RENDERER', 'sendMessage threw error:', errMsg)
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'error', content: errMsg })
      setState('idle'); setIsSending(false)
      return
    }

    if (result?.error) {
      tsLog('RENDERER', 'result has error:', result.error)
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'error', content: result.error! })
      if (!document.hasFocus()) window.dogeAPI.notify('Doge Code', `错误: ${result.error.slice(0, 100)}`).catch(() => {})
    } else {
      // result.content 是 messageLoop 返回的完整回复
      // 清空 currentStreaming 防止与 messages 中的助手消息重复渲染
      const resultText = result?.content || ''
      const streamedText = currentStreamingRef.current
      let finalContent = resultText

      // 如果 result.content 与已流式文本不同，且 resultText 是 streamedText 的超集
      // 说明 streaming 路径漏掉了部分文本（textBuffer 去重可能过度），只补上差异部分
      if (resultText && streamedText && resultText !== streamedText) {
        if (resultText.startsWith(streamedText)) {
          // result 比 streamed 多：只添加尾部差异
          finalContent = resultText
          tsLog('RENDERER', `result has extra ${resultText.length - streamedText.length} chars after streamed text`)
        } else if (streamedText.startsWith(resultText)) {
          // streamed 比 result 多：streaming 路径显示了更多，直接用 streamed
          finalContent = streamedText
          tsLog('RENDERER', `streamed has extra ${streamedText.length - resultText.length} chars, using streamed`)
        } else {
          // 内容不连续相关：取较长的
          finalContent = resultText.length >= streamedText.length ? resultText : streamedText
          tsLog('RENDERER', `content mismatch, using ${resultText.length >= streamedText.length ? 'result' : 'stream'}`)
        }
      }

      if (finalContent) {
        tsLog('RENDERER', 'appending assistant message, length:', finalContent.length)
        streamingActiveRef.current = false // 锁定：此后延迟到达的 chunk 全部丢弃
        setCurrentStreaming(''); currentStreamingRef.current = ''
        appendMsg({ id: `msg-${Date.now() + 1}`, role: 'assistant', content: finalContent })
        if (!document.hasFocus()) window.dogeAPI.notify('Doge Code', `回复完成: ${finalContent.slice(0, 80)}`).catch(() => {})
        // 自动朗读（用户开启时）
        if (autoSpeak && 'speechSynthesis' in window) {
          setTimeout(() => speakText(finalContent), 200)
        }
      } else {
        tsLog('RENDERER', 'finalContent is empty, no message appended')
        setCurrentStreaming(''); currentStreamingRef.current = ''
      }
    }
    setState('idle'); setIsSending(false)
  }, [input, state, persistActiveTabMessages, isOnline, showToast, autoSpeak, pendingImages])

  const handleAbort = useCallback(async () => { await window.dogeAPI.abort(); setCurrentStreaming(''); setIsSending(false) }, [])
  const handleClear = useCallback(async () => {
    await window.dogeAPI.clearHistory()
    setMessages([])
    setCurrentSessionId(null)
    persistActiveTabMessages([])
    setCurrentStreaming('')
  }, [persistActiveTabMessages])

  // ─── 语音输出（浏览器 SpeechSynthesis API） ───
  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = 1.0
    // 语音列表可能是异步加载的，如果当前没有中文语音则等待
    const voices = window.speechSynthesis.getVoices()
    let zhVoice = voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('zh'))
    if (!zhVoice && voices.length === 0) {
      // 语音列表尚未加载，等待后重试
      window.speechSynthesis.onvoiceschanged = () => {
        const vs = window.speechSynthesis.getVoices()
        const v = vs.find((vv: SpeechSynthesisVoice) => vv.lang.startsWith('zh'))
        if (v) utter.voice = v
      }
    } else if (zhVoice) {
      utter.voice = zhVoice
    }
    utter.onstart = () => setIsSpeaking(true)
    utter.onend = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)
    utteranceRef.current = utter
    window.speechSynthesis.speak(utter)
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
        case 'k': if (e.shiftKey) { e.preventDefault(); setShowKanban(p => !p); } break
        case 't': if (e.shiftKey) { e.preventDefault(); setShowTimeTracker(p => !p); } break
        case 'g': if (e.shiftKey) { e.preventDefault(); setShowProgressReport(p => !p); } break
        case 'p': e.preventDefault(); setPaletteMode(e.shiftKey ? 'commands' : 'files'); setShowCommandPalette(p => !p); break
        case 'n': case 'N': e.preventDefault(); handleNewTab(); break
        case 'w': case 'W': e.preventDefault(); if (activeTabId) handleCloseTab(activeTabId); break
        case ',': e.preventDefault(); setShowSettings(p => !p); break
        case '/': e.preventDefault(); inputRef.current?.focus(); break
        case 'l': case 'L': e.preventDefault(); handleClear(); break
        case 'b': case 'B': e.preventDefault(); setSidebarVisible(p => !p); break
        case 'r': case 'R': e.preventDefault(); setMsgSearchQuery(p => p ? '' : '/'); break
        case '`': e.preventDefault(); setTerminalVisible(p => !p); break
        case 's': e.preventDefault(); setShowSemanticSearch(p => !p); break
        case 'o': e.preventDefault(); setShowAIOutline(p => !p); break
        case 'e': e.preventDefault(); setShowCodeReview(p => !p); break
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
    const userMessages = messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '').reverse()
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

  const toggleVoiceInput = useCallback(async () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      setInterimTranscript('')
      return
    }

    // 请求麦克风权限（Electron 需要通过 IPC 桥接确认）
    try {
      const permResult = await window.dogeAPI.requestMicrophonePermission()
      if (!permResult.granted) {
        showToast('麦克风权限被拒绝，请在系统设置中允许访问', 'error')
        return
      }
    } catch {
      // 非 Electron 环境（如浏览器直接访问），继续尝试
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

    try {
      recognition.start()
    } catch (e) {
      showToast(`语音识别启动失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
      setIsRecording(false)
    }
  }, [isRecording, showToast])

  // 同步光标位置到 Vim hook
  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.setSelectionRange(cursorOffset, cursorOffset)
    }
  }, [cursorOffset])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Vim 模式下使用 Vim hook 处理键绑定
    if (vimEnabled) {
      vim.handleKeyDown(e)
      // 阻止 Vim 不处理的键（如 F11、Tab 补全）
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return }
      if (e.key === '\\' && e.ctrlKey) { e.preventDefault(); toggleSplitScreen(); return }
      if (e.key === 'Tab') {
        // Vim NORMAL 模式下 Tab 不处理，交给补全
        if (vim.mode === 'INSERT') return
      }
      // Vim 已处理的键直接返回
      if (vim.mode === 'NORMAL') return
      // INSERT 模式下继续处理 Tab 补全等
      if (e.key !== 'Tab') return
    }

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
          { text: '/kanban', display: '/kanban — 任务看板' },
          { text: '/timer', display: '/timer — 时间追踪' },
          { text: '/report', display: '/report — 进度报告' },
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

  // 派生值
  const displayMessages = messages
  const msgSearchQueryLower = msgSearchQuery.toLowerCase()
  const safeContent = (c: unknown) => typeof c === 'string' ? c : ''
  const filteredDisplayMessages = msgSearchQuery
    ? displayMessages.map((m, i) => ({ ...m, _origIndex: i, _match: safeContent(m.content).toLowerCase().includes(msgSearchQueryLower) }))
    : displayMessages.map((m, i) => ({ ...m, _origIndex: i, _match: true }))

  // 消息搜索过滤（必须在所有 hook 之后、if (!loaded) 之前）
  useEffect(() => {
    if (!msgSearchQuery) { setMsgSearchMatches([]); return }
    const matches: number[] = []
    displayMessages.forEach((m, i) => { if (safeContent(m.content).toLowerCase().includes(msgSearchQueryLower)) matches.push(i) })
    setMsgSearchMatches(matches)
  }, [msgSearchQuery, displayMessages, msgSearchQueryLower])

  if (!loaded) return <div style={{ ...styles.loadingOverlay }}>加载中...</div>
  const isProcessing = state === 'responding'
  const workingDir = config.workingDir || '/'

  // 主题感知颜色辅助
  const _tp = theme.bgPanel
  const _bs = theme.border
  const _tm = theme.textMuted

  return (
    <ThemeContext.Provider value={{ name: effectiveTheme, colors: theme, styles }}>
      <div style={styles.container} onWheel={handleWheel}>
        {toast && (
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', padding: '8px 20px', borderRadius: '6px', background: toast.type === 'error' ? theme.errorBg : `${theme.accent}22`, color: toast.type === 'error' ? theme.errorText : theme.accent, fontSize: '12px', fontWeight: 600, zIndex: 1000, boxShadow: `0 4px 12px ${theme.bg}80`, transition: 'opacity 0.3s' }}>
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
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: c.textFaint, borderRight: 'none' }}
            title="新建标签页"
          >+</div>
        </div>
        {/* 左栏：对话历史 */}
        <div style={{ ...styles.sidebar, display: sidebarVisible ? 'flex' : 'none' }}>
          <div style={styles.sidebarHeader}>
            <span style={{ fontSize: '18px' }}>{'🐕'}</span>
            <span style={{ flex: 1 }}>Doge Code</span>
            <span style={{ cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', border: `1px solid ${c.border}`, color: c.textMuted }} onClick={() => setShowSettings(p => !p)}>⚙</span>
          </div>
          <div style={{ padding: '8px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={styles.modelBadge}>{config.provider}</span>
            <span style={styles.modelBadge}>{config.model}</span>
          </div>
          {/* 会话侧边栏 */}
          <div style={{ borderBottom: `1px solid ${c.border}`, background: c.bgPanel, display: 'flex', flexDirection: 'column', maxHeight: '320px' }}>
            <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: c.textMuted, flex: 1 }}>历史会话</span>
              <button onClick={handleNewSession} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.accent, cursor: 'pointer', fontSize: '10px' }} title="新会话">+</button>
              <button onClick={loadSessions} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px' }} title="刷新">↻</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sessions.length === 0 ? (
                <div style={{ padding: '8px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>无历史会话</div>
              ) : (
                sessions.slice(0, 20).map((s) => {
                  const isActive = currentSessionId === s.id
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleLoadSession(s.id)}
                      style={{
                        padding: '6px 12px', fontSize: '11px', borderBottom: `1px solid ${c.borderSubtle}`, cursor: 'pointer',
                        background: isActive ? c.accentDim : 'transparent',
                        color: isActive ? c.accent : c.textMuted,
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
            <div style={{ borderBottom: `1px solid ${c.border}`, background: c.bgPanel, flexDirection: 'column', maxHeight: '200px' }}>
              <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: c.textMuted, flex: 1 }}>最近文件</span>
                <button onClick={() => setRecentFiles([])} style={{ padding: '1px 5px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.textFaint, cursor: 'pointer', fontSize: '9px' }} title="清空">清空</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {recentFiles.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => handlePreviewFile(f.path)}
                    style={{ padding: '4px 12px', fontSize: '11px', borderBottom: `1px solid ${c.borderSubtle}`, cursor: 'pointer', color: c.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={f.path}
                  >
                    <span style={{ fontSize: '9px', flexShrink: 0, color: c.accent }}>📄</span>
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
              {/* Vim 模式开关 */}
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: c.textMuted, fontWeight: 600 }}>Vim 模式</span>
                <button
                  onClick={() => setVimEnabled(p => !p)}
                  style={{
                    padding: '3px 12px', border: '1px solid', borderColor: vimEnabled ? c.accent : c.border,
                    borderRadius: '3px', background: vimEnabled ? `${c.accent}22` : 'transparent',
                    color: vimEnabled ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                  }}
                >{vimEnabled ? '✓ 已开启' : '开启'}</button>
              </div>
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
              <div style={{ padding: '16px', color: c.textFaint, fontSize: '12px' }}>开始新对话</div>
            ) : (
              (() => {
                const turns: Array<{ userMsg: Message; assistantMsg: Message | null; isSystem?: boolean }> = []
                let i = 0
                while (i < displayMessages.length) {
                  if (displayMessages[i].role === 'user') {
                    const next = i + 1 < displayMessages.length && displayMessages[i + 1].role === 'assistant' ? displayMessages[i + 1] : null
                    turns.push({ userMsg: displayMessages[i], assistantMsg: next })
                    i = next ? i + 2 : i + 1
                  } else if (displayMessages[i].role === 'assistant') {
                    turns.push({ userMsg: { id: '', role: 'user' as const, content: '(系统)' }, assistantMsg: displayMessages[i] })
                    i++
                  } else if (displayMessages[i].role === 'system' || displayMessages[i].role === 'error') {
                    turns.push({ userMsg: displayMessages[i], assistantMsg: null, isSystem: true })
                    i++
                  } else { i++ }
                }
                if (turns.length === 0 && currentStreaming) {
                  const lastUser = [...displayMessages].reverse().find(m => m.role === 'user')
                  if (lastUser) turns.push({ userMsg: lastUser, assistantMsg: null })
                }
                return turns.map((turn, idx) => {
                  const isSystem = turn.isSystem
                  return (
                    <div key={idx} style={{
                      padding: '6px 12px',
                      borderBottom: `1px solid ${c.borderSubtle}`,
                      background: isSystem ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}>
                      {isSystem ? (
                        <div style={{ fontSize: '11px', color: turn.userMsg.role === 'error' ? '#FF6B6B' : c.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.5', fontFamily: 'monospace' }}>
                          {turn.userMsg.content}
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: '12px', color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.4' }}>
                            <span style={{ color: c.accent, marginRight: '4px' }}>❯</span>
                            {turn.userMsg.content || '(空消息)'}
                          </div>
                          {turn.assistantMsg && (
                            <div style={{ fontSize: '10px', color: c.textFaint, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '12px' }}>
                              {turn.assistantMsg.content.slice(0, 60)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })
              })()
            )}
          </div>
          <div style={styles.statusBar}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: isProcessing ? c.accent : c.textMuted }}>{isProcessing ? '● 回复中' : '○ 就绪'}</span>
              {modelInfo && (<span style={{ color: c.textFaint }}>{modelInfo.provider}/{modelInfo.model}</span>)}
              {tokenUsage && tokenUsage.totalTokens > 0 && (
                <>
                  <span style={{ color: c.accent }}>In: {tokenUsage.inputTokens.toLocaleString()}</span>
                  <span style={{ color: c.errorText }}>Out: {tokenUsage.outputTokens.toLocaleString()}</span>
                  <span style={{ color: c.textFaint }}>Total: {tokenUsage.totalTokens.toLocaleString()}</span>
                  <span style={{ color: c.textFaint, fontSize: '10px' }}>| {displayMessages.length} 条消息</span>
                </>
              )}
              {memoryUsage && memoryUsage.status !== 'normal' && (
                <span style={{ color: memoryUsage.status === 'critical' ? c.errorText : '#E5C07B' }}>
                  MEM: {(memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB
                </span>
              )}
              {vimEnabled && (
                <span style={{
                  color: vim.mode === 'NORMAL' ? '#FFA726' : '#4ECB71',
                  fontSize: '10px', fontWeight: 600,
                  background: vim.mode === 'NORMAL' ? 'rgba(255,167,38,0.15)' : 'rgba(78,203,113,0.15)',
                  padding: '1px 6px', borderRadius: '2px',
                }}>
                  {vim.mode === 'NORMAL' ? 'ⓥ NORMAL' : 'ⓘ INSERT'}
                </span>
              )}
              <span
                style={{ cursor: 'pointer', fontSize: '10px', color: workflowMode.locked ? c.accent : c.textFaint }}
                title={workflowMode.locked ? '点击解锁自动模式' : '点击锁定当前模式'}
                onClick={() => workflowMode.setLocked(!workflowMode.locked)}
              >
                {workflowMode.locked ? '🔒' : '🔓'} {workflowMode.mode}
              </span>
              {workflowMode.reason && !workflowMode.locked && (
                <span style={{ color: c.textFaint, fontSize: '9px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={workflowMode.reason}>
                  {workflowMode.reason}
                </span>
              )}
              <span style={{ color: isOnline ? c.accent : c.errorText, fontSize: '10px' }}>
                {isOnline ? '🟢' : '🔴 离线'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: c.textFaint, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={workingDir}>{workingDir}</span>
              {(showKanban || showTimeTracker || showProgressReport) && (
                <span style={{ fontSize: '10px', color: c.accent }}>
                  {showKanban && '[看板]'}
                  {showTimeTracker && '[计时]'}
                  {showProgressReport && '[报告]'}
                </span>
              )}
              {displayMessages.length > 0 && (<button style={styles.clearButton} onClick={handleClear}>清除</button>)}
              <button style={styles.clearButton} onClick={toggleSplitScreen} title="分屏模式 (Ctrl+\\)">{splitScreen ? '⧉ 退出分屏' : '⧉ 分屏'}</button>
              <button style={styles.clearButton} onClick={toggleFullscreen} title="全屏模式 (F11)">{isFullscreen ? '⧸ 退出全屏' : '⛶ 全屏'}</button>
            </div>
          </div>
        </div>

        {/* 中栏：聊天界面 */}
        <div style={{ ...styles.chatView, ...(splitScreen ? { flex: 1, width: 'auto', maxWidth: '50%' } : {}) }}>
          {messages.length > 0 && (
            <div style={{ padding: '4px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                value={msgSearchQuery}
                onChange={(e) => setMsgSearchQuery(e.target.value)}
                placeholder="搜索消息..."
                style={{ flex: 1, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
              />
              {msgSearchQuery && (<span style={{ color: c.textFaint, fontSize: '10px', whiteSpace: 'nowrap' }}>{msgSearchMatches.length} 条匹配</span>)}
            </div>
          )}
          <InlineSuggestion
            suggestions={preAnalysis.filter(s => !dismissedSuggestions.has(s.id))}
            onDismiss={(id) => setDismissedSuggestions(prev => new Set(prev).add(id))}
            onDismissAll={() => setDismissedSuggestions(new Set(preAnalysis.map(s => s.id)))}
            theme={{
              accent: theme.accent, text: theme.text, textFaint: theme.textFaint, textMuted: theme.textMuted,
              bgPanel: theme.bgPanel, border: theme.border, surface: theme.surface,
              errorText: theme.errorText, successText: theme.accent, warningText: '#FFB74D',
            }}
          />
          <SmartImportSuggestion
            suggestions={smartImports.filter(s => !dismissedSmartImports.has(s.id))}
            onDismiss={(id) => setDismissedSmartImports(prev => new Set(prev).add(id))}
            onDismissAll={() => setDismissedSmartImports(new Set(smartImports.map(s => s.id)))}
            theme={{
              accent: theme.accent, text: theme.text, textFaint: theme.textFaint, textMuted: theme.textMuted,
              bgPanel: theme.bgPanel, border: theme.border, surface: theme.surface,
              errorText: theme.errorText, successText: theme.accent, warningText: '#FFB74D',
            }}
          />
          <VirtualMessageList
            messages={messages}
            currentStreaming={currentStreaming}
            toolProgress={toolProgress}
            executingToolIds={executingToolIds}
            msgSearchQuery={msgSearchQuery}
            msgSearchMatches={msgSearchMatches}
            executeToolFromBlock={executeToolFromBlock}
            styles={styles}
          />
          <div style={styles.chatInput}>
            {pendingImages.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {pendingImages.map(img => (
                  <div key={img.id} style={{ position: 'relative', width: '48px', height: '48px' }}>
                    <img src={img.url} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${c.border}` }} />
                    <span onClick={() => removePendingImage(img.id)} style={{ position: 'absolute', top: '-4px', right: '-4px', width: '14px', height: '14px', borderRadius: '50%', background: '#FF6B6B', color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
              <form onSubmit={(e) => { e.preventDefault() }} style={{ flex: 1 }}>
                <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); setCompletions([]); completionIndexRef.current = 0 }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onDrop={(e) => { const path = e.dataTransfer.getData('text/plain'); if (path) { e.preventDefault(); setInput(prev => prev ? prev + ' ' + path : path) } }}
                onDragOver={(e) => e.preventDefault()}
                placeholder={isProcessing ? '按 Enter 中断... (Shift+Enter 换行)' : '输入消息... (Enter 发送, Shift+Enter 换行, ↑↓ 历史导航)'}
                style={{ ...styles.inputBox, height: `${inputHeight}px`, maxHeight: '200px', resize: 'none', overflowY: 'auto', lineHeight: '1.5', fontFamily: 'inherit', fontSize: `${themeSettings.fontSize}px` }}
                disabled={!config.apiKey}
                rows={1}
              />
            </form>
            <button
              type="button"
              onClick={toggleVoiceInput}
              title={isRecording ? '停止录音' : '语音输入'}
              style={{
                padding: '6px 10px', border: '1px solid', borderColor: isRecording ? c.errorText : c.border,
                borderRadius: '4px', background: isRecording ? c.errorBg : c.bgPanel,
                color: isRecording ? c.errorText : c.textMuted, cursor: 'pointer', fontSize: '14px',
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
                padding: '6px 10px', border: '1px solid', borderColor: isSpeaking ? c.accent : c.border,
                borderRadius: '4px', background: isSpeaking ? c.accentDim : c.bgPanel,
                color: isSpeaking ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '14px',
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
                padding: '6px 10px', border: '1px solid', borderColor: autoSpeak ? c.accent : c.border,
                borderRadius: '4px', background: autoSpeak ? c.accentDim : c.bgPanel,
                color: autoSpeak ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '36px', height: '36px',
                flexShrink: 0
              }}
            >
              {autoSpeak ? '🗣️' : '🔕'}
            </button>
            {interimTranscript && (
              <div style={{ fontSize: '10px', color: c.textMuted, fontStyle: 'italic', marginBottom: '4px', padding: '0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                识别中: {interimTranscript}
              </div>
            )}
            {completions.length > 0 && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: c.surface, border: `1px solid ${c.border}`, borderRadius: '4px', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px', zIndex: 100 }}>
                {completions.map((comp, i) => (
                  <div key={i} style={{ padding: '4px 10px', cursor: 'pointer', background: i === completionIndex ? c.border : 'transparent', color: c.text, fontSize: '11px' }}
                    onMouseDown={(e) => { e.preventDefault(); const words = input.split(/\s+/); words[words.length - 1] = comp.text; setInput(words.join(' ') + ' '); setCompletions([]); completionIndexRef.current = 0 }}
                  >{comp.display}</div>
                ))}
              </div>
            )}
            {!config.apiKey && (<div style={{ color: c.errorText, fontSize: '11px', marginTop: '6px' }}>未配置 API Key。请在 .doge/api.json 中配置。</div>)}
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
            <TerminalPanelWrapper cwd={workingDir} onClose={() => setTerminalVisible(false)} />
          )}

          {previewTabs.length > 0 && (
            <>
              <div style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, display: 'flex', background: c.bgAlt, overflowX: 'auto' }}>
                {previewTabs.map(tab => (
                  <div
                    key={tab.id}
                    style={{ padding: '4px 8px', fontSize: '10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: `1px solid ${c.borderSubtle}`, display: 'flex', alignItems: 'center', gap: '4px', background: tab.id === activePreviewTabId ? c.surface : 'transparent', color: tab.id === activePreviewTabId ? c.text : c.textMuted }}
                    onClick={() => { setActivePreviewTabId(tab.id); setIsEditing(false); setEditContent('') }}
                  >
                    <span>{tab.path.split('/').pop()}</span>
                    <span style={{ color: c.textFaint, fontSize: '9px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setPreviewTabs(prev => prev.filter(t => t.id !== tab.id)); if (activePreviewTabId === tab.id) setActivePreviewTabId(previewTabs.find(t => t.id !== tab.id)?.id || null) }}>✕</span>
                  </div>
                ))}
              </div>
              {activePreviewFile ? (
                <div style={{ borderBottom: `1px solid ${c.border}`, padding: '4px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <span style={{ fontSize: '11px', color: c.textMuted, whiteSpace: 'nowrap' }}>{isEditing ? '✏️ 编辑中' : '👁️'} {activePreviewFile.path.split('/').pop()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {isEditing ? (
                        <>
                          <span style={{ cursor: 'pointer', color: c.accent, fontSize: '11px' }} onClick={handleSaveEdit}>{isSaving ? '保存中...' : '💾 保存'}</span>
                          <span style={{ cursor: 'pointer', color: c.textFaint, fontSize: '11px' }} onClick={handleCancelEdit}>✕ 取消</span>
                        </>
                      ) : (
                        <>
                          <span style={{ cursor: 'pointer', color: c.textMuted, fontSize: '11px' }} onClick={handleOpenTerminal} title="在终端中打开">💻</span>
                          <span style={{ cursor: 'pointer', color: c.accent, fontSize: '11px' }} onClick={handleStartEdit}>✏️ 编辑</span>
                          <span style={{ cursor: 'pointer', color: c.textMuted, fontSize: '11px' }} onClick={handleCopyContent}>📝 复制内容</span>
                          <span style={{ cursor: 'pointer', color: c.textMuted, fontSize: '11px' }} onClick={handleRevealInExplorer}>📂 所在位置</span>
                          <span style={{ cursor: 'pointer', color: c.textFaint, fontSize: '11px' }} onClick={() => { navigator.clipboard.writeText(activePreviewFile.path); showToast('路径已复制', 'success') }}>📋</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!isEditing && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                      <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); runSearch() }} placeholder="搜索..." style={{ flex: 1, padding: '2px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
                      <span style={{ color: c.textFaint, fontSize: '10px', minWidth: '40px', textAlign: 'center' }}>{searchResults.length > 0 ? `${currentResultIndex + 1}/${searchResults.length}` : '0/0'}</span>
                      <button onClick={handlePrevResult} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px' }} title="上一个">↑</button>
                      <button onClick={handleNextResult} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.textMuted, cursor: 'pointer', fontSize: '10px' }} title="下一个">↓</button>
                      <input value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} placeholder="替换为..." style={{ flex: 1, padding: '2px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
                      <button onClick={handleReplace} disabled={currentResultIndex === -1} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: currentResultIndex === -1 ? c.textFaint : c.accent, cursor: 'pointer', fontSize: '10px' }} title="替换">替换</button>
                      <button onClick={handleReplaceAll} disabled={searchResults.length === 0} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: searchResults.length === 0 ? c.textFaint : c.accent, cursor: 'pointer', fontSize: '10px' }} title="全部替换">全部</button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ borderBottom: `1px solid ${c.border}`, padding: '8px', color: c.textFaint, fontSize: '10px', textAlign: 'center' }}>所有标签页已关闭</div>
              )}
              {activePreviewFile && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', borderBottom: `1px solid ${c.border}`, maxHeight: '50%' }}>
                  {previewLoading && <div style={{ color: c.textMuted, fontSize: `${themeSettings.fontSize}px`, textAlign: 'center' }}>加载中...</div>}
                  {previewError && <div style={{ color: c.errorText, fontSize: `${themeSettings.fontSize}px` }}>{previewError}</div>}
                  <div>
                    <div style={{ fontSize: `${Math.max(8, themeSettings.fontSize - 3)}px`, color: c.textMuted, marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{activePreviewFile.path}</span>
                      <span>{activePreviewFile.size != null ? `${(activePreviewFile.size / 1024).toFixed(1)} KB` : ''} {activePreviewFile.content ? `${activePreviewFile.content.split('\n').length} 行` : ''}</span>
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{ width: '100%', minHeight: '200px', background: c.bgAlt, border: `1px solid ${c.accent}`, borderRadius: '4px', padding: '8px', color: c.text, fontSize: `${themeSettings.fontSize}px`, fontFamily: 'Consolas, Monaco, monospace', lineHeight: '1.5', resize: 'vertical', outline: 'none', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
                        onKeyDown={(e) => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSaveEdit() } }}
                      />
                    ) : (
                      (() => {
                        const ext = activePreviewFile.path.split('.').pop()?.toLowerCase() || ''
                        const langMap: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rb: 'ruby', sh: 'bash', yml: 'yaml', md: 'markdown', rs: 'rust', cpp: 'cpp', c: 'c', go: 'go', java: 'java', php: 'php', xml: 'html', json: 'json', css: 'css', scss: 'css', html: 'html', sql: 'sql', bash: 'bash', yaml: 'yaml', markdown: 'markdown', typescript: 'typescript', javascript: 'javascript', python: 'python', rust: 'rust', ruby: 'ruby' }
                        const codeExts = ['ts','tsx','js','jsx','py','css','html','json','md','bash','sh','yaml','yml','sql','rust','go','java','c','cpp','php','ruby','rs','toml','ini','env','conf','xml','svg','tex','r','swift','kt','kts','scala','hs','lua','vim','dockerfile','makefile','gitignore']
                        const detectedLang = langMap[ext] || (codeExts.includes(ext) ? ext : '')
                        const highlighted = detectedLang ? highlightCode(activePreviewFile.content || '', detectedLang, effectiveTheme !== 'light', themeSettings.fontSize) : null
                        if (highlighted !== null) {
                          const codeLines = activePreviewFile.content.split('\n')
                          const lineNums = codeLines.map((_, i) => i + 1).join('\n')
                          return (
                            <pre style={{ display: 'flex', background: c.codeBg, border: `1px solid ${c.border}`, borderRadius: '4px', fontSize: `${themeSettings.fontSize}px`, lineHeight: '1.5', overflowX: 'auto', maxHeight: '300px', margin: 0 }}>
                              <div style={{ color: c.textFaint, textAlign: 'right', paddingRight: '8px', userSelect: 'none', minWidth: '36px', borderRight: `1px solid ${c.borderSubtle}`, flexShrink: 0 }}>
                                {lineNums.split('\n').map((n, i) => (<div key={i} style={{ height: '1.5em' }}>{n}</div>))}
                              </div>
                              <div style={{ flex: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: '0 8px', color: c.text }} dangerouslySetInnerHTML={{ __html: highlighted }} />
                            </pre>
                          )
                        }
                        return (
                          <pre style={{ background: c.codeBg, border: `1px solid ${c.border}`, borderRadius: '4px', padding: '8px', fontSize: '11px', lineHeight: '1.5', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: c.text, margin: 0, maxHeight: '300px' }}>
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

          <div style={{ ...styles.panelHeader, borderTop: `1px solid ${c.border}` }}>🔄 Git 变更</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <GitChanges cwd={workingDir} onSelectFile={(path) => { setSelectedGitFile(path); setCommitMessage('') }} onChangesCount={setGitChangesCount} theme={theme} />
            {selectedGitFile && (
              <div style={{ borderTop: `1px solid ${c.border}` }}>
                <div style={{ padding: '4px 12px', fontSize: '11px', color: c.textMuted, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedGitFile}>{selectedGitFile.replace(workingDir + '/', '')}</span>
                  <span style={{ cursor: 'pointer', color: c.textFaint }} onClick={() => setSelectedGitFile(null)}>✕</span>
                </div>
                <GitDiff cwd={workingDir} filePath={selectedGitFile} theme={theme} />
                <div style={{ padding: '8px 12px', borderTop: `1px solid ${c.border}` }}>
                  <input
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="提交信息..."
                    style={{ width: '100%', backgroundColor: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '4px', padding: '6px 10px', color: c.text, fontSize: '12px', outline: 'none', marginBottom: '6px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit() } }}
                  />
                  <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || isCommitting}
                    style={{ width: '100%', padding: '6px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: commitMessage.trim() ? c.accent : c.surface, color: commitMessage.trim() ? '#000' : c.textFaint, fontSize: '12px', fontWeight: 600 }}
                  >
                    {isCommitting ? '提交中...' : '提交'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ ...styles.panelHeader, borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🔧 工具</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showDbPanel ? c.accent : c.textMuted }} onClick={() => setShowDbPanel(p => !p)}>🗄️ DB</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showApiTestPanel ? c.accent : c.textMuted }} onClick={() => setShowApiTestPanel(p => !p)}>🔌 API</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showSnippetPanel ? c.accent : c.textMuted }} onClick={() => setShowSnippetPanel(p => !p)}>✂️ 片段</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showLspPanel ? c.accent : c.textMuted }} onClick={() => setShowLspPanel(p => !p)}>🧠 LSP</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showReferencesPanel ? c.accent : c.textMuted }} onClick={() => { setShowReferencesPanel(p => !p) }}>📎 引用</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showCallChain ? c.accent : c.textMuted }} onClick={() => { setShowCallChain(p => !p) }}>🔗 调用链</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showProjectStructure ? c.accent : c.textMuted }} onClick={() => { setShowProjectStructure(p => !p) }}>📊 结构</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showGitMerge ? c.accent : c.textMuted }} onClick={() => { setShowGitMerge(p => !p) }}>🔀 合并</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showGitBranch ? c.accent : c.textMuted }} onClick={() => { setShowGitBranch(p => !p) }}>🌿 分支</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showSemanticSearch ? c.accent : c.textMuted }} onClick={() => setShowSemanticSearch(p => !p)}>🔍 搜索</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showDebuggerPanel ? c.accent : c.textMuted }} onClick={() => setShowDebuggerPanel(p => !p)}>🪲 调试器</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showCollabPanel ? c.accent : c.textMuted }} onClick={() => setShowCollabPanel(p => !p)}>🤝 协作</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showMonacoPanel ? c.accent : c.textMuted }} onClick={() => setShowMonacoPanel(p => !p)}>🖥️ 编辑器</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showSecurityAudit ? c.accent : c.textMuted }} onClick={() => setShowSecurityAudit(p => !p)}>🛡️ 安全</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showPerformanceRefactor ? c.accent : c.textMuted }} onClick={() => setShowPerformanceRefactor(p => !p)}>⚡ 重构</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: showWorkflowPanel ? c.accent : c.textMuted }} onClick={() => setShowWorkflowPanel(p => !p)}>⚙️ 工作流</span>
              <span style={{ cursor: 'pointer', fontSize: '10px', color: c.accent }} onClick={() => { setShowMcpPanel(p => !p); if (!showMcpPanel) { refreshMcpServers(); refreshAgents() } }}>{showMcpPanel ? '收起 MCP' : 'MCP 管理'}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <ToolPanel cwd={workingDir} theme={THEMES[effectiveTheme]} />
          </div>
          {showMcpPanel && (
            <div style={{ borderTop: `1px solid ${c.border}`, padding: '8px 12px', maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: c.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>MCP / Agents</span>
                <span style={{ cursor: 'pointer', fontSize: '10px', color: c.accent }} onClick={() => setShowAgentPanel(true)}>🤖 管理 Agent</span>
                <span style={{ cursor: 'pointer', fontSize: '10px', color: c.textMuted, marginLeft: '8px' }} onClick={() => setShowPluginPanel(true)}>🧩 插件</span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input value={mcpNewName} onChange={e => setMcpNewName(e.target.value)} placeholder="名称" style={{ flex: 1, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
                <input value={mcpNewCommand} onChange={e => setMcpNewCommand(e.target.value)} placeholder="命令 (npx ...)" style={{ flex: 2, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
                <input value={mcpNewArgs} onChange={e => setMcpNewArgs(e.target.value)} placeholder="参数" style={{ flex: 1, padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
                <button onClick={handleMcpAdd} disabled={mcpLoading || !mcpNewName.trim() || !mcpNewCommand.trim()} style={{ padding: '3px 8px', border: 'none', borderRadius: '3px', background: mcpLoading ? c.surface : c.accent, color: mcpLoading ? c.textFaint : '#000', cursor: mcpLoading ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600 }}>+</button>
              </div>
              {mcpServers.length === 0 && <div style={{ fontSize: '10px', color: c.textFaint }}>暂无 MCP 服务器。使用 /mcp add 或上方表单添加。</div>}
              {mcpServers.map(s => {
                const connected = s.name in mcpConnectedTools
                const selected = mcpSelectedServer === s.name
                return (
                  <div key={s.name} style={{ padding: '4px 6px', background: selected ? c.accentDim : c.bgPanel, border: '1px solid ' + (selected ? c.accent : c.border), borderRadius: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', color: c.text, fontWeight: 500 }}>
                          {s.name}
                          {connected && <span style={{ fontSize: '9px', color: c.accent, marginLeft: '4px' }}>{'● 已连接 (' + mcpConnectedTools[s.name].length + ')'}</span>}
                        </div>
                        <div style={{ fontSize: '9px', color: c.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command} {(s.args || []).join(' ')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {!connected && <span style={{ cursor: 'pointer', fontSize: '9px', color: c.accent }} onClick={() => handleMcpConnect(s.name)}>连接</span>}
                        {connected && <span style={{ cursor: 'pointer', fontSize: '9px', color: c.textMuted }} onClick={() => setMcpSelectedServer(selected ? null : s.name)}>{selected ? '收起' : '工具'}</span>}
                        <span style={{ cursor: 'pointer', fontSize: '9px', color: c.errorText }} onClick={() => handleMcpRemove(s.name)}>删除</span>
                      </div>
                    </div>
                    {connected && selected && (
                      <div style={{ marginTop: '4px', borderTop: '1px solid ' + c.borderSubtle, paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {mcpConnectedTools[s.name].map(t => (
                          <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px', background: c.bgAlt, borderRadius: '2px' }}>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: '10px', color: c.text, fontFamily: 'monospace' }}>{t.name}</div>
                              {t.description && <div style={{ fontSize: '9px', color: c.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>}
                            </div>
                            <span style={{ cursor: 'pointer', fontSize: '9px', color: c.accent, flexShrink: 0, marginLeft: '4px' }}
                              onClick={() => {
                                const argsStr = prompt('输入参数 JSON (工具: ' + t.name + '):', '{}')
                                if (argsStr) {
                                  try { handleMcpCallTool(s.name, t.name, JSON.parse(argsStr)) } catch { showToast('参数 JSON 格式错误', 'error') }
                                }
                              }}>调用</span>
                          </div>
                        ))}
                        {mcpToolResult && mcpSelectedServer === s.name && (
                          <div style={{ marginTop: '4px', padding: '4px', background: c.codeBg, border: '1px solid ' + c.border, borderRadius: '3px', fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '100px', overflowY: 'auto', color: c.textMuted }}>
                            {mcpToolResult}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {agents.length > 0 && <div style={{ fontSize: '10px', color: c.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Agents ({agents.length})</div>}
              {agents.slice(0, 5).map(a => (
                <div key={a.id} style={{ fontSize: '10px', color: c.textMuted, padding: '2px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name} {a.model ? `(${a.model})` : ''}</div>
              ))}
            </div>
          )}
        </div>
        {/* Project Management Panels */}
        {showKanban && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowKanban(false)}>
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', width: '80%', maxWidth: '900px', height: '70%', maxHeight: '600px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: theme.text }}>📋 任务看板</span>
                <span style={{ cursor: 'pointer', color: theme.textFaint }} onClick={() => setShowKanban(false)}>✕</span>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <KanbanBoard cwd={workingDir} theme={theme} />
              </div>
            </div>
          </div>
        )}
        {showTimeTracker && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowTimeTracker(false)}>
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', width: '70%', maxWidth: '700px', height: '70%', maxHeight: '550px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: theme.text }}>⏱️ 时间追踪</span>
                <span style={{ cursor: 'pointer', color: theme.textFaint }} onClick={() => setShowTimeTracker(false)}>✕</span>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <TimeTracker />
              </div>
            </div>
          </div>
        )}
        {showProgressReport && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowProgressReport(false)}>
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', width: '75%', maxWidth: '800px', height: '75%', maxHeight: '600px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: theme.text }}>📊 进度报告</span>
                <span style={{ cursor: 'pointer', color: theme.textFaint }} onClick={() => setShowProgressReport(false)}>✕</span>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ProgressReport cwd={workingDir} theme={theme} />
              </div>
            </div>
          </div>
        )}
        {showSemanticSearch && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 360, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <SemanticSearchPanel cwd={workingDir} theme={theme} onSelectResult={(result) => { handlePreviewFile(result.filePath) }} />
          </div>
        )}
        {showAIOutline && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 320, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <OutlinePanel filePath={activePreviewFile.path} cwd={workingDir} theme={theme} onSymbolClick={(filePath, line) => { handlePreviewFile(filePath) }} />
          </div>
        )}
        {showCodeReview && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 380, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <AICodeReviewPanel filePath={activePreviewFile.path} cwd={workingDir} theme={theme} onNavigateTo={(filePath, line) => { handlePreviewFile(filePath) }} />
          </div>
        )}
        {showCommandPalette && <CommandPalette cwd={workingDir} onClose={() => setShowCommandPalette(false)} mode={paletteMode} setMode={setPaletteMode} commandHistory={cmdHistory.commandHistory} theme={theme} />}
        {showAgentPanel && <AgentPanel cwd={workingDir} theme={theme} onClose={() => setShowAgentPanel(false)} />}
        {showPluginPanel && <PluginPanel theme={theme} onClose={() => setShowPluginPanel(false)} />}
        {showDbPanel && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9997 }}>
            <DatabaseBrowser theme={theme} onClose={() => setShowDbPanel(false)} />
          </div>
        )}
        {showApiTestPanel && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 450, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <ApiTestPanel theme={theme} onClose={() => setShowApiTestPanel(false)} />
          </div>
        )}
        {showSnippetPanel && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 380, height: '65%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: c.text }}>✂️ 代码片段</span>
              <span style={{ cursor: 'pointer', color: c.textFaint, fontSize: '12px' }} onClick={() => setShowSnippetPanel(false)}>✕</span>
            </div>
            <SnippetPanel
              theme={theme}
              currentFile={activePreviewFile.path}
              onInsert={(code: string) => {
                if (isEditing) {
                  setEditContent(prev => prev + '\n' + code)
                } else {
                  setInput(prev => prev + code)
                }
              }}
            />
          </div>
        )}
        {showLspPanel && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 420, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <LspPanel
              filePath={activePreviewFile.path}
              content={activePreviewFile.content || ''}
              cursorLine={0}
              cursorColumn={0}
              theme={theme}
              onClose={() => setShowLspPanel(false)}
              onGoToDefinition={(filePath, line) => { handlePreviewFile(filePath); setShowLspPanel(false) }}
            />
          </div>
        )}
        {showReferencesPanel && activePreviewFile && (
          <ReferencesPanel
            filePath={activePreviewFile.path}
            cursorLine={0}
            cursorColumn={0}
            theme={theme}
            onClose={() => setShowReferencesPanel(false)}
            onGoToDefinition={(filePath, line) => { handlePreviewFile(filePath) }}
            referencesQuery={(filePath, line, character) => lsp.references(filePath, line, character)}
          />
        )}
        {showCallChain && activePreviewFile && (
          <CallChainPanel
            result={callChain}
            filePath={activePreviewFile.path}
            theme={theme}
            onClose={() => setShowCallChain(false)}
            onGoToDefinition={(filePath, line) => { handlePreviewFile(filePath) }}
          />
        )}
        {showProjectStructure && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 480, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <ProjectStructurePlanner cwd={workingDir} theme={theme} onClose={() => setShowProjectStructure(false)} />
          </div>
        )}
        {showGitMerge && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 520, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <GitMergePanel cwd={workingDir} theme={theme} onClose={() => setShowGitMerge(false)} onResolved={() => { setShowGitMerge(false); showToast('合并冲突已解决', 'success') }} />
          </div>
        )}
        {showGitBranch && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 420, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <GitBranchManager cwd={workingDir} theme={theme} onClose={() => setShowGitBranch(false)} onBranchChanged={() => { showToast('分支已更新', 'success') }} />
          </div>
        )}
        {showDebuggerPanel && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 520, height: '75%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <DebuggerPanel cwd={workingDir} theme={theme} onClose={() => setShowDebuggerPanel(false)} />
          </div>
        )}
        {showCollabPanel && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 480, height: '75%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <CollaborationPanel cwd={workingDir} theme={theme} onClose={() => setShowCollabPanel(false)} />
          </div>
        )}
        {showMonacoPanel && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 680, height: '75%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <MonacoEditorPanel cwd={workingDir} theme={theme} themeName={effectiveTheme} onClose={() => setShowMonacoPanel(false)} />
          </div>
        )}
        {showSecurityAudit && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 520, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <SecurityAuditPanel cwd={workingDir} theme={theme} scanPath={selectedFile || workingDir} onNavigateTo={(filePath, lineNumber) => { setSelectedFile(filePath); setShowSecurityAudit(false); /* 可扩展：滚动到对应行 */ }} />
          </div>
        )}
        {showPerformanceRefactor && (
          <div style={{ position: 'fixed', top: 60, right: 20, width: 520, height: '70%', zIndex: 9990, background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <PerformanceRefactorPanel cwd={workingDir} theme={theme} scanPath={selectedFile || workingDir} onNavigateTo={(filePath, lineNumber) => { setSelectedFile(filePath); setShowPerformanceRefactor(false); }} />
          </div>
        )}
        {showWorkflowPanel && (
          <WorkflowPanel
            workflows={wf.workflows}
            history={wf.history}
            currentRun={wf.currentRun}
            batchJobs={wf.batchJobs}
            batchHistory={wf.batchHistory}
            filePath={selectedFile || ''}
            theme={theme}
            onClose={() => setShowWorkflowPanel(false)}
            onCreateWorkflow={wf.createWorkflow}
            onCreateFromTemplate={wf.createFromTemplate}
            onExecute={(id, ctx) => wf.executeWorkflow(id, ctx)}
            onCancel={wf.cancelRun}
            onExecuteBatch={(workflowId, files) => wf.executeBatch(workflowId, files)}
            onCancelBatch={(batchId) => wf.cancelBatch(batchId)}
            onDelete={wf.deleteWorkflow}
          />
        )}
        {showShortcuts && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowShortcuts(false)}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '20px', minWidth: '360px', maxWidth: '480px', boxShadow: `0 8px 32px ${c.bg}80` }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: c.text, marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⌨ 快捷键</span>
                <span style={{ cursor: 'pointer', color: c.textFaint, fontSize: '18px' }} onClick={() => setShowShortcuts(false)}>✕</span>
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
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${c.borderSubtle}` }}>
                    <span style={{ color: c.textMuted, fontSize: '12px' }}>{desc}</span>
                    <kbd style={{ background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', padding: '1px 6px', fontSize: '11px', color: c.accent, fontFamily: 'monospace' }}>{key}</kbd>
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
