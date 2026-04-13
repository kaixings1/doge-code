import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')

async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '.claude', 'vendor', 'shims'].includes(entry.name) && !entry.name.startsWith('.')) {
        files.push(...await getAllTsFiles(fullPath))
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

async function fixFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 匹配所有相对路径导入 (../xxx)
  const importRegex = /(from\s+['"])(\.\.\/[^'"]+)(['"])(\s*)$/gm
  const matches = [...content.matchAll(importRegex)]
  
  if (matches.length === 0) return 0
  
  let newContent = content
  let replacements = 0
  
  for (const match of matches) {
    const fullMatch = match[0].trimEnd()
    const prefix = match[1]
    const oldPath = match[2]
    const suffix = match[3]
    const trailingSpace = match[4] || ''
    
    // 去掉所有../前缀获取模块名
    const moduleName = oldPath.replace(/\.\.\//g, '').replace(/^\.\//, '')
    
    // 尝试在src1中查找模块
    let foundPath: string | null = null
    const candidates = [
      resolve(SRC1_DIR, moduleName),
      resolve(SRC1_DIR, moduleName + '.ts'),
      resolve(SRC1_DIR, moduleName + '.tsx'),
      resolve(SRC1_DIR, moduleName + '.js'),
      resolve(SRC1_DIR, moduleName, 'index.ts'),
      resolve(SRC1_DIR, moduleName, 'index.js'),
      resolve(SRC1_DIR, moduleName, 'index.tsx'),
    ]
    
    for (const candidate of candidates) {
      try {
        await stat(candidate)
        foundPath = candidate
        break
      } catch {}
    }
    
    if (foundPath) {
      let correctRelPath = relative(fromDir, foundPath).replace(/\\/g, '/')
      correctRelPath = correctRelPath.replace(/\.(ts|tsx)$/, '.js')
      
      if (!correctRelPath.startsWith('.')) {
        correctRelPath = './' + correctRelPath
      }
      
      if (correctRelPath !== oldPath) {
        const replacement = `${prefix}${correctRelPath}${suffix}${trailingSpace}`
        newContent = newContent.replace(fullMatch, replacement)
        replacements++
      }
    }
  }
  
  if (replacements > 0) {
    await writeFile(filePath, newContent, 'utf-8')
  }
  
  return replacements
}

async function main() {
  console.log('批量修复 src1/ 目录中的所有错误相对路径...\n')
  const files = await getAllTsFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个TypeScript文件\n`)
  
  let totalReplacements = 0
  let processedFiles = 0
  
  for (const file of files) {
    const replacements = await fixFile(file)
    if (replacements > 0) {
      const relFile = relative(SRC1_DIR, file)
      console.log(`✓ ${relFile}: ${replacements} 个导入已修复`)
      totalReplacements += replacements
      processedFiles++
    }
  }
  
  console.log(`\n完成！共处理 ${processedFiles} 个文件，修复了 ${totalReplacements} 个导入路径`)
}

main().catch(console.error)
