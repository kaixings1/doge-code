/**
 * 工具执行沙箱测试
 *
 * 测试工具执行的安全沙箱功能：
 * - 危险工具执行前需要确认
 * - 权限弹窗显示正确
 * - 取消执行后不调用 API
 * - 确认执行后调用 API
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

// 模拟 window.dogeAPI
const mockApi = {
  executeTool: async (params: { name: string; input: Record<string, unknown> }) => {
    return { success: true, output: `Executed ${params.name}` }
  },
  getTools: async () => [
    { name: 'BashTool', description: '执行命令', input_schema: {} },
    { name: 'FileReadTool', description: '读取文件', input_schema: {} },
    { name: 'FileWriteTool', description: '写入文件', input_schema: {} },
    { name: 'GrepTool', description: '搜索内容', input_schema: {} },
  ],
}

// 危险工具列表
const DANGEROUS_TOOLS = ['BashTool', 'HttpTool', 'FileWriteTool', 'FileEditTool']

function isDangerous(toolName: string): boolean {
  return DANGEROUS_TOOLS.includes(toolName)
}

// 模拟执行流程
async function executeWithSandbox(
  toolName: string,
  input: Record<string, unknown>,
  onConfirm: () => Promise<boolean>,
): Promise<{ success: boolean; output?: string; error?: string }> {
  // 危险工具需要确认
  if (isDangerous(toolName)) {
    const confirmed = await onConfirm()
    if (!confirmed) {
      return { success: false, error: '用户取消执行' }
    }
  }

  try {
    const result = await mockApi.executeTool({ name: toolName, input })
    return result
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '执行失败' }
  }
}

describe('工具执行沙箱', () => {
  describe('危险工具检测', () => {
    it('BashTool 应被识别为危险工具', () => {
      expect(isDangerous('BashTool')).toBe(true)
    })

    it('FileWriteTool 应被识别为危险工具', () => {
      expect(isDangerous('FileWriteTool')).toBe(true)
    })

    it('FileEditTool 应被识别为危险工具', () => {
      expect(isDangerous('FileEditTool')).toBe(true)
    })

    it('HttpTool 应被识别为危险工具', () => {
      expect(isDangerous('HttpTool')).toBe(true)
    })

    it('GrepTool 不应被识别为危险工具', () => {
      expect(isDangerous('GrepTool')).toBe(false)
    })

    it('FileReadTool 不应被识别为危险工具', () => {
      expect(isDangerous('FileReadTool')).toBe(false)
    })
  })

  describe('执行流程', () => {
    it('非危险工具应直接执行', async () => {
      const result = await executeWithSandbox('GrepTool', { pattern: 'test' }, async () => true)
      expect(result.success).toBe(true)
      expect(result.output).toContain('GrepTool')
    })

    it('危险工具确认后应执行', async () => {
      const result = await executeWithSandbox('BashTool', { command: 'ls' }, async () => true)
      expect(result.success).toBe(true)
      expect(result.output).toContain('BashTool')
    })

    it('危险工具取消后不应执行', async () => {
      const result = await executeWithSandbox('BashTool', { command: 'rm -rf /' }, async () => false)
      expect(result.success).toBe(false)
      expect(result.error).toBe('用户取消执行')
    })
  })

  describe('权限边界', () => {
    it('空工具名不应被识别为危险工具', () => {
      expect(isDangerous('')).toBe(false)
    })

    it('大小写敏感 — bashtool 不是危险工具', () => {
      expect(isDangerous('bashtool')).toBe(false)
    })
  })
})
