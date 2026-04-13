import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')

// 获取所有TypeScript文件
async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      // 跳过 node_modules 和 .git
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...await getAllTsFiles(fullPath))
      }
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
  
  // 匹配 ../../xxx (从 src1 内部错误引用的相对路径)
  const importRegex = /(from\s+['"])(\.\.\/\.\.\/([^'"]+))(['"])/g
  
  let replacements = 0
  let newContent = content
  
  const matches = [...content.matchAll(importRegex)]
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const targetPath = match[3] // 去掉 ../../ 的部分
    const suffix = match[4]
    
    // 计算正确的相对路径
    const targetAbsPath = resolve(SRC1_DIR, targetPath)
    let correctRelPath = relative(fromDir, targetAbsPath).replace(/\\/g, '/')
    
    if (!correctRelPath.startsWith('.')) {
      correctRelPath = './' + correctRelPath
    }
    
    // 只有当计算出的路径与原来不同时才替换
    const oldRelPath = fullMatch.slice(prefix.length, -suffix.length)
    if (correctRelPath !== oldRelPath) {
      const replacement = `${prefix}${correctRelPath}${suffix}`
      newContent = newContent.replace(fullMatch, replacement)
      replacements++
    }
  }
  
  if (replacements > 0) {
    await writeFile(filePath, newContent, 'utf-8')
    // 验证写入
    const verifyContent = await readFile(filePath, 'utf-8')
    if (verifyContent !== newContent) {
      console.error(`  ✗ 验证失败: ${relative(SRC1_DIR, filePath)}`)
      return 0
    }
  }
  
  return replacements
}

// 主函数
async function main() {
  console.log('开始修复 src1/ 目录中的错误相对路径...')
  const files = await getAllTsFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个TypeScript文件\n`)
  
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
