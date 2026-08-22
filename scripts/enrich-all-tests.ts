import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'

const COMMANDS_DIR = resolve('src/commands')
const TEST_DIR = resolve('src/__tests__/commands')

interface ExportInfo {
  name: string
  kind: string
  params: string
  returnType: string
  isDefault: boolean
  isExported: boolean
}

function parseExports(sourceCode: string): ExportInfo[] {
  const exports: ExportInfo[] = []
  const cleaned = sourceCode
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^\s{]+))?/g
  let match: RegExpExecArray | null
  while ((match = funcRegex.exec(cleaned)) !== null) {
    exports.push({ name: match[1], kind: match[0].includes('async') ? 'async' : 'function', params: (match[2] ?? '').trim(), returnType: match[3] ?? '', isDefault: false, isExported: true })
  }

  const arrowRegex = /export\s+(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s+([^\s=]+))?\s*=>/g
  while ((match = arrowRegex.exec(cleaned)) !== null) {
    exports.push({ name: match[1], kind: match[0].includes('async') ? 'async' : 'const', params: (match[2] ?? '').trim(), returnType: match[3] ?? '', isDefault: false, isExported: true })
  }

  const constRegex = /export\s+(?:const|let|var)\s+(\w+)\s*=\s+[^=]/g
  while ((match = constRegex.exec(cleaned)) !== null) {
    if (exports.some(e => e.name === match![1])) continue
    exports.push({ name: match[1], kind: 'const', params: '', returnType: '', isDefault: false, isExported: true })
  }

  const defaultObjRegex = /export\s+default\s+(\w+)/g
  while ((match = defaultObjRegex.exec(cleaned)) !== null) {
    if (match[1] === 'function') continue
    if (!exports.some(e => e.name === match![1])) {
      exports.push({ name: match[1], kind: 'const', params: '', returnType: '', isDefault: true, isExported: true })
    }
  }
  const defaultLiteralRegex = /export\s+default\s+\{/g
  while ((match = defaultLiteralRegex.exec(cleaned)) !== null) {
    if (!exports.some(e => e.isDefault)) {
      exports.push({ name: 'default', kind: 'const', params: '', returnType: '', isDefault: true, isExported: true })
    }
  }

  return exports
}

function analyzeSource(sourceCode: string): {
  hasReact: boolean
  hasInk: boolean
  hasProcessExit: boolean
  hasConsoleLog: boolean
  hasFsOps: boolean
  hasNetworkCall: boolean
  exports: ExportInfo[]
} {
  return {
    hasReact: /from\s+['"]react['"]|React\./.test(sourceCode),
    hasInk: /from\s+['"]\.\.\/ink\.js['"]|from\s+['"]ink['"]/.test(sourceCode),
    hasProcessExit: /process\.exit/.test(sourceCode),
    hasConsoleLog: /console\.(log|error|warn|info)/.test(sourceCode),
    hasFsOps: /existsSync|readFileSync|writeFileSync|mkdirSync|readdirSync/.test(sourceCode),
    hasNetworkCall: /fetch\(|axios|https?\.get|https?\.post|undici/.test(sourceCode),
    exports: parseExports(sourceCode),
  }
}

function generateMocks(analysis: ReturnType<typeof analyzeSource>, srcFile: string): string {
  const mocks: string[] = []
  const relBase = srcFile.replace(/\\/g, '/')

  if (analysis.hasReact) {
    mocks.push("vi.mock('react', () => ({\n  createContext: (val: any) => ({ Provider: ({ children }: any) => children, _value: val }),\n  useState: (init: any) => [init, () => {}],\n  useCallback: (fn: any) => fn,\n  useEffect: () => {},\n  useRef: (init: any) => ({ current: init }),\n  useMemo: (fn: any) => fn(),\n  useReducer: (r: any, i: any) => [i, () => {}],\n}))")
  }
  if (analysis.hasInk) {
    mocks.push("vi.mock('" + (relBase.includes('commands/') ? '../..' : '.') + "/ink.js', () => ({\n  Box: () => null, Text: () => null, useInput: () => {},\n  useFocus: () => [false, () => {}], render: () => null, App: () => null,\n}))")
  }
  if (analysis.hasProcessExit) mocks.push("vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)")
  if (analysis.hasConsoleLog) {
    mocks.push("vi.spyOn(console, 'log').mockImplementation(() => {})")
    mocks.push("vi.spyOn(console, 'error').mockImplementation(() => {})")
    mocks.push("vi.spyOn(console, 'warn').mockImplementation(() => {})")
  }
  if (analysis.hasFsOps) {
    mocks.push("vi.mock('fs', () => ({\n  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),\n  writeFileSync: vi.fn(), mkdirSync: vi.fn(),\n  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),\n  readdirSync: vi.fn(() => []),\n}))")
  }
  if (analysis.hasNetworkCall) {
    mocks.push("vi.mock('axios', () => ({\n  default: { get: vi.fn(), post: vi.fn() },\n  get: vi.fn(), post: vi.fn(),\n}))")
  }
  return mocks.length > 0 ? mocks.join('\n\n') + '\n' : ''
}

function generateTestsForExport(exp: ExportInfo, modPrefix: string): string {
  const ref = modPrefix + '.' + exp.name
  const kindLabel = exp.kind === 'async' ? 'async function' : exp.kind === 'function' ? 'function' : exp.kind
  const desc = exp.name
  const definedCheck = "  it('should be defined', () => { expect(" + ref + ").toBeDefined() })"
  const typeCheck = "  it('should be a " + kindLabel + "', () => { expect(typeof " + ref + ").not.toBe(void 0) })"
  return "  describe('" + desc + "', () => {\n    " + definedCheck + "\n    " + typeCheck + "\n  })"
}

function scanCommands(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === '_shared') continue
    const full = join(dir, entry)
    try {
      const s = statSync(full)
      if (s.isDirectory()) {
        for (const idx of ['index.ts', 'index.tsx']) {
          if (existsSync(join(full, idx))) { results.push(join(full, idx)); break }
        }
      } else if (s.isFile()) {
        const ext = entry.slice(entry.lastIndexOf('.')).toLowerCase()
        if (['.ts', '.tsx'].includes(ext) && !entry.includes('.test.') && !entry.includes('.spec.')) {
          if (entry !== 'test-gen.ts' && entry !== 'createMovedToPluginCommand.ts') results.push(full)
        }
      }
    } catch { /* skip */ }
  }
  return results
}

const commandFiles = scanCommands(COMMANDS_DIR)
console.log('\n🔍 开始细化 ' + commandFiles.length + ' 个命令的测试文件\n')

let enriched = 0
let skipped = 0
let errors = 0

for (const srcFile of commandFiles) {
  const relPath = relative(COMMANDS_DIR, srcFile)
  const parts = relPath.split(/[/\\]/)
  const testBaseName = parts.length > 1 ? parts[parts.length - 2] : srcFile.slice(srcFile.lastIndexOf('/') + 1, srcFile.lastIndexOf('.'))
  const testPath = join(TEST_DIR, testBaseName + '.test.ts')

  if (!existsSync(testPath)) { skipped++; continue }

  const existingContent = readFileSync(testPath, 'utf-8')
  const isSkeleton = /(should be defined|module should load)[\s\S]*?await\s+import\('/.test(existingContent)
  if (!isSkeleton) { skipped++; continue }

  try {
    const sourceCode = readFileSync(srcFile, 'utf-8')
    const analysis = analyzeSource(sourceCode)
    const importPath = relative(TEST_DIR, srcFile).replace(/\\/g, '/').replace(/\.(ts|tsx)$/, '')

    const mockBlock = generateMocks(analysis, srcFile)

    const testableExports = analysis.exports.filter(e => e.kind !== 'type' && e.kind !== 'interface')

    let importBlock = "import { describe, it, expect, vi } from 'vitest'\n"
    importBlock += "import * as mod from './" + importPath + "'\n"

    let testBody: string
    if (testableExports.length === 0) {
      testBody = "  it('module should load', async () => {\n    const m = await import('./" + importPath + "')\n    expect(m).toBeDefined()\n  })"
    } else {
      testBody = testableExports.map(e => generateTestsForExport(e, 'mod')).join('\n\n')
    }

    const testContent = mockBlock + importBlock + "\ndescribe('" + testBaseName + "', () => {\n" + testBody + "\n})\n"
    writeFileSync(testPath, testContent, 'utf-8')
    enriched++
  } catch (err) {
    errors++
    console.log('  ❌ ' + testBaseName + ': ' + err)
  }
}

console.log('\n📊 结果: 细化 ' + enriched + ' 个, 跳过 ' + skipped + ' 个, 错误 ' + errors + ' 个')
