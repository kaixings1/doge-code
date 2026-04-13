import { exec } from 'child_process'
import { readFile, writeFile, stat } from 'fs/promises'
import { dirname, relative, resolve } from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)
const SRC1_DIR = resolve('src1')

async function findAndFixImport(filePath: string, importPath: string): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8')
  const fromDir = dirname(filePath)
  
  // 去掉 ../ 前缀获取模块名
  const moduleName = importPath.replace(/\.\.\//g, '').replace(/^\.\//, '')
  
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
  
  if (!foundPath) {
    console.log(`  ✗ 找不到模块: ${importPath}`)
    return false
  }
  
  // 计算正确的相对路径
  let correctRelPath = relative(fromDir, foundPath).replace(/\\/g, '/')
  correctRelPath = correctRelPath.replace(/\.(ts|tsx)$/, '.js')
  
  if (!correctRelPath.startsWith('.')) {
    correctRelPath = './' + correctRelPath
  }
  
  // 替换导入语句（处理各种格式）
  const importVariants = [
    importPath,
    importPath + '.js',
    importPath.replace(/\.js$/, ''),
  ]
  
  let replaced = false
  let newContent = content
  
  for (const variant of importVariants) {
    const regex = new RegExp(`(from\\s+['"])${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"])(\\s*)`, 'g')
    if (newContent.includes(variant)) {
      newContent = newContent.replace(regex, `$1${correctRelPath}$2$3`)
      replaced = true
    }
  }
  
  if (replaced) {
    await writeFile(filePath, newContent, 'utf-8')
    console.log(`  ✓ ${filePath}: ${importPath} -> ${correctRelPath}`)
    return true
  }
  
  return false
}

async function main() {
  console.log('开始自动修复导入错误...\n')
  
  let iteration = 0
  const maxIterations = 200
  
  while (iteration < maxIterations) {
    iteration++
    
    // 运行bootstrap获取错误
    let output: string
    try {
      const result = await execAsync('bun run bootstrap-entry.ts', { 
        cwd: SRC1_DIR,
        timeout: 30000
      })
      output = result.stderr || result.stdout
    } catch (error: any) {
      output = error.stderr || error.stdout || error.message
    }
    
    // 解析错误信息
    const match = output.match(/Cannot find module '([^']+)' from '([^']+)'/)
    if (!match) {
      console.log('\n✓ 没有更多导入错误了！')
      break
    }
    
    const [, importPath, filePath] = match
    console.log(`[${iteration}] ${filePath}`)
    console.log(`    导入: ${importPath}`)
    
    await findAndFixImport(filePath, importPath)
  }
  
  if (iteration >= maxIterations) {
    console.log('\n⚠ 达到最大迭代次数，可能还有未修复的错误')
  }
}

main().catch(console.error)
