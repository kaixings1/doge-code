import { describe, it, expect, vi } from 'vitest'
import { BranchTool } from '../../tools/BranchTool/BranchTool.js'

vi.mock('../../utils/Shell.js', () => ({
  exec: vi.fn(() =>
    Promise.resolve({
      stdout: 'main\n',
      stderr: '',
      code: 0,
    })
  ),
}))

describe('BranchTool', () => {
  it('list 返回分支列表', async () => {
    const result = await BranchTool.call({
      action: 'list',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.branches).toBeDefined()
  })

  it('create 需要 name 参数', async () => {
    const result = await BranchTool.call({
      action: 'create',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('name')
  })

  it('switch 需要 name 参数', async () => {
    const result = await BranchTool.call({
      action: 'switch',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('name')
  })

  it('delete 需要 name 参数', async () => {
    const result = await BranchTool.call({
      action: 'delete',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('name')
  })

  it('status 返回仓库状态', async () => {
    const result = await BranchTool.call({
      action: 'status',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.status).toBeDefined()
    expect(result.data.status.branch).toBe('main')
  })

  it('未知 action 返回错误', async () => {
    const result = await BranchTool.call({
      action: 'unknown',
    } as any)
    expect(result.data.success).toBe(false)
  })
})
