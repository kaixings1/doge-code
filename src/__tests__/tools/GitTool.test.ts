import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitTool } from '../../tools/GitTool/GitTool.js'

vi.mock('../../utils/Shell.js', () => ({
  exec: vi.fn(() =>
    Promise.resolve({
      stdout: 'main\n',
      stderr: '',
      code: 0,
    })
  ),
}))

describe('GitTool', () => {
  it('status 返回工作区状态', async () => {
    const result = await GitTool.call({
      action: 'status',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.message).toBeDefined()
  })

  it('diff 返回变更统计', async () => {
    const result = await GitTool.call({
      action: 'diff',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.output).toBeDefined()
  })

  it('log 返回提交历史', async () => {
    const result = await GitTool.call({
      action: 'log',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.commits).toBeDefined()
  })

  it('add 需要 files 参数', async () => {
    const result = await GitTool.call({
      action: 'add',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('files')
  })

  it('commit 需要 message 参数', async () => {
    const result = await GitTool.call({
      action: 'commit',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('message')
  })

  it('reset 需要 files 参数', async () => {
    const result = await GitTool.call({
      action: 'reset',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('files')
  })

  it('未知 action 返回错误', async () => {
    const result = await GitTool.call({
      action: 'unknown',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('未知操作')
  })
})
