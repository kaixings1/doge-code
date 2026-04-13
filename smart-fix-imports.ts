import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, extname, relative, resolve, sep } from 'path'

const SRC1_DIR = resolve('src1')
const PROJECT_ROOT = resolve(SRC1_DIR, '..')

// 获取所有TypeScript文件
async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.') && 
          entry.name !== 'vendor' && entry.name !== 'shims' && entry.name !== '.claude') {
        files.push(...await getAllTsFiles(fullPath))
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  
  return files
}

// 尝试解析模块路径
async function resolveModulePath(importerDir: string, importPath: string): Promise<string | null> {
  // 如果是相对路径
  if (importPath.startsWith('.')) {
    const resolved = resolve(importerDir, importPath)
    
    // 尝试直接路径
    const extensions = ['.js', '.ts', '.jsx', '.tsx']
    for (const ext of extensions) {
      try {
        await stat(resolved + ext)
        return resolved + ext
      } catch {}
    }
    
    // 尝试目录 + index
    for (const ext of extensions) {
      try {
        await stat(resolve(resolved, 'index' + ext))
        return resolve(resolved, 'index' + ext)
      } catch {}
    }
  }
  
  return null
}

// 在src1中查找模块
async function findModuleInSrc1(moduleName: string): Promise<string | null> {
  // 尝试常见的路径模式
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
      return candidate
    } catch {}
  }
  
  return null
}

// 修复单个文件
async function fixFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 匹配所有相对路径导入
  const importRegex = /(from\s+['"])(\.\.\/[^'"]+)(['"])/g
  const matches = [...content.matchAll(importRegex)]
  
  if (matches.length === 0) return 0
  
  let newContent = content
  let replacements = 0
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const oldPath = match[2]
    const suffix = match[3]
    
    // 尝试解析这个导入
    const resolvedPath = await resolveModulePath(fromDir, oldPath)
    
    if (resolvedPath) {
      // 检查解析后的路径是否在src1中
      if (resolvedPath.startsWith(SRC1_DIR)) {
        // 计算正确的相对路径
        let correctRelPath = relative(fromDir, resolvedPath).replace(/\\/g, '/')
        
        // 确保扩展名是.js（TypeScript ESM惯例）
        correctRelPath = correctRelPath.replace(/\.(ts|tsx)$/, '.js')
        
        if (!correctRelPath.startsWith('.')) {
          correctRelPath = './' + correctRelPath
        }
        
        if (correctRelPath !== oldPath) {
          const replacement = `${prefix}${correctRelPath}${suffix}`
          newContent = newContent.split(fullMatch).join(replacement)
          replacements++
        }
      }
    } else {
      // 无法解析，尝试在src1中查找
      // 去掉所有../前缀获取模块名
      const moduleName = oldPath.replace(/\.\.\//g, '')
      const foundPath = await findModuleInSrc1(moduleName)
      
      if (foundPath) {
        let correctRelPath = relative(fromDir, foundPath).replace(/\\/g, '/')
        correctRelPath = correctRelPath.replace(/\.(ts|tsx)$/, '.js')
        
        if (!correctRelPath.startsWith('.')) {
          correctRelPath = './' + correctRelPath
        }
        
        if (correctRelPath !== oldPath) {
          const replacement = `${prefix}${correctRelPath}${suffix}`
          newContent = newContent.split(fullMatch).join(replacement)
          replacements++
        }
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
  console.log('智能修复 src1/ 目录中的错误相对路径...\n')
  const files = await getAllTsFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个TypeScript文件\n`)
  
  let totalReplacements = 0
  let processedFiles = 0
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const replacements = await fixFile(file)
    if (replacements > 0) {
      const relFile = relative(SRC1_DIR, file)
      console.log(`[${i + 1}/${files.length}] ✓ ${relFile}: ${replacements} 个导入已修复`)
      totalReplacements += replacements
      processedFiles++
    } else if ((i + 1) % 100 === 0) {
      console.log(`[${i + 1}/${files.length}] 处理中...`)
    }
  }
  
  console.log(`\n完成！共处理 ${processedFiles} 个文件，修复了 ${totalReplacements} 个导入路径`)
}

main().catch(console.error)
