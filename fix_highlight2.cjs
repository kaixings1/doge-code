const fs = require('fs')
const path = 'D:/doge-code/desktop/src/renderer/components/MarkdownRenderer.tsx'
let content = fs.readFileSync(path, 'utf8')

// Fix 1: highlightCode - replace hardcoded colors with colors parameter
content = content.replace(
  'function highlightCode(code: string, lang: string, isDark = true): string {\n  const c = { string: isDark ? \'#CE9178\' : \'#A31515\', keyword: isDark ? \'#0000FF\' : \'#0000FF\', number: isDark ? \'#098658\' : \'#098658\', comment: isDark ? \'#008000\' : \'#008000\', property: isDark ? \'#001080\' : \'#001080\' }',
  'function highlightCode(code: string, lang: string, colors: { string: string; keyword: string; number: string; comment: string; property: string }): string {\n  const c = colors'
)

// Fix 2: renderCodeBlock - add colors parameter, pass to highlightCode
content = content.replace(
  'function renderCodeBlock(code: string, lang: string, isDark = true): string {\n  const c = { bg: isDark ? \'#0A0A0A\' : \'#F5F5F5\', border: isDark ? \'#262626\' : \'#E0E0E0\', lang: isDark ? \'#888888\' : \'#666666\' }\n  const rawCode = code.trim()\n  const highlighted = highlightCode(rawCode, lang.toLowerCase(), isDark)',
  'function renderCodeBlock(code: string, lang: string, colors: { string: string; keyword: string; number: string; comment: string; property: string }, bg: string, border: string, langColor: string): string {\n  const rawCode = code.trim()\n  const highlighted = highlightCode(rawCode, lang.toLowerCase(), colors)'
)

// Fix 3: renderCodeBlock return - use bg, border, langColor instead of c.bg, c.border, c.lang
content = content.replace(
  'const langLabel = lang ? `<span style=\"color:${c.lang};font-size:10px\">${lang}</span>` : \'<span></span>\'',
  'const langLabel = lang ? `<span style=\"color:${langColor};font-size:10px\">${lang}</span>` : \'<span></span>\''
)
content = content.replace(
  "style=\"background:${c.border};border:1px solid ${c.border};color:${c.lang};padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px\">复制</button></div><pre style=\"background:${c.bg};border:1px solid ${c.border};border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:0\"><code>${highlighted}</code></pre></div>`",
  "style=\"background:${border};border:1px solid ${border};color:${langColor};padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px\">复制</button></div><pre style=\"background:${bg};border:1px solid ${border};border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:0\"><code>${highlighted}</code></pre></div>`"
)

// Fix 4: renderMarkdown - add colors parameter, derive bg/text/langColor from colors
content = content.replace(
  'function renderMarkdown(text: string, isDark = true): string {\n  const textColor = isDark ? \'#F5F5F5\' : \'#1A1A1A\'\n  const bgColor = isDark ? \'#1A1A1A\' : \'#F5F5F5\'\n  const langColor = isDark ? \'#888888\' : \'#666666\'',
  'function renderMarkdown(text: string, colors: { text: string; bg: string; border: string; textMuted: string }): string {\n  const textColor = colors.text\n  const bgColor = colors.bg\n  const langColor = colors.textMuted'
)

// Fix 5: renderMarkdown calls to renderCodeBlock - pass colors and derived colors
content = content.replace(
  'html = html.replace(/```(\\w*)\\n?([\\s\\S]*?)```/g, (_, lang, code) => renderCodeBlock(code, lang, isDark))',
  'html = html.replace(/```(\\w*)\\n?([\\s\\S]*?)```/g, (_, lang, code) => renderCodeBlock(code, lang, colors, bgColor, colors.border, colors.textMuted))'
)

// Fix 6: smartRender - add colors parameter, pass to renderMarkdown and renderCodeBlock
content = content.replace(
  'function smartRender(content: string, isDark = true): string {\n  const formatted = tryFormatJson(content)\n  if (formatted !== null) {\n    return renderCodeBlock(formatted, \'json\', isDark)\n  }',
  'function smartRender(content: string, colors: { string: string; keyword: string; number: string; comment: string; property: string; text: string; bg: string; border: string; textMuted: string }): string {\n  const formatted = tryFormatJson(content)\n  if (formatted !== null) {\n    return renderCodeBlock(formatted, \'json\', colors, colors.bg, colors.border, colors.textMuted)\n  }'
)

// Fix 7: smartRender second renderCodeBlock call
content = content.replace(
  'return renderCodeBlock(combinedFormatted, \'json\', isDark)',
  'return renderCodeBlock(combinedFormatted, \'json\', colors, colors.bg, colors.border, colors.textMuted)'
)

// Fix 8: smartRender final return - pass colors to renderMarkdown
content = content.replace(
  'return renderMarkdown(content, isDark)\n}',
  'return renderMarkdown(content, colors)\n}'
)

// Fix 9: MarkdownRenderer component - pass colors object instead of isDark
content = content.replace(
  'const { name: effectiveTheme } = useContext(ThemeContext)\n  const isDark = effectiveTheme === \'dark\'',
  'const { colors } = useContext(ThemeContext)'
)

// Fix 10: MarkdownRenderer useMemo - pass colors instead of isDark
content = content.replace(
  'const html = useMemo(() => {\n    if (forceMarkdown) return renderMarkdown(content, isDark)\n    return smartRender(content, isDark)\n  }, [content, forceMarkdown, isDark])',
  'const html = useMemo(() => {\n    if (forceMarkdown) return renderMarkdown(content, colors)\n    return smartRender(content, colors)\n  }, [content, forceMarkdown, colors])'
)

// Fix 11: ToolResultRenderer - pass colors instead of isDark
content = content.replace(
  "if (isJson) {\n      const formatted = typeof output === 'string' ? tryFormatJson(output)! : JSON.stringify(output, null, 2)\n      return renderCodeBlock(formatted, 'json', isDark)\n    }\n    return smartRender(content, isDark)\n  }, [content, isJson, output, isDark])",
  "if (isJson) {\n      const formatted = typeof output === 'string' ? tryFormatJson(output)! : JSON.stringify(output, null, 2)\n      return renderCodeBlock(formatted, 'json', colors, colors.bg, colors.border, colors.textMuted)\n    }\n    return smartRender(content, colors)\n  }, [content, isJson, output, colors])"
)

// Fix 12: ToolResultRenderer - replace isDark with colors for undefined check
content = content.replace(
  "export function ToolResultRenderer({ output, error, success, maxHeight = 300 }: ToolResultRendererProps): JSX.Element {\n  const { name: effectiveTheme } = useContext(ThemeContext)\n  const isDark = effectiveTheme === 'dark'",
  "export function ToolResultRenderer({ output, error, success, maxHeight = 300 }: ToolResultRendererProps): JSX.Element {\n  const { colors } = useContext(ThemeContext)"
)

fs.writeFileSync(path, content)
console.log('MarkdownRenderer.tsx highlighting fixed')
