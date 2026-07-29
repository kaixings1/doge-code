/**
 * Diff 语法高亮渲染组件
 */

import React, { useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface HighlightedDiffProps {
  diffText: string
  theme: ThemeColors
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

function highlightCode(text: string, lang: string, isDark: boolean, colors: ThemeColors): string {
  const c = colors
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const kwColor = isDark ? '#569CD6' : '#0000FF'
  const strColor = isDark ? '#CE9178' : '#A31515'
  const numColor = isDark ? '#B5CEA8' : '#098658'
  const cmtColor = isDark ? '#6A9955' : '#008000'
  html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, '<span style="color:' + kwColor + '">$1</span>')
  html = html.replace(/(['"`'])(?:(?!\1|\\)|\\.)*?\1/g, '<span style="color:' + strColor + '">$&</span>')
  html = html.replace(/\b(\d+)\b/g, '<span style="color:' + numColor + '">$1</span>')
  html = html.replace(/(\/\/.*)$/gm, '<span style="color:' + cmtColor + '">$1</span>')
  return html
}

export function HighlightedDiff({ diffText, theme }: HighlightedDiffProps) {
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

  const isDark = theme.bg === '#000000'
  const lang = detectLang(diffText)

  const highlightSyntax = (text: string): string => {
    if (lang) {
      const highlighted = highlightCode(text, lang, isDark, theme)
      if (highlighted !== text) return highlighted
    }
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const kwColor = isDark ? '#569CD6' : '#0000FF'
    const strColor = isDark ? '#CE9178' : '#A31515'
    const numColor = isDark ? '#B5CEA8' : '#098658'
    const cmtColor = isDark ? '#6A9955' : '#008000'
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, '<span style="color:' + kwColor + '">$1</span>')
    html = html.replace(/(['"`'])(?:(?!\1|\\)|\\.)*?\1/g, '<span style="color:' + strColor + '">$&</span>')
    html = html.replace(/\b(\d+)\b/g, '<span style="color:' + numColor + '">$1</span>')
    html = html.replace(/(\/\/.*)$/gm, '<span style="color:' + cmtColor + '">$1</span>')
    return html
  }

  const baseFontSize = isDark ? '11px' : '11px'
  const lineNumColor = isDark ? '#555555' : '#999999'
  const textColor = isDark ? '#abb2bf' : '#1A1A1A'
  const addBg = isDark ? 'rgba(78,203,113,0.1)' : 'rgba(0,102,204,0.08)'
  const addText = isDark ? '#98C379' : '#0066CC'
  const delBg = isDark ? 'rgba(255,107,107,0.1)' : 'rgba(204,0,0,0.08)'
  const delText = isDark ? '#E06C75' : '#CC0000'
  const hunkColor = isDark ? '#56B6C2' : '#0066CC'
  const metaColor = isDark ? '#5C6370' : '#999999'
  const borderColor = isDark ? '#1A1A1A' : '#E0E0E0'

  return (
    <div style={{ display: 'flex', fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace", fontSize: baseFontSize, lineHeight: '1.5' }}>
      <div style={{ color: lineNumColor, textAlign: 'right', paddingRight: '8px', userSelect: 'none', minWidth: '36px', borderRight: `1px solid ${borderColor}` }}>
        {lineNumbers.map((num, i) => (
          <div key={i} style={{ height: '1.5em' }}>{num}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflowX: 'auto', whiteSpace: 'pre' }}>
        {lines.map((line, i) => {
          let bgColor = 'transparent'
          let lineTextColor = textColor
          if (line.startsWith('+') && !line.startsWith('+++')) { bgColor = addBg; lineTextColor = addText }
          else if (line.startsWith('-') && !line.startsWith('---')) { bgColor = delBg; lineTextColor = delText }
          else if (line.startsWith('@@')) { lineTextColor = hunkColor }
          else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) { lineTextColor = metaColor }

          return (
            <div key={i} style={{ background: bgColor, padding: '0 4px' }}>
              <span dangerouslySetInnerHTML={{ __html: highlightSyntax(line) || ' ' }} style={{ color: lineTextColor }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
