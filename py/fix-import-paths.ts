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

// 计算相对路径
function toRelativePath(fromFile: string, srcImport: string): string {
  // 移除 'src/' 前缀，获取在src1中的实际路径
  const targetPath = srcImport.replace(/^src\//, '')
  const fromDir = dirname(fromFile)
  
  // 计算从fromDir到targetPath的相对路径
  let relPath = relative(fromDir, resolve(SRC1_DIR, targetPath))
  
  // 确保使用正斜杠
  relPath = relPath.replace(/\\/g, '/')
  
  // 如果不是以.开头，添加./
  if (!relPath.startsWith('.')) {
    relPath = './' + relPath
  }
  
  return relPath
}

// 处理单个文件
async function processFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  
  // 匹配 from '...' 或 from "..."
  const importRegex = /(from\s+['"])(src\/[^'"]+)(['"])/g
  let match
  let replacements = 0
  let newContent = content
  
  // 重置regex以进行多次匹配
  const matches = [...content.matchAll(importRegex)]
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const srcPath = match[2]
    const suffix = match[3]
    
    const relativePath = toRelativePath(filePath, srcPath)
    const replacement = `${prefix}${relativePath}${suffix}`
    
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
  console.log('开始扫描 src1/ 目录...')
  const files = await getAllTsFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个TypeScript文件`)
  
  let totalReplacements = 0
  let processedFiles = 0
  
  for (const file of files) {
    const replacements = await processFile(file)
    if (replacements > 0) {
      const relFile = relative(SRC1_DIR, file)
      console.log(`  ✓ ${relFile}: ${replacements} 个导入已替换`)
      totalReplacements += replacements
      processedFiles++
    }
  }
  
  console.log(`\n完成！共处理 ${processedFiles} 个文件，替换了 ${totalReplacements} 个导入路径`)
}

main().catch(console.error)
