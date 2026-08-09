import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { call } from '../../commands/pair/index.js'

const TMP_DIR = 'C:\\Windows\\Temp\\doge-pair-test'

beforeEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
})

function createTmpFile(name: string, content: string): string {
  const fp = join(TMP_DIR, name)
  writeFileSync(fp, content, 'utf-8')
  return fp
}

describe('pair review mode', () => {
  it('detects console.log', async () => {
    const fp = createTmpFile('review1.ts', 'console.log("test")\n')
    const result = await call(`${fp} review`)
    expect(result.value).toContain('console.log')
  })

  it('detects long lines', async () => {
    const longLine = 'const x = "' + 'a'.repeat(130) + '"'
    const fp = createTmpFile('review2.ts', longLine + '\n')
    const result = await call(`${fp} review`)
    expect(result.value).toContain('行过长')
  })

  it('detects == instead of ===', async () => {
    const fp = createTmpFile('review3.ts', 'if (a == b) {}\n')
    const result = await call(`${fp} review`)
    expect(result.value).toContain('==')
  })

  it('clean code gets review output', async () => {
    const fp = createTmpFile('review4.ts', 'const x: number = 42\n')
    const result = await call(`${fp} review`)
    expect(result.value).toContain('审查结果')
  })
})

describe('pair coauthor mode', () => {
  it('suggests exports for code without export', async () => {
    const fp = createTmpFile('coauthor1.ts', 'function foo() {}\n')
    const result = await call(`${fp} coauthor`)
    expect(result.value).toContain('协同编写')
  })

  it('suggests types for untyped code', async () => {
    const fp = createTmpFile('coauthor2.ts', 'function foo(x) { return x }\n')
    const result = await call(`${fp} coauthor`)
    expect(result.value).toContain('类型注解')
  })
})

describe('pair debug mode', () => {
  it('detects forEach + push', async () => {
    const fp = createTmpFile('debug1.ts', 'arr.forEach(x => result.push(x))\n')
    const result = await call(`${fp} debug`)
    expect(result.value).toContain('forEach')
  })

  it('produces debug analysis output', async () => {
    const fp = createTmpFile('debug2.ts', 'async function foo() {}\n')
    const result = await call(`${fp} debug`)
    expect(result.value).toContain('调试分析')
  })
})
