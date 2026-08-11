import { readFileSync, writeFileSync } from 'fs'

// Fix CodeFormatter.tsx orphan code
const cfPath = 'D:/doge-code/desktop/src/renderer/components/CodeFormatter.tsx'
let cfContent = readFileSync(cfPath, 'utf-8')

// Remove the orphan lines
cfContent = cfContent.replace(
  /\/\/ 声明 window\.dogeAPI 上的格式化扩展\n\) => Promise<\{ success: boolean; output\?: string; error\?: string \}>\n      readConfig\?: \(path: string\) => Promise<unknown>\n    \}\n  \}\n\}/,
  ''
)

writeFileSync(cfPath, cfContent)
console.log('Fixed CodeFormatter.tsx')

// Fix useDatabase.ts
const dbPath = 'D:/doge-code/desktop/src/renderer/hooks/useDatabase.ts'
let dbContent = readFileSync(dbPath, 'utf-8')

// Check what's at line 14
const dbLines = dbContent.split('\n')
console.log('Lines around 14 in useDatabase.ts:')
for (let i = 12; i < 20 && i < dbLines.length; i++) {
  console.log(`  ${i + 1}: ${dbLines[i]}`)
}

// Remove orphan content - whatever is left from the declare global removal
const dbOrphanRegex = /\};\s*\/\/ ─── 类型定义 ───/
if (dbContent.includes('declare global')) {
  // If declare global is still there, remove the whole block
  dbContent = dbContent.replace(/declare global \{[\s\S]*?\}\s*\}/, '')
}

writeFileSync(dbPath, dbContent)
console.log('Fixed useDatabase.ts')
