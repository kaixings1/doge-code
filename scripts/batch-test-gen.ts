import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve, relative } from 'path'

const COMMANDS_DIR = resolve('src/commands')
const TEST_OUTPUT_DIR = resolve('src/__tests__/commands')

const exts = ['.ts', '.tsx', '.js', '.jsx']

function scanCommands(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === '_shared') continue
    const full = join(dir, entry)
    try {
      const s = statSync(full)
      if (s.isDirectory()) {
        const candidates = ['index.ts', 'index.tsx']
        for (const idx of candidates) {
          if (existsSync(join(full, idx))) {
            results.push(join(full, idx))
            break
          }
        }
      } else if (s.isFile()) {
        const ext = entry.slice(entry.lastIndexOf('.')).toLowerCase()
        if (exts.includes(ext) && !entry.includes('.test.') && !entry.includes('.spec.')) {
          if (entry !== 'test-gen.ts' && entry !== 'createMovedToPluginCommand.ts') {
            results.push(full)
          }
        }
      }
    } catch { /* skip */ }
  }
  return results
}

const commandFiles = scanCommands(COMMANDS_DIR)
console.log(`\n🔍 发现 ${commandFiles.length} 个命令文件\n`)

if (!existsSync(TEST_OUTPUT_DIR)) {
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true })
}

let generated = 0
let skipped = 0
const skippedNames: string[] = []

for (const srcFile of commandFiles) {
  const relPath = relative(COMMANDS_DIR, srcFile)
  const parts = relPath.split(/[/\\]/)
  const testBaseName = parts.length > 1 ? parts[parts.length - 2] : srcFile.slice(srcFile.lastIndexOf('/') + 1, srcFile.lastIndexOf('.'))
  const testPath = join(TEST_OUTPUT_DIR, testBaseName + '.test.ts')

  if (existsSync(testPath)) {
    skipped++
    skippedNames.push(`  ${testBaseName}`)
    continue
  }

  try {
    const importPath = relative(TEST_OUTPUT_DIR, srcFile).replace(/\\/g, '/')
    const importPathNoExt = importPath.replace(/\.(ts|tsx|js|jsx)$/, '')

    const testContent = `import { describe, it, expect, vi } from 'vitest'

describe('${testBaseName}', () => {
  it('module should load without throwing', async () => {
    const mod = await import('./${importPathNoExt}')
    expect(mod).toBeDefined()
  }, 15000)
})
`
    writeFileSync(testPath, testContent, 'utf-8')
    generated++
    console.log(`  ✅ ${testBaseName}`)
  } catch (err) {
    skipped++
    console.log(`  ❌ ${testBaseName}: ${err}`)
  }
}

console.log(`\n📊 结果: 生成 ${generated} 个测试文件, 跳过 ${skipped} 个`)
if (skippedNames.length > 0 && skippedNames.length <= 30) {
  console.log(`\n已跳过的文件:`)
  skippedNames.forEach(s => console.log(s))
} else if (skippedNames.length > 30) {
  console.log(`\n已跳过 ${skippedNames.length} 个文件`)
}
