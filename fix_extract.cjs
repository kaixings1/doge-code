const fs = require('fs')
const file = 'D:/doge-code/test_loop_v2.cjs'
let content = fs.readFileSync(file, 'utf-8')

// Find and replace the extractFilesFromCommand function
const startMarker = '// 从命令中提取文件路径'
const startIdx = content.indexOf(startMarker)
if (startIdx >= 0) {
  // Find end of function
  let braceCount = 0
  let endIdx = startIdx
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') braceCount++
    else if (content[i] === '}') {
      braceCount--
      if (braceCount === 0) {
        endIdx = i + 1
        break
      }
    }
  }

  const newFunc = `// 从命令中提取文件路径（修复版：正确处理 heredoc）
function extractFilesFromCommand(cmd) {
  const files = []

  if (cmd.includes('<<') && cmd.includes('EOF')) {
    // heredoc 模式：提取 << 前面的文件名
    const match = cmd.match(/>\s*([^\s&|<>]+)/)
    if (match?.[1]) {
      const fp = match[1]
      if (fp && fp.includes('.')) {
        files.push(fp)
      }
    }
  } else if (cmd.includes('>') && !cmd.includes('>>')) {
    // 重定向模式：提取 > 后面的文件名
    const matches = cmd.match(/>\s*([^\s&|<>]+)/g)
    if (matches) {
      for (const m of matches) {
        const fp = m.replace(/^>\s*/, '')
        if (fp && fp.includes('.') && !fp.startsWith('<') && !fp.startsWith('/') && !fp.startsWith('-')) {
          files.push(fp)
        }
      }
    }
  }

  return [...new Set(files)]
}`

  content = content.substring(0, startIdx) + newFunc + content.substring(endIdx)
  fs.writeFileSync(file, content, 'utf-8')
  console.log('Fixed extractFilesFromCommand')
} else {
  console.log('Could not find function')
}
