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

function highlightCode(text: string, lang: string, colors: ThemeColors): string {
  const isDark = colors.bg === '#000000'
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const kwColor = colors.accent
  const strColor = colors.accent
  const numColor = colors.accent
  const cmtColor = colors.textMuted
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

  
  const lang = detectLang(diffText)

  const highlightSyntax = (text: string): string => {
    if (lang) {
      const highlighted = highlightCode(text, lang, theme)
      if (highlighted !== text) return highlighted
    }
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const kwColor = theme.accent
    const strColor = theme.accent
    const numColor = theme.accent
    const cmtColor = theme.textMuted
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, '<span style="color:' + kwColor + '">$1</span>')
    html = html.replace(/(['"`'])(?:(?!\1|\\)|\\.)*?\1/g, '<span style="color:' + strColor + '">$&</span>')
    html = html.replace(/\b(\d+)\b/g, '<span style="color:' + numColor + '">$1</span>')
    html = html.replace(/(\/\/.*)$/gm, '<span style="color:' + cmtColor + '">$1</span>')
    return html
  }

  const baseFontSize = '11px'
  const lineNumColor = theme.textFaint
  const textColor = theme.textMuted
  const addBg = theme.accentDim
  const addText = theme.accent
  const delBg = theme.errorBg
  const delText = theme.errorText
  const hunkColor = theme.accent
  const metaColor = theme.textFaint
  const borderColor = theme.borderSubtle

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

