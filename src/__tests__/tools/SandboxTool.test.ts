import { describe, it, expect, vi } from 'vitest'
import { SandboxTool } from '../../tools/SandboxTool/SandboxTool.js'

vi.mock('../../utils/Shell.js', () => ({
  exec: vi.fn(() =>
    Promise.resolve({
      stdout: 'Hello from sandbox\n',
      stderr: '',
      code: 0,
    })
  ),
}))

describe('SandboxTool', () => {
  it('run 执行命令并返回输出', async () => {
    const result = await SandboxTool.call({
      action: 'run',
      command: 'echo hello',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.output).toBeDefined()
    expect(result.data.exit_code).toBe(0)
  })

  it('run 需要 command 参数', async () => {
    const result = await SandboxTool.call({
      action: 'run',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('command')
  })

  it('list 返回沙箱列表', async () => {
    const result = await SandboxTool.call({
      action: 'list',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.sandbox_id).toBe('local')
  })

  it('status 返回沙箱状态', async () => {
    const result = await SandboxTool.call({
      action: 'status',
      sandbox_id: 'test-1',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.sandbox_id).toBe('test-1')
  })

  it('stop 停止沙箱', async () => {
    const result = await SandboxTool.call({
      action: 'stop',
      sandbox_id: 'test-1',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.message).toContain('已停止')
  })
})
