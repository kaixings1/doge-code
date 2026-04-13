import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')

// 常见的被错误导入的函数及其实际位置
const FIXES = {
  // 从 utils/xxx.ts 错误导入到 xxx.ts 的函数
  'getTasksDir': 'utils/tasks.js',
  'updateTaskState': 'utils/task/framework.js',
  'claimTask': 'utils/task/framework.js',
  'listTasks': 'utils/task/framework.js',
  'extractOutputRedirections': 'utils/bash/commands.js',
  'has1mContext': 'utils/context.js',
  'is1mContextDisabled': 'utils/context.js',
  'modelSupports1M': 'utils/context.js',
}

async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
      files.push(...await getAllTsFiles(fullPath))
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

async function main() {
  console.log('扫描并修复错误的导入路径...\n')
  const files = await getAllTsFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个文件`)
  
  let totalFixes = 0
  
  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    let newContent = content
    let fileFixes = 0
    
    for (const [funcName, correctPath] of Object.entries(FIXES)) {
      // 匹配从错误位置导入的模式
      // 例如：from '../tasks.js' 应该是 from '../utils/tasks.js'
      const wrongPatterns = [
        // 从根目录导入而不是从utils/导入
        new RegExp(`(from\\s+['"])(\\.\\.\/)*(${funcName}[^'"]*)\\s*from\\s+['"]\\.\\.\\/(${funcName}[^'"]*)['"]`, 'g'),
      ]
      
      // 检查是否从错误的路径导入了这些函数
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(funcName) && line.includes('from')) {
          // 检查导入路径是否正确
          const importMatch = line.match(/from\s+['"]([^'"]+)['"]/)
          if (importMatch) {
            const importPath = importMatch[1]
            // 如果导入路径不包含 utils/ 但函数在 utils/ 中
            if (!importPath.includes('utils/') && correctPath.startsWith('utils/')) {
              console.log(`  ${file}: 可能需要修复 ${funcName} 的导入`)
            }
          }
        }
      }
    }
    
    if (fileFixes > 0) {
      await writeFile(file, newContent, 'utf-8')
      totalFixes += fileFixes
    }
  }
  
  console.log(`\n完成！修复了 ${totalFixes} 个导入`)
}

main().catch(console.error)
