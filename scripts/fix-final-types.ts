import { readFileSync, writeFileSync } from 'fs'

// 1. Fix the .d.ts to make dogeAPI non-optional (matching existing code expectations)
const dtsPath = 'D:/doge-code/desktop/src/renderer/types/doge-api-extended.d.ts'
let dtsContent = readFileSync(dtsPath, 'utf-8')

// Change from optional to required
dtsContent = dtsContent.replace('dogeAPI?: ExtendedDogeAPI', 'dogeAPI: ExtendedDogeAPI')

writeFileSync(dtsPath, dtsContent)
console.log('Fixed dogeAPI to be non-optional')

// 2. Fix useDatabase.ts to add the missing global declarations
const dbPath = 'D:/doge-code/desktop/src/renderer/hooks/useDatabase.ts'
let dbContent = readFileSync(dbPath, 'utf-8')

// Add back the database IPC declarations
const dbImportEnd = "import { useCallback, useState } from 'react'"
const dbDeclareGlobal = `${dbImportEnd}

// 数据库 IPC API 类型声明（主进程 IPC handler 未实现时为占位）
declare global {
  interface Window {
    dogeDBConnect?: (conn: any) => Promise<{ success: boolean; error?: string }>
    dogeDBTables?: (connectionId: string) => Promise<{ success: boolean; tables: Array<{ name: string; columns: any[] }>; error?: string }>
    dogeDBQuery?: (connectionId: string, sql: string) => Promise<{ success: boolean; rows: any[]; error?: string }>
  }
}
`

if (!dbContent.includes('dogeDBConnect')) {
  dbContent = dbContent.replace(dbImportEnd, dbDeclareGlobal)
  writeFileSync(dbPath, dbContent)
  console.log('Added database IPC declarations to useDatabase.ts')
}

console.log('Done!')
