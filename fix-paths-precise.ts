import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, extname, relative, resolve } from 'path'

const SRC1_DIR = resolve('src1')

// 获取所有文件
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory() && !['node_modules', '.git', 'vendor', 'shims'].includes(entry.name) && !entry.name.startsWith('.')) {
      files.push(...await getAllFiles(fullPath))
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

// 缓存文件存在性检查
const existsCache = new Map<string, boolean>()
async function existsCached(p: string): Promise<boolean> {
  if (existsCache.has(p)) return existsCache.get(p)!
  try {
    await stat(p)
    existsCache.set(p, true)
    return true
  } catch {
    existsCache.set(p, false)
    return false
  }
}

// 在 src1 中查找匹配的文件
// 例如：导入 'utils/debug'，查找 'src1/utils/debug.ts' 等
async function findInSrc1(importPath: string): Promise<string | null> {
  // 尝试直接匹配
  const candidates = [
    resolve(SRC1_DIR, importPath),
    resolve(SRC1_DIR, importPath + '.ts'),
    resolve(SRC1_DIR, importPath + '.tsx'),
    resolve(SRC1_DIR, importPath + '.js'),
    resolve(SRC1_DIR, importPath + '.jsx'),
    resolve(SRC1_DIR, importPath, 'index.ts'),
    resolve(SRC1_DIR, importPath, 'index.tsx'),
    resolve(SRC1_DIR, importPath, 'index.js'),
  ]
  
  for (const c of candidates) {
    if (await existsCached(c)) return c
  }
  return null
}

// 修复单个文件
async function fixFile(filePath: string): Promise<number> {
  let content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 匹配所有导入
  const importRegex = /(from\s+['"])([^'"]+)(['"])/g
  const matches = [...content.matchAll(importRegex)]
  
  let replacements = 0
  
  for (const match of matches) {
    const fullMatch = match[0]
    const prefix = match[1]
    const rawImport = match[2]
    const suffix = match[3]
    
    // 跳过外部模块
    if (!rawImport.startsWith('.') && !rawImport.startsWith('src/')) continue
    
    let targetPath: string | null = null
    
    if (rawImport.startsWith('src/')) {
      // 处理 'src/...' 导入 -> 映射到 'src1/...'
      const subPath = rawImport.substring(4) // 去掉 'src/'
      targetPath = await findInSrc1(subPath)
    } else {
      // 处理相对导入
      const resolved = resolve(fromDir, rawImport)
      
      // 检查是否指向 src1 内部且存在
      if (resolved.startsWith(SRC1_DIR)) {
        if (await existsCached(resolved)) {
          continue // 已经正确
        }
        
        // 如果不存在，尝试添加扩展名
        const resolvedWithExt = await findInSrc1(relative(SRC1_DIR, resolved))
        if (resolvedWithExt) {
          targetPath = resolvedWithExt
        }
      } else {
        // 指向 src1 外部 -> 尝试在 src1 内部查找同名文件
        const baseName = rawImport.replace(/^(\.\.\/)+/, '')
        targetPath = await findInSrc1(baseName)
      }
    }
    
    if (targetPath) {
      let correctRelPath = relative(fromDir, targetPath).replace(/\\/g, '/')
      if (!correctRelPath.startsWith('.')) {
        correctRelPath = './' + correctRelPath
      }
      // 统一使用 .js 扩展名
      correctRelPath = correctRelPath.replace(/\.(ts|tsx)$/, '.js')
      
      if (correctRelPath !== rawImport) {
        // 使用 split/join 避免正则转义问题
        content = content.split(fullMatch).join(`${prefix}${correctRelPath}${suffix}`)
        replacements++
      }
    }
  }
  
  if (replacements > 0) {
    await writeFile(filePath, content, 'utf-8')
  }
  
  return replacements
}

// 主函数
async function main() {
  console.log('🔍 开始扫描并修复 src1/ 中的路径...\n')
  const files = await getAllFiles(SRC1_DIR)
  console.log(`找到 ${files.length} 个文件`)
  
  let totalFixes = 0
  let fixedFiles = 0
  
  for (const file of files) {
    const fixes = await fixFile(file)
    if (fixes > 0) {
      const relFile = relative(SRC1_DIR, file)
      console.log(`✅ ${relFile}: 修复了 ${fixes} 个导入`)
      totalFixes += fixes
      fixedFiles++
    }
  }
  
  console.log(`\n🎉 完成！修复了 ${fixedFiles} 个文件，共 ${totalFixes} 个导入`)
}

main().catch(console.error)
