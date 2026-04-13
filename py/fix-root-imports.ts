import { readdir, readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'

const SRC1_DIR = resolve('src1')

// 修复 src1 根目录下文件的错误相对路径导入
async function fixRootFiles(): Promise<number> {
  const entries = await readdir(SRC1_DIR, { withFileTypes: true })
  let totalReplacements = 0
  
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
      continue
    }
    
    const filePath = resolve(SRC1_DIR, entry.name)
    const content = await readFile(filePath, 'utf-8')
    
    // 匹配 ../xxx (从 src1 根目录错误引用的相对路径)
    const importRegex = /(from\s+['"])(\.\.\/([^'"]+))(['"])/g
    
    let newContent = content
    let fileReplacements = 0
    
    const matches = [...content.matchAll(importRegex)]
    
    for (const match of matches) {
      const fullMatch = match[0]
      const prefix = match[1]
      const targetPath = match[3] // 去掉 ../ 的部分
      const suffix = match[4]
      
      // 将 ../ 替换为 ./
      const correctPath = './' + targetPath
      const replacement = `${prefix}${correctPath}${suffix}`
      
      newContent = newContent.replace(fullMatch, replacement)
      fileReplacements++
    }
    
    if (fileReplacements > 0) {
      await writeFile(filePath, newContent, 'utf-8')
      console.log(`  ✓ ${entry.name}: ${fileReplacements} 个导入已修复`)
      totalReplacements += fileReplacements
    }
  }
  
  return totalReplacements
}

// 主函数
async function main() {
  console.log('开始修复 src1/ 根目录文件的错误相对路径...\n')
  const totalReplacements = await fixRootFiles()
  console.log(`\n完成！共修复了 ${totalReplacements} 个导入路径`)
}

main().catch(console.error)
