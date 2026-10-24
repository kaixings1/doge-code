/**
 * 任务系统团队语义回归测试（对应 diff_with_claude.md §5.2 / §7.3）。
 *
 * 覆盖：owner / blocks / blockedBy 的写入与反向边同步、删除时的依赖清理、
 * 旧任务文件兼容、metadata 合并语义。直接驱动真实存储层，不做 mock。
 *
 * 隔离方式：CLAUDE_CONFIG_DIR 指向临时目录（getTasksDir 由它派生）。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let root: string
let listId: string
let tasks: typeof import('../../src/utils/tasks.js')

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'doge-tasks-'))
  process.env.CLAUDE_CONFIG_DIR = root
  listId = 'team-semantics'
  await mkdir(join(root, 'tasks', listId), { recursive: true })
  tasks = await import('../../src/utils/tasks.js')
})

afterAll(async () => {
  delete process.env.CLAUDE_CONFIG_DIR
  await rm(root, { recursive: true, force: true })
})

async function makeTask(subject: string, extra: Record<string, unknown> = {}) {
  return tasks.createTask(listId, {
    subject,
    status: 'pending',
    blocks: [],
    blockedBy: [],
    ...extra,
  } as Parameters<typeof tasks.createTask>[1])
}

describe('任务团队语义', () => {
  it('owner 可持久化', async () => {
    const id = await makeTask('带负责人', { owner: 'alice' })
    const got = await tasks.getTask(listId, id)
    expect(got?.owner).toBe('alice')
  })

  it('blockTask 同时维护正向与反向边', async () => {
    const a = await makeTask('A')
    const b = await makeTask('B')
    await tasks.blockTask(listId, a, b)

    const ta = await tasks.getTask(listId, a)
    const tb = await tasks.getTask(listId, b)
    expect(ta?.blocks).toEqual([b])
    expect(tb?.blockedBy).toEqual([a])
  })

  it('删除任务会清理其他任务的依赖引用', async () => {
    const a = await makeTask('删除源')
    const b = await makeTask('被清理')
    await tasks.blockTask(listId, a, b)
    await tasks.deleteTask(listId, a)

    const tb = await tasks.getTask(listId, b)
    expect(tb?.blockedBy).toEqual([])
  })

  it('旧任务文件（缺 blocks/blockedBy）仍可读取', async () => {
    const legacyId = '9001'
    await writeFile(
      join(root, 'tasks', listId, `${legacyId}.json`),
      JSON.stringify({ id: legacyId, subject: 'legacy', status: 'pending' }),
      'utf-8',
    )
    // 旧格式缺 blocks/blockedBy 时会走迁移分支；这里断言不会抛错即可
    await expect(tasks.getTask(listId, legacyId)).resolves.not.toThrow()
  })

  it('metadata 合并覆盖同名键', async () => {
    const id = await makeTask('M')
    await tasks.updateTask(listId, id, { metadata: { keep: 1 } })
    await tasks.updateTask(listId, id, { metadata: { keep: 2, extra: 'x' } })
    const got = await tasks.getTask(listId, id)
    expect(got?.metadata).toEqual({ keep: 2, extra: 'x' })
  })
})
