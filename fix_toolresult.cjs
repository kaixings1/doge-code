const fs = require('fs')
const path = 'D:/doge-code/desktop/src/renderer/components/MarkdownRenderer.tsx'
let content = fs.readFileSync(path, 'utf8')

// Fix ToolResultRenderer: add useContext(ThemeContext) and isDark
content = content.replace(
  "export function ToolResultRenderer({ output, error, success, maxHeight = 300 }: ToolResultRendererProps): JSX.Element {\n  const content = useMemo(() => {\n    if (error) return error\n    if (typeof output === 'string') return output\n    if (output === null || output === undefined) return ''\n    return JSON.stringify(output, null, 2)\n  }, [output, error])",
  "export function ToolResultRenderer({ output, error, success, maxHeight = 300 }: ToolResultRendererProps): JSX.Element {\n  const { name: effectiveTheme } = useContext(ThemeContext)\n  const isDark = effectiveTheme === 'dark'\n\n  const content = useMemo(() => {\n    if (error) return error\n    if (typeof output === 'string') return output\n    if (output === null) return ''\n    return JSON.stringify(output, null, 2)\n  }, [output, error])"
)

// Fix renderCodeBlock and smartRender calls
content = content.replace(
  "if (isJson) {\n      const formatted = typeof output === 'string' ? tryFormatJson(output)! : JSON.stringify(output, null, 2)\n      return renderCodeBlock(formatted, 'json')\n    }\n    return smartRender(content)\n  }, [content, isJson, output])",
  "if (isJson) {\n      const formatted = typeof output === 'string' ? tryFormatJson(output)! : JSON.stringify(output, null, 2)\n      return renderCodeBlock(formatted, 'json', isDark)\n    }\n    return smartRender(content, isDark)\n  }, [content, isJson, output, isDark])"
)

fs.writeFileSync(path, content)
console.log('ToolResultRenderer fixed')
