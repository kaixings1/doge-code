/**
 * MarkdownRenderer — 共享 Markdown 渲染组件
 *
 * 从 App.tsx 和 ToolPanel.tsx 中提取的共享渲染逻辑，
 * 支持代码块语法高亮、JSON 格式化、列表、标题、链接等。
 */

import React, { useMemo, useContext } from 'react'
import { ThemeContext } from '../App.js'

// ─── 语言检测 ───
function detectLanguage(code: string): string {
  const trimmed = code.trim()
  if (!trimmed) return ''

  // JSON 检测
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.includes(':')) return 'json'

  // 代码特征检测
  if (/^(import|export|const|let|var|function|class|interface|type)\s/m.test(trimmed)) return 'typescript'
  if (/#!\/bin\/(bash|sh)/.test(trimmed) || /^(echo|cd|ls|rm|cp|mv|mkdir|cat|grep|find|git|npm|bun)\s/m.test(trimmed)) return 'bash'
  if (/^(def |class |import |from |if __name__)/m.test(trimmed)) return 'python'
  if (/^(package |import |func |type )/m.test(trimmed)) return 'go'
  if (/^(use |fn |let |mut |impl |pub )/m.test(trimmed)) return 'rust'
  if (/^(<!DOCTYPE|<html|<div|<span)/i.test(trimmed)) return 'html'
  if (/^(body|\.[\w-]+|#[\w-]+)\s*\{/m.test(trimmed)) return 'css'
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(trimmed)) return 'sql'
  if (/^(version:|services:|networks:|volumes:)/m.test(trimmed)) return 'yaml'

  return ''
}

// ─── 语法高亮 ───
function highlightCode(code: string, lang: string, colors: {
  string: string; keyword: string; number: string; comment: string; property: string
}): string {
  const c = colors
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
    result = result.replace(/\b(true|false|null)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
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
    result = result.replace(/\b(echo|cd|ls|rm|cp|mv|mkdir|cat|grep|find|sed|awk|git|npm|bun|node|export|source|sudo|chmod|chown|pwd|touch|head|tail|wc|sort|uniq|diff|tar|zip|curl|wget|if|then|else|fi|for|do|done|while|case|esac|function|return|exit)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
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
  } else if (lang === 'go') {
    result = result.replace(/\b(func|package|import|var|const|type|struct|interface|map|chan|go|defer|return|if|else|for|range|switch|case|default|break|continue|fallthrough|select|make|new|len|cap|append|copy|close|panic|recover|nil|true|false)\b/g, '<span style="color:' + c.keyword + '">$1</span>')
    result = result.replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:' + c.string + '">$1</span>')
    result = result.replace(/\/\/[^\n]*/g, '<span style="color:' + c.comment + '">$&</span>')
  }

  return result
}

// ─── JSON 格式化（尝试解析并美化） ───
function tryFormatJson(text: string): string | null {
  const trimmed = text.trim()
  if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(trimmed)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return null
    }
  }
  return null
}

// ─── 代码块复制功能 HTML ───
function renderCodeBlock(code: string, lang: string, colors: {
  string: string; keyword: string; number: string; comment: string; property: string
}, bg: string, border: string, langColor: string): string {
  const rawCode = code.trim()
  const highlighted = highlightCode(rawCode, lang.toLowerCase(), colors)
  const langLabel = lang ? '<span style="color:' + langColor + ';font-size:10px">' + lang + '</span>' : '<span></span>'
  const escaped = rawCode.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return '<div style="position:relative;margin:6px 0" data-code="' + escaped + '"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' + langLabel + '<button onclick="navigator.clipboard.writeText(this.closest(\'div\').parentElement.getAttribute(\'data-code\')).catch(()=>{})" style="background:' + border + ';border:1px solid ' + border + ';color:' + langColor + ';padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px">复制</button></div><pre style="background:' + bg + ';border:1px solid ' + border + ';border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:0"><code>' + highlighted + '</code></pre></div>'
}

// ─── 主渲染函数 ───
function renderMarkdown(text: string, colors: {
  text: string; bg: string; border: string; textMuted: string; accent: string
}): string {
  const textColor = colors.text
  const bgColor = colors.bg
  const langColor = colors.textMuted
  const synColors = { string: colors.accent, keyword: colors.accent, number: colors.accent, comment: colors.textMuted, property: colors.accent }
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 代码块（带语法高亮 + 复制按钮）
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => renderCodeBlock(code, lang, synColors, bgColor, colors.border, colors.textMuted))

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:' + bgColor + ';padding:1px 4px;border-radius:2px;font-size:12px;font-family:monospace;color:' + textColor + '">$1</code>')

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;color:' + textColor + ';margin:8px 0 4px">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:600;color:' + textColor + ';margin:10px 0 4px">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:600;color:' + textColor + ';margin:12px 0 4px">$1</h1>')

  // 粗体 & 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:' + textColor + '">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4ECB71;text-decoration:none" target="_blank" rel="noopener noreferrer">$1</a>')

  // 无序列表
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li style="margin-left:16px;list-style:disc">$2</li>')

  // 有序列表
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li style="margin-left:16px;list-style:decimal">$2</li>')

  // 换行
  html = html.replace(/\n/g, '<br/>')

  return html
}

// ─── 智能渲染：检测纯 JSON 并格式化 ───
function smartRender(content: string, colors: {
  string: string; keyword: string; number: string; comment: string; property: string; text: string; bg: string; border: string; textMuted: string; accent: string
}): string {
  // 尝试将整个内容作为 JSON 格式进行格式化
  const formatted = tryFormatJson(content)
  if (formatted !== null) {
    return renderCodeBlock(formatted, 'json', colors, colors.bg, colors.border, colors.textMuted)
  }

  // 检测内容中是否包含大量 JSON（多行 JSON 字符串）
  const lines = content.split('\n')
  if (lines.length > 2 && lines.every(l => {
    const t = l.trim()
    return t === '' || t.startsWith('{') || t.startsWith('"') || t.startsWith('}') || t.startsWith(']')
  })) {
    const combined = lines.filter(l => l.trim()).join('\n')
    const combinedFormatted = tryFormatJson(combined)
    if (combinedFormatted !== null) {
      return renderCodeBlock(combinedFormatted, 'json', colors, colors.bg, colors.border, colors.textMuted)
    }
  }

  // 否则使用 Markdown 渲染
  return renderMarkdown(content, colors)
}

// ─── React 组件 ───
interface MarkdownRendererProps {
  content: string
  /** 强制使用 Markdown 渲染（不自动检测 JSON） */
  forceMarkdown?: boolean
  /** 最大高度 */
  maxHeight?: number | string
  /** 额外样式 */
  style?: React.CSSProperties
  /** 自定义 className */
  className?: string
}

export function MarkdownRenderer({
  content,
  forceMarkdown = false,
  maxHeight = 'none',
  style = {},
  className = '',
}: MarkdownRendererProps): JSX.Element {
  const { colors } = useContext(ThemeContext)
  const html = useMemo(() => {
    const synColors = {
      string: colors.accent,
      keyword: colors.accent,
      number: colors.accent,
      comment: colors.textMuted,
      property: colors.accent,
    }
    const fullColors = { ...colors, ...synColors }
    if (forceMarkdown) return renderMarkdown(content, fullColors)
    return smartRender(content, fullColors)
  }, [content, forceMarkdown, colors])

  return (
    <div
      className={className}
      style={{
        fontSize: '12px',
        lineHeight: 1.6,
        color: '#D4D4D4',
        overflowX: 'auto',
        maxHeight,
        overflowY: maxHeight !== 'none' ? 'auto' : undefined,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ─── 工具结果专用渲染器 ───
interface ToolResultRendererProps {
  output: unknown
  error?: string
  success?: boolean
  maxHeight?: number | string
}

export function ToolResultRenderer({ output, error, success, maxHeight = 300 }: ToolResultRendererProps): JSX.Element {
  const { colors } = useContext(ThemeContext)

  const content = useMemo(() => {
    if (error) return error
    if (typeof output === 'string') return output
    if (output === null) return ''
    return JSON.stringify(output, null, 2)
  }, [output, error])

  // 检测是否为 JSON
  const isJson = useMemo(() => {
    if (typeof output === 'object' && output !== null) return true
    if (typeof output === 'string') {
      const t = output.trim()
      return (t.startsWith('{') || t.startsWith('[')) && tryFormatJson(t) !== null
    }
    return false
  }, [output])

  // 语法高亮颜色（使用主题 accent 色）
  const synColors: { string: string; keyword: string; number: string; comment: string; property: string } = {
    string: colors.accent,
    keyword: colors.accent,
    number: colors.accent,
    comment: colors.textMuted,
    property: colors.accent,
  }

  const html = useMemo(() => {
    if (isJson) {
      const formatted = typeof output === 'string' ? tryFormatJson(output)! : JSON.stringify(output, null, 2)
      return renderCodeBlock(formatted, 'json', synColors, colors.bg, colors.border, colors.textMuted)
    }
    return smartRender(content, { ...colors, ...synColors })
  }, [content, isJson, output, colors, synColors])

  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: isJson ? 'Consolas, Monaco, monospace' : 'inherit',
      whiteSpace: isJson ? 'pre' : 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: maxHeight + 'px',
      overflowY: 'auto',
      background: success === false ? 'rgba(255,107,107,0.05)' : 'rgba(78,203,113,0.03)',
      border: '1px solid ' + (success === false ? 'rgba(255,107,107,0.2)' : 'rgba(78,203,113,0.15)'),
      color: success === false ? '#FF6B6B' : '#D4D4D4',
      lineHeight: 1.5,
    }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// ─── 导出工具函数 ───
export { renderMarkdown, smartRender, highlightCode, detectLanguage, tryFormatJson }
