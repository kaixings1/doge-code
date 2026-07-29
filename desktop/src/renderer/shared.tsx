/**
 * shared.tsx — 渲染进程共享类型和组件
 *
 * 包含消息类型定义、内容解析函数、Markdown 渲染函数等，
 * 供 App.tsx 和其他组件共享使用。
 */

import React from 'react'

// ─── 消息内容块类型 ───
export interface TextBlock { type: 'text'; text: string }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export interface ThinkingBlock { type: 'thinking'; text: string; signature?: string }
export interface ImageBlock { type: 'image'; url: string; alt?: string }
export type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock | ImageBlock

// ─── 数据模型 ───
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool'
  content: string
}

// ─── 消息内容解析：将 assistant 消息拆分为文本块 + 工具调用块 ───
export function parseMessageContent(content: string): ContentBlock[] {
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

// ─── 轻量语法高亮 ───
function highlightCode(code: string, lang: string, isDark: boolean = true): string {
  const c = { string: isDark ? '#CE9178' : '#A31515', keyword: isDark ? '#569CD6' : '#0000FF', number: isDark ? '#B5CEA8' : '#098658', comment: isDark ? '#6A9955' : '#008000', property: isDark ? '#9CDCFE' : '#001080' }
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
  } else if (['python', 'py'].includes(lang)) {
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
  } else if (['rust', 'rs'].includes(lang)) {
    result = result.replace(/\b(fn|let|mut|pub|struct|enum|impl|trait|use|mod|where|for|in|if|else|match|return|loop|while|break|continue|move|async|await|unsafe|dyn|type|const|static|ref|self|super|crate|true|false|Some|None|Ok|Err|Result|Option|Vec|String|Box|Rc|Arc)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
    result = result.replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/\/\/[^\n]*/g, '<span style="color:' + c.comment + '">$&</span>')
  }

  return result
}

// ─── 轻量 Markdown 渲染器 ───
export function renderMarkdown(text: string, isDark: boolean = true): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 代码块（带语法高亮 + 复制按钮）
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const rawCode = code.trim()
    const highlighted = highlightCode(rawCode, lang.toLowerCase(), isDark)
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

// ─── 内联工具调用块 ───
export function InlineToolUseBlock({ block, onExecute, executingIds }: { block: ToolUseBlock; onExecute: (block: ToolUseBlock) => void; executingIds: Set<string> }) {
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
