import { readFileSync, writeFileSync } from 'fs'

const appPath = 'D:/doge-code/desktop/src/renderer/App.tsx'
let content = readFileSync(appPath, 'utf-8')

// Replace the declare global block
const oldDeclare = `declare global {
  interface Window {
    dogeAPI: DogeAPI
  }
}`

const newDeclare = `declare global {
  interface Window {
    dogeAPI?: import('./types/doge-api-extended.js').ExtendedDogeAPI
  }
}`

content = content.replace(oldDeclare, newDeclare)

writeFileSync(appPath, content)
console.log('Fixed App.tsx declare global')
