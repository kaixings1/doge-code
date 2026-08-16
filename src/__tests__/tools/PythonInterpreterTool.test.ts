import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PythonInterpreterTool } from '../../tools/PythonInterpreterTool/PythonInterpreterTool.js'

let mockExec: ReturnType<typeof vi.fn>

vi.mock('../../utils/Shell.js', () => ({
  exec: vi.fn((...args: any[]) => mockExec(...args)),
}))

describe('PythonInterpreterTool', () => {
  beforeEach(() => {
    mockExec = vi.fn(() =>
      Promise.resolve({
        stdout: '',
        stderr: '',
        code: 0,
      })
    )
  })

  it('执行简单代码并返回输出', async () => {
    mockExec.mockResolvedValueOnce({
      stdout: '42\n',
      stderr: '',
      code: 0,
    })
    const result = await PythonInterpreterTool.call({
      code: 'print(42)',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.output).toContain('42')
  })

  it('空代码返回错误', async () => {
    const result = await PythonInterpreterTool.call({
      code: '',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('不能为空')
  })

  it('执行失败返回错误', async () => {
    mockExec.mockResolvedValueOnce({
      stdout: '',
      stderr: 'NameError: name \'x\' is not defined',
      code: 1,
    })
    const result = await PythonInterpreterTool.call({
      code: 'print(x)',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.exit_code).toBe(1)
  })

  it('使用自定义超时', async () => {
    const result = await PythonInterpreterTool.call({
      code: 'print(1)',
      timeout: 60,
    } as any)
    expect(result.data.success).toBe(true)
  })

  it('使用自定义导入列表', async () => {
    const result = await PythonInterpreterTool.call({
      code: 'import math\nprint(math.pi)',
      authorized_imports: ['math'],
    } as any)
    expect(result.data.success).toBe(true)
  })
})
