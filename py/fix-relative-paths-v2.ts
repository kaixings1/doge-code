import { readdir, readFile, writeFile } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve(__dirname)

// 获取所有TypeScript文件
async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await getAllTsFiles(fullPath))
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  
  return files
}

// 修复错误的相对路径导入
async function fixFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 匹配所有从 src1 内部错误引用的相对路径 (../../xxx)
  // 这些路径应该是从 src1 根目录开始的
  const importRegex = /(from\s+['"])(\.\.\/\.\.\/([^'"]+))(['"])/g
  let replacements = 0
  let newContent = content
  
  const matches = [...content.matchAll(importRegex)]
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const oldPath = match[2]
    const targetPath = match[3] // 去掉 ../../ 的部分
    const suffix = match[4]
    
    // 计算正确的相对路径
    // 从 fromDir 到 SRC1_DIR/targetPath
    const targetAbsPath = resolve(SRC1_DIR, targetPath)
    let correctRelPath = relative(fromDir, targetAbsPath).replace(/\\/g, '/')
    
    if (!correctRelPath.startsWith('.')) {
      correctRelPath = './' + correctRelPath
    }
    
    const replacement = `${prefix}${correctRelPath}${suffix}`
    newContent = newContent.replace(fullMatch, replacement)
    replacements++
  }
  
  if (replacements > 0) {
    await writeFile(filePath, newContent, 'utf-8')
  }
  
  return replacements
}

// 主函数
async function main() {
  console.log('开始修复 src1/ 目录中的错误相对路径...')
  const files = await getAllTsFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个TypeScript文件`)
  
  let totalReplacements = 0
  let processedFiles = 0
  
  for (const file of files) {
    const replacements = await fixFile(file)
    if (replacements > 0) {
      const relFile = relative(SRC1_DIR, file)
      console.log(`  ✓ ${relFile}: ${replacements} 个导入已修复`)
      totalReplacements += replacements
      processedFiles++
    }
  }
  
  console.log(`\n完成！共处理 ${processedFiles} 个文件，修复了 ${totalReplacements} 个导入路径`)
}

main().catch(console.error)
