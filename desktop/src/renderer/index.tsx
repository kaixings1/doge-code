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

// ─── 消息内容解析：将 assistant 消息拆分为文本块 + 工具调用块 ───
function parseMessageContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const toolUseRegex = /<tool_use>\s*<name>([^<]+)<\/name>\s*<input>(.*?)<\/input>\s*<\/tool_use>/gs
  const toolEndRegex = /<\/tool_use>/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  const matches: Array<{ start: number; end: number; name: string; input: string }> = []

  while ((match = toolUseRegex.exec(content)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      name: match[1],
      input: match[2],
    })
  }

  for (const tm of matches) {
    if (tm.start > lastIndex) {
      blocks.push({ type: 'text', text: content.slice(lastIndex, tm.start) })
    }
    let input: Record<string, unknown> = {}
    try { input = JSON.parse(tm.input) } catch { input = { raw: tm.input } }
    blocks.push({ type: 'tool_use', id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: tm.name, input })
    lastIndex = tm.end
  }
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', text: content.slice(lastIndex) })
  }
  if (blocks.length === 0 && content.trim()) {
    blocks.push({ type: 'text', text: content })
  }
  return blocks
}

function renderToolUseBlock(block: ToolUseBlock): string {
  const inputStr = typeof block.input === 'string' ? block.input : JSON.stringify(block.input, null, 2)
  const truncated = inputStr.length > 200 ? inputStr.slice(0, 200) + '...' : inputStr
  return `<div style="background:#0A0A0A;border:1px solid #262626;border-radius:4px;padding:8px 10px;margin:4px 0;font-family:monospace;font-size:11px">
    <div style="color:#4ECB71;font-weight:600;margin-bottom:4px">🔧 ${block.name}</div>
    <div style="color:#888;white-space:pre-wrap;word-break:break-all">${truncated.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  </div>`
}

// // --- 轻量语法高亮 ---
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

  // 代码块（带语法高亮）
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const highlighted = highlightCode(code.trim(), lang.toLowerCase())
    const langLabel = lang ? `<div style="color:#888;font-size:10px;margin-bottom:4px">${lang}</div>` : ''
    return `${langLabel}<pre style="background:#0A0A0A;border:1px solid #262626;border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:4px 0"><code>${highlighted}</code></pre>`
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

// ─── 状态类型 ───
type QueryState = 'idle' | 'responding' | 'needs_user' | 'should_continue' | 'done' | 'crashed' | 'aborted_by_user'

// ─── 消息内容块类型 ───
interface TextBlock { type: 'text'; text: string }
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type ContentBlock = TextBlock | ToolUseBlock

// ─── 数据模型 ───
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool'
  content: string
}

interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
  expanded?: boolean
  parentPath?: string
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
  toolResultBubble: { backgroundColor: '#1A1A2E', border: '1px solid #2A2A4A', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' },
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

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    ts: '📘', tsx: '⚛️', js: '📜', jsx: '⚛️',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    py: '🐍', rs: '🦀', go: '🔵', java: '☕',
    png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🎨',
    gitignore: '🔀', env: '🔐', yaml: '⚙️', yml: '⚙️',
    toml: '⚙️', lock: '🔒', sh: '💻', bat: '💻',
  }
  return iconMap[ext] || '📄'
}

// ─── 文件树组件 ───
function FileTree({ cwd, onPreviewFile }: { cwd: string; onPreviewFile?: (path: string) => void }) {
  const [tree, setTree] = React.useState<FileTreeNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('')
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; node: FileTreeNode } | null>(null)

  React.useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const copyPath = () => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.node.path).catch(() => {})
      setContextMenu(null)
    }
  }

  const deleteNode = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const confirmed = confirm(`确定要删除 "${node.name}" 吗？\n路径: ${node.path}\n\n此操作不可撤销。`)
    if (!confirmed) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.deleteFile(node.path)
      if (result.success) {
        // 刷新文件树：从顶层移除，或从父节点的 children 中移除
        if (node.parentPath) {
          setTree(prev => {
            const removeFromParent = (nodes: FileTreeNode[]): FileTreeNode[] =>
              nodes.map(n => {
                if (n.path === node.parentPath && n.children) {
                  return { ...n, children: n.children.filter(c => c.path !== node.path) }
                }
                if (n.children) return { ...n, children: removeFromParent(n.children) }
                return n
              })
            return removeFromParent(prev)
          })
        } else {
          setTree(prev => prev.filter(n => n.path !== node.path))
        }
      } else {
        alert(result.error || '删除失败')
      }
    } catch { alert('删除失败') }
    setContextMenu(null)
  }

  const renameNode = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const newName = prompt('重命名为:', node.name)
    if (!newName || newName === node.name) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.renameFile(node.path, newName)
      if (result.success && result.newPath) {
        // 刷新文件树：递归更新匹配的节点 name 和 path
        setTree(prev => {
          const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map(n => {
              if (n.path === node.path) {
                return { ...n, name: newName, path: result.newPath! }
              }
              if (n.children) return { ...n, children: updateNode(n.children) }
              return n
            })
          return updateNode(prev)
        })
      } else {
        alert(result.error || '重命名失败')
      }
    } catch { alert('重命名失败') }
    setContextMenu(null)
  }

  const newFileInDir = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const fileName = prompt('新建文件名:')
    if (!fileName) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.newFile(node.path, fileName)
      if (result.success && result.path) {
        const newNode: FileTreeNode = {
          name: fileName,
          path: result.path,
          isDirectory: false,
          expanded: false,
          parentPath: node.path,
        }
        setTree(prev => {
          const addToParent = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map(n => {
              if (n.path === node.path && n.children) {
                return { ...n, children: [...n.children, newNode] }
              }
              if (n.children) return { ...n, children: addToParent(n.children) }
              return n
            })
          return addToParent(prev)
        })
      } else {
        alert(result.error || '新建文件失败')
      }
    } catch { alert('新建文件失败') }
    setContextMenu(null)
  }

  const newFolderInDir = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const folderName = prompt('新建文件夹名:')
    if (!folderName) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.newFolder(node.path, folderName)
      if (result.success && result.path) {
        const newNode: FileTreeNode = {
          name: folderName,
          path: result.path,
          isDirectory: true,
          expanded: false,
          parentPath: node.path,
          children: [],
        }
        setTree(prev => {
          const addToParent = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map(n => {
              if (n.path === node.path && n.children) {
                return { ...n, children: [...n.children, newNode] }
              }
              if (n.children) return { ...n, children: addToParent(n.children) }
              return n
            })
          return addToParent(prev)
        })
      } else {
        alert(result.error || '新建文件夹失败')
      }
    } catch { alert('新建文件夹失败') }
    setContextMenu(null)
  }

  const openTerminalInDir = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    try {
      const result = await window.dogeAPI.openTerminal(node.path)
      if (!result.success) {
        alert(result.error || '打开终端失败')
      }
    } catch { alert('打开终端失败') }
    setContextMenu(null)
  }

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

    if (node.expanded) {
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: false } : n))
      return
    }

    if (node.children && node.children.length > 0) {
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: true } : n))
      return
    }

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
          parentPath: node.path,
        }))
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, children, expanded: true } : n))
    } catch { /* ignore */ } finally {
      setLoadingPaths((prev) => { const next = new Set(prev); next.delete(node.path); return next })
    }
  }

  const renderNode = (node: FileTreeNode, depth: number = 0): JSX.Element[] => {
    if (filter && !node.name.toLowerCase().includes(filter.toLowerCase())) return []
    const result: JSX.Element[] = []
    const isLoading = loadingPaths.has(node.path)
    result.push(
      <div
        key={node.path}
        style={{ ...styles.fileItem, paddingLeft: `${12 + depth * 16}px`, color: node.isDirectory ? '#F5F5F5' : '#888888' }}
        onClick={() => toggleDir(node)}
        onDoubleClick={() => { if (!node.isDirectory) onPreviewFile?.(node.path) }}
        onContextMenu={(e) => handleContextMenu(e, node)}
      >
        <span>{node.isDirectory ? (node.expanded ? '▼' : '▶') : getFileIcon(node.name, false)}</span>
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

  return (
    <>
      {/* 文件搜索框 */}
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #1A1A1A' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 搜索文件..."
          style={{
            width: '100%', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px',
            padding: '3px 6px', color: '#F5F5F5', fontSize: '11px', outline: 'none'
          }}
        />
      </div>
      {tree.flatMap((node) => renderNode(node))}
      {/* 文件树右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
            background: '#1A1A1A', border: '1px solid #333', borderRadius: '4px', padding: '4px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '160px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.isDirectory ? (
            <>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#F5F5F5' }} onClick={openTerminalInDir}>
                📂 打开终端
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#F5F5F5' }} onClick={newFileInDir}>
                📄 新建文件
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#F5F5F5' }} onClick={newFolderInDir}>
                📁 新建文件夹
              </div>
              <div style={{ borderTop: '1px solid #333' }} />
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={copyPath}>
                📋 复制路径
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={renameNode}>
                ✏️ 重命名
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#FF6B6B' }} onClick={deleteNode}>
                🗑️ 删除文件夹
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={copyPath}>
                📋 复制路径
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={renameNode}>
                ✏️ 重命名
              </div>
              <div style={{ borderTop: '1px solid #333' }} />
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#FF6B6B' }} onClick={deleteNode}>
                🗑️ 删除文件
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

// ─── Git 变更组件 ───
function GitChanges({ cwd, onSelectFile }: { cwd: string; onSelectFile: (path: string) => void }) {
  const [files, setFiles] = React.useState<GitFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<'all' | 'staged'>('all')
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; file: GitFile } | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.getGitStatus(cwd)
      setFiles(result)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  React.useEffect(() => { refresh() }, [refresh])

  React.useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, file: GitFile) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  const runGit = async (action: 'stage' | 'unstage' | 'discard', filePath: string) => {
    setContextMenu(null)
    let result: { success: boolean; error?: string }
    if (action === 'stage') result = await window.dogeAPI.gitStage(cwd, filePath)
    else if (action === 'unstage') result = await window.dogeAPI.gitUnstage(cwd, filePath)
    else result = await window.dogeAPI.gitDiscard(cwd, filePath)

    if (!result.success) alert(result.error || '操作失败')
    refresh()
    if (filePath) onSelectFile(filePath)
  }

  const visibleFiles = files.filter(f => viewMode === 'staged' ? f.staged : true)
  const stats = files.reduce(
    (acc, f) => {
      if (f.status.includes('M')) acc.modified++
      else if (f.status.includes('A') || f.status.includes('?')) acc.added++
      else if (f.status.includes('D')) acc.deleted++
      else if (f.status.includes('R')) acc.renamed++
      return acc
    },
    { modified: 0, added: 0, deleted: 0, renamed: 0 }
  )

  if (loading) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>加载中...</div>
  if (files.length === 0) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>无变更</div>

  return (
    <div style={{ fontSize: '11px' }}>
      {/* 统计栏 */}
      <div style={{ padding: '4px 12px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #1A1A1A' }}>
        {stats.modified > 0 && <span style={{ color: '#FF6B6B' }}>修改 {stats.modified}</span>}
        {stats.added > 0 && <span style={{ color: '#4ECB71' }}>新增 {stats.added}</span>}
        {stats.deleted > 0 && <span style={{ color: '#FF6B6B' }}>删除 {stats.deleted}</span>}
        {stats.renamed > 0 && <span style={{ color: '#FFB347' }}>重命名 {stats.renamed}</span>}
        <span style={{ marginLeft: 'auto', color: '#555' }}>共 {files.length} 个文件</span>
      </div>

      {/* 切换按钮 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A' }}>
        <button
          onClick={() => setViewMode('all')}
          style={{
            flex: 1, padding: '4px', border: 'none', background: viewMode === 'all' ? '#1A1A1A' : 'transparent',
            color: viewMode === 'all' ? '#F5F5F5' : '#666', cursor: 'pointer', fontSize: '11px'
          }}
        >
          全部 ({files.length})
        </button>
        <button
          onClick={() => setViewMode('staged')}
          style={{
            flex: 1, padding: '4px', border: 'none', background: viewMode === 'staged' ? '#1A1A1A' : 'transparent',
            color: viewMode === 'staged' ? '#F5F5F5' : '#666', cursor: 'pointer', fontSize: '11px'
          }}
        >
          已暂存 ({files.filter(f => f.staged).length})
        </button>
      </div>

      {/* 文件列表 */}
      {visibleFiles.length === 0 ? (
        <div style={{ padding: '8px 12px', color: '#555' }}>无变更</div>
      ) : (
        visibleFiles.map((f) => {
          const color = STATUS_COLORS[f.status] || '#888888'
          const label = f.status.trim() || '??'
          return (
            <div
              key={f.path}
              style={{ ...styles.gitFile, cursor: 'pointer' }}
              onClick={() => onSelectFile(f.path)}
              onContextMenu={(e) => handleContextMenu(e, f)}
              title="左键查看 diff，右键操作"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{f.path.replace(cwd + '/', '')}</span>
              <span style={{ ...styles.gitStatus, color }}>{label}</span>
            </div>
          )
        })
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
            background: '#1A1A1A', border: '1px solid #333', borderRadius: '4px', padding: '4px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '160px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.file.status[0] !== '?' && !contextMenu.file.staged && (
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#4ECB71' }} onClick={() => runGit('stage', contextMenu.file.path)}>
              暂存 (Stage)
            </div>
          )}
          {contextMenu.file.staged && (
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#FFB347' }} onClick={() => runGit('unstage', contextMenu.file.path)}>
              取消暂存 (Unstage)
            </div>
          )}
          {!contextMenu.file.status.includes('D') && (
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#FF6B6B' }} onClick={() => runGit('discard', contextMenu.file.path)}>
              丢弃更改 (Discard)
            </div>
          )}
          <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={() => { navigator.clipboard.writeText(contextMenu.file.path); setContextMenu(null) }}>
            复制路径 (Copy)
          </div>
        </div>
      )}
    </div>
  )
}

// 语法高亮 diff 渲染
function HighlightedDiff({ diffText }: { diffText: string }) {
  const lines = diffText.split('\n')
  const [lineNumbers, setLineNumbers] = React.useState<number[]>([])

  React.useEffect(() => {
    const nums: number[] = []
    let line = 0
    for (const l of lines) {
      if (l.startsWith('+') && !l.startsWith('+++')) line++
      else if (l.startsWith('-') && !l.startsWith('---')) {}
      else line++
      nums.push(line)
    }
    setLineNumbers(nums)
  }, [diffText])

  const highlightSyntax = (text: string): string => {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, '<span style="color:#C678DD">$1</span>')
    html = html.replace(/(['"`])(?:(?!\1|\\).|\\.)*?\1/g, '<span style="color:#98C379">$&</span>')
    html = html.replace(/\b(\d+)\b/g, '<span style="color:#D19A66">$1</span>')
    html = html.replace(/(\/\/.*)$/gm, '<span style="color:#5C6370">$1</span>')
    return html
  }

  return (
    <div style={{ display: 'flex', fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace", fontSize: '11px', lineHeight: '1.5' }}>
      <div style={{ color: '#444', textAlign: 'right', paddingRight: '8px', userSelect: 'none', minWidth: '36px', borderRight: '1px solid #1A1A1A' }}>
        {lineNumbers.map((num, i) => (
          <div key={i} style={{ height: '1.5em' }}>{num}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflowX: 'auto', whiteSpace: 'pre' }}>
        {lines.map((line, i) => {
          let bgColor = 'transparent'
          let textColor = '#abb2bf'
          if (line.startsWith('+') && !line.startsWith('+++')) { bgColor = 'rgba(78, 203, 113, 0.1)'; textColor = '#98C379' }
          else if (line.startsWith('-') && !line.startsWith('---')) { bgColor = 'rgba(255, 107, 107, 0.1)'; textColor = '#E06C75' }
          else if (line.startsWith('@@')) { textColor = '#56B6C2' }
          else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) { textColor = '#5C6370' }

          return (
            <div key={i} style={{ background: bgColor, padding: '0 4px' }}>
              <span dangerouslySetInnerHTML={{ __html: highlightSyntax(line) || ' ' }} style={{ color: textColor }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GitDiff({ cwd, filePath }: { cwd: string; filePath: string }) {
  const [diff, setDiff] = React.useState<string>('加载中...')
  const [loading, setLoading] = React.useState(true)
  const [stats, setStats] = React.useState<{ added: number; removed: number }>({ added: 0, removed: 0 })

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const result = await window.dogeAPI.getGitDiff(cwd, filePath)
        const diffText = result || '无差异'
        setDiff(diffText)
        const lines = diffText.split('\n')
        let added = 0, removed = 0
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) added++
          else if (line.startsWith('-') && !line.startsWith('---')) removed++
        }
        setStats({ added, removed })
      } catch (e) {
        setDiff('读取失败')
      } finally { setLoading(false) }
    }
    load()
  }, [cwd, filePath])

  if (loading) return <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>加载中...</div>

  return (
    <div>
      <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1A1A1A', marginBottom: '4px' }}>
        <span style={{ color: '#888', fontSize: '10px' }}>
          <span style={{ color: '#4ECB71' }}>+{stats.added}</span>
          <span style={{ margin: '0 4px', color: '#333' }}>|</span>
          <span style={{ color: '#FF6B6B' }}>-{stats.removed}</span>
        </span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(diff)
          }}
          style={{ background: 'none', border: '1px solid #262626', color: '#666', padding: '1px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
        >
          复制
        </button>
      </div>
      <div style={{ maxHeight: '400px', overflow: 'auto' }}>
        <HighlightedDiff diffText={diff} />
      </div>
    </div>
  )
}

// ─── 工具面板组件 ───
function ToolPanel({ cwd }: { cwd: string }) {
  const [tools, setTools] = React.useState<Array<{ name: string; description: string; input_schema: Record<string, unknown> }>>([])
  const [selectedTool, setSelectedTool] = React.useState<string | null>(null)
  const [toolInput, setToolInput] = React.useState('')
  const [toolResult, setToolResult] = React.useState<{ success: boolean; output?: unknown; error?: string } | null>(null)
  const [executing, setExecuting] = React.useState(false)

  React.useEffect(() => {
    async function load() {
      try {
        const result = await window.dogeAPI.getTools()
        setTools(result)
      } catch { /* ignore */ }
    }
    load()
  }, [])

  const selectedToolDef = tools.find(t => t.name === selectedTool)

  const handleExecute = async () => {
    if (!selectedTool) return
    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(toolInput)
    } catch {
      alert('输入参数必须是有效的 JSON 格式')
      return
    }

    const dangerous = ['BashTool', 'HttpTool', 'FileWriteTool', 'FileEditTool']
    if (dangerous.includes(selectedTool)) {
      const confirmed = confirm(`⚠ 工具 "${selectedTool}" 可能修改系统状态。\n参数: ${JSON.stringify(input, null, 2)}\n\n确认执行？`)
      if (!confirmed) return
    }

    setExecuting(true)
    setToolResult(null)
    try {
      const result = await window.dogeAPI.executeTool({ name: selectedTool, input })
      setToolResult(result)
    } catch (e) {
      setToolResult({ success: false, error: e instanceof Error ? e.message : '执行失败' })
    } finally {
      setExecuting(false)
    }
  }

  if (tools.length === 0) {
    return <div style={{ padding: '8px 12px', color: '#555', fontSize: '11px' }}>加载中...</div>
  }

  return (
    <div style={{ fontSize: '11px' }}>
      <div style={{ padding: '4px 12px', display: 'flex', gap: '4px', flexWrap: 'wrap', borderBottom: '1px solid #1A1A1A' }}>
        {tools.map(tool => (
          <button
            key={tool.name}
            onClick={() => { setSelectedTool(tool.name); setToolInput(''); setToolResult(null) }}
            style={{
              padding: '2px 8px', border: '1px solid', borderColor: selectedTool === tool.name ? '#4ECB71' : '#262626',
              borderRadius: '3px', background: selectedTool === tool.name ? 'rgba(78,203,113,0.1)' : '#0F0F0F',
              color: selectedTool === tool.name ? '#4ECB71' : '#888', cursor: 'pointer', fontSize: '10px'
            }}
          >
            {tool.name}
          </button>
        ))}
      </div>

      {selectedToolDef && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1A1A1A' }}>
          <div style={{ color: '#888', marginBottom: '4px', fontSize: '10px' }}>{selectedToolDef.description}</div>
          <textarea
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            placeholder={`输入 JSON 参数，例如: {"command": "ls -la"}`}
            style={{
              width: '100%', minHeight: '60px', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '4px',
              padding: '6px 8px', color: '#F5F5F5', fontSize: '11px', fontFamily: 'monospace', outline: 'none', resize: 'vertical'
            }}
          />
          <button
            onClick={handleExecute}
            disabled={executing || !toolInput.trim()}
            style={{
              width: '100%', marginTop: '6px', padding: '5px', border: 'none', borderRadius: '4px', cursor: 'pointer',
              background: (!executing && toolInput.trim()) ? '#4ECB71' : '#1A1A1A',
              color: (!executing && toolInput.trim()) ? '#000' : '#555',
              fontSize: '11px', fontWeight: 600
            }}
          >
            {executing ? '执行中...' : '执行'}
          </button>
        </div>
      )}

      {toolResult && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #262626' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>执行结果</div>
          <div style={{
            padding: '6px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: '200px', overflowY: 'auto',
            background: toolResult.success ? 'rgba(78,203,113,0.05)' : 'rgba(255,107,107,0.05)',
            border: `1px solid ${toolResult.success ? 'rgba(78,203,113,0.2)' : 'rgba(255,107,107,0.2)'}`,
            color: toolResult.success ? '#4ECB71' : '#FF6B6B'
          }}>
            {toolResult.error || (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 命令面板组件 ───
function CommandPalette({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const [query, setQuery] = React.useState('')
  const [commands, setCommands] = React.useState<Array<{ name: string; description: string; category: string }>>([])
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [results, setResults] = React.useState<{ success: boolean; output?: string; error?: string } | null>(null)
  const [executing, setExecuting] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    async function load() {
      try {
        const cmds = await window.dogeAPI.getCommands()
        setCommands(cmds)
      } catch { /* ignore */ }
    }
    load()
    inputRef.current?.focus()
  }, [])

  const filtered = commands.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  )

  const handleSelect = async (cmdName: string) => {
    const args = query.slice(cmdName.length).trim().split(' ').filter(Boolean)
    setExecuting(true)
    setResults(null)
    try {
      const result = await window.dogeAPI.executeCommand(cmdName, args)
      setResults(result)
    } catch (e) {
      setResults({ success: false, error: e instanceof Error ? e.message : '执行失败' })
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex].name)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '20vh'
    }} onClick={onClose}>
      <div style={{
        width: '500px', maxHeight: '500px', background: '#1A1A1A', border: '1px solid #333',
        borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令 (如 /commit, /status, /help)..."
            style={{
              width: '100%', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '4px',
              padding: '8px 12px', color: '#F5F5F5', fontSize: '14px', outline: 'none'
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px', color: '#555', textAlign: 'center' }}>无匹配命令</div>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.name}
                onClick={() => handleSelect(cmd.name)}
                style={{
                  padding: '8px 16px', cursor: 'pointer', background: i === selectedIndex ? '#2A2A2A' : 'transparent',
                  borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span style={{ color: '#4ECB71', fontFamily: 'monospace', fontSize: '13px', minWidth: '120px' }}>{cmd.name}</span>
                <span style={{ color: '#888', fontSize: '12px', flex: 1 }}>{cmd.description}</span>
                <span style={{ color: '#555', fontSize: '10px' }}>{cmd.category}</span>
              </div>
            ))
          )}
        </div>
        {results && (
          <div style={{ borderTop: '1px solid #262626', maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px 16px', fontSize: '10px', color: '#888', borderBottom: '1px solid #1A1A1A' }}>执行结果</div>
            <pre style={{
              padding: '12px 16px', margin: 0, color: results.success ? '#4ECB71' : '#FF6B6B',
              fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>{results.error || results.output || ''}</pre>
          </div>
        )}
        {executing && (
          <div style={{ padding: '8px 16px', color: '#888', fontSize: '11px', borderTop: '1px solid #262626' }}>
            执行中...
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 主组件 ───
function App(): JSX.Element {
  const [config, setConfig] = React.useState<DesktopConfig>({ provider: 'openai', apiKey: '', model: 'gpt-4o', workingDir: '' })
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState('')
  const [state, setState] = React.useState<QueryState>('idle')
  const [currentStreaming, setCurrentStreaming] = React.useState('')
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [selectedGitFile, setSelectedGitFile] = React.useState<string | null>(null)
  const [commitMessage, setCommitMessage] = React.useState('')
  const [isCommitting, setIsCommitting] = React.useState(false)
  const [previewFile, setPreviewFile] = React.useState<{ path: string; content: string; size?: number } | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [editContent, setEditContent] = React.useState('')
  const [isSaving, setIsSaving] = React.useState(false)

  const handlePreviewFile = React.useCallback(async (filePath: string) => {
    setIsEditing(false)
    setEditContent('')
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await window.dogeAPI.readFile(filePath)
      if (result.success) {
        setPreviewFile({ path: filePath, content: result.content || '', size: result.size })
      } else {
        setPreviewError(result.error || '无法读取文件')
        setPreviewFile(null)
      }
    } catch {
      setPreviewError('读取文件失败')
      setPreviewFile(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const handleStartEdit = React.useCallback(() => {
    if (previewFile) {
      setEditContent(previewFile.content)
      setIsEditing(true)
    }
  }, [previewFile])

  const handleSaveEdit = React.useCallback(async () => {
    if (!previewFile || isSaving) return
    setIsSaving(true)
    try {
      const result = await window.dogeAPI.writeFile(previewFile.path, editContent)
      if (result.success) {
        setPreviewFile(prev => prev ? { ...prev, content: editContent } : null)
        setIsEditing(false)
        setEditContent('')
      } else {
        setPreviewError(result.error || '保存失败')
      }
    } catch {
      setPreviewError('保存文件失败')
    } finally {
      setIsSaving(false)
    }
  }, [previewFile, editContent, isSaving])

  const handleCancelEdit = React.useCallback(() => {
    setIsEditing(false)
    setEditContent('')
  }, [])
  const [showCommandPalette, setShowCommandPalette] = React.useState(false)
  const [modelInfo, setModelInfo] = React.useState<{ provider: string; model: string; baseUrl: string; hasApiKey: boolean } | null>(null)
  const [tokenUsage, setTokenUsage] = React.useState<{ inputTokens: number; outputTokens: number; totalTokens: number; lastResponseLength: number; messageCount: number } | null>(null)
  const [themeSettings, setThemeSettings] = React.useState<{ theme: string; fontSize: number; fontFamily: string; sidebarWidth: number; rightPanelWidth: number }>({ theme: 'dark', fontSize: 13, fontFamily: 'system', sidebarWidth: 260, rightPanelWidth: 280 })
  const [showSettings, setShowSettings] = React.useState(false)
  const [editProvider, setEditProvider] = React.useState('')
  const [editModel, setEditModel] = React.useState('')
  const [editApiKey, setEditApiKey] = React.useState('')
  const [editBaseUrl, setEditBaseUrl] = React.useState('')
  const [savingConfig, setSavingConfig] = React.useState(false)
  const [sessions, setSessions] = React.useState<Array<{ id: string; createdAt: string; messageCount: number }>>([])
  const [showSessions, setShowSessions] = React.useState(false)
  const [toast, setToast] = React.useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null)
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  // ─── 多 Tab 会话管理 ───
  interface AppTab {
    id: string
    sessionId: string
    title: string
    messages: Message[]
  }
  const [tabs, setTabs] = React.useState<AppTab[]>([])
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null)
  const tabIdCounter = React.useRef(0)

  // 切换到指定 tab（同步 messages 到本地状态）
  const switchTab = React.useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      setActiveTabId(tabId)
      setMessages(tab.messages)
      setCurrentStreaming('')
      setError(null)
    }
  }, [tabs])

  // 将当前 messages 保存回 tabs
  const saveMessagesToTab = React.useCallback((msgs: Message[]) => {
    if (!activeTabId) return
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, messages: msgs } : t))
  }, [activeTabId])

  // persistActiveTabMessages 别名（供 handleSend/handleClear 使用）
  const persistActiveTabMessages = React.useCallback((msgs: Message[]) => {
    saveMessagesToTab(msgs)
  }, [saveMessagesToTab])

  // 根据第一条用户消息自动更新 Tab 标题
  const titleUpdatedRef = React.useRef<Set<string>>(new Set())
  React.useEffect(() => {
    if (!activeTabId) return
    // 如果该 tab 标题已经更新过，跳过
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

  // Tab 数据持久化（localStorage）
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('doge-tabs')
      if (saved && tabs.length === 0) {
        const parsed = JSON.parse(saved) as AppTab[]
        if (parsed.length > 0) {
          setTabs(parsed)
          setActiveTabId(parsed[0].id)
          setMessages(parsed[0].messages)
          tabIdCounter.current = parsed.length
        }
      }
    } catch { /* ignore */ }
  }, [])

  React.useEffect(() => {
    try { localStorage.setItem('doge-tabs', JSON.stringify(tabs)) } catch { /* ignore */ }
  }, [tabs])

  const showToast = React.useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null }, 3000)
  }, [])

  // textarea 自动高度
  React.useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(200, Math.max(44, el.scrollHeight)) + 'px'
  }, [input])

  React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, currentStreaming])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setShowCommandPalette(p => !p)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

  // 加载模型信息
  React.useEffect(() => {
    async function loadModelInfo() {
      try {
        const info = await window.dogeAPI.getModelInfo()
        setModelInfo(info)
      } catch { /* ignore */ }
    }
    loadModelInfo()
  }, [])

  // 定期刷新 Token 使用量
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const usage = await window.dogeAPI.getTokenUsage()
        setTokenUsage(usage)
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // 加载主题设置
  React.useEffect(() => {
    async function loadTheme() {
      try {
        const theme = await window.dogeAPI.getTheme()
        setThemeSettings(theme)
      } catch { /* ignore */ }
    }
    loadTheme()
  }, [])

  // 初始化配置编辑字段
  React.useEffect(() => {
    if (modelInfo) {
      setEditProvider(modelInfo.provider)
      setEditModel(modelInfo.model)
      setEditApiKey(modelInfo.hasApiKey ? '***' : '')
      setEditBaseUrl(modelInfo.baseUrl || '')
    }
  }, [modelInfo])

  // 加载历史会话列表
  const loadSessions = React.useCallback(async () => {
    try {
      const result = await window.dogeAPI.listSessions()
      if (Array.isArray(result)) setSessions(result)
    } catch { /* ignore */ }
  }, [])

  const handleNewSession = React.useCallback(async () => {
    await window.dogeAPI.newSession()
    const sid = await window.dogeAPI.getCurrentSessionId()
    // 创建新 tab
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

  // 初始化时加载当前会话 ID
  React.useEffect(() => {
    window.dogeAPI.getCurrentSessionId().then(sid => setCurrentSessionId(sid))
  }, [])

  // 应用启动时创建默认 Tab
  React.useEffect(() => {
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

  // 保存 history 的 ref，用于初始化
  const historyRef = React.useRef<Message[]>([])
  React.useEffect(() => { historyRef.current = messages }, [messages])

  const handleLoadSession = React.useCallback(async (sessionId: string) => {
    const result = await window.dogeAPI.loadSession(sessionId)
    if (result.success) {
      const history = await window.dogeAPI.getHistory()
      const loadedMessages = history.messages?.length
        ? history.messages.map((m, i) => ({ id: `history-${i}`, role: m.role as Message['role'], content: m.content }))
        : []
      setMessages(loadedMessages)
      setCurrentSessionId(sessionId)
      // 同步到当前 tab
      if (activeTabId) {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sessionId, messages: loadedMessages } : t))
      }
      setShowSessions(false)
      window.dogeAPI.notify('Doge Code', `已加载会话 (${result.messageCount} 条消息)`)
    } else {
      alert(result.error || '加载失败')
    }
  }, [activeTabId])

  const handleDeleteSession = React.useCallback(async (sessionId: string) => {
    const result = await window.dogeAPI.deleteSession(sessionId)
    if (result.success) {
      setSessions(p => p.filter(s => s.id !== sessionId))
      showToast('会话已删除', 'success')
    } else {
      alert(result.error || '删除失败')
    }
  }, [showToast])

  const handleSaveConfig = React.useCallback(async () => {
    setSavingConfig(true)
    try {
      const apiKeyValue = editApiKey === '***' ? '' : editApiKey
      const result = await window.dogeAPI.updateConfig({
        provider: editProvider,
        model: editModel,
        apiKey: apiKeyValue,
        baseUrl: editBaseUrl,
      })
      if (result.success) {
        showToast('配置已保存', 'success')
        setConfig(p => ({ ...p, provider: editProvider, model: editModel }))
      } else {
        alert(result.error || '保存失败')
      }
    } catch {
      alert('保存失败')
    } finally {
      setSavingConfig(false)
    }
  }, [editProvider, editModel, editApiKey, editBaseUrl, showToast])

  // 新建 Tab
  const handleNewTab = React.useCallback(async () => {
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

  // 关闭 Tab
  const handleCloseTab = React.useCallback(async (tabId: string) => {
    const idx = tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    const remaining = tabs.filter(t => t.id !== tabId)

    if (tabId === activeTabId) {
      if (remaining.length > 0) {
        const newActive = remaining[Math.min(idx, remaining.length - 1)]
        switchTab(newActive.id)
      } else {
        // 关闭最后一个 tab，自动创建新会话
        await handleNewTab()
        return
      }
    }
    setTabs(remaining)
  }, [tabs, activeTabId, switchTab, handleNewTab])

  React.useEffect(() => { loadSessions() }, [loadSessions])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSend = React.useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (!text || state === 'responding') return
    setInput(''); setError(null); setCurrentStreaming('')

    const appendMsg = (msg: Message) => {
      setMessages(prev => {
        const next = [...prev, msg]
        persistActiveTabMessages(next)
        return next
      })
    }

    // 命令模式：以 / 开头
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
      const assistantMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: result.success ? (result.output || '(无输出)') : `错误: ${result.error}`
      }
      appendMsg(assistantMsg)
      setState('idle')
      return
    }

    // 普通对话
    const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text }
    appendMsg(userMsg)

    setState('responding')

    let result: { success?: boolean; content?: string; error?: string } | null = null
    try {
      result = await window.dogeAPI.sendMessage(text)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '发送失败'
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'error', content: errMsg })
      setState('idle')
      return
    }

    if (result?.error) {
      appendMsg({ id: `msg-${Date.now() + 1}`, role: 'error', content: result.error! })
    } else if (result?.content) {
      const assistantMsg: Message = { id: `msg-${Date.now() + 1}`, role: 'assistant', content: result.content }
      appendMsg(assistantMsg)
    }
    setCurrentStreaming('')
    setState('idle')
  }, [input, state, persistActiveTabMessages])

  const handleAbort = React.useCallback(async () => { await window.dogeAPI.abort(); setCurrentStreaming('') }, [])
  const handleClear = React.useCallback(async () => { await window.dogeAPI.clearHistory(); setMessages([]); persistActiveTabMessages([]); setCurrentStreaming('') }, [persistActiveTabMessages])

  const handleCommit = React.useCallback(async () => {
    if (!commitMessage.trim() || isCommitting) return
    setIsCommitting(true)
    const result = await window.dogeAPI.gitCommit(config.workingDir, commitMessage.trim())
    if (!result.success) alert(result.error || '提交失败')
    else { setCommitMessage(''); setSelectedGitFile(null) }
    setIsCommitting(false)
  }, [commitMessage, isCommitting, config.workingDir])

  // 输入历史导航
  const historyIndexRef = React.useRef(-1)
  const [historyDraft, setHistoryDraft] = React.useState('')

  React.useEffect(() => { historyIndexRef.current = -1 }, [messages])

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
  const [completions, setCompletions] = React.useState<{ text: string; display: string }[]>([])
  const [completionIndex, setCompletionIndex] = React.useState(0)
  const completionIndexRef = React.useRef(0)

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const value = input.trim()
      if (!value) return

      // 获取补全候选
      const lastWord = value.split(/\s+/).pop() || ''
      if (!lastWord) return

      let candidates: { text: string; display: string }[] = []

      // 命令补全（以 / 开头）
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
        // 文件路径补全
        const parts = value.split(/[\s/]+/)
        const partialFile = parts.pop() || ''
        if (partialFile && !partialFile.includes('*')) {
          window.dogeAPI.listDir(config.workingDir || '').then((items: Array<{ name: string; isDirectory: boolean }>) => {
            const matches = items
              .filter((item: { name: string; isDirectory: boolean }) => item.name.toLowerCase().includes(partialFile.toLowerCase()))
              .slice(0, 10)
              .map((item: { name: string; isDirectory: boolean }) => ({
                text: item.name,
                display: item.isDirectory ? `${item.name}/` : item.name
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
      e.preventDefault()
      navigateHistory('up')
    } else if (e.key === 'ArrowDown' && !e.shiftKey && e.ctrlKey === false) {
      e.preventDefault()
      navigateHistory('down')
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault()
      const inputEl = e.currentTarget
      inputEl.scrollTop = Math.max(0, inputEl.scrollTop - 40)
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault()
      const inputEl = e.currentTarget
      inputEl.scrollTop = Math.min(inputEl.scrollHeight, inputEl.scrollTop + 40)
    }
  }, [handleSend, handleAbort, state, messages, input, config.workingDir])

  if (!loaded) return <div style={{ ...styles.loadingOverlay }}>加载中...</div>
  const isProcessing = state === 'responding'
  const workingDir = config.workingDir || '/'
  const displayMessages = messages

  return (
    <div style={styles.container}>
      {toast && (
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', padding: '8px 20px', borderRadius: '6px', background: toast.type === 'error' ? '#5C2A2A' : '#1A3A2A', color: toast.type === 'error' ? '#FF6B6B' : '#4ECB71', fontSize: '12px', fontWeight: 600, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transition: 'opacity 0.3s' }}>
          {toast.text}
        </div>
      )}
      {/* Tab 栏 */}
      <div style={{ display: 'flex', background: '#0F0F0F', borderBottom: '1px solid #1A1A1A', minHeight: '32px', alignItems: 'stretch', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px',
              cursor: 'pointer', fontSize: '12px', borderRight: '1px solid #1A1A1A',
              background: tab.id === activeTabId ? '#1A1A1A' : 'transparent',
              color: tab.id === activeTabId ? '#F5F5F5' : '#555',
              whiteSpace: 'nowrap', minWidth: 0, maxWidth: '180px'
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{tab.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
              style={{ cursor: 'pointer', fontSize: '10px', color: '#555', padding: '0 2px', borderRadius: '2px', flexShrink: 0 }}
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
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={{ fontSize: '18px' }}>{'🐕'}</span>
          <span style={{ flex: 1 }}>Doge Code</span>
          <span style={{ cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #262626', color: '#888' }} onClick={() => setShowSettings(p => !p)}>⚙</span>
        </div>
        <div style={{ padding: '8px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={styles.modelBadge}>{config.provider}</span>
          <span style={styles.modelBadge}>{config.model}</span>
          <span style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: '10px', color: '#555', padding: '2px 6px', border: '1px solid #262626', borderRadius: '3px' }} onClick={() => setShowSessions(p => !p)}>会话 ▼</span>
        </div>
        {/* 会话下拉列表 */}
        {showSessions && (
          <div style={{ borderBottom: '1px solid #262626', maxHeight: '300px', overflowY: 'auto', background: '#0F0F0F' }}>
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #262626', display: 'flex', gap: '6px' }}>
              <button onClick={handleNewSession} style={{ flex: 1, padding: '4px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#4ECB71', cursor: 'pointer', fontSize: '10px' }}>+ 新会话</button>
              <button onClick={loadSessions} style={{ flex: 1, padding: '4px', border: '1px solid #262626', borderRadius: '3px', background: '#0A0A0A', color: '#888', cursor: 'pointer', fontSize: '10px' }}>刷新</button>
            </div>
            {sessions.length === 0 ? (
              <div style={{ padding: '8px 12px', color: '#555', fontSize: '11px' }}>无历史会话</div>
            ) : (
              sessions.slice(0, 15).map((s) => (
                <div key={s.id} onClick={() => handleLoadSession(s.id)} style={{ padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #1A1A1A', cursor: 'pointer', color: '#888' }} title={`${s.messageCount} 条消息 · 点击加载，✕ 删除`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', flex: 1 }}>{s.id}</div>
                    <span style={{ color: '#555', fontSize: '10px', cursor: 'pointer', padding: '1px 4px', borderRadius: '2px', border: '1px solid #262626' }} onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id) }}>✕</span>
                  </div>
                  <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>{new Date(s.createdAt).toLocaleString()} · {s.messageCount} 条</div>
                </div>
              ))
            )}
          </div>
        )}
        {/* 设置面板 */}
        {showSettings && (
          <div style={{ borderBottom: '1px solid #262626', padding: '12px', background: '#0F0F0F' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>主题设置</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {['dark', 'light', 'auto'].map((t) => (
                <button key={t} onClick={async () => { await window.dogeAPI.setTheme({ theme: t }); setThemeSettings(p => ({ ...p, theme: t })) }} style={{ flex: 1, padding: '4px', border: '1px solid', borderColor: themeSettings.theme === t ? '#4ECB71' : '#262626', borderRadius: '3px', background: themeSettings.theme === t ? 'rgba(78,203,113,0.1)' : '#0A0A0A', color: themeSettings.theme === t ? '#4ECB71' : '#888', cursor: 'pointer', fontSize: '10px', textTransform: 'capitalize' }}>
                  {t === 'auto' ? '自动' : t === 'dark' ? '深色' : '浅色'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '4px' }}>字体大小: {themeSettings.fontSize}px</div>
            <input type="range" min="11" max="18" value={themeSettings.fontSize} onChange={(e) => { const v = Number(e.target.value); setThemeSettings(p => ({ ...p, fontSize: v })); window.dogeAPI.setTheme({ fontSize: v }) }} style={{ width: '100%', accentColor: '#4ECB71' }} />
            <div style={{ borderTop: '1px solid #262626', marginTop: '12px', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>模型配置</div>
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>提供商</div>
                <select value={editProvider} onChange={(e) => setEditProvider(e.target.value)} style={{ width: '100%', padding: '4px 6px', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '11px', outline: 'none' }}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>模型</div>
                <input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="gpt-4o" style={{ width: '100%', padding: '4px 6px', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '11px', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>API Key</div>
                <input value={editApiKey} onChange={(e) => setEditApiKey(e.target.value)} type="password" placeholder="sk-..." style={{ width: '100%', padding: '4px 6px', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '11px', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>Base URL</div>
                <input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" style={{ width: '100%', padding: '4px 6px', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '3px', color: '#F5F5F5', fontSize: '11px', outline: 'none' }} />
              </div>
              <button onClick={handleSaveConfig} disabled={savingConfig} style={{ width: '100%', padding: '5px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: (!savingConfig) ? '#4ECB71' : '#1A1A1A', color: (!savingConfig) ? '#000' : '#555', fontSize: '11px', fontWeight: 600 }}>
                {savingConfig ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {displayMessages.length === 0 && !currentStreaming ? (
            <div style={{ padding: '16px', color: '#555555', fontSize: '12px' }}>开始新对话</div>
          ) : (
            displayMessages.map((m) => (
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: isProcessing ? '#4ECB71' : '#666' }}>{isProcessing ? '● 回复中' : '○ 就绪'}</span>
            {tokenUsage && tokenUsage.totalTokens > 0 && (
              <span style={{ color: '#555' }}>Token: {tokenUsage.totalTokens.toLocaleString()}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {displayMessages.length > 0 && (
              <button style={styles.clearButton} onClick={handleClear}>清除</button>
            )}
          </div>
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
              {messages.map((m) => {
                if (m.role === 'error') {
                  return (
                    <div key={m.id} style={styles.errorBubble}>
                      <div style={styles.roleLabel}>错误</div>
                      <div>{m.content}</div>
                    </div>
                  )
                }
                const isAssistant = m.role === 'assistant'
                const isTool = m.role === 'tool'
                const blocks = isAssistant ? parseMessageContent(m.content) : null

                let toolResultContent: { success?: boolean; output?: unknown; error?: string } | null = null
                if (isTool) {
                  try { toolResultContent = JSON.parse(m.content) } catch { /* not JSON */ }
                }

                return (
                <div key={m.id} style={{ ...styles.messageBubble, ...(m.role === 'user' ? styles.userBubble : isTool ? styles.toolResultBubble : styles.assistantBubble) }}>
                  <div style={styles.roleLabel}>{m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role === 'tool' ? '🔧 工具结果' : '系统'}</div>
                  {isTool && toolResultContent
                    ? (
                        <div>
                          {toolResultContent.success != null && (
                            <div style={{ color: toolResultContent.success ? '#4ECB71' : '#FF6B6B', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                              {toolResultContent.success ? '✓ 执行成功' : '✗ 执行失败'}
                            </div>
                          )}
                          {toolResultContent.error && (
                            <div style={{ color: '#FF6B6B', fontSize: '12px', marginBottom: '4px' }}>{toolResultContent.error}</div>
                          )}
                          {toolResultContent.output != null && (
                            <pre style={{ margin: 0, fontSize: '11px', color: '#ccc', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace', lineHeight: 1.5 }}>
                              {typeof toolResultContent.output === 'string' ? toolResultContent.output : JSON.stringify(toolResultContent.output, null, 2)}
                            </pre>
                          )}
                        </div>
                      )
                    : blocks
                      ? blocks.map((block, i) => {
                          if (block.type === 'tool_use') {
                            return <div key={i} dangerouslySetInnerHTML={{ __html: renderToolUseBlock(block) }} />
                          }
                          return <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }} />
                        })
                      : <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, '<br/>') }} />
                  }
                </div>
              )})}
              {currentStreaming && (
                <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
                  <div style={styles.roleLabel}>助手</div>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(currentStreaming) }} />
                  <div style={styles.thinkingIndicator}>...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div style={styles.chatInput}>
          <form onSubmit={(e) => { e.preventDefault(); isProcessing ? handleAbort() : handleSend() }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isProcessing ? '按 Enter 中断... (Shift+Enter 换行)' : '输入消息... (Enter 发送, Shift+Enter 换行, ↑↓ 历史导航)'}
              style={{
                ...styles.inputBox,
                minHeight: '44px',
                maxHeight: '200px',
                resize: 'none',
                overflowY: 'auto',
                lineHeight: '1.5',
                fontFamily: 'inherit',
                fontSize: `${themeSettings.fontSize}px`
              }}
              disabled={!config.apiKey}
              autoFocus
              rows={1}
            />
          </form>
          {!config.apiKey && (
            <div style={{ color: '#FF6B6B', fontSize: '11px', marginTop: '6px' }}>
              未配置 API Key。请在 .doge/api.json 中配置。
            </div>
          )}
        </div>
      </div>

      {/* 右栏：文件树 + Git 变更 + 工具面板 */}
      <div style={styles.rightPanel}>
        <div style={styles.panelHeader}>📁 文件树</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <FileTree cwd={workingDir} onPreviewFile={handlePreviewFile} />
        </div>

        {/* 文件预览面板 */}
        {previewFile && (
          <div style={{ ...styles.panelHeader, borderTop: '1px solid #262626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{isEditing ? '✏️ 编辑中' : '👁️'} {previewFile.path.split('/').pop()}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {isEditing ? (
                <>
                  <span style={{ cursor: 'pointer', color: '#4ECB71', fontSize: '11px' }} onClick={handleSaveEdit}>{isSaving ? '保存中...' : '💾 保存'}</span>
                  <span style={{ cursor: 'pointer', color: '#555', fontSize: '11px' }} onClick={handleCancelEdit}>✕ 取消</span>
                </>
              ) : (
                <>
                  <span style={{ cursor: 'pointer', color: '#569CD6', fontSize: '11px' }} onClick={handleStartEdit}>✏️ 编辑</span>
                  <span style={{ cursor: 'pointer', color: '#555', fontSize: '11px' }} onClick={() => setPreviewFile(null)}>✕ 关闭</span>
                </>
              )}
            </div>
          </div>
        )}
        {(previewFile || previewLoading) && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px', borderBottom: '1px solid #262626', maxHeight: previewFile ? '50%' : '40px' }}>
            {previewLoading && <div style={{ color: '#888', fontSize: '11px', textAlign: 'center' }}>加载中...</div>}
            {previewError && <div style={{ color: '#FF6B6B', fontSize: '11px' }}>{previewError}</div>}
            {previewFile && (
              <div>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>
                  {previewFile.path} {previewFile.size != null ? `(${(previewFile.size / 1024).toFixed(1)} KB)` : ''}
                </div>
                {isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{
                      width: '100%', minHeight: '200px', background: '#0A0A0A', border: '1px solid #569CD6',
                      borderRadius: '4px', padding: '8px', color: '#D4D4D4', fontSize: '11px',
                      fontFamily: 'Consolas, Monaco, monospace', lineHeight: '1.5', resize: 'vertical',
                      outline: 'none', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        handleSaveEdit()
                      }
                    }}
                  />
                ) : (
                  <pre style={{
                    background: '#0A0A0A', border: '1px solid #262626', borderRadius: '4px', padding: '8px',
                    fontSize: '11px', lineHeight: '1.5', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    color: '#D4D4D4', margin: 0, maxHeight: '300px', overflowY: 'auto'
                  }}>
                    {previewFile.content || '(空文件)'}
                  </pre>
                )}
              </div>
            )}
          </div>
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
              {/* 提交输入框 */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid #262626' }}>
                <input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="提交信息..."
                  style={{
                    width: '100%', backgroundColor: '#0F0F0F', border: '1px solid #262626', borderRadius: '4px',
                    padding: '6px 10px', color: '#F5F5F5', fontSize: '12px', outline: 'none', marginBottom: '6px'
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit() } }}
                />
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || isCommitting}
                  style={{
                    width: '100%', padding: '6px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    background: commitMessage.trim() ? '#4ECB71' : '#1A1A1A',
                    color: commitMessage.trim() ? '#000' : '#555',
                    fontSize: '12px', fontWeight: 600
                  }}
                >
                  {isCommitting ? '提交中...' : '提交'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div style={{ ...styles.panelHeader, borderTop: '1px solid #262626' }}>🔧 工具</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <ToolPanel cwd={workingDir} />
        </div>
      </div>
      {showCommandPalette && <CommandPalette cwd={workingDir} onClose={() => setShowCommandPalette(false)} />}
    </div>
  )
}

// ─── 启动 ───
async function main(): Promise<void> {
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
