import { readFileSync, writeFileSync } from 'fs'

const appPath = 'D:/doge-code/desktop/src/renderer/App.tsx'
let content = readFileSync(appPath, 'utf-8')

// Remove the old declare global block (original version with DogeAPI)
const oldDeclareRegex = /declare global \{\s*interface Window \{\s*dogeAPI: DogeAPI\s*\}\s*\}/

if (oldDeclareRegex.test(content)) {
  content = content.replace(oldDeclareRegex, '')
  writeFileSync(appPath, content)
  console.log('Removed old declare global from App.tsx')
} else {
  console.log('Pattern not found, checking content...')
  // Show what's around line 56
  const lines = content.split('\n')
  for (let i = 54; i < 62 && i < lines.length; i++) {
    console.log(`Line ${i + 1}: ${lines[i]}`)
  }
}
