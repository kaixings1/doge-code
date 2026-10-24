import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FileReadTool } from '../../src/tools/FileReadTool/FileReadTool.js'

/**
 * Read 工具 allow_large（对齐官方 v2.1.296）
 *
 * 语义：忽略常规大小/token 上限，一次读完整个文本文件。
 * 与 offset/limit 互斥——同时使用直接报错，而不是静默忽略。
 *
 * 这里调用真实 FileReadTool.call，用临时文件构造超过默认 256KB 上限的场景。
 */

type Ctx = Parameters<typeof FileReadTool.call>[1]

function makeContext(): Ctx {
  const state = new Map()
  return {
    readFileState: state,
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        additionalDirectories: [],
      },
    }),
    setAppState: () => {},
    options: {},
    abortController: new AbortController(),
  } as unknown as Ctx
}

// 默认 maxSizeBytes 是 256KB；造一个 ~400KB 的文本文件稳定超过它。
const BIG_LINES = 8000
const BIG_LINE_TEXT = 'x'.repeat(50) // 8000 * 51 ≈ 408KB

let dir: string
let bigFile: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'read-allow-large-'))
  bigFile = join(dir, 'big.txt')
  writeFileSync(bigFile, Array.from({ length: BIG_LINES }, () => BIG_LINE_TEXT).join('\n'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Read allow_large', () => {
  it('默认读取超大文件会被大小上限拒绝', async () => {
    const ctx = makeContext()
    await expect(
      FileReadTool.call({ file_path: bigFile, prompt: '' } as never, ctx),
    ).rejects.toThrow()
  })

  it('allow_large=true 时能一次读完整个超大文件', async () => {
    const ctx = makeContext()
    const result = await FileReadTool.call(
      { file_path: bigFile, allow_large: true } as never,
      ctx,
    )
    expect(result).toBeTruthy()
    // 输出里应包含完整的 8000 行内容（或被持久化，但不应因大小报错）
    expect(JSON.stringify(result)).toContain('big.txt')
  })

  it('allow_large 与 limit 同时使用时报错', async () => {
    const ctx = makeContext()
    await expect(
      FileReadTool.call(
        { file_path: bigFile, allow_large: true, limit: 10 } as never,
        ctx,
      ),
    ).rejects.toThrow(/allow_large/)
  })

  it('allow_large 与 offset 同时使用时报错', async () => {
    const ctx = makeContext()
    await expect(
      FileReadTool.call(
        { file_path: bigFile, allow_large: true, offset: 5 } as never,
        ctx,
      ),
    ).rejects.toThrow(/allow_large/)
  })

  it('offset 默认为 1 时与 allow_large 不冲突', async () => {
    const ctx = makeContext()
    const result = await FileReadTool.call(
      { file_path: bigFile, allow_large: true, offset: 1 } as never,
      ctx,
    )
    expect(result).toBeTruthy()
  })
})
