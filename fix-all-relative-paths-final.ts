import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')
const PROJECT_ROOT = resolve(SRC1_DIR, '..')

// 获取所有TypeScript文件
async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      // 跳过 node_modules 和 .git
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.') && entry.name !== 'vendor' && entry.name !== 'shims') {
        files.push(...await getAllTsFiles(fullPath))
      }
    } else if (entry.isFile() && /\.(ts|tsx|js)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  
  return files
}

// 修复错误的相对路径导入
async function fixFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 匹配 ../xxx, ../../xxx, ../../../xxx 等
  const importRegex = /(from\s+['"])(\.\.\/(?:\.\.\/)*([^'"]+))(['"])/g
  
  let replacements = 0
  let newContent = content
  
  const matches = [...content.matchAll(importRegex)]
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const oldRelPath = match[2] // 包括所有的 ../
    const targetPath = match[3] // 去掉所有 ../ 的部分
    const suffix = match[4]
    
    // 计算目标文件的绝对路径（从src1根目录）
    const targetAbsPath = resolve(SRC1_DIR, targetPath)
    
    try {
      // 检查文件是否存在于src1中
      await stat(targetAbsPath)
      
      // 文件存在，计算正确的相对路径
      let correctRelPath = relative(fromDir, targetAbsPath).replace(/\\/g, '/')
      
      if (!correctRelPath.startsWith('.')) {
        correctRelPath = './' + correctRelPath
      }
      
      // 只有当计算出的路径与原来不同时才替换
      if (correctRelPath !== oldRelPath) {
        const replacement = `${prefix}${correctRelPath}${suffix}`
        newContent = newContent.replace(fullMatch, replacement)
        replacements++
      }
    } catch {
      // 文件不在src1中，可能在项目根目录（如package.json）
      const rootTargetPath = resolve(PROJECT_ROOT, targetPath)
      try {
        await stat(rootTargetPath)
        // 文件在项目根目录，计算正确的相对路径
        let correctRelPath = relative(fromDir, rootTargetPath).replace(/\\/g, '/')
        
        if (!correctRelPath.startsWith('.')) {
          correctRelPath = './' + correctRelPath
        }
        
        if (correctRelPath !== oldRelPath) {
          const replacement = `${prefix}${correctRelPath}${suffix}`
          newContent = newContent.replace(fullMatch, replacement)
          replacements++
        }
      } catch {
        // 文件不存在，跳过
      }
    }
  }
  
  if (replacements > 0) {
    await writeFile(filePath, newContent, 'utf-8')
  }
  
  return replacements
}

// 主函数
async function main() {
  console.log('开始深度修复 src1/ 目录中的错误相对路径...')
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
