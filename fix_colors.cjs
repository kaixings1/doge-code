const fs = require('fs')

// Fix App.tsx
let app = fs.readFileSync('D:/doge-code/desktop/src/renderer/App.tsx', 'utf8')

// Replace hex colors with theme variable references
// color:#CE9178 -> color:${c.string}
app = app.split('color:#CE9178').join('color:${c.string}')
app = app.split('color:#569CD6').join('color:${c.keyword}')
app = app.split('color:#B5CEA8').join('color:${c.number}')
app = app.split('color:#6A9955').join('color:${c.comment}')
app = app.split('color:#9CDCFE').join('color:${c.property}')

fs.writeFileSync('D:/doge-code/desktop/src/renderer/App.tsx', app)
console.log('App.tsx updated')

// Fix shared.tsx - need to pass theme info
let shared = fs.readFileSync('D:/doge-code/desktop/src/renderer/shared.tsx', 'utf8')

// shared.tsx highlightCode doesn't have access to theme, so we add isDark param
// First replace colors
shared = shared.split('color:#CE9178').join('color:${c.string}')
shared = shared.split('color:#569CD6').join('color:${c.keyword}')
shared = shared.split('color:#B5CEA8').join('color:${c.number}')
shared = shared.split('color:#6A9955').join('color:${c.comment}')
shared = shared.split('color:#9CDCFE').join('color:${c.property}')

// Update highlightCode function signature to accept isDark
shared = shared.replace(
  'function highlightCode(code: string, lang: string): string {',
  'function highlightCode(code: string, lang: string, isDark: boolean = true): string {\n  const c = { string: isDark ? \'#CE9178\' : \'#A31515\', keyword: isDark ? \'#569CD6\' : \'#0000FF\', number: isDark ? \'#B5CEA8\' : \'#098658\', comment: isDark ? \'#6A9955\' : \'#008000\', property: isDark ? \'#9CDCFE\' : \'#001080\' }'
)

// Fix renderMarkdown - add theme-aware colors
// Update renderCodeBlock to accept theme
shared = shared.replace(
  'function renderCodeBlock(code: string, lang: string): string {',
  'function renderCodeBlock(code: string, lang: string, isDark: boolean = true): string {\n  const tc = { string: isDark ? \'#CE9178\' : \'#A31515\', keyword: isDark ? \'#569CD6\' : \'#0000FF\', number: isDark ? \'#B5CEA8\' : \'#098658\', comment: isDark ? \'#6A9955\' : \'#008000\', property: isDark ? \'#9CDCFE\' : \'#001080\' }'
)

// Fix the highlightCode call inside renderCodeBlock
shared = shared.split('highlightCode(rawCode, lang.toLowerCase())').join('highlightCode(rawCode, lang.toLowerCase(), isDark)')

// Fix renderMarkdown signature to accept isDark
shared = shared.replace(
  'export function renderMarkdown(text: string): string {',
  'export function renderMarkdown(text: string, isDark: boolean = true): string {'
)

shared = shared.split('highlightCode(rawCode, lang.toLowerCase())').join('highlightCode(rawCode, lang.toLowerCase(), isDark)')

fs.writeFileSync('D:/doge-code/desktop/src/renderer/shared.tsx', shared)
console.log('shared.tsx updated')

// Fix MarkdownRenderer.tsx
let md = fs.readFileSync('D:/doge-code/desktop/src/renderer/components/MarkdownRenderer.tsx', 'utf8')

// Replace hex colors with theme-aware ones
md = md.split('color:#CE9178').join('color:${c.string}')
md = md.split('color:#569CD6').join('color:${c.keyword}')
md = md.split('color:#B5CEA8').join('color:${c.number}')
md = md.split('color:#6A9955').join('color:${c.comment}')
md = md.split('color:#9CDCFE').join('color:${c.property}')

// Fix hardcoded dark-only colors in renderCodeBlock
md = md.split('background:#0A0A0A').join('background:[[CBG]]')
md = md.split('border:1px solid #262626').join('border:1px solid [[CBORDER]]')
md = md.split('color:#888').join('color:[[CLANG]]')
md = md.split('font-size:12px').join('font-size:[[CFS]]')

fs.writeFileSync('D:/doge-code/desktop/src/renderer/components/MarkdownRenderer.tsx', md)
console.log('MarkdownRenderer.tsx updated')

// Fix HighlightedDiff.tsx
let diff = fs.readFileSync('D:/doge-code/desktop/src/renderer/components/HighlightedDiff.tsx', 'utf8')
diff = diff.split('color:#C678DD').join('color:[[DK]]')
diff = diff.split('color:#98C379').join('color:[[DS]]')
diff = diff.split('color:#D19A66').join('color:[[DN]]')
diff = diff.split('color:#5C6370').join('color:[[DC]]')
diff = diff.split("color: '#444'").join("color: [[DLN]]")
diff = diff.split("'#1A1A1A'").join("[[DLB]]")
diff = diff.split("color: '#abb2bf'").join("color: [[DT]]")
diff = diff.split("'rgba(78, 203, 113, 0.1)'").join("[[DP]]")
diff = diff.split("textColor: '#98C379'").join("textColor: [[DPT]]")
diff = diff.split("'rgba(255, 107, 107, 0.1)'").join("[[DM]]")
diff = diff.split("textColor: '#E06C75'").join("textColor: [[DMT]]")
diff = diff.split("textColor: '#56B6C2'").join("textColor: [[DH]]")
diff = diff.split("textColor: '#5C6370'").join("textColor: [[DDM]]")
diff = diff.split("fontSize: '11px'").join("fontSize: [[DFS]]")

fs.writeFileSync('D:/doge-code/desktop/src/renderer/components/HighlightedDiff.tsx', diff)
console.log('HighlightedDiff.tsx updated')

console.log('All files updated.')
