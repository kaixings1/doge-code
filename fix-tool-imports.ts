import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')
const TOOLS_DIR = resolve(SRC1_DIR, 'tools')

async function getAllToolFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...await getAllToolFiles(fullPath))
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

async function fixFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 匹配所有来自 src1 根目录的错误相对路径
  // 例如：../../../Tool.js, ../../../utils/xxx.js, ../../../types 等
  const importRegex = /(from\s+['"])(\.\.\/\.\.\/\.\.\/([^'"]+))(['"])/g
  
  let replacements = 0
  let newContent = content
  
  const matches = [...content.matchAll(importRegex)]
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const targetPath = match[3] // 去掉 ../../../ 的部分
    const suffix = match[4]
    
    // 计算正确的相对路径（从 src1 根目录）
    const targetAbsPath = resolve(SRC1_DIR, targetPath)
    
    try {
      await stat(targetAbsPath)
      let correctRelPath = relative(fromDir, targetAbsPath).replace(/\\/g, '/')
      
      if (!correctRelPath.startsWith('.')) {
        correctRelPath = './' + correctRelPath
      }
      
      if (correctRelPath !== fullMatch.slice(prefix.length, -suffix.length)) {
        const replacement = `${prefix}${correctRelPath}${suffix}`
        newContent = newContent.replace(fullMatch, replacement)
        replacements++
      }
    } catch {
      // 文件不存在，跳过
    }
  }
  
  if (replacements > 0) {
    await writeFile(filePath, newContent, 'utf-8')
  }
  
  return replacements
}

async function main() {
  console.log('修复工具目录中的错误相对路径...\n')
  const files = await getAllToolFiles(TOOLS_DIR)
  console.log(`找到 ${files.length} 个文件`)
  
  let totalReplacements = 0
  let processedFiles = 0
  
  for (const file of files) {
    const replacements = await fixFile(file)
    if (replacements > 0) {
      const relFile = relative(TOOLS_DIR, file)
      console.log(`✓ ${relFile}: ${replacements} 个导入已修复`)
      totalReplacements += replacements
      processedFiles++
    }
  }
  
  console.log(`\n完成！共处理 ${processedFiles} 个文件，修复了 ${totalReplacements} 个导入路径`)
}

main().catch(console.error)
