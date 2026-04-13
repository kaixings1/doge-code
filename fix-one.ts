import { readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')

// 从命令行获取错误信息
const errorLine = process.argv[2]
if (!errorLine) {
  console.error('用法: bun fix-one.ts "Cannot find module \'XXX\' from \'YYY\'"')
  process.exit(1)
}

// 解析错误信息
const match = errorLine.match(/Cannot find module '([^']+)' from '([^']+)'/)
if (!match) {
  console.error('无法解析错误信息')
  process.exit(1)
}

const [, importPath, filePath] = match
console.log(`文件: ${filePath}`)
console.log(`导入: ${importPath}\n`)

// 读取文件内容
const content = await readFile(filePath, 'utf-8')
const fromDir = dirname(filePath)

// 查找所有包含这个导入的行
const lines = content.split('\n')
let foundLine = null
let lineIndex = -1

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(importPath.replace(/^\.\//, '').replace(/\.js$/, ''))) {
    foundLine = lines[i]
    lineIndex = i
    break
  }
}

if (!foundLine) {
  console.error('找不到导入语句')
  process.exit(1)
}

console.log(`找到导入语句 (行 ${lineIndex + 1}): ${foundLine.trim()}\n`)

// 计算正确的相对路径
const moduleName = importPath.replace(/^\.\.\/+/, '').replace(/^\.\//, '')
let foundPath = null

const candidates = [
  resolve(SRC1_DIR, moduleName),
  resolve(SRC1_DIR, moduleName + '.ts'),
  resolve(SRC1_DIR, moduleName + '.tsx'),
  resolve(SRC1_DIR, moduleName + '.js'),
  resolve(SRC1_DIR, moduleName, 'index.ts'),
  resolve(SRC1_DIR, moduleName, 'index.js'),
]

for (const candidate of candidates) {
  try {
    await stat(candidate)
    foundPath = candidate
    console.log(`找到目标文件: ${foundPath}\n`)
    break
  } catch {}
}

if (!foundPath) {
  console.error('找不到目标文件')
  process.exit(1)
}

// 计算正确的相对路径
let correctRelPath = relative(fromDir, foundPath).replace(/\\/g, '/')
correctRelPath = correctRelPath.replace(/\.(ts|tsx)$/, '.js')

if (!correctRelPath.startsWith('.')) {
  correctRelPath = './' + correctRelPath
}

console.log(`正确的路径: ${correctRelPath}\n`)

// 替换导入语句
const oldImportRegex = new RegExp(`(from\\s+['"])${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"])`, 'g')
const newContent = content.replace(oldImportRegex, `$1${correctRelPath}$2`)

// 写回文件
await writeFile(filePath, newContent, 'utf-8')
console.log(`✓ 已修复 ${filePath}`)
