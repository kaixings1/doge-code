import { readFileSync, writeFileSync } from 'fs'

// Update desktop tsconfig to include the types directory
const tsconfigPath = 'D:/doge-code/desktop/tsconfig.json'
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'))

if (!tsconfig.include.includes('src/renderer/types/**/*.d.ts')) {
  tsconfig.include.push('src/renderer/types/**/*.d.ts')
}

writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))
console.log('Updated tsconfig.json')
