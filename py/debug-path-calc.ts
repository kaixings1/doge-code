import { dirname, relative, resolve } from 'path'

const SRC1_DIR = 'D:\\doge-code\\src1'
const filePath = 'D:\\doge-code\\src1\\utils\\debug.ts'
const srcImport = '../../bootstrap/state.js'

const fromDir = dirname(filePath)
console.log('fromDir:', fromDir)

// 匹配 ../../xxx
const match = srcImport.match(/^\.\.\/\.\.\/(.+)$/)
if (match) {
  const targetPath = match[1]
  console.log('targetPath (relative to src1):', targetPath)
  
  const targetAbsPath = resolve(SRC1_DIR, targetPath)
  console.log('targetAbsPath:', targetAbsPath)
  
  const correctRelPath = relative(fromDir, targetAbsPath).replace(/\\/g, '/')
  console.log('correctRelPath:', correctRelPath)
}
