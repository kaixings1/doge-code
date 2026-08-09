import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const BASE_TMP = join(process.cwd(), '.tmp', 'doge-collab-test')

function makeIsolatedDir(): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const dir = join(BASE_TMP, id)
  const collabDir = join(dir, '.doge', 'collab')
  mkdirSync(collabDir, { recursive: true })
  return dir
}

function cleanupIsolated(dir: string) {
  if (existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

let currentDir = ''
let call: (args: string) => Promise<{ type: string; value: string }>

beforeEach(async () => {
  if (existsSync(BASE_TMP)) {
    try { rmSync(BASE_TMP, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  currentDir = makeIsolatedDir()
  process.env.HOME = currentDir
  process.env.USERPROFILE = currentDir
  const mod = await import('../../commands/collab/index.js')
  call = async (args: string) => {
    const m = await mod.default.load()
    return m.call(args)
  }
})

afterEach(() => {
  delete process.env.HOME
  delete process.env.USERPROFILE
  cleanupIsolated(currentDir)
})

async function createRoom(name = 'test-room'): Promise<string> {
  const result = await call(`create ${name}`)
  const match = result.value.match(/房间 ID: ([\w-]+)/)
  return match ? match[1] : ''
}

describe('collab call', () => {
  it('help should show usage', async () => {
    const result = await call('help')
    expect(result.value).toContain('实时协作编辑')
    expect(result.value).toContain('/collab create')
  })

  it('empty command shows help', async () => {
    const result = await call('')
    expect(result.value).toContain('实时协作编辑')
  })

  it('create makes a room', async () => {
    const result = await call('create my-project')
    expect(result.value).toContain('协作房间已创建')
    expect(result.value).toContain('room-')
  })

  it('join adds participant', async () => {
    const roomId = await createRoom('my-project')
    const result = await call(`join ${roomId}`)
    expect(result.value).toContain('已加入房间')
    expect(result.value).toContain('my-project')
  })

  it('join nonexistent room returns error', async () => {
    const result = await call('join room-999')
    expect(result.value).toContain('房间不存在')
  })

  it('leave returns success', async () => {
    const roomId = await createRoom()
    const result = await call(`leave ${roomId}`)
    expect(result.value).toContain('已离开')
  })

  it('leave nonexistent room returns error', async () => {
    const result = await call('leave room-999')
    expect(result.value).toContain('房间不存在')
  })

  it('list with no rooms', async () => {
    const result = await call('list')
    expect(result.value).toContain('暂无活跃')
  })

  it('list shows rooms', async () => {
    await createRoom('room-a')
    const result = await call('list')
    expect(result.value).toContain('room-a')
  })

  it('info shows room details', async () => {
    const roomId = await createRoom('my-project')
    const result = await call(`info ${roomId}`)
    expect(result.value).toContain('房间详情')
    expect(result.value).toContain('my-project')
  })

  it('info nonexistent room returns error', async () => {
    const result = await call('info room-999')
    expect(result.value).toContain('房间不存在')
  })

  it('insert adds text to document', async () => {
    const roomId = await createRoom()
    const result = await call(`insert ${roomId} src/test.ts 0 "hello world"`)
    expect(result.value).toContain('已插入')
  })

  it('insert to nonexistent room returns error', async () => {
    const result = await call('insert room-999 src/test.ts 0 "hello"')
    expect(result.value).toContain('房间不存在')
  })

  it('delete removes text from document', async () => {
    const roomId = await createRoom()
    await call(`insert ${roomId} src/test.ts 0 "hello world"`)
    const result = await call(`delete ${roomId} src/test.ts 0 5`)
    expect(result.value).toContain('已删除')
  })

  it('sync shows version info', async () => {
    const roomId = await createRoom()
    const result = await call(`sync ${roomId}`)
    expect(result.value).toContain('同步完成')
  })

  it('sync nonexistent room returns error', async () => {
    const result = await call('sync room-999')
    expect(result.value).toContain('房间不存在')
  })

  it('comment adds a comment', async () => {
    const roomId = await createRoom()
    const result = await call(`comment ${roomId} src/test.ts 10 "nice code"`)
    expect(result.value).toContain('评论已添加')
  })

  it('comments lists comments', async () => {
    const roomId = await createRoom()
    await call(`comment ${roomId} src/test.ts 10 "first"`)
    await call(`comment ${roomId} src/test.ts 20 "second"`)
    const result = await call(`comments ${roomId}`)
    expect(result.value).toContain('评论列表')
    expect(result.value).toContain('first')
    expect(result.value).toContain('second')
  })

  it('comments with no comments shows empty', async () => {
    const roomId = await createRoom()
    const result = await call(`comments ${roomId}`)
    expect(result.value).toContain('暂无评论')
  })

  it('unknown command returns error', async () => {
    const result = await call('unknown')
    expect(result.value).toContain('未知命令')
  })
})
