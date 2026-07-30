const fs = require('fs')
const path = 'D:/doge-code/desktop/src/renderer/App.tsx'
let content = fs.readFileSync(path, 'utf8')

// Fix duplicate const c line
content = content.replace(
  "const c = getSyntaxColors(isDark)\n  const fs = fontSize ? `font-size:${fontSize}px;` : ''\n  const c = getSyntaxColors(isDark)",
  "const c = getSyntaxColors(isDark)\n  const fs = fontSize ? `font-size:${fontSize}px;` : ''"
)

// Replace hardcoded colors in highlightCode with theme-aware colors
// TS/JS strings
content = content.replace(
  /result\.replace\(\/\?:"\(\[\^"\\\]\|\\\\.\)\*"\|'\(\['^'\\\]\|\\\\.\)\*'\|`\(\['^`\\\]\|\\\\.\)\*\`\)\/g, '<span style="color:#CE9178">\$1<\/span>'\)/,
  `result = result.replace(/(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\\`(?:[^\\\`\\\\]|\\\\.)*\\\`)/g, '<span style="color:${c.string};' + fs + '">$1</span>')`
)

fs.writeFileSync(path, content)
console.log('Done')
