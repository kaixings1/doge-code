/**
 * Diff 语法高亮渲染组件
 */

import React, { useEffect, useState } from 'react'

interface HighlightedDiffProps {
  diffText: string
}

function detectLang(text: string): string {
  const m = text.match(/diff --git \/.+\.(\w+)/)
  if (m) {
    const ext = m[1].toLowerCase()
    const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', css: 'css', scss: 'css', html: 'html', py: 'python', sh: 'bash', yaml: 'yaml', yml: 'yaml', rs: 'rust', md: 'markdown', sql: 'sql' }
    if (map[ext]) return map[ext]
  }
  const m2 = text.match(/^\+\+\+\s+\S+\/([^\/]+)$/m)
  if (m2) {
    const ext = m2[1].split('.').pop()?.toLowerCase() || ''
    const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', css: 'css', scss: 'css', html: 'html', py: 'python', sh: 'bash', yaml: 'yaml', yml: 'yaml', rs: 'rust', md: 'markdown', sql: 'sql' }
    if (map[ext]) return map[ext]
  }
  return ''
}

function highlightCode(text: string, lang: string): string {
  // 简化的语法高亮 - 实际项目中可以使用 highlight.js 或 prism.js
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, '<span style="color:#C678DD">$1</span>')
  html = html.replace(/(['"`'])(?:(?!\1|\\)|\\.)*?\1/g, '<span style="color:#98C379">$&</span>')
  html = html.replace(/\b(\d+)\b/g, '<span style="color:#D19A66">$1</span>')
  html = html.replace(/(\/\/.*)$/gm, '<span style="color:#5C6370">$1</span>')
  return html
}

export function HighlightedDiff({ diffText }: HighlightedDiffProps) {
  const lines = diffText.split('\n')
  const [lineNumbers, setLineNumbers] = useState<number[]>([])

  useEffect(() => {
    const nums: number[] = []
    let line = 0
    for (const l of lines) {
      line++
      nums.push(line)
    }
    setLineNumbers(nums)
  }, [diffText])

  const lang = detectLang(diffText)

  const highlightSyntax = (text: string): string => {
    if (lang) {
      const highlighted = highlightCode(text, lang)
      if (highlighted !== text) return highlighted
    }
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, '<span style="color:#C678DD">$1</span>')
    html = html.replace(/(['"`'])(?:(?!\1|\\)|\\.)*?\1/g, '<span style="color:#98C379">$&</span>')
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
