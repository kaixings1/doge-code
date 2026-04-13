import { readFile, writeFile } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')
const filePath = resolve('src1/utils/debug.ts')

console.log('Fixing:', filePath)

const content = await readFile(filePath, 'utf-8')
const fromDir = dirname(filePath)

// 匹配 ../../xxx
const importRegex = /(from\s+['"])(\.\.\/\.\.\/([^'"]+))(['"])/g

const matches = [...content.matchAll(importRegex)]
console.log('Found', matches.length, 'matches')

let newContent = content
for (const match of matches) {
  const fullMatch = match[0]
  const prefix = match[1]
  const targetPath = match[3]
  const suffix = match[4]
  
  console.log('  Old:', fullMatch)
  
  const targetAbsPath = resolve(SRC1_DIR, targetPath)
  let correctRelPath = relative(fromDir, targetAbsPath).replace(/\\/g, '/')
  
  if (!correctRelPath.startsWith('.')) {
    correctRelPath = './' + correctRelPath
  }
  
  const replacement = `${prefix}${correctRelPath}${suffix}`
  console.log('  New:', replacement)
  
  newContent = newContent.replace(fullMatch, replacement)
}

await writeFile(filePath, newContent, 'utf-8')
console.log('File written successfully')
