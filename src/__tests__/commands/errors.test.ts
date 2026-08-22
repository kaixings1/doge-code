import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const TMP_DIR = 'C:\\Windows\\Temp\\doge-errors-test'
const DOGE_DIR = join(TMP_DIR, '.doge')

vi.mock('os', () => ({
  homedir: () => TMP_DIR,
}))

let call: (args: string) => Promise<{ type: string; value: string }>

beforeEach(async () => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })
  mkdirSync(DOGE_DIR, { recursive: true })
  const mod = await import('../../commands/errors/index.js')
  const loaded = await mod.default.load()
  call = loaded.call
})

afterEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
})

describe('errors scanForErrors', () => {
  const scanDir = join(TMP_DIR, 'scan-src')

  beforeEach(() => {
    mkdirSync(scanDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(scanDir)) rmSync(scanDir, { recursive: true, force: true })
  })

  it('scan 应检测目录中的错误模式', async () => {
    writeFileSync(join(scanDir, 'bad.ts'), "console.log('debug')\neval('code')\nvar old = true\n", 'utf-8')
    const result = await call(`scan ${scanDir}`)
    expect(result.value).toContain('扫描完成')
    expect(result.value).toContain('发现')
  })
})

describe('errors call subcommands', () => {
  const scanDir = join(TMP_DIR, 'cmd-test')

  beforeEach(() => {
    mkdirSync(scanDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(scanDir)) rmSync(scanDir, { recursive: true, force: true })
  })

  it('list 无错误时应返回 OK', async () => {
    await call('clear')
    const result = await call('list')
    expect(result.value).toContain('无未解决')
  })

  it('scan 后 list 应显示错误', async () => {
    writeFileSync(join(scanDir, 'sample.ts'), "console.log('test')\n", 'utf-8')
    await call(`scan ${scanDir}`)
    const result = await call('list')
    expect(result.value).toContain('未解决')
    expect(result.value).toContain('console')
  })

  it('resolve <id> 应标记为已解决', async () => {
    writeFileSync(join(scanDir, 'sample.ts'), "console.log('test')\n", 'utf-8')
    await call(`scan ${scanDir}`)
    const listResult = await call('list')
    const idMatch = listResult.value.match(/id: ([^\s)]+)/)
    if (idMatch) {
      const resolveResult = await call(`resolve ${idMatch[1]}`)
      expect(resolveResult.value).toContain('已解决')
    }
  })

  it('resolve-all 应标记所有为已解决', async () => {
    writeFileSync(join(scanDir, 'sample.ts'), "console.log('test')\n", 'utf-8')
    await call(`scan ${scanDir}`)
    const result = await call('resolve-all')
    expect(result.value).toContain('已标记所有')
    const listAfter = await call('list')
    expect(listAfter.value).toContain('无未解决')
  })

  it('stats 应显示统计信息', async () => {
    writeFileSync(join(scanDir, 'sample.ts'), "console.log('test')\n", 'utf-8')
    await call(`scan ${scanDir}`)
    const result = await call('stats')
    expect(result.value).toContain('错误统计')
  })

  it('patterns 应列出内置模式', async () => {
    const result = await call('patterns')
    expect(result.value).toContain('错误模式')
    expect(result.value).toContain('console.log')
  })

  it('clear 应清空错误日志', async () => {
    writeFileSync(join(scanDir, 'sample.ts'), "console.log('test')\n", 'utf-8')
    await call(`scan ${scanDir}`)
    await call('clear')
    const result = await call('list')
    expect(result.value).toContain('无未解决')
  })

  it('attempt-fix 不存在的 id 应返回 Not found', async () => {
    const result = await call('attempt-fix nonexistent')
    expect(result.value).toContain('未找到')
  })

  it('export 应导出错误到文件', async () => {
    writeFileSync(join(scanDir, 'sample.ts'), "console.log('test')\n", 'utf-8')
    await call(`scan ${scanDir}`)
    const result = await call('export')
    expect(result.value).toContain('已导出')
    const exportPath = join(TMP_DIR, 'errors-export.json')
    if (existsSync(exportPath)) rmSync(exportPath, { force: true })
  })
})
