import { readFileSync, writeFileSync } from 'fs'

const dbPath = 'D:/doge-code/desktop/src/renderer/hooks/useDatabase.ts'
let content = readFileSync(dbPath, 'utf-8')

// Remove the orphan lines and the comment above
content = content.replace(
  /\/\/ 数据库 IPC API 类型声明（主进程 IPC handler 未实现时为占位）\n>; error\?: string \}>\n    dogeDBQuery\?: \(connectionId: string, sql: string\) => Promise<\{ success: boolean; rows: any\[\]; error\?: string \}>\n  \}\n\}/,
  ''
)

writeFileSync(dbPath, content)
console.log('Fixed useDatabase.ts orphan code')
